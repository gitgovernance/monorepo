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
import type { FileLister, FileListOptions, FileStats } from '../file_lister';
import { FileListerError } from '../file_lister';
import type { GitHubFetchFn, GitHubContentsResponse } from '../../github/github.types';
import type { GitHubFileListerOptions, GitHubTreeEntry } from './github_file_lister.types';

/**
 * Response shape from the GitHub Git Trees API.
 */
type GitHubTreeResponse = {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

/**
 * Response shape from the GitHub Git Blobs API.
 */
type GitHubBlobResponse = {
  sha: string;
  content: string;
  encoding: string;
  size: number;
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
 * const lister = new GitHubFileLister({
 *   owner: 'myorg',
 *   repo: 'myrepo',
 *   token: 'ghp_xxx',
 *   ref: 'main',
 *   basePath: '.gitgov',
 * });
 *
 * const files = await lister.list(['**\/*.ts']);
 * const content = await lister.read('config.json');
 * ```
 */
export class GitHubFileLister implements FileLister {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly apiBaseUrl: string;
  private readonly fetchFn: GitHubFetchFn;

  /** Cached tree entries from the Trees API */
  private treeCache: GitHubTreeEntry[] | null = null;

  constructor(options: GitHubFileListerOptions, fetchFn?: GitHubFetchFn) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.ref = options.ref ?? 'HEAD';
    this.basePath = options.basePath ?? '';
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.fetchFn = fetchFn ?? globalThis.fetch;
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
    const url = this.buildUrl(`/repos/${this.owner}/${this.repo}/contents/${fullPath}?ref=${this.ref}`);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (response.status === 200) {
        return true;
      }

      if (response.status === 404) {
        return false;
      }

      if (response.status === 401 || response.status === 403) {
        throw new FileListerError(
          `Permission denied: ${filePath}`,
          'PERMISSION_DENIED',
          filePath,
        );
      }

      if (response.status >= 500) {
        throw new FileListerError(
          `GitHub API server error (${response.status}): ${filePath}`,
          'READ_ERROR',
          filePath,
        );
      }

      throw new FileListerError(
        `Unexpected GitHub API response (${response.status}): ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    } catch (error: unknown) {
      if (error instanceof FileListerError) {
        throw error;
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
   * [EARS-B2] Decodes base64 content from Contents API.
   * [EARS-B7] Falls back to Blobs API for files >1MB (null content).
   */
  async read(filePath: string): Promise<string> {
    const fullPath = this.buildFullPath(filePath);
    const url = this.buildUrl(`/repos/${this.owner}/${this.repo}/contents/${fullPath}?ref=${this.ref}`);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    } catch (error: unknown) {
      throw new FileListerError(
        `Network error reading file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    this.handleErrorResponse(response, filePath);

    let data: GitHubContentsResponse;
    try {
      data = await response.json() as GitHubContentsResponse;
    } catch {
      throw new FileListerError(
        `Unexpected response format reading file: ${filePath}`,
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
  }

  /**
   * [EARS-A4] Gets file statistics via Contents API.
   * Returns size from API, mtime as 0 (not available via Contents API), isFile as true.
   */
  async stat(filePath: string): Promise<FileStats> {
    const fullPath = this.buildFullPath(filePath);
    const url = this.buildUrl(`/repos/${this.owner}/${this.repo}/contents/${fullPath}?ref=${this.ref}`);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    } catch (error: unknown) {
      throw new FileListerError(
        `Network error getting file stats: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    this.handleErrorResponse(response, filePath);

    let data: GitHubContentsResponse;
    try {
      data = await response.json() as GitHubContentsResponse;
    } catch {
      throw new FileListerError(
        `Unexpected response format for stat: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    return {
      size: data.size,
      mtime: 0,
      isFile: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Builds the full API URL from a path.
   */
  private buildUrl(path: string): string {
    return `${this.apiBaseUrl}${path}`;
  }

  /**
   * Builds the standard headers for GitHub API requests.
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
    };
  }

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
   * Handles common error responses from GitHub API.
   * Throws appropriate FileListerError for non-200 responses.
   */
  private handleErrorResponse(response: Response, filePath: string): void {
    if (response.ok) {
      return;
    }

    if (response.status === 404) {
      throw new FileListerError(
        `File not found: ${filePath}`,
        'FILE_NOT_FOUND',
        filePath,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new FileListerError(
        `Permission denied: ${filePath}`,
        'PERMISSION_DENIED',
        filePath,
      );
    }

    if (response.status >= 500) {
      throw new FileListerError(
        `GitHub API server error (${response.status}): ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    throw new FileListerError(
      `Unexpected GitHub API response (${response.status}): ${filePath}`,
      'READ_ERROR',
      filePath,
    );
  }

  /**
   * [EARS-B6] Fetches and caches the full repository tree.
   * [EARS-C3] Throws READ_ERROR if the tree response is truncated.
   */
  private async fetchTree(): Promise<GitHubTreeEntry[]> {
    if (this.treeCache !== null) {
      return this.treeCache;
    }

    const url = this.buildUrl(
      `/repos/${this.owner}/${this.repo}/git/trees/${this.ref}?recursive=1`
    );

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    } catch (error: unknown) {
      throw new FileListerError(
        'Network error fetching repository tree',
        'READ_ERROR',
      );
    }

    if (response.status === 404) {
      throw new FileListerError(
        'Repository or ref not found',
        'FILE_NOT_FOUND',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new FileListerError(
        'Permission denied accessing repository tree',
        'PERMISSION_DENIED',
      );
    }

    if (response.status >= 500) {
      throw new FileListerError(
        `GitHub API server error (${response.status}) fetching tree`,
        'READ_ERROR',
      );
    }

    if (!response.ok) {
      throw new FileListerError(
        `Unexpected GitHub API response (${response.status}) fetching tree`,
        'READ_ERROR',
      );
    }

    let data: GitHubTreeResponse;
    try {
      data = await response.json() as GitHubTreeResponse;
    } catch {
      throw new FileListerError(
        'Unexpected response format from Trees API',
        'READ_ERROR',
      );
    }

    // [EARS-C3] Truncated tree means we cannot reliably list all files
    if (data.truncated) {
      throw new FileListerError(
        'Repository tree is truncated; too many files to list via Trees API',
        'READ_ERROR',
      );
    }

    this.treeCache = data.tree;
    return this.treeCache;
  }

  /**
   * [EARS-B7] Reads file content via the Blobs API (fallback for >1MB files).
   */
  private async readViaBlobs(sha: string, filePath: string): Promise<string> {
    const url = this.buildUrl(
      `/repos/${this.owner}/${this.repo}/git/blobs/${sha}`
    );

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    } catch (error: unknown) {
      throw new FileListerError(
        `Network error reading blob for file: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    this.handleErrorResponse(response, filePath);

    let data: GitHubBlobResponse;
    try {
      data = await response.json() as GitHubBlobResponse;
    } catch {
      throw new FileListerError(
        `Unexpected response format from Blobs API: ${filePath}`,
        'READ_ERROR',
        filePath,
      );
    }

    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
}
