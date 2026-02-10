import type { RecordStore, IdEncoder } from '../record_store.js';
import type { GitHubFetchFn, GitHubContentsResponse } from '../../github/github.types.js';
import type { GitHubRecordStoreOptions, GitHubCreateUpdateResponse, GitHubWriteResult, GitHubWriteOpts } from './github_record_store.types.js';
import type { IGitModule } from '../../git/index.js';
import { GitHubApiError } from '../../github/github.types.js';

/**
 * GitHubRecordStore<V> - GitHub Contents API implementation of RecordStore<V, GitHubWriteResult, GitHubWriteOpts>
 *
 * Persists records as JSON files in a GitHub repository via the Contents API.
 * Supports SHA caching to avoid redundant GET calls before PUT/DELETE.
 *
 * @example
 * const store = new GitHubRecordStore<ActorRecord>({
 *   owner: 'gitgovernance',
 *   repo: 'my-project',
 *   token: 'ghp_xxx',
 *   basePath: '.gitgov/actors',
 * });
 *
 * const result = await store.put('human:camilo', actor);
 * const actor = await store.get('human:camilo');
 */
export class GitHubRecordStore<V> implements RecordStore<V, GitHubWriteResult, GitHubWriteOpts> {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly extension: string;
  private readonly apiBaseUrl: string;
  private readonly idEncoder: IdEncoder | undefined;
  private readonly fetchFn: GitHubFetchFn;

  /** SHA cache keyed by full file path (basePath/encoded + extension) */
  private readonly shaCache: Map<string, string> = new Map();

  // TODO: Store gitModule and use in putMany() for atomic commits once GitHubGitModule Cat A is implemented
  constructor(options: GitHubRecordStoreOptions, fetchFn?: GitHubFetchFn, _gitModule?: IGitModule) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.ref = options.ref ?? 'main';
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.idEncoder = options.idEncoder;
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Gets a record by ID from GitHub Contents API.
   * Caches the SHA for subsequent put/delete operations.
   * @returns The record or null if it doesn't exist
   */
  async get(id: string): Promise<V | null> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const url = this.buildContentsUrl(filePath);

