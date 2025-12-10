// Main module
export { SyncModule } from "./sync_module";
export { PullScheduler } from "./pull_scheduler";

// Types
export type {
  SyncModuleDependencies,
  SyncPushOptions,
  SyncPushResult,
  SyncPullOptions,
  SyncPullResult,
  SyncResolveOptions,
  SyncResolveResult,
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
} from "./types";

export type {
  PullSchedulerConfig,
  PullSchedulerDependencies,
  PullSchedulerResult,
} from "./pull_scheduler";

// Errors
export {
  SyncError,
  PushFromStateBranchError,
  IntegrityViolationError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  StateBranchSetupError,
  UncommittedChangesError,
  CryptoModuleRequiredError,
  // Type guards for error handling (additive - backward compatible)
  isSyncError,
  isPushFromStateBranchError,
  isIntegrityViolationError,
  isConflictMarkersPresentError,
  isUncommittedChangesError,
  isNoRebaseInProgressError,
  isStateBranchSetupError,
  isCryptoModuleRequiredError,
} from "./errors";

