/**
 * GitHubConfigStore - GitHub Contents API implementation of ConfigStore
 *
 * Persists config.json to a GitHub repository via the Contents API.
 * Used by SaaS/server-side environments where the project lives on GitHub
 * and direct filesystem access is not available.
 *
 * Key behaviors:
 * - loadConfig: GET contents, base64 decode, JSON parse. Fail-safe on 404/invalid JSON.
 * - saveConfig: JSON serialize + base64 encode, PUT contents with optional SHA for updates.
 * - Caches blob SHA from loadConfig for subsequent saveConfig (optimistic concurrency).
 */

import type { ConfigStore } from '../config_store';
import type { GitGovConfig } from '../../config_manager/config_manager.types';
import type { GitHubFetchFn, GitHubContentsResponse } from '../../github';
import type { GitHubConfigStoreOptions, GitHubSaveResponse, GitHubSaveResult } from './github_config_store.types';
import { GitHubApiError } from '../../github';

/**
 * GitHub Contents API-backed ConfigStore implementation.
 *
 * Reads and writes `.gitgov/config.json` (or custom basePath) from a GitHub
 * repository using the Contents API. Implements fail-safe pattern: returns
 * null on 404 or invalid JSON instead of throwing.
 *
 * @example
 * ```typescript
 * const store = new GitHubConfigStore({
 *   owner: 'my-org',
 *   repo: 'my-project',
 *   token: 'ghp_...',
 * });
 * const config = await store.loadConfig();
 * if (config) {
 *   config.projectName = 'Updated';
 *   await store.saveConfig(config);
 * }
 * ```
 */
export class GitHubConfigStore implements ConfigStore<GitHubSaveResult> {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly apiBaseUrl: string;
  private readonly fetchFn: GitHubFetchFn;

  /** Cached blob SHA from the last loadConfig call, used for PUT updates */
  private cachedSha: string | null = null;

  constructor(options: GitHubConfigStoreOptions, fetchFn?: GitHubFetchFn) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.ref = options.ref ?? 'main';
    this.basePath = options.basePath ?? '.gitgov';
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Load project configuration from GitHub Contents API.
   *
   * [EARS-A1] Returns GitGovConfig when valid JSON is found.
   * [EARS-A2] Returns null on 404 (fail-safe).
   * [EARS-A3] Returns null on invalid JSON (fail-safe).
   * [EARS-B1] Fetches via Contents API with base64 decode.
   * [EARS-B2] Caches SHA from response for subsequent saveConfig.
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/contents/${this.basePath}/config.json?ref=${this.ref}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitHubApiError(`Network error: ${message}`, 'NETWORK_ERROR');
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      throw new GitHubApiError(
        `Permission denied accessing ${this.owner}/${this.repo} config`,
        'PERMISSION_DENIED',
        response.status,
      );
    }

    if (response.status >= 500) {
      throw new GitHubApiError(
        `GitHub server error (${response.status})`,
        'SERVER_ERROR',
        response.status,
      );
    }

    const body = (await response.json()) as GitHubContentsResponse;

    // Cache SHA for subsequent saveConfig
    this.cachedSha = body.sha;

    // Decode base64 content
    if (!body.content) {
      return null;
    }

    try {
      const decoded = Buffer.from(body.content, 'base64').toString('utf-8');
      return JSON.parse(decoded) as GitGovConfig;
    } catch {
      // Invalid JSON - fail-safe
      return null;
    }
  }

  /**
   * Save project configuration to GitHub via Contents API PUT.
   *
   * [EARS-A4] Writes config via PUT to Contents API.
   * [EARS-B3] Includes cached SHA for updates (optimistic concurrency).
   * [EARS-B4] Omits SHA for initial creation.
   * [EARS-C1] Throws PERMISSION_DENIED on 401/403.
   * [EARS-C2] Throws CONFLICT on 409.
   * [EARS-C3] Throws SERVER_ERROR on 5xx.
   */
  async saveConfig(config: GitGovConfig): Promise<GitHubSaveResult> {
    const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/contents/${this.basePath}/config.json`;
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');

    const reqBody: Record<string, string> = {
      message: 'chore(config): update gitgov config.json',
      content,
      branch: this.ref,
    };

    if (this.cachedSha) {
      reqBody['sha'] = this.cachedSha;
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'PUT',
        headers: this.buildHeaders(),
        body: JSON.stringify(reqBody),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitHubApiError(`Network error: ${message}`, 'NETWORK_ERROR');
    }

    if (response.status === 401 || response.status === 403) {
      throw new GitHubApiError(
        `Permission denied writing to ${this.owner}/${this.repo} config`,
        'PERMISSION_DENIED',
        response.status,
      );
    }

    if (response.status === 409) {
      throw new GitHubApiError(
        `Conflict writing config.json (SHA mismatch)`,
        'CONFLICT',
        response.status,
      );
    }

    if (response.status >= 500) {
      throw new GitHubApiError(
        `GitHub server error (${response.status})`,
        'SERVER_ERROR',
        response.status,
      );
    }

    const result = (await response.json()) as GitHubSaveResponse;

    // Update cached SHA for subsequent saves
    this.cachedSha = result.content.sha;

    return { commitSha: result.commit.sha };
  }

  /**
   * Build common HTTP headers for GitHub API requests.
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }
}
