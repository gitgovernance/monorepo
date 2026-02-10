/**
 * Shared types for the @gitgov/core/github export path.
 *
 * These types are used by all GitHub API implementations:
 * GitHubFileLister, GitHubRecordStore, GitHubGitModule, GitHubConfigStore.
 *
 * All EARS prefixes map to their respective module blueprints.
 */

/**
 * HTTP fetch function signature for dependency injection (testability).
 * Defaults to globalThis.fetch in production.
 * In tests, inject a mock function to avoid real HTTP calls.
 */
export type GitHubFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Response from GitHub Contents API for a single file.
 * Used by FileLister, RecordStore, and ConfigStore.
 * @see https://docs.github.com/en/rest/repos/contents
 */
export type GitHubContentsResponse = {
  /** File name */
  name: string;
  /** File path relative to repo root */
  path: string;
  /** SHA of the blob */
  sha: string;
  /** File size in bytes */
  size: number;
  /** Base64-encoded file content (null if >1MB) */
  content: string | null;
  /** Content encoding ('base64') */
  encoding: string;
};

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
 * Used by RecordStore, ConfigStore, and other modules that
 * interact with GitHub Contents API directly.
 */
export class GitHubApiError extends Error {
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
