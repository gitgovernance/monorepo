/**
 * Types for GitLabGitModule.
 *
 * @module git/gitlab_git_module.types
 */

import type { GitbeakerClient } from '../gitlab';

/**
 * Configuration for GitLabGitModule.
 */
export type GitLabGitModuleOptions = {
  /** GitLab project ID (numeric) or URL-encoded path */
  projectId: number | string;
  /** Gitbeaker client instance */
  api: GitbeakerClient;
  /** Default branch name (default: 'gitgov-state') */
  defaultBranch?: string;
};
