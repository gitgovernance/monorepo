/**
 * @gitgov/core-gitlab — GitLab REST API provider for GitGovernance
 *
 * This package provides GitLab implementations of the core interfaces
 * defined in @gitgov/core: FileLister, ConfigStore, RecordStore,
 * IGitModule, and ISyncStateModule.
 *
 * Usage:
 *   import { GitLabFileLister, GitLabConfigStore, GitLabApiError } from '@gitgov/core-gitlab';
 */

// Shared error infrastructure
export {
  GitLabApiError,
  type GitLabApiErrorCode,
  mapGitbeakerError,
  isGitbeakerRequestError,
} from './gitlab';

// Re-export Gitbeaker client type
export type { GitbeakerClient } from './gitlab';

// FileLister
export { GitLabFileLister } from './file_lister';
export type { GitLabFileListerOptions } from './file_lister';

// ConfigStore
export { GitLabConfigStore } from './config_store';
export type {
  GitLabConfigStoreOptions,
  GitLabSaveResult,
} from './config_store';

// RecordStore
export { GitLabRecordStore } from './record_store';
export type {
  GitLabRecordStoreOptions,
  GitLabWriteResult,
  GitLabWriteOpts,
} from './record_store';

// GitModule
export { GitLabGitModule } from './git';
export type { GitLabGitModuleOptions } from './git';
