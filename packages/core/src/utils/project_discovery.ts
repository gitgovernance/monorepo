/**
 * Project Discovery Utilities
 *
 * Filesystem-based utilities for discovering GitGovernance project roots.
 * Used at CLI bootstrap to resolve projectRoot before injecting it via DI.
 *
 * NOTE: These functions should only be called at the CLI/bootstrap level.
 * Core modules receive projectRoot via constructor injection.
 */

import { createHash } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

// Project root cache for performance
let projectRootCache: string | null = null;
let lastSearchPath: string | null = null;

/**
 * Finds the project root by searching upwards for a .git directory.
 * Caches the result for subsequent calls.
 *
 * @param startPath - Starting path (default: process.cwd())
 * @returns Path to project root, or null if not found
 */
export function findProjectRoot(startPath: string = process.cwd()): string | null {
  // Reset cache if we're searching from a different directory
  if (lastSearchPath && lastSearchPath !== startPath) {
    projectRootCache = null;
    lastSearchPath = null;
  }

  if (projectRootCache && lastSearchPath === startPath) {
    return projectRootCache;
  }

  lastSearchPath = startPath;

  let currentPath = startPath;
  while (currentPath !== path.parse(currentPath).root) {
    if (existsSync(path.join(currentPath, '.git'))) {
      projectRootCache = currentPath;
      return projectRootCache;
    }
    currentPath = path.dirname(currentPath);
  }

  // Final check at the root directory
  if (existsSync(path.join(currentPath, '.git'))) {
    projectRootCache = currentPath;
    return projectRootCache;
  }

  return null;
}

/**
 * Reset the project root cache.
 * Useful for testing when switching between project contexts.
 */
export function resetDiscoveryCache(): void {
  projectRootCache = null;
  lastSearchPath = null;
}

/**
 * Compute the worktree base path for a given repo root.
 *
 * The CLI stores .gitgov/ state in ~/.gitgov/worktrees/<hash>/ — NOT inside
 * the repo directory. The hash is SHA-256(realpathSync(repoRoot))[0:12].
 *
 * Uses realpathSync to resolve symlinks (macOS /tmp/ → /private/tmp/).
 *
 * @param repoRoot - Absolute path to the git repo root
 * @returns Path under ~/.gitgov/worktrees/{hash}
 */
export function getWorktreeBasePath(repoRoot: string): string {
  const resolvedPath = realpathSync(repoRoot);
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
  return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
}
