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

// Shared types
export type {
  GitHubFetchFn,
  GitHubContentsResponse,
  GitHubApiErrorCode,
} from './github/github.types';
export { GitHubApiError } from './github/github.types';

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
