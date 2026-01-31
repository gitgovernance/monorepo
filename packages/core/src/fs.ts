/**
 * Filesystem-dependent implementations
 *
 * This module exports all implementations that require filesystem access.
 * Use @gitgov/core/memory for serverless/in-memory alternatives.
 */

// Store
export { FsRecordStore, DEFAULT_ID_ENCODER } from './record_store/fs';

// ConfigStore + ConfigManager Factories
export {
  FsConfigStore,
  // Factory with explicit projectRoot (for DI containers)
  createConfigManager,
} from './config_store/fs';

// SessionStore + SessionManager Factories
export {
  FsSessionStore,
  // Factory with explicit projectRoot (for DI containers)
  createSessionManager,
} from './session_store/fs';

// KeyProvider
export { FsKeyProvider } from './key_provider/fs';
export type { FsKeyProviderOptions } from './key_provider/fs';

// FileLister
export { FsFileLister } from './file_lister/fs';
export type { FsFileListerOptions } from './file_lister/fs';

// FsLintModule
export { FsLintModule } from './lint/fs';
export type {
  IFsLintModule,
  FsLintModuleDependencies,
  FsLintOptions,
  FsFixOptions,
  FileSystem,
} from './lint/fs/fs_lint.types';

// ProjectInitializer
export { FsProjectInitializer } from './project_initializer/fs';

// LocalGitModule (CLI-based, uses execCommand for git operations)
export { LocalGitModule, LocalGitModule as GitModule } from './git/local';
export type { IGitModule, GitModuleDependencies } from './git';

// Project Discovery (filesystem-based project root detection)
export {
  findProjectRoot,
  findGitgovRoot,
  getGitgovPath,
  isGitgovProject,
  resetDiscoveryCache,
} from './utils/project_discovery';

// FsSyncStateModule (filesystem-based state synchronization)
export { FsSyncStateModule } from './sync_state/fs';

// AgentRunner (filesystem-based agent execution)
export { FsAgentRunner, createAgentRunner } from './agent_runner/fs';
export type { FsAgentRunnerDependencies } from './agent_runner/fs';
