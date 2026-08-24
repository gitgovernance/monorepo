/**
 * FileLister Interface
 *
 * Abstracts file listing and reading operations for serverless compatibility.
 * Enables modules like ScopeSelector and RecordProjector to work without
 * direct filesystem dependencies.
 *
 * @module file_lister
 */

import type { FileListOptions, FileStats } from './file_lister.types';

// Re-export types and errors for barrel consumers
export type { FileListOptions, FileStats, FsFileListerOptions, MemoryFileListerOptions } from './file_lister.types';
export { FileListerError } from './file_lister.errors';
export type { FileListerErrorCode, FileListerErrorDetails } from './file_lister.errors';

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
 * import { MemoryFileLister } from '@gitgov/core/memory';
 * const lister = new MemoryFileLister({ files: { 'src/index.ts': 'code...' } });
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
   * [EARS-FL05] Discards any cached state so the next read observes the source again.
   *
   * FRESHNESS SEMANTICS OF THIS INTERFACE, declared here because implementations differ:
   * an instance is NOT guaranteed to observe changes that happen after its first read.
   * `FsFileLister` and `MemoryFileLister` re-read every time; `GitHubFileLister` caches the
   * repository tree ([EARS-B6]) and, without invalidation, observes the tree of a single
   * instant forever. A consumer waiting for something to APPEAR must call this between
   * attempts — it must NOT assume `list()` re-reads the source.
   *
   * Implementations with no cache implement it as a NO-OP. That is not an empty method: it
   * is the statement that this backend has nothing to discard, which is information the
   * consumer needs. Safe to call at any time, including before any read. Never throws.
   *
   * Origin: a poll built on one reused `GitHubFileLister` spun 60s over a frozen array and
   * read as flakiness for weeks (measured). Putting this only on the concrete
   * class would have forced consumers into `instanceof` — the coupling this interface
   * exists to prevent — and would let the planned `GitlabFileLister` reintroduce the defect.
   */
  invalidateCache(): void;

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

  /**
   * Batch read multiple files in parallel.
   * Optional — API-based backends (GitHub) benefit from parallel fetching.
   * Filesystem backends can implement trivially or leave undefined.
   * Consumers check `if (lister.readBatch)` and fall back to sequential read().
   *
   * @param paths - Array of file paths relative to cwd
   * @returns Map of path → content
   * @throws FileListerError if any path doesn't exist or rate limit hit
   */
  readBatch?(paths: string[]): Promise<Map<string, string>>;
}
