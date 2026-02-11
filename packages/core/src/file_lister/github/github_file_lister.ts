/**
 * GitHubFileLister - GitHub REST API implementation of FileLister
 *
 * Provides file listing and reading operations via GitHub's REST API
 * for SaaS environments where direct filesystem access is not available.
 *
 * Uses the Git Trees API for listing (with caching) and the Contents API
 * for reading individual files. Falls back to the Blobs API for files
 * larger than 1MB where the Contents API returns null content.
 *
 * @module file_lister/github/github_file_lister
 */

import picomatch from 'picomatch';
import type { Octokit } from '@octokit/rest';
import type { FileLister, FileListOptions, FileStats } from '../file_lister';
import { FileListerError } from '../file_lister';
import { isOctokitRequestError } from '../../github';
import type { GitHubFileListerOptions } from './github_file_lister.types';

/** Tree entry shape from Octokit git.getTree response */
type TreeEntry = {
  path?: string;
  type?: string;
  sha?: string;
  size?: number;
};

/**
 * GitHubFileLister - GitHub REST API FileLister implementation.
 *
 * Implements the FileLister interface using GitHub's REST API endpoints:
 * - Trees API for listing files (cached)
 * - Contents API for reading, stat, and exists
 * - Blobs API as fallback for large files (>1MB)
 *
 * @example
 * ```typescript
 * import { Octokit } from '@octokit/rest';
 * const octokit = new Octokit({ auth: 'ghp_xxx' });
 * const lister = new GitHubFileLister({
 *   owner: 'myorg',
 *   repo: 'myrepo',
 *   ref: 'gitgov-state',
 *   basePath: '.gitgov',
 * }, octokit);
 *
 * const files = await lister.list(['**\/*.ts']);
 * const content = await lister.read('config.json');
 * ```
 */
export class GitHubFileLister implements FileLister {
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly octokit: Octokit;

  /** Cached tree entries from the Trees API */
  private treeCache: TreeEntry[] | null = null;

  constructor(options: GitHubFileListerOptions, octokit: Octokit) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath ?? '';
    this.octokit = octokit;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FileLister Interface
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * [EARS-A1] Lists files matching glob patterns.
   * [EARS-B1] Uses Trees API with recursive=1 and picomatch filter.
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

    // Match against patterns using picomatch
    const isMatch = picomatch(patterns, {
      ignore: options?.ignore,
    });

    return relativePaths.filter(p => isMatch(p)).sort();
  }

  /**
   * [EARS-A2] Checks if a file exists via Contents API.
   * [EARS-B4] Returns false for 404 responses.
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.buildFullPath(filePath);

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: fullPath,
        ref: this.ref,
      });
      // [EARS-A2] Verify it's a file, not a directory
      if (Array.isArray(data) || data.type !== 'file') {
        return false;
      }
      return true;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 404) return false;
        if (error.status === 401 || error.status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (error.status >= 500) {
          throw new FileListerError(
            `GitHub API server error (${error.status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitHub API response (${error.status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error checking file: ${filePath}`,
        'NETWORK_ERROR',
        filePath,
      );
    }
  }

  /**
   * [EARS-A3] Reads file content as string.
   * [EARS-B2] Decodes base64 content from Contents API.
   * [EARS-B7] Falls back to Blobs API for files >1MB (null content).
   */
  async read(filePath: string): Promise<string> {
    const fullPath = this.buildFullPath(filePath);

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: fullPath,
        ref: this.ref,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new FileListerError(
          `Not a file: ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }

      // [EARS-B2] Decode base64 content
      if (data.content !== null && data.content !== undefined) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      // [EARS-B7] Content is null (file >1MB), fallback to Blobs API
      return this.readViaBlobs(data.sha, filePath);
    } catch (error: unknown) {
      if (error instanceof FileListerError) throw error;
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (error.status === 401 || error.status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (error.status >= 500) {
          throw new FileListerError(
            `GitHub API server error (${error.status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitHub API response (${error.status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error reading file: ${filePath}`,
        'NETWORK_ERROR',
        filePath,
      );
    }
  }

  /**
   * [EARS-A4] Gets file statistics via Contents API.
   * Returns size from API, mtime as 0 (not available via Contents API), isFile as true.
   */
  async stat(filePath: string): Promise<FileStats> {
    const fullPath = this.buildFullPath(filePath);

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: fullPath,
        ref: this.ref,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new FileListerError(
          `Not a file: ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }

      return {
        size: data.size,
        mtime: 0,
        isFile: true,
      };
    } catch (error: unknown) {
      if (error instanceof FileListerError) throw error;
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (error.status === 401 || error.status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        if (error.status >= 500) {
          throw new FileListerError(
            `GitHub API server error (${error.status}): ${filePath}`,
            'READ_ERROR',
            filePath,
          );
        }
        throw new FileListerError(
          `Unexpected GitHub API response (${error.status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error getting file stats: ${filePath}`,
        'NETWORK_ERROR',
        filePath,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds the full file path including basePath prefix.
   */
  private buildFullPath(filePath: string): string {
    if (this.basePath) {
      return `${this.basePath}/${filePath}`;
    }
    return filePath;
  }

  /**
   * [EARS-B6] Fetches and caches the full repository tree.
   * [EARS-C3] Throws READ_ERROR if the tree response is truncated.
   */
  private async fetchTree(): Promise<TreeEntry[]> {
    if (this.treeCache !== null) {
      return this.treeCache;
    }

    try {
      const { data } = await this.octokit.rest.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: this.ref,
        recursive: '1',
      });

      // [EARS-C3] Truncated tree means we cannot reliably list all files
      if (data.truncated) {
        throw new FileListerError(
          'Repository tree is truncated; too many files to list via Trees API',
          'READ_ERROR',
        );
      }

      this.treeCache = data.tree;
      return this.treeCache;
    } catch (error: unknown) {
      if (error instanceof FileListerError) throw error;
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new FileListerError(
            'Repository or ref not found',
            'FILE_NOT_FOUND',
          );
        }
        if (error.status === 401 || error.status === 403) {
          throw new FileListerError(
            'Permission denied accessing repository tree',
            'PERMISSION_DENIED',
          );
        }
        if (error.status >= 500) {
          throw new FileListerError(
            `GitHub API server error (${error.status}) fetching tree`,
            'READ_ERROR',
          );
        }
        throw new FileListerError(
          `Unexpected GitHub API response (${error.status}) fetching tree`,
          'READ_ERROR',
        );
      }
      throw new FileListerError(
        'Network error fetching repository tree',
        'NETWORK_ERROR',
      );
    }
  }

  /**
   * [EARS-B7] Reads file content via the Blobs API (fallback for >1MB files).
   */
  private async readViaBlobs(sha: string, filePath: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.git.getBlob({
        owner: this.owner,
        repo: this.repo,
        file_sha: sha,
      });

      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new FileListerError(
            `File not found: ${filePath}`,
            'FILE_NOT_FOUND',
            filePath,
          );
        }
        if (error.status === 401 || error.status === 403) {
          throw new FileListerError(
            `Permission denied: ${filePath}`,
            'PERMISSION_DENIED',
            filePath,
          );
        }
        throw new FileListerError(
          `GitHub API error (${error.status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }
      throw new FileListerError(
        `Network error reading blob for file: ${filePath}`,
        'NETWORK_ERROR',
        filePath,
      );
    }
  }
}
