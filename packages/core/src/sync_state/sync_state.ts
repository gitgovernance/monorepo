/**
 * ISyncModule - State Synchronization Interface
 *
 * Defines the contract for state synchronization between local working tree
 * and a shared state branch. Implementations handle the I/O specifics:
 * - FsSyncModule: Uses local filesystem + git CLI (packages/core/src/sync/fs/)
 * - Future: GithubSyncModule via GitHub API
 *
 * @module sync
 */

import type {
  SyncPushOptions,
  SyncPushResult,
  SyncPullOptions,
  SyncPullResult,
  SyncResolveOptions,
  SyncResolveResult,
  AuditStateOptions,
  AuditStateReport,
  ConflictDiff,
  IntegrityViolation,
  StateDeltaFile,
} from "./sync.types";

/**
 * State synchronization module interface.
 *
 * Provides push/pull/resolve operations for syncing .gitgov/ records
 * with a shared state branch (e.g., gitgov-state).
 */
export interface ISyncModule {
  /** Returns the configured state branch name (default: "gitgov-state") */
  getStateBranchName(): Promise<string>;

  /** Ensures the state branch exists (creates if missing) */
  ensureStateBranch(): Promise<void>;

  /** Calculates the file delta between source branch and state branch */
  calculateStateDelta(sourceBranch: string): Promise<StateDeltaFile[]>;

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
  pushState(options: SyncPushOptions): Promise<SyncPushResult>;

  /** Pulls remote state changes into local .gitgov/ */
  pullState(options?: SyncPullOptions): Promise<SyncPullResult>;

  /** Resolves a rebase conflict with signed resolution commit */
  resolveConflict(options: SyncResolveOptions): Promise<SyncResolveResult>;
}
