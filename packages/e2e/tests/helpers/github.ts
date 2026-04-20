/**
 * GitHub Helpers — Octokit, sync state, GitHub record store.
 */
export { GithubSyncStateModule, GitHubRecordStore, GitHubGitModule, GitHubFileLister, GitHubConfigStore } from '@gitgov/core/github';
export type { GithubSyncStateDependencies } from '@gitgov/core/github';
import { GitHubGitModule, GitHubFileLister, GitHubRecordStore as GHRecordStore, GitHubConfigStore } from '@gitgov/core/github';
import type { Octokit } from '@octokit/rest';

export const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? '';

export function createGitHubCoreBackend(octokit: Octokit): unknown {
  return {
    createGitModule: async (opts: { owner: string; repo: string; defaultBranch?: string }) =>
      new GitHubGitModule({ owner: opts.owner, repo: opts.repo, defaultBranch: opts.defaultBranch }, octokit),
    createFileLister: async (opts: { owner: string; repo: string; ref?: string }) =>
      new GitHubFileLister({ owner: opts.owner, repo: opts.repo, ref: opts.ref }, octokit),
    createRecordStore: async <V>(opts: { owner: string; repo: string; ref?: string; basePath: string; idEncoder?: unknown }) =>
      new GHRecordStore<V>(
        { owner: opts.owner, repo: opts.repo, ref: opts.ref, basePath: opts.basePath, ...(opts.idEncoder ? { idEncoder: opts.idEncoder as any } : {}) },
        octokit,
      ),
    createConfigStore: async (opts: { owner: string; repo: string; ref?: string }) =>
      new GitHubConfigStore({ owner: opts.owner, repo: opts.repo, ref: opts.ref }, octokit),
    verifyInstallation: async () => true,
    findInstallationForOrg: async () => null,
  };
}

export const GITHUB_TEST_REPO = process.env['GITHUB_TEST_REPO'] ?? '';
export const GITHUB_REMOTE_URL = GITHUB_TEST_REPO.includes('@') || GITHUB_TEST_REPO.includes('://')
  ? GITHUB_TEST_REPO
  : GITHUB_TEST_REPO
    ? `git@github.com:${GITHUB_TEST_REPO}.git`
    : '';
export const HAS_GITHUB = GITHUB_REMOTE_URL.length > 0;

export const GITHUB_TEST_OWNER = process.env['GITHUB_TEST_OWNER'] ?? '';
export const GITHUB_TEST_REPO_NAME = process.env['GITHUB_TEST_REPO_NAME'] ?? '';
export const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] ?? '';

export function requireGitHub(): void {
  if (!HAS_GITHUB) {
    console.log('[SKIP] GitHub tests require GITHUB_TEST_REPO env var');
  }
}

export const GITLAB_TOKEN = process.env['GITLAB_TOKEN'] ?? '';
export const GITLAB_TEST_PROJECT_ID = process.env['GITLAB_TEST_PROJECT_ID'] ?? '';
export const HAS_GITLAB = GITLAB_TOKEN.length > 0 && GITLAB_TEST_PROJECT_ID.length > 0;

export function requireGitLab(): void {
  if (!HAS_GITLAB) {
    console.log('[SKIP] GitLab tests require GITLAB_TOKEN + GITLAB_TEST_PROJECT_ID env vars');
  }
}

// Re-exports for projector stores
import { DEFAULT_ID_ENCODER } from '@gitgov/core/fs';
import { GitHubRecordStore } from '@gitgov/core/github';
import type {
  RecordProjectorDependencies,
} from '../../node_modules/@gitgov/core/src/record_projection/record_projection.types';
import type {
  GitGovTaskRecord,
  GitGovActorRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovAgentRecord,
} from '@gitgov/core';

/**
 * Creates GitHub-backed stores typed correctly for RecordProjector.
 * Eliminates `as unknown as RecordProjectorDependencies['stores']` casts in tests.
 */
export function createGitHubProjectorStores(
  octokit: Octokit,
  opts: { owner: string; repo: string; ref: string },
): RecordProjectorDependencies['stores'] {
  const storeOpts = { owner: opts.owner, repo: opts.repo, ref: opts.ref };
  return {
    tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, octokit),
    actors: new GitHubRecordStore<GitGovActorRecord>({ ...storeOpts, basePath: '.gitgov/actors', idEncoder: DEFAULT_ID_ENCODER }, octokit),
    cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...storeOpts, basePath: '.gitgov/cycles' }, octokit),
    feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, octokit),
    executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...storeOpts, basePath: '.gitgov/executions' }, octokit),
    agents: new GitHubRecordStore<GitGovAgentRecord>({ ...storeOpts, basePath: '.gitgov/agents', idEncoder: DEFAULT_ID_ENCODER }, octokit),
  };
}
