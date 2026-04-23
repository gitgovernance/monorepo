/**
 * GitHub API implementations for @gitgov/core/github
 *
 * This module exports all implementations that use GitHub REST API.
 * Suitable for SaaS environments, Forge apps, GitHub Actions,
 * and any context without local filesystem access.
 *
 * Usage:
 *   import { GitHubFileLister, GitHubRecordStore, GitHubGitModule, GitHubConfigStore } from '@gitgov/core/github';
 *
 * Each implementation receives an `Octokit` instance for testability and shared auth/base-URL config.
 */

// ==================== Re-exports: Octokit (types only) ====================

export type { Octokit, RestEndpointMethodTypes } from '@octokit/rest';

import { GitError } from './git/errors';

// ==================== Shared Types ====================

/**
 * Error codes for GitHub API errors.
 * Semantic codes that abstract HTTP status codes.
 */
export type GitHubApiErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_ID'
  | 'INVALID_RESPONSE';

/**
 * Typed error for GitHub API operations.
 * Used by RecordStore, ConfigStore, GitHubGitModule, and other modules that
 * interact with GitHub Contents API directly.
 *
 * Extends `GitError` so consumers that catch the base git error class
 * still receive GitHub-backend errors polymorphically. This enables
 * `catch (err instanceof GitError)` to handle both CLI and API failures
 * uniformly while still allowing narrow `instanceof GitHubApiError` checks
 * for backend-specific logic (e.g. inspecting the semantic `code` field).
 */
export class GitHubApiError extends GitError {
  constructor(
    message: string,
    /** Semantic error code */
    public readonly code: GitHubApiErrorCode,
    /** HTTP status code (if applicable) */
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
    Object.setPrototypeOf(this, GitHubApiError.prototype);
  }
}

/**
 * Type guard: checks if an error is an Octokit RequestError (duck-typing).
 * Avoids runtime import of ESM-only @octokit/request-error.
 */
export function isOctokitRequestError(error: unknown): error is { status: number; message: string } {
  return (
    error instanceof Error &&
    typeof (error as unknown as Record<string, unknown>)['status'] === 'number'
  );
}

/**
 * Maps Octokit RequestError (and unknown errors) to GitHubApiError.
 * Shared utility used by all GitHub backend modules.
 */
export function mapOctokitError(error: unknown, context: string): GitHubApiError {
  if (isOctokitRequestError(error)) {
    const status = error.status;

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
    if (status === 422) {
      return new GitHubApiError(
        `Validation failed: ${context}`,
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
      `GitHub API error (${status}): ${context}`,
      'SERVER_ERROR',
      status,
    );
  }

  // Network / unknown errors
  const message = error instanceof Error ? error.message : String(error);
  return new GitHubApiError(`Network error: ${message}`, 'NETWORK_ERROR');
}

// ==================== Module Exports ====================

// SyncState
export { GithubSyncStateModule } from './sync_state/github_sync_state';
export type { GithubSyncStateDependencies } from './sync_state/github_sync_state';

// FileLister
export { GitHubFileLister } from './file_lister/github';
export type {
  GitHubFileListerOptions,
} from './file_lister/github';

// RecordStore
export { GitHubRecordStore } from './record_store/github';
export type {
  GitHubRecordStoreOptions,
  GitHubWriteResult,
  GitHubWriteOpts,
} from './record_store/github';

// GitModule
export { GitHubGitModule } from './git/github';
export type { GitHubGitModuleOptions } from './git/github';

// ConfigStore
export { GitHubConfigStore } from './config_store/github';
export type {
  GitHubConfigStoreOptions,
  GitHubSaveResult,
} from './config_store/github';

// PolicyConfigLoader
export { GitHubPolicyConfigLoader } from './policy_evaluator/github/github_policy_config_loader';
export type { GitHubPolicyConfigLoaderOptions } from './policy_evaluator/github/github_policy_config_loader';

// ProjectInitializer
export { GitHubProjectInitializer } from './project_initializer/github';
export type { GitHubProjectInitializerOptions } from './project_initializer/github';
