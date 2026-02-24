/**
 * Types for GithubSyncStateModule.
 *
 * Blueprint: github_sync_state_module.md §3.1
 * @module sync_state/github_sync_state
 */

import type { Octokit } from '@octokit/rest';
import type { ConfigManager } from '../../config_manager';
import type { IIdentityAdapter } from '../../adapters/identity_adapter';
import type { ILintModule } from '../../lint';
import type { IRecordProjector } from '../../record_projection';

/**
 * Dependencies for GithubSyncStateModule.
 *
 * Uses Octokit directly (not IGitModule) because:
 * - GitHubGitModule has a stateful staging buffer that complicates the flow
 * - Tree API recursive operations (getTree, compare) are not exposed in IGitModule
 * - Direct Octokit control is simpler for atomic tree+commit+ref operations
 */
export type GithubSyncStateDependencies = {
  /** Octokit instance (authenticated) */
  octokit: Octokit;
  /** GitHub repo owner */
  owner: string;
  /** GitHub repo name */
  repo: string;
  /** Configuration manager (DI consistency — not actively used in initial implementation) */
  config: ConfigManager;
  /** Identity adapter (DI consistency — not actively used; lint handles validation internally) */
  identity: IIdentityAdapter;
  /** Lint module for record validation */
  lint: ILintModule;
  /** Record projector for re-indexing after pull */
  indexer: IRecordProjector;
};
