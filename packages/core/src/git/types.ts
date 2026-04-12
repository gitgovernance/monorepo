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

/**
 * Parsed reference to a git remote URL.
 *
 * Represents the decomposed identity of a git remote:
 *   host: the server (github.com, gitlab.mycompany.com, gitea.internal.net)
 *   path: the repo path on that server (owner/repo, group/subgroup/project)
 *
 * Used by CLI (parse from git remote URL) and SaaS (resolve to Repository).
 * Created via parseRemoteUrl(). Shared between CLI and SaaS via @gitgov/core.
 *
 * IKS-A33, Cycle 4 identity_key_sync
 */
export type GitRemoteRef = {
  /** Host of the git server (e.g. "github.com", "gitlab.mycompany.com") */
  host: string;
  /** Path of the repository on the server (e.g. "owner/repo", "group/subgroup/project") */
  path: string;
};

/**
 * [GM9, GM10, GM11] Parse a git remote URL into { host, path }.
 *
 * Supports:
 *   HTTPS: https://github.com/owner/repo.git → { host: "github.com", path: "owner/repo" }
 *   SSH:   git@github.com:owner/repo.git     → { host: "github.com", path: "owner/repo" }
 *   Nested: https://gitlab.co/group/sub/proj.git → { host: "gitlab.co", path: "group/sub/proj" }
 *
 * Returns null if the URL cannot be parsed. Pure function — no I/O.
 */
export function parseRemoteUrl(url: string): GitRemoteRef | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { host: httpsMatch[1], path: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/^[^@]+@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { host: sshMatch[1], path: sshMatch[2] };
  }

  return null;
}
