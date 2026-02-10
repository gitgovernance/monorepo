/**
 * GitHubConfigStore Types
 *
 * Configuration types for the GitHub-backed ConfigStore implementation.
 * Used by GitHubConfigStore to interact with the GitHub Contents API
 * for reading/writing config.json in a remote repository.
 */

/**
 * Options for constructing a GitHubConfigStore instance.
 */
export type GitHubConfigStoreOptions = {
  /** GitHub repository owner (user or organization) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** GitHub personal access token or installation token */
  token: string;
  /** Git ref (branch) to read/write from. Default: 'main' */
  ref?: string;
  /** Base path within the repo for GitGovernance files. Default: '.gitgov' */
  basePath?: string;
  /** GitHub API base URL. Default: 'https://api.github.com' */
  apiBaseUrl?: string;
};

/**
 * Response from GitHub Contents API PUT (create/update file).
 * Subset of the full response relevant to ConfigStore operations.
 */
export type GitHubSaveResponse = {
  commit: { sha: string; message: string };
  content: { sha: string; path: string; size: number };
};

/**
 * Result returned by saveConfig on GitHubConfigStore.
 * Contains the commit SHA from the GitHub API response.
 */
export type GitHubSaveResult = {
  /** SHA of the commit created by the save operation */
  commitSha: string;
};