    const response = await this.doFetch(url, { method: 'GET' });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, `GET ${filePath}`);
    }

    const body = (await response.json()) as GitHubContentsResponse;
    if (body.content === null) {
      throw new GitHubApiError(
        `File content is null (file may exceed 1MB): ${filePath}`,
        'INVALID_RESPONSE',
      );
    }

    // Cache the SHA for subsequent operations
    this.shaCache.set(filePath, body.sha);

    const decoded = Buffer.from(body.content, 'base64').toString('utf-8');
    return JSON.parse(decoded) as V;
  }

  /**
   * Persists a record to GitHub via the Contents API (create or update).
   * Uses cached SHA for updates; omits SHA for creates.
   */
  async put(id: string, value: V, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const url = this.buildContentsUrl(filePath);

    const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');

    const body: Record<string, string> = {
      message: opts?.commitMessage ?? `put ${id}`,
      content,
      branch: this.ref,
    };

    const cachedSha = this.shaCache.get(filePath);
    if (cachedSha !== undefined) {
      body['sha'] = cachedSha;
    }

    const response = await this.doFetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw this.mapHttpError(response.status, `PUT ${filePath}`);
    }

    const result = (await response.json()) as GitHubCreateUpdateResponse;
    // Cache the new SHA from the response
    this.shaCache.set(filePath, result.content.sha);

    return { commitSha: result.commit.sha };
  }

  /**
   * Persists multiple records in a single operation.
   * Currently delegates to sequential put() calls.
   * Future: use GitHubGitModule staging buffer for atomic commits.
   */
  async putMany(entries: Array<{ id: string; value: V }>, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    let lastResult: GitHubWriteResult = {};
    for (const { id, value } of entries) {
      lastResult = await this.put(id, value, opts);
    }
    return lastResult;
  }

  /**
   * Deletes a record from GitHub via the Contents API.
   * If SHA is not cached, performs a GET first to obtain it.
   * 404 on DELETE is treated as success (idempotent).
   */
  async delete(id: string, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const url = this.buildContentsUrl(filePath);

    let sha = this.shaCache.get(filePath);

    // If no cached SHA, do a GET to obtain it
    if (sha === undefined) {
      const getResponse = await this.doFetch(url, { method: 'GET' });

      if (getResponse.status === 404) {
        // File doesn't exist, nothing to delete (idempotent)
        return {};
      }

      if (!getResponse.ok) {
        throw this.mapHttpError(getResponse.status, `GET ${filePath} (for delete)`);
      }

      const getBody = (await getResponse.json()) as GitHubContentsResponse;
      sha = getBody.sha;
    }

    const body = JSON.stringify({
      message: opts?.commitMessage ?? `delete ${id}`,
      sha,
      branch: this.ref,
    });

    const deleteResponse = await this.doFetch(url, {
      method: 'DELETE',
      body,
    });

    if (deleteResponse.status === 404) {
      // Already deleted between GET and DELETE, idempotent success
      this.shaCache.delete(filePath);
      return {};
    }

    if (!deleteResponse.ok) {
      throw this.mapHttpError(deleteResponse.status, `DELETE ${filePath}`);
    }

    const deleteBody = (await deleteResponse.json()) as { commit: { sha: string } };
    this.shaCache.delete(filePath);
    return { commitSha: deleteBody.commit.sha };
  }

  /**
   * Lists all record IDs by reading the directory from GitHub Contents API.
   * Filters by extension, strips extension, and decodes IDs if idEncoder is configured.
   * 404 for the directory returns an empty array.
   */
  async list(): Promise<string[]> {
    const url = this.buildContentsUrl(this.basePath);

    const response = await this.doFetch(url, { method: 'GET' });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, `GET ${this.basePath} (list)`);
    }

    const entries = (await response.json()) as GitHubContentsResponse[];

    const ids = entries
      .filter((entry) => entry.name.endsWith(this.extension))
      .map((entry) => entry.name.slice(0, -this.extension.length));

    return this.idEncoder ? ids.map((encoded) => this.idEncoder!.decode(encoded)) : ids;
  }

  /**
   * Checks if a record exists by attempting to GET it from the Contents API.
   * 200 -> true, 404 -> false.
   */
  async exists(id: string): Promise<boolean> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const url = this.buildContentsUrl(filePath);

    const response = await this.doFetch(url, { method: 'GET' });

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, `GET ${filePath} (exists)`);
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Validates that an ID does not contain path traversal characters.
   * Rejects IDs containing '..', '/', or '\'.
   */
  private validateId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new GitHubApiError('ID must be a non-empty string', 'INVALID_ID');
    }
    if (id.includes('..') || /[\/\\]/.test(id)) {
      throw new GitHubApiError(
        `Invalid ID: "${id}". IDs cannot contain /, \\, or ..`,
        'INVALID_ID',
      );
    }
  }

  /**
   * Builds the full file path within the repo: basePath/encoded + extension
   */
  private buildFilePath(id: string): string {
    const encoded = this.idEncoder ? this.idEncoder.encode(id) : id;
    return `${this.basePath}/${encoded}${this.extension}`;
  }

  /**
   * Builds the full GitHub Contents API URL for a given path.
   */
  private buildContentsUrl(repoPath: string): string {
    return `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.ref}`;
  }

  /**
   * Executes a fetch with standard GitHub headers.
   */
  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitHubApiError(`Network error: ${message}`, 'NETWORK_ERROR');
    }
  }

  /**
   * Maps HTTP status codes to GitHubApiError instances.
   */
  private mapHttpError(status: number, context: string): GitHubApiError {
    if (status === 401 || status === 403) {
      return new GitHubApiError(
        `Permission denied: ${context}`,
        'PERMISSION_DENIED',
        status,
      );
    }
    if (status === 404) {
      return new GitHubApiError(
        `Not found: ${context}`,
        'NOT_FOUND',
        status,
      );
    }
    if (status === 409) {
      return new GitHubApiError(
        `Conflict: ${context}`,
        'CONFLICT',
        status,
      );
    }
    if (status >= 500) {
      return new GitHubApiError(
        `Server error (${status}): ${context}`,
        'SERVER_ERROR',
        status,
      );
    }
    return new GitHubApiError(
      `Unexpected error (${status}): ${context}`,
      'SERVER_ERROR',
      status,
    );
  }
}
