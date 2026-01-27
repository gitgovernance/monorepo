/**
 * FileLister Interface
 *
 * Abstracts file listing and reading operations for serverless compatibility.
 * Enables modules like ScopeSelector and IndexerAdapter to work without
 * direct filesystem dependencies.
 *
 * @module file_lister
 */

import type { FileListOptions, FileStats } from './file_lister.types';

// Re-export types and errors for barrel consumers
export type { FileListOptions, FileStats, FsFileListerOptions, MockFileListerOptions } from './file_lister.types';
export { FileListerError } from './file_lister.errors';
export type { FileListerErrorCode } from './file_lister.errors';

/**
 * Interface for listing and reading files.
 * Abstracts filesystem operations for serverless compatibility.
 *
 * @example
 * ```typescript
 * // Filesystem backend (development/CLI)
 * import { FsFileLister } from '@gitgov/core/fs';
 * const lister = new FsFileLister({ cwd: '/path/to/project' });
 *
 * // Memory backend (testing)
 * import { MockFileLister } from '@gitgov/core/memory';
 * const lister = new MockFileLister({ files: { 'src/index.ts': 'code...' } });
 *
 * // Usage
 * const files = await lister.list(['**\/*.ts']);
 * const content = await lister.read('src/index.ts');
 * ```
 */
export interface FileLister {
  /**
   * [EARS-FL01] Lists files matching glob patterns.
   * @param patterns - Glob patterns to match (e.g., ['**\/*.ts', 'src/**'])
   * @param options - Optional configuration for listing
   * @returns Array of file paths relative to cwd
   */
  list(patterns: string[], options?: FileListOptions): Promise<string[]>;

  /**
   * [EARS-FL02] Checks if a file exists.
   * @param filePath - Path relative to cwd
   * @returns true if file exists, false otherwise
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * [EARS-FL03] Reads file content as string.
   * @param filePath - Path relative to cwd
   * @returns File content as UTF-8 string
   * @throws FileListerError if file doesn't exist or can't be read
   */
  read(filePath: string): Promise<string>;

  /**
   * [EARS-FL04] Gets file statistics.
   * @param filePath - Path relative to cwd
   * @returns File stats (size, mtime)
   * @throws FileListerError if file doesn't exist
   */
  stat(filePath: string): Promise<FileStats>;
}
