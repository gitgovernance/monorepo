/**
 * ISyncStateModule - State Synchronization Interface
 *
 * Defines the contract for state synchronization between local working tree
 * and a shared state branch. Implementations handle the I/O specifics:
 * - FsSyncStateModule: Uses local filesystem + git CLI (packages/core/src/sync_state/fs/)
 * - GithubSyncStateModule: Uses GitHub API via Octokit (packages/core/src/sync_state/github_sync_state/)
 *
 * @module sync_state
 */

import type {
  SyncStatePushOptions,
  SyncStatePushResult,
  SyncStatePullOptions,
  SyncStatePullResult,
  SyncStateResolveOptions,
  SyncStateResolveResult,
  AuditStateOptions,
  AuditStateReport,
  ConflictDiff,
  IntegrityViolation,
  StateDeltaFile,
} from "./sync_state.types";

/**
 * State synchronization module interface.
 *
 * Provides push/pull/resolve operations for syncing .gitgov/ records
 * with a shared state branch (e.g., gitgov-state).
 */
export interface ISyncStateModule {
  /** Returns the configured state branch name (default: "gitgov-state") */
  getStateBranchName(): Promise<string>;

  /** Ensures the state branch exists (creates if missing) */
  ensureStateBranch(): Promise<void>;

  /** Calculates the file delta between source branch and state branch */
  calculateStateDelta(sourceBranch: string): Promise<StateDeltaFile[]>;

  /** Returns pending local changes not yet synced to the state branch */
  getPendingChanges(): Promise<StateDeltaFile[]>;

  /** Checks if a rebase operation is currently in progress */
  isRebaseInProgress(): Promise<boolean>;

  /** Returns list of files that still contain conflict markers */
  checkConflictMarkers(filePaths: string[]): Promise<string[]>;

  /** Returns structured diff information for conflicted files */
  getConflictDiff(filePaths?: string[]): Promise<ConflictDiff>;

  /** Verifies that all rebase commits have corresponding resolution commits */
  verifyResolutionIntegrity(): Promise<IntegrityViolation[]>;

  /** Audits the state branch for integrity violations and structural issues */
  auditState(options?: AuditStateOptions): Promise<AuditStateReport>;

  /** Pushes local .gitgov/ state to the shared state branch */
  pushState(options: SyncStatePushOptions): Promise<SyncStatePushResult>;

  /** Pulls remote state changes into local .gitgov/ */
  pullState(options?: SyncStatePullOptions): Promise<SyncStatePullResult>;

  /** Resolves a rebase conflict with signed resolution commit */
  resolveConflict(options: SyncStateResolveOptions): Promise<SyncStateResolveResult>;
}
