/**
 * GitLabRecordStore<V> - GitLab REST API implementation of RecordStore
 *
 * Persists records as JSON files in a GitLab repository via Gitbeaker.
 * Uses Files API for individual CRUD, Tree API for listing, and
 * Commits API for atomic batch writes (putMany — 1 API call).
 *
 * Key differences from GitHubRecordStore:
 * - putMany uses Commits API natively (1 call vs 6+ in GitHub) — no GitModule dependency
 * - blob_id cache for optimistic concurrency (client-side verification)
 * - POST (create) vs PUT (update) — separate endpoints
 *
 * @module record_store/gitlab_record_store
 */

import type { GitbeakerClient } from '../gitlab';
import { GitLabApiError, mapGitbeakerError, isGitbeakerRequestError } from '../gitlab';
import type { GitLabRecordStoreOptions, GitLabWriteResult, GitLabWriteOpts, IdEncoder } from './gitlab_record_store.types';

// RecordStore interface is structurally typed — we implement the shape without importing
// to avoid dependency resolution issues with @gitgov/core subpaths

/**
 * [EARS-A1 to A12, B1 to B9, C1 to C6]
 */
export class GitLabRecordStore<V> {
  private readonly projectId: number | string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly extension: string;
  private readonly idEncoder: IdEncoder | undefined;
  private readonly api: GitbeakerClient;

  /** blob_id cache: filePath → blob_id (populated by get, used by put for concurrency) */
  private readonly blobIdCache: Map<string, string> = new Map();

  // [EARS-B8] No GitModule dependency — putMany uses Commits API natively
  constructor(options: GitLabRecordStoreOptions) {
    this.projectId = options.projectId;
    this.api = options.api;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.idEncoder = options.idEncoder;
  }

  // ═══════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════

