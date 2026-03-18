/**
 * Tests for GitLabFileLister
 *
 * Blueprint: gitlab_file_lister_module.md
 * EARS: A1-A4 (interface), B1-B8 (GitLab-specific), C1-C4 (errors)
 */

import { GitLabFileLister } from './gitlab_file_lister';
import type { GitLabFileListerOptions } from './gitlab_file_lister.types';
import { FileListerError } from '@gitgov/core/file_lister/file_lister.errors';

// ═══════════════════════════════════════════════════════════════════════
// Mock Gitbeaker
// ═══════════════════════════════════════════════════════════════════════

function createMockApi() {
  return {
    Repositories: {
      allRepositoryTrees: jest.fn(),
      showBlob: jest.fn(),
    },
    RepositoryFiles: {
      show: jest.fn(),
    },
  } as unknown as GitLabFileListerOptions['api'];
}

function mockApi(api: GitLabFileListerOptions['api']) {
  return api as unknown as {
    Repositories: { allRepositoryTrees: jest.Mock; showBlob: jest.Mock };
    RepositoryFiles: { show: jest.Mock };
  };
}

function gitbeakerError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>)['cause'] = { response: { status } };
  return err;
}

function networkError(): Error {
  return new TypeError('fetch failed');
}

const defaultOpts: GitLabFileListerOptions = {
  projectId: 123,
  api: createMockApi(),
  ref: 'gitgov-state',
  basePath: '.gitgov',
};

