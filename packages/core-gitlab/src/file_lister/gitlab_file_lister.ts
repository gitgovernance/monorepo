/**
 * GitLabFileLister - GitLab REST API implementation of FileLister
 *
 * Provides file listing and reading operations via GitLab's REST API
 * for SaaS environments where direct filesystem access is not available.
 *
 * Uses the Repository Tree API for listing (with pagination + caching) and
 * the Repository Files API for reading individual files. Falls back to the
 * Blobs API for files larger than 1MB where the Files API returns null content.
 *
 * @module file_lister/gitlab_file_lister
 */

import picomatch from 'picomatch';
import type { GitbeakerClient } from '../gitlab';
import type { FileLister, FileListOptions, FileStats } from '@gitgov/core/file_lister/file_lister';
import { FileListerError } from '@gitgov/core/file_lister/file_lister.errors';
import { isGitbeakerRequestError } from '../gitlab';
import type { GitLabFileListerOptions } from './gitlab_file_lister.types';

/** Tree entry shape from Gitbeaker Repositories.tree response */
type TreeEntry = {
  path: string;
  type: string;
  id: string;
  name: string;
  mode: string;
};

/**
 * GitLabFileLister - GitLab REST API FileLister implementation.
 *
 * Implements the FileLister interface using GitLab's REST API endpoints:
 * - Repository Tree API for listing files (paginated + cached)
 * - Repository Files API for reading, stat, and exists
 * - Repository Blobs API as fallback for large files (>1MB)
 *
 * @example
 * ```typescript
 * import { Gitlab } from '@gitbeaker/rest';
 * const api = new Gitlab({ token: 'glpat-xxx' });
 * const lister = new GitLabFileLister({
 *   projectId: 12345,
 *   api,
 *   ref: 'gitgov-state',
 *   basePath: '.gitgov',
 * });
 *
 * const files = await lister.list(['**\/*.json']);
 * const content = await lister.read('config.json');
 * ```
 */
export class GitLabFileLister implements FileLister {
  private readonly projectId: number | string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly api: GitbeakerClient;

  /** Cached tree entries from the Tree API (all pages) */
  private treeCache: TreeEntry[] | null = null;

