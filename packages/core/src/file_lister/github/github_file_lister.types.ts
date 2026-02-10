/**
 * Types for GitHubFileLister module.
 *
 * @module file_lister/github/github_file_lister.types
 */

/**
 * Configuration options for GitHubFileLister.
 */
export type GitHubFileListerOptions = {
  /** GitHub repository owner (user or org) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** GitHub access token with repo permissions */
  token: string;
  /** Git ref to use (branch, tag, or SHA). Default: 'HEAD' */
  ref?: string;
  /** Base path within the repo to scope operations. Default: '' (repo root) */
  basePath?: string;
  /** GitHub API base URL. Default: 'https://api.github.com' */
  apiBaseUrl?: string;
};

/**
 * A single entry from the GitHub Git Trees API response.
 */
export type GitHubTreeEntry = {
  /** File path relative to repo root */
  path: string;
  /** Entry type: 'blob' for files, 'tree' for directories */
  type: 'blob' | 'tree';
  /** SHA of the blob or tree */
  sha: string;
  /** File size in bytes (only present for blobs) */
  size?: number;
};
