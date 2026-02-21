// ISyncStateModule interface
export type { ISyncStateModule } from "./sync_state";

// PullScheduler (pure, depends on interface not implementation)
export { PullScheduler } from "./pull_scheduler";

// Types
export type {
  SyncStateModuleDependencies,
  SyncStatePushOptions,
  SyncStatePushResult,
  SyncStatePullOptions,
  SyncStatePullResult,
  SyncStateResolveOptions,
  SyncStateResolveResult,
  ConflictInfo,
  ConflictType,
  IntegrityViolation,
  AuditStateOptions,
  AuditStateReport,
  AuditScope,
  ExpectedFilesScope,
  ConflictDiff,
  ConflictFileDiff,
  StateDeltaFile,
} from "./sync_state.types";

export type {
  PullSchedulerConfig,
  PullSchedulerDependencies,
  PullSchedulerResult,
} from "./pull_scheduler";

// Constants
export { DEFAULT_STATE_BRANCH } from "./fs_worktree/fs_worktree_sync_state.types";

// Errors
export {
  SyncStateError,
  PushFromStateBranchError,
  IntegrityViolationError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  RebaseAlreadyInProgressError,
  StateBranchSetupError,
  UncommittedChangesError,
  CryptoModuleRequiredError,
  ActorIdentityMismatchError,
  // Type guards for error handling
  isSyncStateError,
  isPushFromStateBranchError,
  isIntegrityViolationError,
  isConflictMarkersPresentError,
  isUncommittedChangesError,
  isNoRebaseInProgressError,
  isRebaseAlreadyInProgressError,
  isStateBranchSetupError,
  isCryptoModuleRequiredError,
  isActorIdentityMismatchError,
  WorktreeSetupError,
  isWorktreeSetupError,
} from "./sync_state.errors";
