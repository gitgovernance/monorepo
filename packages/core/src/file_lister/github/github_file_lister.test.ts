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
 * - C: Error Handling (5xx, network, truncated, unexpected format)
 */

import { GitHubFileLister } from './github_file_lister';
import type { GitHubFileListerOptions } from './github_file_lister.types';
import type { GitHubFetchFn } from '../../github';
import { FileListerError } from '../file_lister';

// ==================== Test Helpers ====================

const defaultOptions: GitHubFileListerOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  token: 'ghp_test_token_123',
  ref: 'main',
  basePath: '.gitgov',
  apiBaseUrl: 'https://api.github.com',
};

function createMockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

function createTreeResponse(entries: Array<{ path: string; type: 'blob' | 'tree'; sha?: string; size?: number }>, truncated = false) {
  return {
    sha: 'tree-sha-abc',
    tree: entries.map(e => ({
      path: e.path,
      type: e.type,
      sha: e.sha ?? 'blob-sha-' + e.path.replace(/[/.]/g, '-'),
      size: e.size ?? 100,
    })),
    truncated,
  };
}

function createContentsResponse(content: string, sha = 'file-sha-123', size?: number) {
  return {
    name: 'test-file',
    path: 'test-file',
    sha,
    size: size ?? content.length,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  };
}

function createBlobResponse(content: string, sha = 'blob-sha-456') {
  return {
    sha,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
    size: content.length,
  };
}

// ==================== Tests ====================

