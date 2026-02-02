// IWatcherStateModule interface
export type { IWatcherStateModule } from './watcher_state';

// Types
export type {
  WatcherStateModuleDependencies,
  WatcherStateModuleOptions,
  WatcherStateStatus,
} from './watcher_state.types';

// Errors
export {
  WatcherStateError,
  ProjectNotInitializedError,
  WatcherSetupError,
  ChecksumMismatchError,
  isWatcherStateError,
  isProjectNotInitializedError,
  isWatcherSetupError,
  isChecksumMismatchError,
} from './watcher_state.errors';
