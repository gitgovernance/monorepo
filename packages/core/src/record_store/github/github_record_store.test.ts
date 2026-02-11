/**
 * GitHubRecordStore Unit Tests
 *
 * Tests GitHubRecordStore<V> implementation of RecordStore<V, GitHubWriteResult, GitHubWriteOpts>
 * using GitHub Contents API for record persistence.
 *
 * All EARS prefixes map to the github_record_store_module blueprint.
 *
 * EARS Blocks:
 * - A: RecordStore Contract (get, put, delete, list, exists, putMany)
 * - B: GitHub-Specific Behavior (Contents API, SHA cache, idEncoder, putMany atomic)
 * - C: Error Handling (path traversal, permission, conflict, server, network)
 */

import { GitHubRecordStore } from './github_record_store';
import type { GitHubRecordStoreOptions } from './github_record_store.types';
import type { GitHubFetchFn } from '../../github';
import { GitHubApiError } from '../../github';
import type { IGitModule } from '../../git/index';

// ==================== Test Types ====================

type TestRecord = {
  name: string;
  score: number;
};

// ==================== Test Helpers ====================

const defaultOptions: GitHubRecordStoreOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  token: 'ghp_test_token_123',
  ref: 'main',
  basePath: '.gitgov/actors',
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

function createContentsResponse(value: unknown, sha = 'file-sha-123') {
  const jsonStr = JSON.stringify(value, null, 2);
  return {
    name: 'test.json',
    path: '.gitgov/actors/test.json',
    sha,
    size: jsonStr.length,
    content: Buffer.from(jsonStr).toString('base64'),
    encoding: 'base64',
  };
}

function createPutResponse(commitSha = 'commit-sha-abc', fileSha = 'new-file-sha') {
  return {
    commit: { sha: commitSha, message: 'put test' },
    content: { sha: fileSha, path: '.gitgov/actors/test.json', size: 50 },
  };
}

function createMockGitModule(overrides?: Partial<IGitModule>): IGitModule {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue('atomic-commit-sha'),
    rm: jest.fn().mockResolvedValue(undefined),
    getStagedFiles: jest.fn().mockResolvedValue([]),
    // Remaining methods are unused by putMany
    exec: jest.fn(),
    init: jest.fn(),
    getRepoRoot: jest.fn(),
    getCurrentBranch: jest.fn(),
    getCommitHash: jest.fn(),
    setConfig: jest.fn(),
    getMergeBase: jest.fn(),
    getChangedFiles: jest.fn(),
    getFileContent: jest.fn(),
    getCommitHistory: jest.fn(),
    getCommitHistoryRange: jest.fn(),
    getCommitMessage: jest.fn(),
    hasUncommittedChanges: jest.fn(),
    isRebaseInProgress: jest.fn(),
    branchExists: jest.fn(),
    listRemoteBranches: jest.fn(),
    isRemoteConfigured: jest.fn(),
    getBranchRemote: jest.fn(),
    getConflictedFiles: jest.fn(),
    checkoutBranch: jest.fn(),
    stash: jest.fn(),
    stashPop: jest.fn(),
    stashDrop: jest.fn(),
    checkoutOrphanBranch: jest.fn(),
    fetch: jest.fn(),
    pull: jest.fn(),
    pullRebase: jest.fn(),
    resetHard: jest.fn(),
    checkoutFilesFromBranch: jest.fn(),
    commitAllowEmpty: jest.fn(),
    push: jest.fn(),
    pushWithUpstream: jest.fn(),
    setUpstream: jest.fn(),
    rebaseContinue: jest.fn(),
    rebaseAbort: jest.fn(),
    createBranch: jest.fn(),
    rebase: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as unknown as IGitModule;
}

// ==================== Tests ====================

