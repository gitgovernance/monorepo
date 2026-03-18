/**
 * Types for GitLabRecordStore module.
 *
 * @module record_store/gitlab_record_store.types
 */

import type { GitbeakerClient } from '../gitlab';

/** ID encoder for transforming record IDs to filename-safe strings */
export interface IdEncoder {
  encode(id: string): string;
  decode(filename: string): string;
}

/**
 * Configuration for GitLabRecordStore.
 * All paths are relative to basePath within the repo.
 */
export type GitLabRecordStoreOptions = {
  /** GitLab project ID (numeric) or URL-encoded path */
  projectId: number | string;
  /** Gitbeaker client instance */
  api: GitbeakerClient;
  /** Directory where records live (e.g., '.gitgov/actors') — REQUIRED */
  basePath: string;
  /** Branch to read/write (default: 'gitgov-state') */
  ref?: string;
  /** File extension for records (default: '.json') */
  extension?: string;
  /** Optional ID encoder for transforming IDs to filename-safe strings */
  idEncoder?: IdEncoder;
};

/**
 * Write result returned by put(), putMany(), and delete().
 */
export type GitLabWriteResult = {
  /** SHA of the commit created. Optional because idempotent delete may not create a commit. */
  commitSha?: string;
};

/**
 * Write options accepted by put(), putMany(), and delete().
 */
export type GitLabWriteOpts = {
  /** Custom commit message */
  commitMessage?: string;
};
