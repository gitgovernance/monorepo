/**
 * GitModule - Low-level Git Operations
 * 
 * This module provides a business-agnostic abstraction layer for Git operations.
 * 
 * @module git
 */

export { GitModule } from './git_module.js';

export type {
  GitModuleDependencies,
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from './types.js';

export {
  GitError,
  GitCommandError,
  BranchNotFoundError,
  FileNotFoundError,
  MergeConflictError,
  RebaseConflictError,
  RebaseNotInProgressError,
} from './errors.js';