describe('GitHubRecordStore', () => {
  let mockFetch: jest.Mock<ReturnType<GitHubFetchFn>, Parameters<GitHubFetchFn>>;
  let store: GitHubRecordStore<TestRecord>;

  beforeEach(() => {
    mockFetch = jest.fn();
    store = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch);
  });

  // ==================== 4.1. RecordStore Contract (EARS-A1 to A12) ====================

  describe('4.1. RecordStore Contract (EARS-A1 to A12)', () => {
    it('[EARS-A1] should return stored record when ID exists', async () => {
      const record: TestRecord = { name: 'Camilo', score: 100 };
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse(record)));

      const result = await store.get('camilo');

      expect(result).toEqual(record);
    });

    it('[EARS-A2] should return null when ID does not exist', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const result = await store.get('nonexistent');

      expect(result).toBeNull();
    });

    it('[EARS-A3] should persist value and return GitHubWriteResult with commitSha', async () => {
      const record: TestRecord = { name: 'Camilo', score: 100 };
      mockFetch.mockResolvedValue(createMockResponse(201, createPutResponse('commit-123')));

      const result = await store.put('camilo', record);

      expect(result).toEqual({ commitSha: 'commit-123' });
    });

    it('[EARS-A4] should overwrite existing value and return new commitSha', async () => {
      const record: TestRecord = { name: 'Camilo', score: 100 };
      // First: get to cache SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse(record, 'old-sha')));
      await store.get('camilo');

      // Second: put with cached SHA
      const updated: TestRecord = { name: 'Camilo', score: 200 };
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createPutResponse('commit-456', 'new-sha')));

      const result = await store.put('camilo', updated);

      expect(result).toEqual({ commitSha: 'commit-456' });
      // Verify SHA was included in PUT body
      const putBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(putBody.sha).toBe('old-sha');
    });

    it('[EARS-A5] should delete existing record and return commitSha', async () => {
      // First: get to cache SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse({ name: 'X', score: 1 }, 'del-sha')));
      await store.get('to-delete');

      // Second: delete with cached SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { commit: { sha: 'delete-commit' } }));

      const result = await store.delete('to-delete');

      expect(result).toEqual({ commitSha: 'delete-commit' });
    });

    it('[EARS-A6] should complete without error and return commitSha undefined for non-existing ID', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const result = await store.delete('nonexistent');

      expect(result).toEqual({});
      expect(result.commitSha).toBeUndefined();
    });

    it('[EARS-A7] should return all stored IDs', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, [
        { name: 'alice.json', path: '.gitgov/actors/alice.json', sha: 'a', size: 10, content: null, encoding: 'base64' },
        { name: 'bob.json', path: '.gitgov/actors/bob.json', sha: 'b', size: 10, content: null, encoding: 'base64' },
        { name: 'README.md', path: '.gitgov/actors/README.md', sha: 'r', size: 10, content: null, encoding: 'base64' },
      ]));

      const ids = await store.list();

      expect(ids).toEqual(['alice', 'bob']);
    });

    it('[EARS-A8] should return empty array for empty store', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, []));

      const ids = await store.list();

      expect(ids).toEqual([]);
    });

    it('[EARS-A9] should return true for existing ID', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse({ name: 'X', score: 1 })));

      const exists = await store.exists('camilo');

      expect(exists).toBe(true);
    });

    it('[EARS-A10] should return false for non-existing ID', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const exists = await store.exists('nonexistent');

      expect(exists).toBe(false);
    });

    it('[EARS-A11] should persist all entries and return commitSha', async () => {
      const mockGit = createMockGitModule();
      const storeWithGit = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch, mockGit);

      const entries = [
        { id: 'alice', value: { name: 'Alice', score: 90 } },
        { id: 'bob', value: { name: 'Bob', score: 80 } },
      ];

      const result = await storeWithGit.putMany(entries);

      expect(result).toEqual({ commitSha: 'atomic-commit-sha' });
      expect(mockGit.add).toHaveBeenCalledTimes(1);
      expect(mockGit.commit).toHaveBeenCalledTimes(1);
    });

    it('[EARS-A12] should return commitSha undefined for empty entries', async () => {
      const mockGit = createMockGitModule();
      const storeWithGit = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch, mockGit);

      const result = await storeWithGit.putMany([]);

      expect(result).toEqual({});
      expect(result.commitSha).toBeUndefined();
      expect(mockGit.add).not.toHaveBeenCalled();
      expect(mockGit.commit).not.toHaveBeenCalled();
    });
  });

  // ==================== 4.2. GitHub-Specific Behavior (EARS-B1 to B9) ====================

  describe('4.2. GitHub-Specific Behavior (EARS-B1 to B9)', () => {
    it('[EARS-B1] should fetch file via Contents API and decode base64', async () => {
      const record: TestRecord = { name: 'Camilo', score: 42 };
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse(record)));

      const result = await store.get('camilo');

      expect(result).toEqual(record);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/contents/.gitgov/actors/camilo.json?ref=main');
      expect(init?.method).toBe('GET');
    });

    it('[EARS-B2] should create file via PUT without sha for new records', async () => {
      const record: TestRecord = { name: 'New', score: 0 };
      mockFetch.mockResolvedValue(createMockResponse(201, createPutResponse()));

      await store.put('new-record', record);

      const putBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(putBody).not.toHaveProperty('sha');
      expect(putBody.message).toBe('put new-record');
      expect(putBody.branch).toBe('main');
    });

    it('[EARS-B2] should use opts.commitMessage when provided', async () => {
      const record: TestRecord = { name: 'Custom', score: 0 };
      mockFetch.mockResolvedValue(createMockResponse(201, createPutResponse()));

      await store.put('custom', record, { commitMessage: 'custom message' });

      const putBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(putBody.message).toBe('custom message');
    });

    it('[EARS-B2] should generate default commit message "put {id}" when opts.commitMessage not provided', async () => {
      const record: TestRecord = { name: 'Default', score: 0 };
      mockFetch.mockResolvedValue(createMockResponse(201, createPutResponse()));

      await store.put('my-record', record);

      const putBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(putBody.message).toBe('put my-record');
    });

    it('[EARS-B3] should update file via PUT with sha from cache', async () => {
      // Get first to cache SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse({ name: 'Old', score: 1 }, 'cached-sha-999')));
      await store.get('existing');

      // Put should include cached SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createPutResponse()));
      await store.put('existing', { name: 'Updated', score: 2 });

      const putBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(putBody.sha).toBe('cached-sha-999');
    });

    it('[EARS-B4] should delete file via DELETE with sha and return commitSha', async () => {
      // Get first to cache SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse({ name: 'X', score: 1 }, 'delete-sha')));
      await store.get('to-delete');

      // Delete with cached SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { commit: { sha: 'del-commit-sha' } }));
      const result = await store.delete('to-delete');

      expect(result).toEqual({ commitSha: 'del-commit-sha' });
      const [, init] = mockFetch.mock.calls[1]!;
      expect(init?.method).toBe('DELETE');
      const delBody = JSON.parse(init?.body as string);
      expect(delBody.sha).toBe('delete-sha');
    });

    it('[EARS-B4] should use opts.commitMessage for delete when provided', async () => {
      // Get first
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse({ name: 'X', score: 1 }, 'sha')));
      await store.get('del-msg');

      // Delete with custom message
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { commit: { sha: 'sha' } }));
      await store.delete('del-msg', { commitMessage: 'custom delete' });

      const delBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(delBody.message).toBe('custom delete');
    });

    it('[EARS-B5] should list directory contents and extract IDs', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, [
        { name: 'actor-1.json', path: '.gitgov/actors/actor-1.json', sha: 'a', size: 10, content: null, encoding: 'base64' },
        { name: 'actor-2.json', path: '.gitgov/actors/actor-2.json', sha: 'b', size: 10, content: null, encoding: 'base64' },
      ]));

      const ids = await store.list();

      expect(ids).toEqual(['actor-1', 'actor-2']);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/contents/.gitgov/actors?ref=main');
    });

    it('[EARS-B6] should encode/decode IDs when idEncoder configured', async () => {
      const encoder = {
        encode: (id: string) => id.replace(/:/g, '_'),
        decode: (encoded: string) => encoded.replace(/_/g, ':'),
      };

      const storeWithEncoder = new GitHubRecordStore<TestRecord>(
        { ...defaultOptions, idEncoder: encoder },
        mockFetch,
      );

      // Test list() decoding
      mockFetch.mockResolvedValue(createMockResponse(200, [
        { name: 'human_camilo.json', path: '.gitgov/actors/human_camilo.json', sha: 'a', size: 10, content: null, encoding: 'base64' },
      ]));

      const ids = await storeWithEncoder.list();
      expect(ids).toEqual(['human:camilo']);

      // Test get() encoding
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse({ name: 'Cam', score: 1 })));
      await storeWithEncoder.get('human:camilo');

      // URL should use encoded ID
      const getUrl = mockFetch.mock.calls[1]![0] as string;
      expect(getUrl).toContain('human_camilo.json');
    });

    it('[EARS-B7] should cache SHA from GET response for subsequent operations', async () => {
      const record: TestRecord = { name: 'Cached', score: 50 };
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createContentsResponse(record, 'cached-sha-xyz')));

      await store.get('cached');

      // Subsequent put should use cached SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createPutResponse()));
      await store.put('cached', { name: 'Updated', score: 51 });

      const putBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(putBody.sha).toBe('cached-sha-xyz');
    });

    it('[EARS-B8] should create all files in single atomic commit via GitHubGitModule', async () => {
      const mockGit = createMockGitModule();
      const storeWithGit = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch, mockGit);

      const entries = [
        { id: 'alice', value: { name: 'Alice', score: 90 } },
        { id: 'bob', value: { name: 'Bob', score: 80 } },
      ];

      const result = await storeWithGit.putMany(entries);

      expect(result).toEqual({ commitSha: 'atomic-commit-sha' });

      // Verify add() was called with contentMap
      const addCall = (mockGit.add as jest.Mock).mock.calls[0]!;
      const filePaths = addCall[0] as string[];
      const addOpts = addCall[1] as { contentMap: Record<string, string> };

      expect(filePaths).toEqual([
        '.gitgov/actors/alice.json',
        '.gitgov/actors/bob.json',
      ]);
      expect(JSON.parse(addOpts.contentMap['.gitgov/actors/alice.json']!)).toEqual({ name: 'Alice', score: 90 });
      expect(JSON.parse(addOpts.contentMap['.gitgov/actors/bob.json']!)).toEqual({ name: 'Bob', score: 80 });
    });

    it('[EARS-B8] should use opts.commitMessage for putMany when provided', async () => {
      const mockGit = createMockGitModule();
      const storeWithGit = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch, mockGit);

      await storeWithGit.putMany(
        [{ id: 'alice', value: { name: 'Alice', score: 90 } }],
        { commitMessage: 'batch update actors' },
      );

      expect(mockGit.commit).toHaveBeenCalledWith('batch update actors');
    });

    it('[EARS-B8] should generate default commit message for putMany', async () => {
      const mockGit = createMockGitModule();
      const storeWithGit = new GitHubRecordStore<TestRecord>(defaultOptions, mockFetch, mockGit);

      await storeWithGit.putMany([
        { id: 'a', value: { name: 'A', score: 1 } },
        { id: 'b', value: { name: 'B', score: 2 } },
      ]);

      expect(mockGit.commit).toHaveBeenCalledWith('putMany 2 records');
    });

    it('[EARS-B8] should throw when putMany called without gitModule dependency', async () => {
      // store was created without gitModule
      await expect(store.putMany([
        { id: 'alice', value: { name: 'Alice', score: 90 } },
      ])).rejects.toThrow('putMany requires IGitModule dependency for atomic commits');
    });

    it('[EARS-B9] should return empty array when basePath returns 404', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const ids = await store.list();

      expect(ids).toEqual([]);
    });
  });

  // ==================== 4.3. Error Handling (EARS-C1 to C5) ====================

  describe('4.3. Error Handling (EARS-C1 to C5)', () => {
    it('[EARS-C1] should throw GitHubApiError INVALID_ID for path traversal', async () => {
      await expect(store.get('../secret')).rejects.toThrow(GitHubApiError);
      await expect(store.get('../secret')).rejects.toMatchObject({ code: 'INVALID_ID' });

      await expect(store.get('foo/bar')).rejects.toThrow(GitHubApiError);
      await expect(store.get('foo/bar')).rejects.toMatchObject({ code: 'INVALID_ID' });

      await expect(store.get('foo\\bar')).rejects.toThrow(GitHubApiError);
      await expect(store.get('foo\\bar')).rejects.toMatchObject({ code: 'INVALID_ID' });
    });

    it('[EARS-C2] should throw GitHubApiError PERMISSION_DENIED for 401/403', async () => {
      mockFetch.mockResolvedValue(createMockResponse(403, { message: 'Forbidden' }));

      await expect(store.get('secret')).rejects.toThrow(GitHubApiError);
      await expect(store.get('secret')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
    });

    it('[EARS-C3] should throw GitHubApiError CONFLICT for 409', async () => {
      mockFetch.mockResolvedValue(createMockResponse(409, { message: 'Conflict' }));

      await expect(store.put('stale', { name: 'X', score: 1 })).rejects.toThrow(GitHubApiError);
      await expect(store.put('stale', { name: 'X', score: 1 })).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('[EARS-C4] should throw GitHubApiError SERVER_ERROR for 5xx', async () => {
      mockFetch.mockResolvedValue(createMockResponse(500, { message: 'Internal Server Error' }));

      await expect(store.get('error')).rejects.toThrow(GitHubApiError);
      await expect(store.get('error')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        statusCode: 500,
      });
    });

    it('[EARS-C5] should throw GitHubApiError NETWORK_ERROR for fetch failures', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(store.get('network-error')).rejects.toThrow(GitHubApiError);
      await expect(store.get('network-error')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });
});
