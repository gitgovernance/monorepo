/**
 * GitHubConfigStore Types
 *
 * Configuration types for the GitHub-backed ConfigStore implementation.
 * Auth (token) and base URL are configured via the Octokit instance.
 */

/**
 * Options for constructing a GitHubConfigStore instance.
 * Auth and API base URL are configured on the Octokit instance, not here.
 */
export type GitHubConfigStoreOptions = {
  /** GitHub repository owner (user or organization) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch to read from / write to (default: 'gitgov-state'). Must be a branch name for saves. */
  ref?: string;
  /** Base path within the repo (default: '.gitgov') */
  basePath?: string;
};

/**
 * Result returned by saveConfig on GitHubConfigStore.
 * Contains the commit SHA from the GitHub API response.
 */
export type GitHubSaveResult = {
  /**
   * SHA of the commit created by the save operation.
   * Always present — saveConfig either creates a commit (success) or throws (failure).
   * Contrast with GitHubWriteResult.commitSha which is optional (idempotent delete).
   */
  commitSha: string;
};