function createLister(overrides?: Partial<GitLabFileListerOptions>) {
  const opts = { ...defaultOpts, ...overrides, api: overrides?.api ?? createMockApi() };
  return { lister: new GitLabFileLister(opts), api: opts.api };
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('GitLabFileLister', () => {
  describe('4.1. FileLister Interface (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return files matching glob patterns', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
        { path: '.gitgov/tasks/t1.json', type: 'blob', id: 'a2', name: 't1.json', mode: '100644' },
        { path: '.gitgov/actors/a1.json', type: 'blob', id: 'a3', name: 'a1.json', mode: '100644' },
      ]);

      const files = await lister.list(['**/*.json']);
      expect(files).toEqual(['actors/a1.json', 'config.json', 'tasks/t1.json']);
    });

    it('[EARS-A1] should support multiple patterns', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
        { path: '.gitgov/README.md', type: 'blob', id: 'a2', name: 'README.md', mode: '100644' },
      ]);

      const files = await lister.list(['*.json', '*.md']);
      expect(files).toEqual(['README.md', 'config.json']);
    });

    it('[EARS-A1] should return empty array for no matches', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
      ]);

      const files = await lister.list(['*.ts']);
      expect(files).toEqual([]);
    });

    it('[EARS-A2] should return true when file exists (HTTP 200)', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: 'e30=',
        blob_id: 'abc',
        size: 2,
      });

      expect(await lister.exists('config.json')).toBe(true);
    });

    it('[EARS-A2] should return false when path is a directory (Files API 404)', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      expect(await lister.exists('tasks')).toBe(false);
    });

    it('[EARS-A2] should return false when file does not exist (HTTP 404)', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      expect(await lister.exists('nonexistent.json')).toBe(false);
    });

    it('[EARS-A3] should return file content decoded from base64', async () => {
      const { lister, api } = createLister();
      const content = '{"key": "value"}';
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(content).toString('base64'),
        blob_id: 'abc',
        size: content.length,
      });

      const result = await lister.read('config.json');
      expect(result).toBe(content);
    });

    it('[EARS-A4] should return size from API, mtime 0, isFile true', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: 'e30=',
        blob_id: 'abc',
        size: 42,
      });

      const stats = await lister.stat('config.json');
      expect(stats).toEqual({ size: 42, mtime: 0, isFile: true });
    });
  });

  describe('4.2. GitLab-Specific (EARS-B1 to B8)', () => {
    it('[EARS-B1] should fetch tree via paginated Tree API with recursive=true', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
      ]);

      await lister.list(['**/*']);

      expect(mockApi(api).Repositories.allRepositoryTrees).toHaveBeenCalledWith(123, expect.objectContaining({
        ref: 'gitgov-state',
        recursive: true,
      }));
    });

    it('[EARS-B1] should return all items from paginated tree (Gitbeaker auto-paginates)', async () => {
      const { lister, api } = createLister();
      // allRepositoryTrees handles pagination internally — returns all items in 1 call
      const allItems = Array.from({ length: 101 }, (_, i) => ({
        path: `.gitgov/file${i}.json`, type: 'blob', id: `id${i}`, name: `file${i}.json`, mode: '100644',
      }));

      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue(allItems);

      const files = await lister.list(['**/*.json']);
      expect(files.length).toBe(101);
      expect(mockApi(api).Repositories.allRepositoryTrees).toHaveBeenCalledTimes(1);
    });

    it('[EARS-B1] should normalize directory patterns to recursive globs', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/tasks/t1.json', type: 'blob', id: 'a1', name: 't1.json', mode: '100644' },
        { path: '.gitgov/tasks/t2.json', type: 'blob', id: 'a2', name: 't2.json', mode: '100644' },
      ]);

      const files = await lister.list(['tasks/']);
      expect(files).toEqual(['tasks/t1.json', 'tasks/t2.json']);
    });

    it('[EARS-B1] should filter tree entries with picomatch', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
        { path: '.gitgov/tasks', type: 'tree', id: 'a2', name: 'tasks', mode: '040000' },
      ]);

      const files = await lister.list(['**/*.json']);
      expect(files).toEqual(['config.json']);
    });

    it('[EARS-B2] should decode base64 content from Files API', async () => {
      const { lister, api } = createLister();
      const original = '{"protocolVersion":"1.0"}';
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(original).toString('base64'),
        blob_id: 'abc',
        size: original.length,
      });

      const content = await lister.read('config.json');
      expect(content).toBe(original);
    });

    it('[EARS-B3] should pass basePath-prefixed path to Gitbeaker', async () => {
      const { lister, api } = createLister({ basePath: '.gitgov' });
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: 'e30=',
        blob_id: 'abc',
        size: 2,
      });

      await lister.read('config.json');

      expect(mockApi(api).RepositoryFiles.show).toHaveBeenCalledWith(
        123,
        '.gitgov/config.json',
        'gitgov-state',
      );
    });

    it('[EARS-B3] should strip basePath from returned file paths', async () => {
      const { lister, api } = createLister({ basePath: '.gitgov' });
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/tasks/t1.json', type: 'blob', id: 'a1', name: 't1.json', mode: '100644' },
      ]);

      const files = await lister.list(['**/*']);
      expect(files).toEqual(['tasks/t1.json']);
    });

    it('[EARS-B4] should throw FILE_NOT_FOUND for HTTP 404 on read', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      await expect(lister.read('missing.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('missing.json')).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('[EARS-B4] should throw FILE_NOT_FOUND for HTTP 404 on stat', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      await expect(lister.stat('missing.json')).rejects.toThrow(FileListerError);
      await expect(lister.stat('missing.json')).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('[EARS-B4] should return false for HTTP 404 on exists', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      expect(await lister.exists('missing.json')).toBe(false);
    });

    it('[EARS-B5] should throw PERMISSION_DENIED for HTTP 401', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(401));

      await expect(lister.read('config.json')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('[EARS-B5] should throw PERMISSION_DENIED for HTTP 403', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(403));

      await expect(lister.read('config.json')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('[EARS-B6] should cache tree and not re-fetch on subsequent list calls', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/config.json', type: 'blob', id: 'a1', name: 'config.json', mode: '100644' },
      ]);

      await lister.list(['**/*']);
      await lister.list(['**/*']);

      expect(mockApi(api).Repositories.allRepositoryTrees).toHaveBeenCalledTimes(1);
    });

    it('[EARS-B7] should fallback to Blobs API when content is null (file >1MB)', async () => {
      const { lister, api } = createLister();
      const largeContent = 'x'.repeat(2_000_000);
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: null,
        blob_id: 'blob-sha',
        size: 2_000_000,
      });
      mockApi(api).Repositories.showBlob.mockResolvedValue({
        content: Buffer.from(largeContent).toString('base64'),
      });

      const result = await lister.read('large-file.json');
      expect(result).toBe(largeContent);
      expect(mockApi(api).Repositories.showBlob).toHaveBeenCalledWith(123, 'blob-sha');
    });

    it('[EARS-B8] should use gitgov-state as default ref when not specified', async () => {
      const api = createMockApi();
      const lister = new GitLabFileLister({ projectId: 123, api });

      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: 'e30=',
        blob_id: 'abc',
        size: 2,
      });

      await lister.exists('test.json');

      expect(mockApi(api).RepositoryFiles.show).toHaveBeenCalledWith(
        123,
        'test.json',
        'gitgov-state',
      );
    });

    it('[EARS-B8] should work without basePath (repo root)', async () => {
      const { lister, api } = createLister({ basePath: '' });
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: 'README.md', type: 'blob', id: 'a1', name: 'README.md', mode: '100644' },
      ]);

      const files = await lister.list(['*.md']);
      expect(files).toEqual(['README.md']);
    });
  });

  describe('4.3. Error Handling (EARS-C1 to C4)', () => {
    it('[EARS-C1] should throw READ_ERROR with status code for HTTP 5xx', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(500));

      await expect(lister.read('config.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('config.json')).rejects.toMatchObject({ code: 'READ_ERROR' });
    });

    it('[EARS-C2] should throw READ_ERROR for network failures', async () => {
      const { lister, api } = createLister();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(networkError());

      await expect(lister.read('config.json')).rejects.toThrow(FileListerError);
      await expect(lister.read('config.json')).rejects.toMatchObject({ code: 'READ_ERROR' });
    });

    it('[EARS-C3] should throw READ_ERROR for directory path on read', async () => {
      const { lister, api } = createLister();
      // Files API returns null content and no blob_id for a non-file
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: null,
        blob_id: undefined,
        size: 0,
      });

      await expect(lister.read('tasks')).rejects.toThrow(FileListerError);
      await expect(lister.read('tasks')).rejects.toMatchObject({ code: 'READ_ERROR' });
    });

    it('[EARS-C3] should throw FileListerError for directory path on stat (GitLab returns 404 for directories)', async () => {
      const { lister, api } = createLister();
      // GitLab Files API returns 404 for directories — cannot distinguish from not-found
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      await expect(lister.stat('tasks')).rejects.toThrow(FileListerError);
      await expect(lister.stat('tasks')).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('[EARS-C4] should throw FILE_NOT_FOUND when tree ref returns HTTP 404', async () => {
      const { lister, api } = createLister();
      mockApi(api).Repositories.allRepositoryTrees.mockRejectedValue(gitbeakerError(404));

      await expect(lister.list(['**/*'])).rejects.toThrow(FileListerError);
      await expect(lister.list(['**/*'])).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });
  });
});
