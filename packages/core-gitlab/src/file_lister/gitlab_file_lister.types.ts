/**
 * Types for GitLabFileLister module.
 *
 * @module file_lister/gitlab_file_lister.types
 */

import type { GitbeakerClient } from '../gitlab';

/**
 * Configuration options for GitLabFileLister.
 * Auth and API base URL are configured on the Gitbeaker instance, not here.
 */
export type GitLabFileListerOptions = {
  /** GitLab project ID (numeric) or URL-encoded path (e.g., 'my-org%2Fmy-repo') */
  projectId: number | string;
  /** Gitbeaker client instance (handles auth + base URL) */
  api: GitbeakerClient;
  /** Git ref to use (branch, tag, or SHA). Default: 'gitgov-state' */
  ref?: string;
  /** Base path within the repo to scope operations. Default: '' (repo root) */
  basePath?: string;
};
