/**
 * Project Discovery Utilities
 *
 * Filesystem-based utilities for discovering GitGovernance project roots.
 * Used at CLI bootstrap to resolve projectRoot before injecting it via DI.
 *
 * NOTE: These functions should only be called at the CLI/bootstrap level.
 * Core modules receive projectRoot via constructor injection.
 */

import * as path from 'path';
import { existsSync } from 'fs';

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
  // In test environment, allow cache reset via global
  if (typeof (global as any).projectRoot !== 'undefined' && (global as any).projectRoot === null) {
    projectRootCache = null;
    lastSearchPath = null;
  }

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
 * Finds the project root by searching upwards.
 * First looks for .gitgov (initialized project), then .git (for init).
 *
 * @param startPath - Starting path (default: process.cwd())
 * @returns Path to project root, or null if not found
 */
export function findGitgovRoot(startPath: string = process.cwd()): string | null {
  let currentPath = startPath;

  // First pass: Look for .gitgov (initialized GitGovernance project)
  while (currentPath !== path.parse(currentPath).root) {
    if (existsSync(path.join(currentPath, '.gitgov'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  // Final check at root for .gitgov
  if (existsSync(path.join(currentPath, '.gitgov'))) {
    return currentPath;
  }

  // Second pass: Look for .git (for init command)
  currentPath = startPath;
  while (currentPath !== path.parse(currentPath).root) {
    if (existsSync(path.join(currentPath, '.git'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  // Final check at root for .git
  if (existsSync(path.join(currentPath, '.git'))) {
    return currentPath;
  }

  return null;
}

/**
 * Gets the .gitgov directory path from project root.
 *
 * @throws Error if not inside a GitGovernance project
 */
export function getGitgovPath(): string {
  const root = findGitgovRoot();
  if (!root) {
    throw new Error("Could not find project root. Make sure you are inside a GitGovernance repository.");
  }
  return path.join(root, '.gitgov');
}

/**
 * Checks if current directory is inside a GitGovernance project.
 */
export function isGitgovProject(): boolean {
  try {
    const gitgovPath = getGitgovPath();
    return existsSync(gitgovPath);
  } catch {
    return false;
  }
}

/**
 * Reset the project root cache.
 * Useful for testing when switching between project contexts.
 */
export function resetDiscoveryCache(): void {
  projectRootCache = null;
  lastSearchPath = null;
}
