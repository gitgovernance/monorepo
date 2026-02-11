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
 * Each implementation receives a `fetchFn` for testability (default: globalThis.fetch).
 */

// ==================== Shared Types ====================

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

// ==================== Module Exports ====================

// FileLister
export { GitHubFileLister } from './file_lister/github';
export type {
  GitHubFileListerOptions,
  GitHubTreeEntry,
} from './file_lister/github';

// RecordStore
export { GitHubRecordStore } from './record_store/github';
export type {
  GitHubRecordStoreOptions,
  GitHubCreateUpdateResponse,
  GitHubWriteResult,
  GitHubWriteOpts,
} from './record_store/github';

// GitModule
export { GitHubGitModule } from './git/github';
export type {
  GitHubGitModuleOptions,
  StagingEntry,
  GitHubRefResponse,
  GitHubCommitResponse,
  GitHubCompareResponse,
} from './git/github';

// ConfigStore
export { GitHubConfigStore } from './config_store/github';
export type {
  GitHubConfigStoreOptions,
  GitHubSaveResponse,
  GitHubSaveResult,
} from './config_store/github';
