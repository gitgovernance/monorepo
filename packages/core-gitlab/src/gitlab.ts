/**
 * GitLab API shared types and utilities for @gitgov/core-gitlab
 *
 * This module exports the error infrastructure shared by all GitLab backend modules.
 * Mirrors the structure of github.ts in @gitgov/core/github.
 *
 * Usage:
 *   import { GitLabApiError, mapGitbeakerError, isGitbeakerRequestError } from '@gitgov/core-gitlab';
 */

// ==================== Re-exports: Gitbeaker ====================

import { Gitlab as GitbeakerGitlab } from '@gitbeaker/rest';
/** Gitbeaker client instance type */
export type GitbeakerClient = InstanceType<typeof GitbeakerGitlab>;

// ==================== Shared Types ====================

/**
 * Error codes for GitLab API errors.
 * Semantic codes that abstract HTTP status codes.
 * Mirrors GitHubApiErrorCode for consistency across providers.
 */
export type GitLabApiErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_ID'
  | 'INVALID_RESPONSE';

/**
 * Typed error for GitLab API operations.
 * Used by ConfigStore, RecordStore, and SyncStateModule.
 * FileLister and GitModule have their own error hierarchies.
 */
export class GitLabApiError extends Error {
  constructor(
    message: string,
    /** Semantic error code */
    public readonly code: GitLabApiErrorCode,
    /** HTTP status code (if applicable — absent for NETWORK_ERROR) */
    public readonly statusCode?: number,
    /** Error options with cause for chaining */
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GitLabApiError';
  }
}

/**
 * Type guard: checks if an error is a Gitbeaker request error (duck-typing).
 * Gitbeaker errors can have `cause.response.status` or `statusCode` directly.
 * Uses duck-typing to avoid dependency on Gitbeaker internal types.
 *
 * [EARS-B1] Returns true for errors with cause.response.status
 * [EARS-B2] Returns true for errors with statusCode property
 * [EARS-B3] Returns false for non-Gitbeaker errors
 */
export function isGitbeakerRequestError(
  error: unknown,
): error is Error & { cause?: { response?: { status: number } }; statusCode?: number } {
  return (
    error instanceof Error &&
    (('cause' in error &&
      typeof error.cause === 'object' &&
      error.cause !== null &&
      'response' in error.cause) ||
      ('statusCode' in error &&
        typeof (error as Record<string, unknown>)['statusCode'] === 'number'))
  );
}

/**
 * Extracts HTTP status code from a Gitbeaker error.
 * Checks both `cause.response.status` and `statusCode` formats.
 */
function extractStatusCode(error: Error & { cause?: { response?: { status: number } }; statusCode?: number }): number | undefined {
  if (error.cause && typeof error.cause === 'object' && 'response' in error.cause) {
    const response = error.cause.response as { status?: number };
    if (typeof response.status === 'number') {
      return response.status;
    }
  }
  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

/**
 * Maps Gitbeaker error (and unknown errors) to GitLabApiError.
 * Shared utility used by ConfigStore, RecordStore, and SyncStateModule.
 *
 * Translation table:
 *   401/403 → PERMISSION_DENIED
 *   404     → NOT_FOUND
 *   409     → CONFLICT
 *   5xx     → SERVER_ERROR
 *   other   → SERVER_ERROR
 *   non-HTTP → NETWORK_ERROR
 *
 * Always returns GitLabApiError — never throws.
 * Preserves original error as `cause` for debugging.
 *
 * [EARS-A1] 401/403 → PERMISSION_DENIED
 * [EARS-A2] 404 → NOT_FOUND
 * [EARS-A3] 409 → CONFLICT
 * [EARS-A4] 400 → SERVER_ERROR (validation error)
 * [EARS-A5] 5xx → SERVER_ERROR
 * [EARS-A6] Other status → SERVER_ERROR
 * [EARS-A7] Non-HTTP → NETWORK_ERROR
 */
export function mapGitbeakerError(error: unknown, context: string): GitLabApiError {
  if (isGitbeakerRequestError(error)) {
    const status = extractStatusCode(error);

    if (status === 401 || status === 403) {
      return new GitLabApiError(
        `Permission denied: ${context}`,
        'PERMISSION_DENIED',
        status,
        { cause: error },
      );
    }
    if (status === 404) {
      return new GitLabApiError(
        `Not found: ${context}`,
        'NOT_FOUND',
        status,
        { cause: error },
      );
    }
    if (status === 409) {
      return new GitLabApiError(
        `Conflict: ${context}`,
        'CONFLICT',
        status,
        { cause: error },
      );
    }
    if (status !== undefined && status >= 500) {
      return new GitLabApiError(
        `Server error (${status}): ${context}`,
        'SERVER_ERROR',
        status,
        { cause: error },
      );
    }

    return new GitLabApiError(
      `GitLab API error (${status ?? 'unknown'}): ${context}`,
      'SERVER_ERROR',
      status,
      { cause: error },
    );
  }

  // Network / unknown errors
  const message = error instanceof Error ? error.message : String(error);
  return new GitLabApiError(
    `Network error: ${message}`,
    'NETWORK_ERROR',
    undefined,
    { cause: error instanceof Error ? error : new Error(String(error)) },
  );
}
