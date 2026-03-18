/**
 * Types for GitLabConfigStore module.
 *
 * @module config_store/gitlab_config_store.types
 */

import type { GitbeakerClient } from '../gitlab';

/**
 * Options for constructing a GitLabConfigStore instance.
 * Auth and API base URL are configured on the Gitbeaker instance, not here.
 */
export type GitLabConfigStoreOptions = {
  /** GitLab project ID (numeric) or URL-encoded path */
  projectId: number | string;
  /** Gitbeaker client instance (handles auth + base URL) */
  api: GitbeakerClient;
  /** Branch to read from / write to (default: 'gitgov-state'). Must be a branch name for saves. */
  ref?: string;
  /** Base path within the repo (default: '.gitgov') */
  basePath?: string;
};

/**
 * Result returned by saveConfig on GitLabConfigStore.
 * Contains the commit SHA and updated blob_id.
 */
export type GitLabSaveResult = {
  /** SHA of the commit created by the save operation */
  commitSha: string;
  /** Updated blob_id for subsequent operations */
  blobId: string;
};
