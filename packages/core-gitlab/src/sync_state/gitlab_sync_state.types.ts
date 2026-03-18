/**
 * Types for GitLabSyncStateModule.
 * @module sync_state/gitlab_sync_state.types
 */

import type { GitbeakerClient } from '../gitlab';

/**
 * Dependencies for GitLabSyncStateModule.
 * Minimal compared to GitHub (no config/identity DI consistency deps).
 */
export type GitLabSyncStateDependencies = {
  /** GitLab project ID */
  projectId: number | string;
  /** Gitbeaker client instance (authenticated) */
  api: GitbeakerClient;
  /** Record projector for re-indexing after pull */
  indexer: { computeProjection(): Promise<unknown> };
};