  // [EARS-B8] Defaults: ref='gitgov-state', basePath=''
  constructor(options: GitLabFileListerOptions) {
    this.projectId = options.projectId;
    this.api = options.api;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath ?? '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FileLister Interface
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * [EARS-A1] Lists files matching glob patterns.
   * [EARS-B1] Uses Tree API with pagination and picomatch filter.
   * [EARS-B3] Applies basePath prefix for tree entries, strips from results.
   * [EARS-B6] Caches tree between list() calls.
   */
  async list(patterns: string[], options?: FileListOptions): Promise<string[]> {
    const entries = await this.fetchTree();

    // Filter only blobs (files, not directories)
    const blobs = entries.filter(entry => entry.type === 'blob');

    // Apply basePath: only entries under basePath, then strip prefix
    const prefix = this.basePath ? `${this.basePath}/` : '';
    const relativePaths: string[] = [];

    for (const blob of blobs) {
      if (!blob.path) continue;
      if (prefix && !blob.path.startsWith(prefix)) {
        continue;
      }
      const relativePath = prefix ? blob.path.slice(prefix.length) : blob.path;
      relativePaths.push(relativePath);
    }

    // [EARS-B1] Normalize directory patterns: 'dir/' → 'dir/**'
    const normalizedPatterns = patterns.map(p =>
      p.endsWith('/') ? `${p}**` : p,
    );

    // Match against patterns using picomatch
    const isMatch = picomatch(normalizedPatterns, {
      ignore: options?.ignore,
    });

    return relativePaths.filter(p => isMatch(p)).sort();
  }

  /**
   * [EARS-A2] Checks if a file exists via Files API.
   * [EARS-B4] Returns false for 404 responses and directory paths.
   * [EARS-B5] Throws PERMISSION_DENIED for 401/403.
   * [EARS-C1] Throws READ_ERROR for 5xx.
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.buildFullPath(filePath);

    try {
      await this.api.RepositoryFiles.show(this.projectId, fullPath, this.ref);
      return true;
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) return false;
        if (status === 401 || status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (status !== undefined && status >= 500) {
          throw new FileListerError(
            `GitLab API server error (${status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitLab API response (${status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error checking file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }
  }

  /**
   * [EARS-A3] Reads file content as string.
   * [EARS-B2] Decodes base64 content from Files API.
   * [EARS-B5] Throws PERMISSION_DENIED for 401/403.
   * [EARS-B7] Falls back to Blobs API for files >1MB (null content).
   * [EARS-C1] Throws READ_ERROR for 5xx.
   * [EARS-C2] Throws READ_ERROR for network errors.
   * [EARS-C3] Throws READ_ERROR for directory paths (Not a file).
   */
  async read(filePath: string): Promise<string> {
    const fullPath = this.buildFullPath(filePath);

    try {
      const file = await this.api.RepositoryFiles.show(
        this.projectId,
        fullPath,
        this.ref,
      );

      // [EARS-B2] Decode base64 content
      const content = String(file.content ?? '');
      if (content !== '') {
        return Buffer.from(content, 'base64').toString('utf-8');
      }

      // [EARS-B7] Content is null/empty (file >1MB), fallback to Blobs API
      const blobId = String(file.blob_id ?? '');
      if (blobId) {
        return this.readViaBlobs(blobId, filePath);
      }

      throw new FileListerError(
        `Not a file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    } catch (error: unknown) {
      if (error instanceof FileListerError) throw error;
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (status === 401 || status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (status !== undefined && status >= 500) {
          throw new FileListerError(
            `GitLab API server error (${status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitLab API response (${status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error reading file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }
  }

  /**
   * [EARS-A4] Gets file statistics via Files API.
   * [EARS-B4] Throws FILE_NOT_FOUND for 404.
   * [EARS-B5] Throws PERMISSION_DENIED for 401/403.
   * [EARS-C1] Throws READ_ERROR for 5xx.
   * [EARS-C2] Throws READ_ERROR for network errors.
   * Returns size from API, mtime as 0 (not available), isFile as true.
   */
  async stat(filePath: string): Promise<FileStats> {
    const fullPath = this.buildFullPath(filePath);

    try {
      const file = await this.api.RepositoryFiles.show(
        this.projectId,
        fullPath,
        this.ref,
      );

      return {
        size: file.size,
        mtime: 0,
        isFile: true,
      };
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (status === 401 || status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (status !== undefined && status >= 500) {
          throw new FileListerError(
            `GitLab API server error (${status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitLab API response (${status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error getting file stats: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /** Builds the full file path including basePath prefix. */
  private buildFullPath(filePath: string): string {
    if (this.basePath) {
      return `${this.basePath}/${filePath}`;
    }
    return filePath;
  }

  /** Extracts HTTP status code from a Gitbeaker error. */
  private extractStatus(error: { cause?: { response?: { status: number } }; statusCode?: number }): number | undefined {
    if (error.cause && typeof error.cause === 'object' && 'response' in error.cause) {
      const response = error.cause.response as { status?: number };
      if (typeof response.status === 'number') return response.status;
    }
    if (typeof error.statusCode === 'number') return error.statusCode;
    return undefined;
  }

  /**
   * [EARS-B1] Fetches and caches the full repository tree (all pages).
   * [EARS-B6] Returns cached tree on subsequent calls.
   * [EARS-C4] Throws FILE_NOT_FOUND if project or ref not found (404).
   */
  private async fetchTree(): Promise<TreeEntry[]> {
    if (this.treeCache !== null) {
      return this.treeCache;
    }

    try {
      // allRepositoryTrees handles pagination automatically
      const allItems = (await this.api.Repositories.allRepositoryTrees(this.projectId, {
        path: this.basePath || undefined,
        ref: this.ref,
        recursive: true,
      } as Parameters<typeof this.api.Repositories.allRepositoryTrees>[1])) as unknown as TreeEntry[];

      this.treeCache = allItems;
      return this.treeCache;
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) {
          throw new FileListerError(
            'Project or ref not found',
            'FILE_NOT_FOUND',
          );
        }
        if (status === 401 || status === 403) {
          throw new FileListerError(
            'Permission denied accessing repository tree',
            'PERMISSION_DENIED',
          );
        }
        if (status !== undefined && status >= 500) {
          throw new FileListerError(
            `GitLab API server error (${status}) fetching tree`,
            'READ_ERROR',
          );
        }
        throw new FileListerError(
          `Unexpected GitLab API response (${status}) fetching tree`,
          'READ_ERROR',
        );
      }
      throw new FileListerError(
        'Network error fetching repository tree',
        'READ_ERROR',
      );
    }
  }

  /**
   * [EARS-B7] Reads file content via the Blobs API (fallback for >1MB files).
   */
  private async readViaBlobs(blobId: string, filePath: string): Promise<string> {
    try {
      const blob = await this.api.Repositories.showBlob(this.projectId, blobId);
      return Buffer.from(blob.content, 'base64').toString('utf-8');
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (status === 401 || status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        throw new FileListerError(
          `GitLab API error (${status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error reading blob for file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }
  }
}
