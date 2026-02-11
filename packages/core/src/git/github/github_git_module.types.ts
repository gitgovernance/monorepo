/**
 * Types for GitHubGitModule.
 * All EARS prefixes map to github_git_module.md
 */

/**
 * Configuration for GitHubGitModule.
 * All operations target the specified owner/repo via GitHub REST API.
 * Note: defaultBranch (not ref) because GitModule tracks which branch
 * operations target, switchable via checkoutBranch().
 */
export type GitHubGitModuleOptions = {
  /** GitHub repository owner (user or organization) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Default branch name (default: 'gitgov-state') */
  defaultBranch?: string;
};

/**
 * Internal staging buffer entry.
 * content = string means add/update, content = null means delete.
 */
export type StagingEntry = {
  /** File path relative to repo root */
  path: string;
  /** File content (null = delete) */
  content: string | null;
};