  /**
   * [EARS-A1] Get record by ID — returns parsed JSON or null if not found.
   * [EARS-A2] Returns null for 404.
   * [EARS-B1] Fetches via Files API + base64 decode.
   * [EARS-B7] Caches blob_id for optimistic concurrency.
   */
  async get(id: string): Promise<V | null> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);

    try {
      const file = await this.api.RepositoryFiles.show(this.projectId, filePath, this.ref);
      const content = String(file.content ?? '');

      if (!content) {
        throw new GitLabApiError(`File content is empty: ${filePath}`, 'INVALID_RESPONSE');
      }

      // [EARS-B7] Cache blob_id
      this.blobIdCache.set(filePath, String(file.blob_id));

      const decoded = Buffer.from(content, 'base64').toString('utf-8');
      return JSON.parse(decoded) as V;
    } catch (error: unknown) {
      if (error instanceof GitLabApiError) throw error;
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) return null;
      }
      throw mapGitbeakerError(error, `GET ${filePath}`);
    }
  }

  /**
   * [EARS-A3] Put record — creates or updates.
   * [EARS-A4] Overwrites existing record.
   * [EARS-B2] New record → POST Files API (create).
   * [EARS-B3] Existing record → re-read blob_id + PUT Files API (update).
   */
  async put(id: string, value: V, opts?: GitLabWriteOpts): Promise<GitLabWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');
    const message = opts?.commitMessage ?? `put ${id}`;

    const cachedBlobId = this.blobIdCache.get(filePath);

    try {
      if (cachedBlobId) {
        // [EARS-B3] Update: re-read blob_id for optimistic concurrency, then PUT
        const current = await this.api.RepositoryFiles.show(this.projectId, filePath, this.ref);
        if (String(current.blob_id) !== cachedBlobId) {
          throw new GitLabApiError(
            `Record was modified by another process: ${id}`,
            'CONFLICT',
            409,
          );
        }

        await this.api.RepositoryFiles.edit(
          this.projectId, filePath, this.ref, content, message,
          { encoding: 'base64' },
        );
      } else {
        // [EARS-B2] Create: POST
        try {
          await this.api.RepositoryFiles.create(
            this.projectId, filePath, this.ref, content, message,
            { encoding: 'base64' },
          );
        } catch (createError: unknown) {
          // File might already exist — try update instead
          if (isGitbeakerRequestError(createError) && this.extractStatus(createError) === 400) {
            await this.api.RepositoryFiles.edit(
              this.projectId, filePath, this.ref, content, message,
              { encoding: 'base64' },
            );
          } else {
            throw createError;
          }
        }
      }

      // Re-read to get commit SHA and update blob_id cache
      const updated = await this.api.RepositoryFiles.show(this.projectId, filePath, this.ref);
      this.blobIdCache.set(filePath, String(updated.blob_id));

      return { commitSha: String(updated.last_commit_id) };
    } catch (error: unknown) {
      if (error instanceof GitLabApiError) throw error;
      throw mapGitbeakerError(error, `PUT ${filePath}`);
    }
  }

  /**
   * [EARS-A11] Atomic batch write via Commits API (1 API call).
   * [EARS-A12] Empty entries → commitSha undefined.
   * [EARS-B8] Uses Commits API actions[] — no GitModule dependency.
   */
  async putMany(entries: Array<{ id: string; value: V }>, opts?: GitLabWriteOpts): Promise<GitLabWriteResult> {
    if (entries.length === 0) {
      return {};
    }

    for (const { id } of entries) {
      this.validateId(id);
    }

    // Determine action type per entry (create vs update)
    const actions: Array<Record<string, unknown>> = [];

    for (const { id, value } of entries) {
      const filePath = this.buildFilePath(id);
      const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');
      const exists = this.blobIdCache.has(filePath) || await this.existsOnRemote(filePath);

      actions.push({
        action: exists ? 'update' : 'create',
        file_path: filePath,
        content,
        encoding: 'base64',
      });
    }

    const message = opts?.commitMessage ?? `putMany ${entries.length} records`;

    try {
      const result = await this.api.Commits.create(
        this.projectId,
        this.ref,
        message,
        actions as unknown as Parameters<typeof this.api.Commits.create>[3],
      );

      return { commitSha: String(result.id) };
    } catch (error: unknown) {
      if (error instanceof GitLabApiError) throw error;
      throw mapGitbeakerError(error, `putMany ${entries.length} records`);
    }
  }

  /**
   * [EARS-A5] Delete existing record.
   * [EARS-A6] Idempotent — returns commitSha undefined for non-existent.
   * [EARS-B4] Delete via Files API DELETE.
   */
  async delete(id: string, opts?: GitLabWriteOpts): Promise<GitLabWriteResult> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    const message = opts?.commitMessage ?? `delete ${id}`;

    try {
      await this.api.RepositoryFiles.remove(
        this.projectId, filePath, this.ref, message,
      );
      this.blobIdCache.delete(filePath);

      return { commitSha: message }; // GitLab remove doesn't return commit SHA directly
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        // [EARS-A6] Idempotent delete — 404 is not an error
        if (status === 404) {
          this.blobIdCache.delete(filePath);
          return {};
        }
      }
      throw mapGitbeakerError(error, `DELETE ${filePath}`);
    }
  }

  /**
   * [EARS-A7] List all record IDs in basePath.
   * [EARS-A8] Returns [] for empty store.
   * [EARS-B5] Uses Tree API with pagination.
   * [EARS-B9] Returns [] for 404 basePath.
   * [EARS-B6] Applies idEncoder.decode() if configured.
   */
  async list(): Promise<string[]> {
    try {
      const items = await this.api.Repositories.allRepositoryTrees(this.projectId, {
        path: this.basePath,
        ref: this.ref,
      } as Parameters<typeof this.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ path: string; type: string; name: string }>;

      const ids = items
        .filter((entry) => entry.type === 'blob' && entry.name.endsWith(this.extension))
        .map((entry) => entry.name.slice(0, -this.extension.length));

      return this.idEncoder ? ids.map((encoded) => this.idEncoder!.decode(encoded)) : ids;
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        // [EARS-B9] basePath 404 → empty array
        if (status === 404) return [];
      }
      throw mapGitbeakerError(error, `list ${this.basePath}`);
    }
  }

  /**
   * [EARS-A9] Returns true for existing record.
   * [EARS-A10] Returns false for non-existent.
   */
  async exists(id: string): Promise<boolean> {
    this.validateId(id);
    const filePath = this.buildFilePath(id);
    return this.existsOnRemote(filePath);
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-C1] Validates record ID — rejects empty, non-string, path traversal */
  private validateId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new GitLabApiError('ID must be a non-empty string', 'INVALID_ID');
    }
    if (id.includes('..') || /[\/\\]/.test(id)) {
      throw new GitLabApiError(
        `Invalid ID: "${id}". IDs cannot contain /, \\, or ..`,
        'INVALID_ID',
      );
    }
  }

  private buildFilePath(id: string): string {
    const encoded = this.idEncoder ? this.idEncoder.encode(id) : id;
    return `${this.basePath}/${encoded}${this.extension}`;
  }

  private async existsOnRemote(filePath: string): Promise<boolean> {
    try {
      await this.api.RepositoryFiles.show(this.projectId, filePath, this.ref);
      return true;
    } catch {
      return false;
    }
  }

  private extractStatus(error: unknown): number | undefined {
    if (error instanceof Error && 'cause' in error && typeof error.cause === 'object' && error.cause !== null && 'response' in error.cause) {
      const response = (error.cause as { response?: { status?: number } }).response;
      if (typeof response?.status === 'number') return response.status;
    }
    if (error instanceof Error && 'statusCode' in error && typeof (error as Record<string, unknown>)['statusCode'] === 'number') {
      return (error as Record<string, unknown>)['statusCode'] as number;
    }
    return undefined;
  }
}
