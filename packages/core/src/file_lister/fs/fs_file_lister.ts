/**
 * FsFileLister - Filesystem-based FileLister implementation
 *
 * Uses fast-glob for pattern matching and fs/promises for file operations.
 * Used in CLI and development environments.
 *
 * @module file_lister/fs/fs_file_lister
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileLister, FileListOptions, FileStats, FsFileListerOptions } from '../file_lister';
import { FileListerError } from '../file_lister';

/**
 * Filesystem-based FileLister implementation.
 * Uses fast-glob for pattern matching and fs/promises for file operations.
 *
 * @example
 * ```typescript
 * const lister = new FsFileLister({ cwd: '/path/to/project' });
 * const files = await lister.list(['**\/*.ts'], { ignore: ['node_modules/**'] });
 * const content = await lister.read('src/index.ts');
 * ```
 */
export class FsFileLister implements FileLister {
  private readonly cwd: string;

  constructor(options: FsFileListerOptions) {
    this.cwd = options.cwd;
    // Note: respectGitignore is accepted but currently a no-op
    // Future enhancement: parse .gitignore and merge with ignore patterns
  }

  /**
   * [EARS-FL01] Lists files matching glob patterns.
   * [EARS-FFL01] Excludes files matching ignore patterns.
   * [EARS-FFL02] Respects .gitignore if enabled.
   */
  async list(patterns: string[], options?: FileListOptions): Promise<string[]> {
    // [EARS-FFL04] Validate patterns don't contain path traversal
    // [EARS-FFL05] Validate patterns are not absolute paths
    for (const pattern of patterns) {
      if (pattern.includes('..')) {
        throw new FileListerError(
          `Invalid pattern: path traversal not allowed: ${pattern}`,
          'INVALID_PATH',
          pattern
        );
      }
      if (path.isAbsolute(pattern)) {
        throw new FileListerError(
          `Invalid pattern: absolute paths not allowed: ${pattern}`,
          'INVALID_PATH',
          pattern
        );
      }
    }

    const fgOptions: Parameters<typeof fg>[1] = {
      cwd: this.cwd,
      ignore: options?.ignore ?? [],
      onlyFiles: options?.onlyFiles ?? true,
      absolute: options?.absolute ?? false,
      dot: true,
    };

    // Only add deep if maxDepth is specified
    if (options?.maxDepth !== undefined) {
      fgOptions.deep = options.maxDepth;
    }

    // [EARS-FFL02] Respect .gitignore if enabled
    // Note: fast-glob handles .gitignore via the 'ignore' option
    // We set this as a future enhancement - currently a no-op
    // To properly implement, we would read .gitignore and merge patterns

    return fg(patterns, fgOptions);
  }

  /**
   * [EARS-FL02] Checks if a file exists.
   */
  async exists(filePath: string): Promise<boolean> {
    // [EARS-FFL04] Validate path doesn't contain traversal
    this.validatePath(filePath);

    try {
      const fullPath = path.join(this.cwd, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * [EARS-FL03] Reads file content as string.
   * [EARS-FFL03] Throws FILE_NOT_FOUND for missing files.
   */
  async read(filePath: string): Promise<string> {
    // [EARS-FFL04] Validate path doesn't contain traversal
    this.validatePath(filePath);

    const fullPath = path.join(this.cwd, filePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        throw new FileListerError(
          `File not found: ${filePath}`,
          'FILE_NOT_FOUND',
          filePath
        );
      }
      if (error.code === 'EACCES') {
        throw new FileListerError(
          `Permission denied: ${filePath}`,
          'PERMISSION_DENIED',
          filePath
        );
      }
      throw new FileListerError(
        `Read error: ${error.message}`,
        'READ_ERROR',
        filePath
      );
    }
  }

  /**
   * [EARS-FL04] Gets file statistics.
   * [EARS-FFL03] Throws FILE_NOT_FOUND for missing files.
   */
  async stat(filePath: string): Promise<FileStats> {
    // [EARS-FFL04] Validate path doesn't contain traversal
    this.validatePath(filePath);

    const fullPath = path.join(this.cwd, filePath);
    try {
      const stats = await fs.stat(fullPath);
      return {
        size: stats.size,
        mtime: stats.mtimeMs,
        isFile: stats.isFile(),
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        throw new FileListerError(
          `File not found: ${filePath}`,
          'FILE_NOT_FOUND',
          filePath
        );
      }
      throw new FileListerError(
        `Stat error: ${error.message}`,
        'READ_ERROR',
        filePath
      );
    }
  }

  /**
   * [EARS-FFL04] Validates that the path doesn't contain traversal characters.
   * [EARS-FFL05] Validates that the path is not absolute.
   */
  private validatePath(filePath: string): void {
    if (filePath.includes('..')) {
      throw new FileListerError(
        `Invalid path: path traversal not allowed: ${filePath}`,
        'INVALID_PATH',
        filePath
      );
    }
    // [EARS-FFL05] Prevent absolute paths to avoid escaping cwd
    if (path.isAbsolute(filePath)) {
      throw new FileListerError(
        `Invalid path: absolute paths not allowed: ${filePath}`,
        'INVALID_PATH',
        filePath
      );
    }
  }
}
