import type { Octokit } from '@octokit/rest';
import type { RecordStore, IdEncoder } from '../record_store';
import type { GitHubRecordStoreOptions, GitHubWriteResult, GitHubWriteOpts } from './github_record_store.types';
import type { IGitModule } from '../../git/index';
import { GitHubApiError, mapOctokitError, isOctokitRequestError } from '../../github';

/**
 * GitHubRecordStore<V> - GitHub Contents API implementation of RecordStore<V, GitHubWriteResult, GitHubWriteOpts>
 *
 * Persists records as JSON files in a GitHub repository via Octokit.
 * Supports SHA caching to avoid redundant GET calls before PUT/DELETE.
 */
export class GitHubRecordStore<V> implements RecordStore<V, GitHubWriteResult, GitHubWriteOpts> {
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly extension: string;
  private readonly idEncoder: IdEncoder | undefined;
  private readonly octokit: Octokit;

  /** SHA cache keyed by full file path (basePath/encoded + extension) */
  private readonly shaCache: Map<string, string> = new Map();

  /** IGitModule dependency for putMany() atomic commits. Optional — only needed for putMany(). */
  private readonly gitModule: IGitModule | undefined;

  constructor(options: GitHubRecordStoreOptions, octokit: Octokit, gitModule?: IGitModule) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.idEncoder = options.idEncoder;
    this.octokit = octokit;
    this.gitModule = gitModule;
  }

  async get(id: string): Promise<V | null> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: this.ref,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new GitHubApiError(`Not a file: ${filePath}`, 'INVALID_RESPONSE');
      }

      if (data.content === null || data.content === undefined) {
        throw new GitHubApiError(
          `File content is null (file may exceed 1MB): ${filePath}`,
          'INVALID_RESPONSE',
        );
      }

      // Cache the SHA for subsequent operations
      this.shaCache.set(filePath, data.sha);

      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return JSON.parse(decoded) as V;
    } catch (error: unknown) {
      if (error instanceof GitHubApiError) throw error;
      if (isOctokitRequestError(error) && error.status === 404) return null;
      throw mapOctokitError(error, `GET ${filePath}`);
    }
  }

  async put(id: string, value: V, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');

    const cachedSha = this.shaCache.get(filePath);

    try {
      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: opts?.commitMessage ?? `put ${id}`,
        content,
        branch: this.ref,
        ...(cachedSha ? { sha: cachedSha } : {}),
      });

      // Cache the new SHA from the response
      if (data.content?.sha) {
        this.shaCache.set(filePath, data.content.sha);
      }

      return { commitSha: data.commit.sha! };
    } catch (error: unknown) {
      throw mapOctokitError(error, `PUT ${filePath}`);
    }
  }

  /**
   * [EARS-A11, EARS-A12, EARS-B8] Persists multiple records in a single atomic commit.
   * Uses GitHubGitModule staging buffer: add() with contentMap, then commit().
   * Empty entries array returns { commitSha: undefined } without API calls.
   * Requires gitModule dependency — throws if not injected.
   */
  async putMany(entries: Array<{ id: string; value: V }>, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    if (entries.length === 0) {
      return {};
    }

    if (!this.gitModule) {
      throw new Error('putMany requires IGitModule dependency for atomic commits');
    }

    for (const { id } of entries) {
      this.validateId(id);
    }

    const contentMap: Record<string, string> = {};
    const filePaths: string[] = [];

    for (const { id, value } of entries) {
      const filePath = this.buildFilePath(id);
      contentMap[filePath] = JSON.stringify(value, null, 2);
      filePaths.push(filePath);
    }

    await this.gitModule.add(filePaths, { contentMap });

    const message = opts?.commitMessage ?? `putMany ${entries.length} records`;
    const commitSha = await this.gitModule.commit(message);

    return { commitSha };
  }

  async delete(id: string, opts?: GitHubWriteOpts): Promise<GitHubWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);

    let sha = this.shaCache.get(filePath);

    // If no cached SHA, do a GET to obtain it
    if (sha === undefined) {
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: this.ref,
        });

        if (Array.isArray(data) || data.type !== 'file') {
          return {};
        }

        sha = data.sha;
      } catch (error: unknown) {
        if (isOctokitRequestError(error) && error.status === 404) {
          return {};
        }
        throw mapOctokitError(error, `GET ${filePath} (for delete)`);
      }
    }

    try {
      const { data } = await this.octokit.rest.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: opts?.commitMessage ?? `delete ${id}`,
        sha: sha!,
        branch: this.ref,
      });

      this.shaCache.delete(filePath);
      return { commitSha: data.commit.sha! };
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        this.shaCache.delete(filePath);
        return {};
      }
      throw mapOctokitError(error, `DELETE ${filePath}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.basePath,
        ref: this.ref,
      });

      if (!Array.isArray(data)) {
        return [];
      }

      const ids = data
        .filter((entry) => entry.name.endsWith(this.extension))
        .map((entry) => entry.name.slice(0, -this.extension.length));

      return this.idEncoder ? ids.map((encoded) => this.idEncoder!.decode(encoded)) : ids;
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return [];
      }
      throw mapOctokitError(error, `GET ${this.basePath} (list)`);
    }
  }

  async exists(id: string): Promise<boolean> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);

    try {
      await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: this.ref,
      });
      return true;
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return false;
      }
      throw mapOctokitError(error, `GET ${filePath} (exists)`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────

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

  private buildFilePath(id: string): string {
    const encoded = this.idEncoder ? this.idEncoder.encode(id) : id;
    return `${this.basePath}/${encoded}${this.extension}`;
  }
}
