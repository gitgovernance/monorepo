/**
 * GitHubFileLister Unit Tests
 *
 * Tests GitHubFileLister implementation of the FileLister interface
 * using GitHub REST API (Trees, Contents, Blobs) for file operations.
 *
 * All EARS prefixes map to the github_file_lister_module blueprint.
 *
 * EARS Blocks:
 * - A: FileLister Interface Contract (list, exists, read, stat)
 * - B: GitHub-Specific Behavior (Trees API, Contents API, basePath, caching, Blobs)
 * - C: Error Handling (5xx, network, truncated, unexpected format, tree 404)
 */

import { GitHubFileLister } from './github_file_lister';
import type { GitHubFileListerOptions } from './github_file_lister.types';
import type { Octokit } from '@octokit/rest';
import { FileListerError } from '../file_lister';

// ==================== Test Helpers ====================

type MockOctokit = Octokit & {
  rest: {
    repos: {
      getContent: jest.MockedFunction<any>;
    };
    git: {
      getTree: jest.MockedFunction<any>;
      getBlob: jest.MockedFunction<any>;
    };
  };
};

function createMockOctokit(): MockOctokit {
  return {
    rest: {
      repos: {
        getContent: jest.fn(),
      },
      git: {
        getTree: jest.fn(),
        getBlob: jest.fn(),
      },
    },
  } as unknown as MockOctokit;
}

function createOctokitError(status: number, message = 'Error'): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

const defaultOptions: GitHubFileListerOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  ref: 'gitgov-state',
  basePath: '.gitgov',
};

function createTreeResponse(entries: Array<{ path: string; type: 'blob' | 'tree'; sha?: string; size?: number }>, truncated = false) {
  return {
    data: {
      sha: 'tree-sha-abc',
      tree: entries.map(e => ({
        path: e.path,
        type: e.type,
        sha: e.sha ?? 'blob-sha-' + e.path.replace(/[/.]/g, '-'),
        size: e.size ?? 100,
      })),
      truncated,
    },
  };
}

function createContentsResponse(content: string, sha = 'file-sha-123', size?: number) {
  return {
    data: {
      name: 'test-file',
      path: 'test-file',
      sha,
      size: size ?? content.length,
      type: 'file' as const,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    },
  };
}

function createBlobResponse(content: string, sha = 'blob-sha-456') {
  return {
    data: {
      sha,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
      size: content.length,
    },
  };
}

// ==================== Tests ====================

