/**
 * FileLister Interface
 *
 * Abstracts file listing and reading operations for serverless compatibility.
 * Enables modules like ScopeSelector and IndexerAdapter to work without
 * direct filesystem dependencies.
 *
 * @module file_lister
 */

/**
 * Error codes for FileLister operations.
 */
export type FileListerErrorCode =
  | 'FILE_NOT_FOUND'
  | 'READ_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH';

/**
 * Error thrown when file operations fail.
 */
export class FileListerError extends Error {
  constructor(
    message: string,
    public readonly code: FileListerErrorCode,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'FileListerError';
  }
}

/**
 * Options for file listing.
 */
export interface FileListOptions {
  /** Glob patterns to ignore (e.g., ['node_modules/**']) */
  ignore?: string[];
  /** Only return files (not directories). Default: true */
  onlyFiles?: boolean;
  /** Return absolute paths instead of relative. Default: false */
  absolute?: boolean;
  /** Maximum depth to traverse. Default: unlimited */
  maxDepth?: number;
}

/**
 * File statistics returned by stat().
 */
export interface FileStats {
  /** File size in bytes */
  size: number;
  /** Last modification time as timestamp (ms since epoch) */
  mtime: number;
  /** Whether it's a file (not directory) */
  isFile: boolean;
}

/**
 * Options for FsFileLister.
 */
export interface FsFileListerOptions {
  /** Base directory for all operations */
  cwd: string;
  /** Whether to automatically respect .gitignore. Default: false */
  respectGitignore?: boolean;
}

/**
 * Options for MockFileLister.
 */
export interface MockFileListerOptions {
  /** Map of filePath -> content */
  files?: Map<string, string> | Record<string, string>;
  /** Map of filePath -> stats (optional, generated if not provided) */
  stats?: Map<string, FileStats>;
}

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
