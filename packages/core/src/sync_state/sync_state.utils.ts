/**
 * Shared utilities for SyncState modules (FsSyncState, GithubSyncState).
 *
 * @module sync_state/utils
 */

import path from "path";
import {
  SYNC_DIRECTORIES,
  SYNC_ROOT_FILES,
  SYNC_ALLOWED_EXTENSIONS,
  SYNC_EXCLUDED_PATTERNS,
  LOCAL_ONLY_FILES,
} from "./sync_state.types";

/**
 * Check if a file should be synced to gitgov-state.
 * Returns true only for allowed *.json files in SYNC_DIRECTORIES or SYNC_ROOT_FILES.
 *
 * Accepts paths in multiple formats:
 * - .gitgov/tasks/foo.json (git ls-files output)
 * - /absolute/path/.gitgov/tasks/foo.json
 * - /tmp/tempdir/tasks/foo.json (tempDir copy without .gitgov)
 * - tasks/foo.json (relative to .gitgov)
 */
export function shouldSyncFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);

  // Check if extension is allowed
  if (!SYNC_ALLOWED_EXTENSIONS.includes(ext as typeof SYNC_ALLOWED_EXTENSIONS[number])) {
    return false;
  }

  // Check if file matches any excluded pattern (.key, .backup, etc.)
  for (const pattern of SYNC_EXCLUDED_PATTERNS) {
    if (pattern.test(fileName)) {
      return false;
    }
  }

  // Check if it's a local-only file (.session.json, index.json, gitgov)
  if (LOCAL_ONLY_FILES.includes(fileName as typeof LOCAL_ONLY_FILES[number])) {
    return false;
  }

  // CRITICAL: Verify file is in an allowed sync directory or is a root sync file
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  // Find .gitgov in path and get the part after it
  const gitgovIndex = parts.findIndex(p => p === '.gitgov');

  let relativeParts: string[];
  if (gitgovIndex !== -1) {
    // Path contains .gitgov: .gitgov/tasks/foo.json or /path/.gitgov/tasks/foo.json
    relativeParts = parts.slice(gitgovIndex + 1);
  } else {
    // Path is relative to .gitgov or from tempDir: tasks/foo.json or /tmp/tempdir/tasks/foo.json
    // Check if any part matches a sync directory
    const syncDirIndex = parts.findIndex(p =>
      SYNC_DIRECTORIES.includes(p as typeof SYNC_DIRECTORIES[number])
    );
    if (syncDirIndex !== -1) {
      relativeParts = parts.slice(syncDirIndex);
    } else if (SYNC_ROOT_FILES.includes(fileName as typeof SYNC_ROOT_FILES[number])) {
      // It's a root sync file like config.json
      return true;
    } else {
      return false;
    }
  }

  if (relativeParts.length === 1) {
    // Root file: config.json
    return SYNC_ROOT_FILES.includes(relativeParts[0] as typeof SYNC_ROOT_FILES[number]);
  } else if (relativeParts.length >= 2) {
    // Directory file: tasks/foo.json
    const dirName = relativeParts[0];
    return SYNC_DIRECTORIES.includes(dirName as typeof SYNC_DIRECTORIES[number]);
  }

  return false;
}

/**
 * Filter an array of file paths, returning only those that should be synced.
 */
export function filterSyncableFiles(files: string[]): string[] {
  return files.filter(shouldSyncFile);
}
