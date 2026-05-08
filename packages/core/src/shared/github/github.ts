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

import { GitError } from '../../git/errors';

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
 *
 * Uses TypeScript 4.9+ structural narrowing (`'status' in error`) — no casts.
 */
export function isOctokitRequestError(error: unknown): error is { status: number; message: string } {
  if (!(error instanceof Error)) return false;
  if (!('status' in error)) return false;
  return typeof error.status === 'number';
}

/**
 * [EARS-D4] Detects whether an unknown error is a GitHub rate-limit failure
 * (primary or secondary), using the canonical detection pattern documented at
 * https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
 *
 * Returns `true` only when ALL of the following hold:
 *   - error is an Error with numeric `status` of 403 OR 429 (both are valid
 *     rate-limit codes per GitHub docs — primary uses 403/429, secondary same)
 *   - error.response.headers['x-ratelimit-remaining'] is present AND equals 0
 *     (true for both primary AND secondary rate limit per docs)
 *
 * Used to distinguish rate-limit failures from permission-denial 403s (which
 * carry the same status but no `x-ratelimit-remaining: 0` header).
 *
 * Never throws — graceful `false` on any structural mismatch.
 */
export function isOctokitRateLimitError(error: unknown): boolean {
  if (!isOctokitRequestError(error)) return false;
  if (error.status !== 403 && error.status !== 429) return false;
  if (!('response' in error)) return false;
  const response = error.response;
  if (typeof response !== 'object' || response === null) return false;
  if (!('headers' in response)) return false;
  const headers = response.headers;
  if (typeof headers !== 'object' || headers === null) return false;
  if (!('x-ratelimit-remaining' in headers)) return false;
  const remaining = headers['x-ratelimit-remaining'];
  if (typeof remaining === 'string') return parseInt(remaining, 10) === 0;
  if (typeof remaining === 'number') return remaining === 0;
  return false;
}

/**
 * [EARS-D1][EARS-D2][EARS-D3] Extracts the `x-ratelimit-reset` Unix timestamp from an
 * Octokit error's response headers. Returns `undefined` if the input is not an Error,
 * lacks `response.headers`, or the header is missing/invalid. Never throws.
 *
 * Used by GitHubFileLister.readBatch to populate FileListerError.details.resetTime
 * when a 403 rate limit is hit mid-batch (see github_file_lister §4.4 EARS-D3).
 */
export function getOctokitRateLimitReset(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  if (!('response' in error)) return undefined;
  const response = error.response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('headers' in response)) return undefined;
  const headers = response.headers;
  if (typeof headers !== 'object' || headers === null) return undefined;
  if (!('x-ratelimit-reset' in headers)) return undefined;
  const reset = headers['x-ratelimit-reset'];
  if (typeof reset === 'string') {
    const n = parseInt(reset, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof reset === 'number') return reset;
  return undefined;
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
export { GithubSyncStateModule } from '../../sync_state/github_sync_state';
export type { GithubSyncStateDependencies } from '../../sync_state/github_sync_state';

// FileLister
export { GitHubFileLister } from '../../file_lister/github';
export type {
  GitHubFileListerOptions,
} from '../../file_lister/github';

// RecordStore
export { GitHubRecordStore } from '../../record_store/github';
export type {
  GitHubRecordStoreOptions,
  GitHubWriteResult,
  GitHubWriteOpts,
} from '../../record_store/github';

// GitModule
export { GitHubGitModule } from '../../git/github';
export type { GitHubGitModuleOptions } from '../../git/github';

// ConfigStore
export { GitHubConfigStore } from '../../config_store/github';
export type {
  GitHubConfigStoreOptions,
  GitHubSaveResult,
} from '../../config_store/github';

// PolicyConfigLoader
export { GitHubPolicyConfigLoader } from '../../policy_evaluator/github/github_policy_config_loader';
export type { GitHubPolicyConfigLoaderOptions } from '../../policy_evaluator/github/github_policy_config_loader';

// ProjectInitializer
export { GitHubProjectInitializer } from '../../project_initializer/github';
export type { GitHubProjectInitializerOptions } from '../../project_initializer/github';

// CiReporter (8th sibling — G19)
export { GitHubCiReporter } from '../../ci_reporter/github';
