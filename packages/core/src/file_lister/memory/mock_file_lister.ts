/**
 * MockFileLister - In-memory FileLister for testing
 *
 * Simulates filesystem operations using a Map.
 * Used for unit testing without actual I/O.
 *
 * @module file_lister/memory/mock_file_lister
 */

import picomatch from 'picomatch';
import type { FileLister, FileListOptions, FileStats, MockFileListerOptions } from '../file_lister';
import { FileListerError } from '../file_lister';

/**
 * Matches file paths against multiple glob patterns using picomatch.
 */
function matchPatterns(patterns: string[], filePaths: string[]): string[] {
  const isMatch = picomatch(patterns);
  return filePaths.filter(filePath => isMatch(filePath));
}

/**
 * Filters out files matching ignore patterns.
 */
function filterIgnored(filePaths: string[], ignorePatterns: string[]): string[] {
  if (!ignorePatterns.length) return filePaths;
  const isIgnored = picomatch(ignorePatterns);
  return filePaths.filter(filePath => !isIgnored(filePath));
}

/**
 * In-memory FileLister for testing.
 * Simulates filesystem operations using a Map.
 *
 * @example
 * ```typescript
 * const lister = new MockFileLister({
 *   files: new Map([
 *     ['src/index.ts', 'export const x = 1;'],
 *     ['README.md', '# Project'],
 *   ])
 * });
 *
 * // Or with object syntax
 * const lister = new MockFileLister({
 *   files: { 'src/index.ts': 'code...', 'README.md': '# Project' }
 * });
 *
 * const files = await lister.list(['**\/*.ts']);
 * ```
 */
export class MockFileLister implements FileLister {
  private readonly files: Map<string, string>;
  private readonly stats: Map<string, FileStats>;

  /**
   * [EARS-MFL01] Constructs MockFileLister with provided files.
   */
  constructor(options: MockFileListerOptions = {}) {
    // [EARS-MFL01] Accept both Map and Record<string, string>
    if (options.files instanceof Map) {
      this.files = new Map(options.files);
    } else if (options.files) {
      this.files = new Map(Object.entries(options.files));
    } else {
      this.files = new Map();
    }
    this.stats = options.stats ?? new Map();
  }

  /**
   * [EARS-FL01] Lists files matching glob patterns.
   * [EARS-MFL02] Filters files using glob patterns.
   */
  async list(patterns: string[], options?: FileListOptions): Promise<string[]> {
    const allPaths = Array.from(this.files.keys());

    // [EARS-MFL02] Match patterns
    let matched = matchPatterns(patterns, allPaths);

    // Filter ignored patterns
    if (options?.ignore?.length) {
      matched = filterIgnored(matched, options.ignore);
    }

    return matched.sort();
  }

  /**
   * [EARS-FL02] Checks if a file exists.
   */
  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  /**
   * [EARS-FL03] Reads file content as string.
   */
  async read(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new FileListerError(
        `File not found: ${filePath}`,
        'FILE_NOT_FOUND',
        filePath
      );
    }
    return content;
  }

  /**
   * [EARS-FL04] Gets file statistics.
   * [EARS-MFL03] Generates stats from content if not explicitly provided.
   */
  async stat(filePath: string): Promise<FileStats> {
    if (!this.files.has(filePath)) {
      throw new FileListerError(
        `File not found: ${filePath}`,
        'FILE_NOT_FOUND',
        filePath
      );
    }

    // Return explicit stats if provided
    const explicitStats = this.stats.get(filePath);
    if (explicitStats) {
      return explicitStats;
    }

    // [EARS-MFL03] Generate stats from content
    const content = this.files.get(filePath)!;
    return {
      size: content.length,
      mtime: Date.now(),
      isFile: true,
    };
  }

  // ============================================
  // Testing utilities
  // ============================================

  /**
   * [EARS-MFL04] Adds a file to the mock filesystem.
   */
  addFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  /**
   * Removes a file from the mock filesystem.
   */
  removeFile(filePath: string): boolean {
    this.stats.delete(filePath);
    return this.files.delete(filePath);
  }

  /**
   * Returns the number of files.
   */
  size(): number {
    return this.files.size;
  }

  /**
   * Clears all files.
   */
  clear(): void {
    this.files.clear();
    this.stats.clear();
  }

  /**
   * Returns all file paths.
   */
  listPaths(): string[] {
    return Array.from(this.files.keys());
  }
}
