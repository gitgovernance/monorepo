/**
 * Custom Error Classes for GitModule
 * 
 * These errors provide typed exceptions for better error handling
 * and diagnostics in the Git module operations.
 */

/**
 * Base error class for all Git-related errors
 */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
    Object.setPrototypeOf(this, GitError.prototype);
  }
}

/**
 * Error thrown when a Git command fails
 */
export class GitCommandError extends GitError {
  public readonly stderr: string;
  public readonly stdout?: string;
  public readonly command?: string | undefined;

  constructor(message: string, stderr: string = '', command?: string | undefined, stdout?: string) {
    super(message);
    this.name = 'GitCommandError';
    this.stderr = stderr;
    this.stdout = stdout;
    this.command = command;
    Object.setPrototypeOf(this, GitCommandError.prototype);
  }
}

/**
 * Error thrown when a branch does not exist
 */
export class BranchNotFoundError extends GitError {
  public readonly branchName: string;

  constructor(branchName: string) {
    super(`Branch not found: ${branchName}`);
    this.name = 'BranchNotFoundError';
    this.branchName = branchName;
    Object.setPrototypeOf(this, BranchNotFoundError.prototype);
  }
}

/**
 * Error thrown when a file does not exist in a commit
 */
export class FileNotFoundError extends GitError {
  public readonly filePath: string;
  public readonly commitHash: string;

  constructor(filePath: string, commitHash: string) {
    super(`File not found: ${filePath} in commit ${commitHash}`);
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
    this.commitHash = commitHash;
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

/**
 * Error thrown when a merge conflict occurs
 */
export class MergeConflictError extends GitError {
  public readonly conflictedFiles: string[];

  constructor(conflictedFiles: string[]) {
    super(`Merge conflict detected in ${conflictedFiles.length} file(s)`);
    this.name = 'MergeConflictError';
    this.conflictedFiles = conflictedFiles;
    Object.setPrototypeOf(this, MergeConflictError.prototype);
  }
}

/**
 * Error thrown when a rebase conflict occurs
 */
export class RebaseConflictError extends GitError {
  public readonly conflictedFiles: string[];

  constructor(conflictedFiles: string[]) {
    super(`Rebase conflict detected in ${conflictedFiles.length} file(s)`);
    this.name = 'RebaseConflictError';
    this.conflictedFiles = conflictedFiles;
    Object.setPrototypeOf(this, RebaseConflictError.prototype);
  }
}

/**
 * Error thrown when trying to continue/abort a rebase that is not in progress
 */
export class RebaseNotInProgressError extends GitError {
  constructor() {
    super('No rebase in progress');
    this.name = 'RebaseNotInProgressError';
    Object.setPrototypeOf(this, RebaseNotInProgressError.prototype);
  }
}

/**
 * Error thrown when trying to create a branch that already exists
 */
export class BranchAlreadyExistsError extends GitError {
  public readonly branchName: string;

  constructor(branchName: string) {
    super(`Branch already exists: ${branchName}`);
    this.name = 'BranchAlreadyExistsError';
    this.branchName = branchName;
    Object.setPrototypeOf(this, BranchAlreadyExistsError.prototype);
  }
}

