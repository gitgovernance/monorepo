/**
 * Types for GitHubFileLister module.
 *
 * @module file_lister/github/github_file_lister.types
 */

/**
 * Configuration options for GitHubFileLister.
 * Auth and API base URL are configured on the Octokit instance, not here.
 */
export type GitHubFileListerOptions = {
  /** GitHub repository owner (user or org) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Git ref to use (branch, tag, or SHA). Default: 'gitgov-state' */
  ref?: string;
  /** Base path within the repo to scope operations. Default: '' (repo root) */
  basePath?: string;
};
