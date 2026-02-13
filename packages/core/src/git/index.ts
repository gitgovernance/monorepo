/**
 * GitModule - Low-level Git Operations
 *
 * This module provides backend-agnostic access to Git operations.
 *
 * IMPORTANT: This module only exports the interface and types.
 * For implementations, use:
 * - @gitgov/core/fs for LocalGitModule (CLI-based)
 * - @gitgov/core/memory for MemoryGitModule (testing)
 *
 * @example
 * ```typescript
 * // Import interface and types
 * import type { IGitModule } from '@gitgov/core';
 *
 * // Import CLI implementation from fs entry point
 * import { LocalGitModule } from '@gitgov/core/fs';
 *
 * // Import memory implementation from memory entry point
 * import { MemoryGitModule } from '@gitgov/core/memory';
 * ```
 *
 * @module git
 */

import type {
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * IGitModule - Interface for Git operations
 *
 * Implementations:
 * - LocalGitModule: Uses execCommand to run git CLI (production)
 * - MemoryGitModule: In-memory mock for unit tests
 * - Future: GitHubGitModule for SaaS API-based operations
 *
 * All methods are async to support both local CLI execution
 * and future API-based implementations (GitHub REST/GraphQL).
 */
export interface IGitModule {
  // Command Execution
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

  // Initialization
  init(): Promise<void>;

  // Read Operations
  getRepoRoot(): Promise<string>;
  getCurrentBranch(): Promise<string>;
  getCommitHash(ref?: string): Promise<string>;
  setConfig(key: string, value: string, scope?: 'local' | 'global' | 'system'): Promise<void>;
  getMergeBase(branchA: string, branchB: string): Promise<string>;
  getChangedFiles(fromCommit: string, toCommit: string, pathFilter: string): Promise<ChangedFile[]>;
  getStagedFiles(): Promise<string[]>;
  getFileContent(commitHash: string, filePath: string): Promise<string>;
  getCommitHistory(branch: string, options?: GetCommitHistoryOptions): Promise<CommitInfo[]>;
  getCommitHistoryRange(fromHash: string, toHash: string, options?: GetCommitHistoryOptions): Promise<CommitInfo[]>;
  getCommitMessage(commitHash: string): Promise<string>;
  hasUncommittedChanges(pathFilter?: string): Promise<boolean>;
  isRebaseInProgress(): Promise<boolean>;
  branchExists(branchName: string): Promise<boolean>;
  listRemoteBranches(remoteName: string): Promise<string[]>;
  isRemoteConfigured(remoteName: string): Promise<boolean>;
  getBranchRemote(branchName: string): Promise<string | null>;
  getConflictedFiles(): Promise<string[]>;

  // Write Operations
  checkoutBranch(branchName: string): Promise<void>;
  stash(message?: string): Promise<string | null>;
  stashPop(): Promise<boolean>;
  stashDrop(stashHash?: string): Promise<void>;
  checkoutOrphanBranch(branchName: string): Promise<void>;
  fetch(remote: string): Promise<void>;
  pull(remote: string, branchName: string): Promise<void>;
  pullRebase(remote: string, branchName: string): Promise<void>;
  resetHard(target: string): Promise<void>;
  checkoutFilesFromBranch(sourceBranch: string, filePaths: string[]): Promise<void>;
  add(filePaths: string[], options?: { force?: boolean; contentMap?: Record<string, string> }): Promise<void>;
  rm(filePaths: string[]): Promise<void>;
  commit(message: string, author?: CommitAuthor): Promise<string>;
  commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string>;
  push(remote: string, branchName: string): Promise<void>;
  pushWithUpstream(remote: string, branchName: string): Promise<void>;
  setUpstream(branchName: string, remote: string, remoteBranch: string): Promise<void>;

  // Rebase Operations
  rebaseContinue(): Promise<string>;
  rebaseAbort(): Promise<void>;
  createBranch(branchName: string, startPoint?: string): Promise<void>;
  rebase(targetBranch: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type {
  GitModuleDependencies,
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════════════════

export {
  GitError,
  GitCommandError,
  BranchNotFoundError,
  BranchAlreadyExistsError,
  FileNotFoundError,
  MergeConflictError,
  RebaseConflictError,
  RebaseNotInProgressError,
} from './errors';
