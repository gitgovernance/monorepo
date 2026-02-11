import type { IdEncoder } from '../record_store';

/**
 * Options for GitHubRecordStore
 */
export type GitHubRecordStoreOptions = {
  /** GitHub repository owner (user or org) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Personal access token or GitHub App token */
  token: string;
  /** Branch ref (default: 'main') */
  ref?: string;
  /** Base directory path in the repo (e.g., '.gitgov/actors') */
  basePath: string;
  /** File extension for records (default: '.json') */
  extension?: string;
  /** GitHub API base URL (default: 'https://api.github.com') */
  apiBaseUrl?: string;
  /** ID encoder for filename-safe IDs (default: undefined = no encoding) */
  idEncoder?: IdEncoder;
};

/**
 * Response from GitHub Contents API for create/update operations
 */
export type GitHubCreateUpdateResponse = {
  commit: { sha: string; message: string };
  content: { sha: string; path: string; size: number };
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