describe('GitHubFileLister', () => {
  let mockFetch: jest.Mock<ReturnType<GitHubFetchFn>, Parameters<GitHubFetchFn>>;
  let lister: GitHubFileLister;

  beforeEach(() => {
    mockFetch = jest.fn();
    lister = new GitHubFileLister(defaultOptions, mockFetch);
  });

  // ==================== 4.1. FileLister Interface Contract (EARS-A1 to A4) ====================

  describe('4.1. FileLister Interface Contract (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return files matching glob patterns', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/actors/human_camilo.json', type: 'blob' },
        { path: '.gitgov/cycles/001.json', type: 'blob' },
        { path: 'src/index.ts', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await lister.list(['**/*.json']);

      expect(result).toEqual([
        'actors/human_camilo.json',
        'config.json',
        'cycles/001.json',
      ]);
    });

    it('[EARS-A1] should support multiple patterns', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/README.md', type: 'blob' },
        { path: '.gitgov/actors/camilo.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await lister.list(['**/*.json', '**/*.md']);

      expect(result).toContain('config.json');
      expect(result).toContain('README.md');
      expect(result).toContain('actors/camilo.json');
    });

    it('[EARS-A1] should return empty array for no matches', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await lister.list(['**/*.ts']);

      expect(result).toEqual([]);
    });

    it('[EARS-A2] should return true when file exists (HTTP 200)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse('content')));

      const result = await lister.exists('config.json');

      expect(result).toBe(true);
    });

    it('[EARS-A2] should return false when file does not exist (HTTP 404)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const result = await lister.exists('nonexistent.json');

      expect(result).toBe(false);
    });

    it('[EARS-A3] should return file content decoded from base64', async () => {
      const fileContent = '{"key": "value"}';
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse(fileContent)));

      const result = await lister.read('config.json');

      expect(result).toBe(fileContent);
    });

    it('[EARS-A4] should return size from API, mtime 0, isFile true', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
        name: 'config.json',
        path: '.gitgov/config.json',
        sha: 'sha-123',
        size: 42,
        content: Buffer.from('{}').toString('base64'),
        encoding: 'base64',
      }));

      const result = await lister.stat('config.json');

      expect(result).toEqual({ size: 42, mtime: 0, isFile: true });
    });
  });

  // ==================== 4.2. GitHub-Specific Behavior (EARS-B1 to B7) ====================

  describe('4.2. GitHub-Specific Behavior (EARS-B1 to B7)', () => {
    it('[EARS-B1] should fetch tree via Trees API with recursive=1', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      await lister.list(['**/*.json']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/test-org/test-repo/git/trees/main?recursive=1');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toEqual(expect.objectContaining({
        'Authorization': 'Bearer ghp_test_token_123',
      }));
    });

    it('[EARS-B1] should filter tree entries with picomatch', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/actors/camilo.json', type: 'blob' },
        { path: '.gitgov/README.md', type: 'blob' },
        { path: '.gitgov/cycles', type: 'tree' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await lister.list(['**/*.json']);

      expect(result).toEqual(['actors/camilo.json', 'config.json']);
      expect(result).not.toContain('README.md');
    });

    it('[EARS-B2] should decode base64 content from Contents API', async () => {
      const originalContent = 'Hello World!\nLine 2';
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse(originalContent)));

      const result = await lister.read('test.txt');

      expect(result).toBe(originalContent);
    });

    it('[EARS-B3] should prefix basePath in API calls', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse('content')));

      await lister.read('config.json');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/test-org/test-repo/contents/.gitgov/config.json?ref=main');
    });

    it('[EARS-B3] should strip basePath from returned file paths', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
        { path: '.gitgov/deep/nested/file.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await lister.list(['**/*']);

      expect(result).toEqual(['config.json', 'deep/nested/file.json']);
      expect(result.every(p => !p.startsWith('.gitgov/'))).toBe(true);
    });

    it('[EARS-B4] should throw FILE_NOT_FOUND for HTTP 404 on read', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      await expect(lister.read('nonexistent.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('nonexistent.json')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('[EARS-B4] should return false for HTTP 404 on exists', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const result = await lister.exists('missing.json');

      expect(result).toBe(false);
    });

    it('[EARS-B5] should throw PERMISSION_DENIED for HTTP 401 or 403', async () => {
      mockFetch.mockResolvedValue(createMockResponse(403, { message: 'Forbidden' }));

      await expect(lister.read('secret.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('secret.json')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('[EARS-B6] should cache tree and not re-fetch on subsequent list calls', async () => {
      const tree = createTreeResponse([
        { path: '.gitgov/config.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      await lister.list(['**/*']);
      await lister.list(['**/*.json']);

      // Only 1 fetch call for tree, not 2
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('[EARS-B7] should fallback to Blobs API when content is null (file >1MB)', async () => {
      const largeContent = 'large file content here';
      // First call: Contents API returns null content (>1MB)
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {
        name: 'big-file.json',
        path: '.gitgov/big-file.json',
        sha: 'large-blob-sha',
        size: 2_000_000,
        content: null,
        encoding: 'base64',
      }));
      // Second call: Blobs API returns the actual content
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createBlobResponse(largeContent, 'large-blob-sha')));

      const result = await lister.read('big-file.json');

      expect(result).toBe(largeContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [blobUrl] = mockFetch.mock.calls[1]!;
      expect(blobUrl).toContain('/git/blobs/large-blob-sha');
    });
  });

  // ==================== 4.3. Error Handling (EARS-C1 to C4) ====================

  describe('4.3. Error Handling (EARS-C1 to C4)', () => {
    it('[EARS-C1] should throw READ_ERROR with status code for HTTP 5xx', async () => {
      mockFetch.mockResolvedValue(createMockResponse(500, { message: 'Internal Server Error' }));

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C2] should throw READ_ERROR for network failures', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C3] should throw READ_ERROR when tree response is truncated', async () => {
      const tree = createTreeResponse(
        [{ path: '.gitgov/config.json', type: 'blob' }],
        true, // truncated
      );
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      await expect(lister.list(['**/*'])).rejects.toThrow(FileListerError);
      await expect(lister.list(['**/*'])).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });

    it('[EARS-C4] should throw READ_ERROR for unexpected API response format', async () => {
      // Return something that can't be parsed as JSON properly
      const badResponse = {
        status: 200,
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Unexpected token')),
        text: jest.fn().mockResolvedValue('not json'),
        headers: new Headers(),
      } as unknown as Response;
      mockFetch.mockResolvedValue(badResponse);

      await expect(lister.read('file.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('file.json')).rejects.toMatchObject({
        code: 'READ_ERROR',
      });
    });
  });

  // ==================== Constructor Defaults ====================

  describe('Constructor Defaults', () => {
    it('should use HEAD as default ref when not specified', async () => {
      const listerNoRef = new GitHubFileLister(
        { owner: 'org', repo: 'repo', token: 'tok' },
        mockFetch,
      );
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse('content')));

      await listerNoRef.read('file.txt');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('?ref=HEAD');
    });

    it('should work without basePath (repo root)', async () => {
      const listerNoBase = new GitHubFileLister(
        { owner: 'org', repo: 'repo', token: 'tok', ref: 'main' },
        mockFetch,
      );
      const tree = createTreeResponse([
        { path: 'src/index.ts', type: 'blob' },
        { path: 'package.json', type: 'blob' },
      ]);
      mockFetch.mockResolvedValue(createMockResponse(200, tree));

      const result = await listerNoBase.list(['**/*.ts']);

      expect(result).toEqual(['src/index.ts']);
    });
  });
});
