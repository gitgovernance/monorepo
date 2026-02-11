import type { IdEncoder } from '../record_store';

/**
 * Options for GitHubRecordStore.
 * Auth and API base URL are configured on the Octokit instance, not here.
 */
export type GitHubRecordStoreOptions = {
  /** GitHub repository owner (user or org) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch ref (default: 'gitgov-state') */
  ref?: string;
  /** Base directory path in the repo (e.g., '.gitgov/actors') */
  basePath: string;
  /** File extension for records (default: '.json') */
  extension?: string;
  /** ID encoder for filename-safe IDs (default: undefined = no encoding) */
  idEncoder?: IdEncoder;
};

/**
 * Result returned by write operations (put, putMany, delete) on GitHubRecordStore.
 * Contains the commit SHA from the GitHub API response.
 */
export type GitHubWriteResult = {
  /** SHA of the commit created by the write operation */
  commitSha?: string;
};

/**
 * Options for write operations on GitHubRecordStore.
 */
export type GitHubWriteOpts = {
  /** Custom commit message (default: auto-generated) */
  commitMessage?: string;
};