describe('GitHubFileLister', () => {
  let mockOctokit: MockOctokit;
  let lister: GitHubFileLister;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    lister = new GitHubFileLister(defaultOptions, mockOctokit);
  });

  // ==================== 4.1. FileLister Interface Contract (EARS-A1 to A4) ====================

  describe('4.1. FileLister Interface Contract (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return files matching glob patterns', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/actors/human_camilo.json', type: 'blob' },
        { path: '.gitgov/cycles/001.json', type: 'blob' },
        { path: 'src/index.ts', type: 'blob' },
      ]));

      const result = await lister.list(['**/*.json']);

      expect(result).toEqual([
        'actors/human_camilo.json',
        'config.json',
        'cycles/001.json',
      ]);
    });

    it('[EARS-A1] should support multiple patterns', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/README.md', type: 'blob' },
        { path: '.gitgov/actors/camilo.json', type: 'blob' },
      ]));

      const result = await lister.list(['**/*.json', '**/*.md']);

      expect(result).toContain('config.json');
      expect(result).toContain('README.md');
      expect(result).toContain('actors/camilo.json');
    });

    it('[EARS-A1] should return empty array for no matches', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]));

      const result = await lister.list(['**/*.ts']);

      expect(result).toEqual([]);
    });

    it('[EARS-A2] should return true when file exists (HTTP 200)', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse('content'));

      const result = await lister.exists('config.json');

      expect(result).toBe(true);
    });

    it('[EARS-A2] should return false when path is a directory, not a file', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: [{ name: 'subdir', type: 'dir' }],
      });

      const result = await lister.exists('some-directory');

      expect(result).toBe(false);
    });

    it('[EARS-A2] should return false when file does not exist (HTTP 404)', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      const result = await lister.exists('nonexistent.json');

      expect(result).toBe(false);
    });

    it('[EARS-A3] should return file content decoded from base64', async () => {
      const fileContent = '{"key": "value"}';
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse(fileContent));

      const result = await lister.read('config.json');

      expect(result).toBe(fileContent);
    });

    it('[EARS-A4] should return size from API, mtime 0, isFile true', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          name: 'config.json',
          path: '.gitgov/config.json',
          sha: 'sha-123',
          size: 42,
          type: 'file',
          content: Buffer.from('{}').toString('base64'),
          encoding: 'base64',
        },
      });

      const result = await lister.stat('config.json');

      expect(result).toEqual({ size: 42, mtime: 0, isFile: true });
    });
  });

  // ==================== 4.2. GitHub-Specific Behavior (EARS-B1 to B7) ====================

  describe('4.2. GitHub-Specific Behavior (EARS-B1 to B7)', () => {
    it('[EARS-B1] should fetch tree via Octokit git.getTree with recursive', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]));

      await lister.list(['**/*.json']);

      expect(mockOctokit.rest.git.getTree).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.getTree).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        tree_sha: 'gitgov-state',
        recursive: '1',
      });
    });

    it('[EARS-B1] should filter tree entries with picomatch', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/actors/camilo.json', type: 'blob' },
        { path: '.gitgov/README.md', type: 'blob' },
        { path: '.gitgov/cycles', type: 'tree' },
      ]));

      const result = await lister.list(['**/*.json']);

      expect(result).toEqual(['actors/camilo.json', 'config.json']);
      expect(result).not.toContain('README.md');
    });

    it('[EARS-B2] should decode base64 content from Contents API', async () => {
      const originalContent = 'Hello World!\nLine 2';
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse(originalContent));

      const result = await lister.read('test.txt');

      expect(result).toBe(originalContent);
    });

    it('[EARS-B3] should pass basePath-prefixed path to Octokit', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse('content'));

      await lister.read('config.json');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        path: '.gitgov/config.json',
        ref: 'gitgov-state',
      });
    });

    it('[EARS-B3] should strip basePath from returned file paths', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/deep/nested/file.json', type: 'blob' },
      ]));

      const result = await lister.list(['**/*']);

      expect(result).toEqual(['config.json', 'deep/nested/file.json']);
      expect(result.every(p => !p.startsWith('.gitgov/'))).toBe(true);
    });

    it('[EARS-B4] should throw FILE_NOT_FOUND for HTTP 404 on read', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      await expect(lister.read('nonexistent.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('nonexistent.json')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('[EARS-B4] should throw FILE_NOT_FOUND for HTTP 404 on stat', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      await expect(lister.stat('nonexistent.json')).rejects.toThrow(FileListerError);
      await expect(lister.stat('nonexistent.json')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('[EARS-B4] should return false for HTTP 404 on exists', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      const result = await lister.exists('missing.json');

      expect(result).toBe(false);
    });

    it('[EARS-B5] should throw PERMISSION_DENIED for HTTP 403', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(403));

      await expect(lister.read('secret.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('secret.json')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('[EARS-B5] should throw PERMISSION_DENIED for HTTP 401', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(401));

      await expect(lister.read('secret.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('secret.json')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('[EARS-B6] should cache tree and not re-fetch on subsequent list calls', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]));

      await lister.list(['**/*']);
      await lister.list(['**/*.json']);

      // Only 1 fetch call for tree, not 2
      expect(mockOctokit.rest.git.getTree).toHaveBeenCalledTimes(1);
    });

    it('[EARS-B7] should fallback to Blobs API when content is null (file >1MB)', async () => {
      const largeContent = 'large file content here';
      // Contents API returns null content (>1MB)
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          name: 'big-file.json',
          path: '.gitgov/big-file.json',
          sha: 'large-blob-sha',
          size: 2_000_000,
          type: 'file',
          content: null,
          encoding: 'base64',
        },
      });
      // Blobs API returns the actual content
      mockOctokit.rest.git.getBlob.mockResolvedValue(createBlobResponse(largeContent, 'large-blob-sha'));

      const result = await lister.read('big-file.json');

      expect(result).toBe(largeContent);
      expect(mockOctokit.rest.git.getBlob).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        file_sha: 'large-blob-sha',
      });
    });
  });

  // ==================== 4.3. Error Handling (EARS-C1 to C5) ====================

  describe('4.3. Error Handling (EARS-C1 to C5)', () => {
    it('[EARS-C1] should throw READ_ERROR with status code for HTTP 5xx', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(500));

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C2] should throw NETWORK_ERROR for network failures', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new TypeError('fetch failed'));

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('[EARS-C3] should throw READ_ERROR when tree response is truncated', async () => {
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse(
        [{ path: '.gitgov/config.json', type: 'blob' }],
        true, // truncated
      ));

      await expect(lister.list(['**/*'])).rejects.toThrow(FileListerError);
      await expect(lister.list(['**/*'])).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C4] should throw READ_ERROR for unexpected API response format on read', async () => {
      // Return a directory instead of a file
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: [{ name: 'subdir', type: 'dir' }],
      });

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C4] should throw READ_ERROR for unexpected API response format on stat', async () => {
      // Return a directory instead of a file
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: [{ name: 'subdir', type: 'dir' }],
      });

      await expect(lister.stat('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.stat('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C5] should throw FILE_NOT_FOUND when tree ref returns HTTP 404', async () => {
      mockOctokit.rest.git.getTree.mockRejectedValue(createOctokitError(404));

      await expect(lister.list(['**/*'])).rejects.toThrow(FileListerError);
      await expect(lister.list(['**/*'])).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });
  });

  // ==================== Constructor Defaults ====================

  describe('Constructor Defaults', () => {
    it('[EARS-B8] should use gitgov-state as default ref when not specified', async () => {
      const listerNoRef = new GitHubFileLister(
        { owner: 'org', repo: 'repo' },
        mockOctokit,
      );
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse('content'));

      await listerNoRef.read('file.txt');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith(
        expect.objectContaining({ ref: 'gitgov-state' }),
      );
    });

    it('[EARS-B8] should work without basePath (repo root)', async () => {
      const listerNoBase = new GitHubFileLister(
        { owner: 'org', repo: 'repo', ref: 'main' },
        mockOctokit,
      );
      mockOctokit.rest.git.getTree.mockResolvedValue(createTreeResponse([
        { path: 'src/index.ts', type: 'blob' },
        { path: 'package.json', type: 'blob' },
      ]));

      const result = await listerNoBase.list(['**/*.ts']);

      expect(result).toEqual(['src/index.ts']);
    });
  });
});
