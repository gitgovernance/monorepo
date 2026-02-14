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

// Errors
export {
  SyncStateError,
  PushFromStateBranchError,
  IntegrityViolationError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
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
  isStateBranchSetupError,
  isCryptoModuleRequiredError,
  isActorIdentityMismatchError,
  WorktreeSetupError,
  isWorktreeSetupError,
} from "./sync_state.errors";
