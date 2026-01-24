/**
 * Type Definitions for GitModule
 *
 * These types define the contracts for Git operations,
 * dependencies, and data structures used throughout the module.
 */

/**
 * Options for executing shell commands
 */
export type ExecOptions = {
  /** Working directory for the command */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
};

/**
 * Result of executing a shell command
 */
export type ExecResult = {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
};

/**
 * Dependencies required by LocalGitModule
 *
 * This module uses dependency injection to allow testing with mocks
 * and support different execution environments.
 */
export type GitModuleDependencies = {
  /** Path to the Git repository root (optional, auto-detected if not provided) */
  repoRoot?: string;
  /** Function to execute shell commands (required) */
  execCommand: (
    command: string,
    args: string[],
    options?: ExecOptions
  ) => Promise<ExecResult>;
};

/**
 * Options for retrieving commit history
 */
export type GetCommitHistoryOptions = {
  /** Maximum number of commits to return */
  maxCount?: number;
  /** Path filter (e.g., ".gitgov/") */
  pathFilter?: string;
  /** Output format (default: "json") */
  format?: 'json' | 'text';
};

/**
 * Information about a commit in the history
 */
export type CommitInfo = {
  /** Commit hash */
  hash: string;
  /** Commit message */
  message: string;
  /** Commit author (name <email>) */
  author: string;
  /** Commit date (ISO 8601) */
  date: string;
  /** List of modified files (optional) */
  files?: string[];
};

/**
 * Information about a changed file
 */
export type ChangedFile = {
  /** Change status: A (Added), M (Modified), D (Deleted) */
  status: 'A' | 'M' | 'D';
  /** File path relative to repository root */
  file: string;
};

/**
 * Author information for commits
 */
export type CommitAuthor = {
  /** Author name */
  name: string;
  /** Author email */
  email: string;
};
