/**
 * GitLabConfigStore - GitLab Repository Files API implementation of ConfigStore
 *
 * Persists config.json to a GitLab repository via Gitbeaker.
 * Used by SaaS/server-side environments where the project lives on GitLab
 * and direct filesystem access is not available.
 *
 * Key behaviors:
 * - loadConfig: GET Files API, base64 decode, JSON parse. Fail-safe on 404/invalid JSON.
 * - saveConfig: JSON serialize + base64 encode, POST (create) or PUT (update) Files API.
 * - Caches blob_id from loadConfig for optimistic concurrency in saveConfig.
 */

import type { GitbeakerClient } from '../gitlab';
import type { ConfigStore } from '@gitgov/core';
import type { GitGovConfig } from '@gitgov/core';
import type { GitLabConfigStoreOptions, GitLabSaveResult } from './gitlab_config_store.types';
import { GitLabApiError, mapGitbeakerError, isGitbeakerRequestError } from '../gitlab';

export class GitLabConfigStore implements ConfigStore<GitLabSaveResult> {
  private readonly projectId: number | string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly api: GitbeakerClient;

  /** Cached blob_id from the last loadConfig call, used for optimistic concurrency */
  private cachedBlobId: string | null = null;

  constructor(options: GitLabConfigStoreOptions) {
    this.projectId = options.projectId;
    this.api = options.api;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath ?? '.gitgov';
  }

  /**
   * Load project configuration from GitLab Files API.
   *
   * [EARS-A1] Returns GitGovConfig when valid JSON is found.
   * [EARS-A2] Returns null on 404 (fail-safe).
   * [EARS-A3] Returns null on invalid JSON (fail-safe).
   * [EARS-B1] Fetches via Files API with base64 decode.
   * [EARS-B2] Caches blob_id from response for subsequent saveConfig.
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    const path = `${this.basePath}/config.json`;

    try {
      const file = await this.api.RepositoryFiles.show(
        this.projectId,
        path,
        this.ref,
      );

      if (!file.content) {
        return null;
      }

      // [EARS-B2] Cache blob_id for subsequent saveConfig
      this.cachedBlobId = String(file.blob_id);

      try {
        const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
        return JSON.parse(decoded) as GitGovConfig;
      } catch {
        // [EARS-A3] Invalid JSON — fail-safe
        return null;
      }
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        // [EARS-A2] 404 → null (fail-safe)
        if (status === 404) return null;
      }
      // [EARS-C4/C5] Auth and server errors are NOT fail-safe — throw
      throw mapGitbeakerError(error, `loadConfig ${this.projectId}/${path}`);
    }
  }

  /**
   * Save project configuration to GitLab via Files API.
   *
   * [EARS-A4] Writes config via Files API.
   * [EARS-B3] Re-reads blob_id to verify optimistic concurrency before update.
   * [EARS-B4] Uses POST for initial creation (no cached blob_id).
   * [EARS-B5] Extracts new blob_id from API response after save.
   * [EARS-B7] Throws CONFLICT if blob_id changed between load and save.
   */
  async saveConfig(config: GitGovConfig): Promise<GitLabSaveResult> {
    const path = `${this.basePath}/config.json`;
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
    const commitMessage = 'chore(config): update gitgov config.json';

    try {
      if (this.cachedBlobId) {
        // [EARS-B7] Optimistic concurrency: verify blob_id hasn't changed
        try {
          const current = await this.api.RepositoryFiles.show(
            this.projectId,
            path,
            this.ref,
          );
          if (String(current.blob_id) !== this.cachedBlobId) {
            throw new GitLabApiError(
              'Config was modified by another process',
              'CONFLICT',
              409,
            );
          }
        } catch (error: unknown) {
          if (error instanceof GitLabApiError) throw error;
          throw mapGitbeakerError(error, `verifying config ${this.projectId}/${path}`);
        }

        // [EARS-B3] Update existing file via PUT
        await this.api.RepositoryFiles.edit(
          this.projectId,
          path,
          this.ref,
          content,
          commitMessage,
          { encoding: 'base64' },
        );
      } else {
        // [EARS-B4] Create new file via POST
        await this.api.RepositoryFiles.create(
          this.projectId,
          path,
          this.ref,
          content,
          commitMessage,
          { encoding: 'base64' },
        );
      }

      // [EARS-B5] Re-read to get new blob_id and commit SHA
      const updated = await this.api.RepositoryFiles.show(
        this.projectId,
        path,
        this.ref,
      );
      this.cachedBlobId = String(updated.blob_id);

      return {
        commitSha: String(updated.last_commit_id),
        blobId: String(updated.blob_id),
      };
    } catch (error: unknown) {
      if (error instanceof GitLabApiError) throw error;
      throw mapGitbeakerError(error, `saveConfig ${this.projectId}/${path}`);
    }
  }

  /** Extracts HTTP status code from a Gitbeaker error. */
  private extractStatus(error: unknown): number | undefined {
    if (
      error instanceof Error &&
      'cause' in error &&
      typeof error.cause === 'object' &&
      error.cause !== null &&
      'response' in error.cause
    ) {
      const response = (error.cause as { response?: { status?: number } }).response;
      if (typeof response?.status === 'number') return response.status;
    }
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof (error as Record<string, unknown>)['statusCode'] === 'number'
    ) {
      return (error as Record<string, unknown>)['statusCode'] as number;
    }
    return undefined;
  }
}
