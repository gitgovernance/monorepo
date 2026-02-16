import type { SyncStateModuleDependencies } from '../sync_state.types';

/**
 * Reutiliza las mismas dependencias que FsSyncStateModule.
 * No requiere dependencias adicionales.
 */
export type FsWorktreeSyncStateDependencies = SyncStateModuleDependencies;

/**
 * Configuration for worktree-based sync module.
 */
export type FsWorktreeSyncStateConfig = {
  /** Root directory of the git repository */
  repoRoot: string;
  /** State branch name (default: "gitgov-state") */
  stateBranchName?: string;
  /** Absolute path to worktree. Default: path.join(repoRoot, '.gitgov-worktree') */
  worktreePath?: string;
};

/**
 * Result of worktree health check.
 */
export type WorktreeHealthResult = {
  /** Whether the worktree directory exists */
  exists: boolean;
  /** Whether the worktree is healthy (correct branch, valid .git) */
  healthy: boolean;
  /** Path to the worktree */
  path: string;
  /** Error message if unhealthy */
  error?: string;
};

/** Default worktree directory name */
export const WORKTREE_DIR_NAME = '.gitgov-worktree' as const;

/** Default state branch name */
export const DEFAULT_STATE_BRANCH = 'gitgov-state' as const;
