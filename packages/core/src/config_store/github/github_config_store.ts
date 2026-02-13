/**
 * GitHubConfigStore - GitHub Contents API implementation of ConfigStore
 *
 * Persists config.json to a GitHub repository via Octokit.
 * Used by SaaS/server-side environments where the project lives on GitHub
 * and direct filesystem access is not available.
 *
 * Key behaviors:
 * - loadConfig: GET contents, base64 decode, JSON parse. Fail-safe on 404/invalid JSON.
 * - saveConfig: JSON serialize + base64 encode, PUT contents with optional SHA for updates.
 * - Caches blob SHA from loadConfig for subsequent saveConfig (optimistic concurrency).
 */

import type { Octokit } from '@octokit/rest';
import type { ConfigStore } from '../config_store';
import type { GitGovConfig } from '../../config_manager/config_manager.types';
import type { GitHubConfigStoreOptions, GitHubSaveResult } from './github_config_store.types';
import { mapOctokitError, isOctokitRequestError } from '../../github';

export class GitHubConfigStore implements ConfigStore<GitHubSaveResult> {
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly octokit: Octokit;

  /** Cached blob SHA from the last loadConfig call, used for PUT updates */
  private cachedSha: string | null = null;

  constructor(options: GitHubConfigStoreOptions, octokit: Octokit) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath ?? '.gitgov';
    this.octokit = octokit;
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
    const path = `${this.basePath}/config.json`;

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.ref,
      });

      // getContent can return array (directory) — we expect a file
      if (Array.isArray(data) || data.type !== 'file') {
        return null;
      }

      // Decode base64 content
      if (!data.content) {
        return null;
      }

      // Cache SHA for subsequent saveConfig (only when content is present)
      this.cachedSha = data.sha;

      try {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return JSON.parse(decoded) as GitGovConfig;
      } catch {
        // Invalid JSON - fail-safe
        return null;
      }
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return null;
      }
      throw mapOctokitError(error, `loadConfig ${this.owner}/${this.repo}/${path}`);
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
    const path = `${this.basePath}/config.json`;
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');

    try {
      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: 'chore(config): update gitgov config.json',
        content,
        branch: this.ref,
        ...(this.cachedSha ? { sha: this.cachedSha } : {}),
      });

      // Update cached SHA for subsequent saves
      if (data.content?.sha) {
        this.cachedSha = data.content.sha;
      }

      return { commitSha: data.commit.sha! };
    } catch (error: unknown) {
      throw mapOctokitError(error, `saveConfig ${this.owner}/${this.repo}/${path}`);
    }
  }
}
