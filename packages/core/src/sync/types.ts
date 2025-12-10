import type { GitModule } from "../git";
import type { ConfigManager } from "../config_manager";
import type { IIdentityAdapter } from "../adapters/identity_adapter";
import type { LintModule, LintReport } from "../lint";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";

/**
 * SyncModule Dependencies
 */
export interface SyncModuleDependencies {
  /** Low-level Git module (required) */
  git: GitModule;
  /** Configuration manager (required) */
  config: ConfigManager;
  /** Identity adapter for signature verification and signing (required) */
  identity: IIdentityAdapter;
  /** Lint module for record validation (required) */
  lint: LintModule;
  /** Indexer adapter for automatic re-indexing after pull/resolve (required) */
  indexer: IIndexerAdapter;
}

/**
 * Options for pushState operation
 */
export interface SyncPushOptions {
  /** Branch to push from (default: current branch) */
  sourceBranch?: string;
  /** Actor ID publishing the state (required) */
  actorId: string;
  /** Simulate operation without making real changes */
  dryRun?: boolean;
  /** Force push even if there are unsynced remote changes */
  force?: boolean;
}

/**
 * Result of pushState operation
 */
export interface SyncPushResult {
  /** Indicates if the operation was successful */
  success: boolean;
  /** Number of files synced */
  filesSynced: number;
  /** Name of the branch pushed from */
  sourceBranch: string;
  /** Created commit hash (null if no changes or dry-run) */
  commitHash: string | null;
  /** Created commit message */
  commitMessage: string | null;
  /** Indicates if a conflict was detected during reconciliation */
  conflictDetected: boolean;
  /** Conflict information if detected */
  conflictInfo?: ConflictInfo;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Options for pullState operation
 */
export interface SyncPullOptions {
  /** Force re-indexing even if there are no new changes */
  forceReindex?: boolean;
}

/**
 * Result of pullState operation
 */
export interface SyncPullResult {
  /** Indicates if the operation was successful */
  success: boolean;
  /** Indicates if there were new remote changes */
  hasChanges: boolean;
  /** Number of files updated */
  filesUpdated: number;
  /** Indicates if re-indexing was executed */
  reindexed: boolean;
  /** Indicates if a conflict was detected during pull */
  conflictDetected: boolean;
  /** Conflict information if detected */
  conflictInfo?: ConflictInfo;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Options for resolveConflict operation
 */
export interface SyncResolveOptions {
  /** Justification for the conflict resolution (required) */
  reason: string;
  /** Actor ID resolving the conflict (required) */
  actorId: string;
}

/**
 * Result of resolveConflict operation
 */
export interface SyncResolveResult {
  /** Indicates if the operation was successful */
  success: boolean;
  /** Commit hash of the created rebase commit */
  rebaseCommitHash: string;
  /** Commit hash of the signed resolution commit */
  resolutionCommitHash: string;
  /** Number of conflicts resolved */
  conflictsResolved: number;
  /** Actor ID who resolved the conflict */
  resolvedBy: string;
  /** Reason for resolution */
  reason: string;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Detailed information about a detected conflict
 */
export interface ConflictInfo {
  /** Type of conflict detected */
  type: ConflictType;
  /** Files affected by the conflict */
  affectedFiles: string[];
  /** Descriptive message of the conflict */
  message: string;
  /** Instructions to resolve the conflict */
  resolutionSteps: string[];
}

/**
 * Auxiliary type to identify the conflict type
 */
export type ConflictType =
  | "rebase_conflict" // Conflict during automatic rebase
  | "merge_conflict" // Conflict during merge
  | "integrity_violation" // Integrity violation (rebase without resolution)
  | "unresolved_markers"; // Conflict markers present in files

/**
 * Information about a detected integrity violation
 */
export interface IntegrityViolation {
  /** Commit hash of the rebase commit without resolution */
  rebaseCommitHash: string;
  /** Message of the rebase commit */
  commitMessage: string;
  /** Timestamp of the commit */
  timestamp: string;
  /** Author of the commit */
  author: string;
}

/**
 * Verification scope for state audit
 */
export type AuditScope =
  | "current" // Only verify Records in the current branch (useful for pre-push)
  | "state-branch" // Only verify Records in gitgov-state (useful for remote audit)
  | "all"; // Verify both (useful for complete audit)

/**
 * Scope for expected files verification
 */
export type ExpectedFilesScope =
  | "head" // Only verify in HEAD of gitgov-state (default, faster)
  | "all-commits"; // Verify in all commits (more exhaustive, slower)

/**
 * Options for state audit
 */
export interface AuditStateOptions {
  /** Verification scope: which Records to verify (default: "all") */
  scope?: AuditScope;
  /** Verify signatures in Records (default: true) */
  verifySignatures?: boolean;
  /** Verify checksums of Records (default: true) */
  verifyChecksums?: boolean;
  /** Verify that expected files exist (default: true) */
  verifyExpectedFiles?: boolean;
  /** Scope for expected files verification (default: "head") */
  expectedFilesScope?: ExpectedFilesScope;
  /** Path of specific files to audit (default: all in .gitgov/) */
  filePaths?: string[];
}

/**
 * Conflict diff information for a file
 */
export interface ConflictFileDiff {
  /** Path of the conflicted file */
  filePath: string;
  /** Content of the local version (ours) */
  localContent: string;
  /** Content of the remote version (theirs) */
  remoteContent: string;
  /** Base content (common ancestor) */
  baseContent: string | null;
  /** Lines with conflict markers (if they still exist) */
  conflictMarkers?: Array<{
    line: number;
    marker: string; // "<<<<<", "=====", ">>>>>"
  }>;
}

/**
 * Structured conflict diff
 */
export interface ConflictDiff {
  /** Conflicted files with their diff */
  files: ConflictFileDiff[];
  /** Descriptive message of the conflict */
  message: string;
  /** Instructions to resolve */
  resolutionSteps: string[];
}

/**
 * Complete state audit report
 * 
 * This report combines SyncModule-specific audits (rebase integrity, commits)
 * with structural validation from LintModule (signatures, checksums, schemas).
 */
export interface AuditStateReport {
  /** Indicates if the audit passed without violations */
  passed: boolean;
  /** Scope used for the audit */
  scope: AuditScope;
  /** Total commits analyzed */
  totalCommits: number;
  /** Rebase commits found */
  rebaseCommits: number;
  /** Resolution commits found */
  resolutionCommits: number;
  /** Integrity violations of resolutions (SyncModule-specific) */
  integrityViolations: IntegrityViolation[];
  /** Summary message of the audit */
  summary: string;
  /** Complete LintModule report for structural validation (signatures, checksums, schemas, etc.) */
  lintReport?: LintReport;
}

/**
 * Information of a changed file in the delta
 */
export interface StateDeltaFile {
  /** File status: Added, Modified, Deleted */
  status: "A" | "M" | "D";
  /** File path */
  file: string;
}

/**
 * Whitelist of files and directories allowed for synchronization.
 * Only these paths will be copied from .gitgov/ to gitgov-state.
 * 
 * [EARS-42] Explicitly defines what gets synced, avoiding temporary files,
 * builds, scripts, and local configurations like .gitignore
 * 
 * Excluded (not in whitelist):
 * - builds/ (local build artifacts)
 * - scripts/ (local helper scripts)
 * - .gitignore (per-branch file, should not be synced)
 * - *.backup-* (backup files)
 * - *.tmp (temporary files)
 * - .DS_Store (macOS metadata)
 */
/**
 * Directories to SYNC to gitgov-state branch (shared state)
 * Only *.json files within these directories will be synced
 */
export const SYNC_DIRECTORIES = [
  'tasks',
  'cycles',
  'actors',
  'agents',
  'feedback',
  'executions',
  'changelogs',
  'workflows',
] as const;

/**
 * Root-level files to SYNC to gitgov-state
 */
export const SYNC_ROOT_FILES = [
  'config.json',
] as const;

/**
 * File extensions that are ALLOWED to be synced
 * Only these extensions will be copied to gitgov-state
 */
export const SYNC_ALLOWED_EXTENSIONS = ['.json'] as const;

/**
 * File patterns that are NEVER synced (even if they match allowed extensions)
 * These are excluded from gitgov-state branch
 */
export const SYNC_EXCLUDED_PATTERNS = [
  /\.key$/,           // Private keys (e.g., actors/*.key)
  /\.backup$/,        // Backup files from lint
  /\.backup-\d+$/,    // Numbered backup files
  /\.tmp$/,           // Temporary files
  /\.bak$/,           // Backup files
] as const;

/**
 * Files/directories that are LOCAL-ONLY (never synced to gitgov-state)
 * These are regenerated or machine-specific
 */
export const LOCAL_ONLY_FILES = [
  'index.json',      // Generated index, rebuilt on each machine
  '.session.json',   // Local session state for current user/agent
  'gitgov',          // Local binary/script
] as const;

