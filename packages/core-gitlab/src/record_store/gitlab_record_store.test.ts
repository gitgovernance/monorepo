/**
 * Tests for GitLabRecordStore
 *
 * Blueprint: gitlab_record_store_module.md
 * EARS: A1-A12 (interface), B1-B9 (GitLab-specific), C1-C6 (errors)
 */

import { GitLabRecordStore } from './gitlab_record_store';
import type { GitLabRecordStoreOptions } from './gitlab_record_store.types';
// GitLabApiError used implicitly via toMatchObject({ code: '...' })

function createMockApi() {
  return {
    RepositoryFiles: {
      show: jest.fn(),
      create: jest.fn(),
      edit: jest.fn(),
      remove: jest.fn(),
    },
    Repositories: {
      allRepositoryTrees: jest.fn(),
    },
    Commits: {
      create: jest.fn(),
    },
    Branches: {
      show: jest.fn(),
    },
  } as unknown as GitLabRecordStoreOptions['api'];
}

function mockApi(api: GitLabRecordStoreOptions['api']) {
  return api as unknown as {
    RepositoryFiles: { show: jest.Mock; create: jest.Mock; edit: jest.Mock; remove: jest.Mock };
    Repositories: { allRepositoryTrees: jest.Mock };
    Commits: { create: jest.Mock };
    Branches: { show: jest.Mock };
  };
}

function gitbeakerError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>)['cause'] = { response: { status } };
  return err;
}

const testRecord = { header: { id: 'test' }, payload: { title: 'Test' } };

function createStore(overrides?: Partial<GitLabRecordStoreOptions>) {
  const api = overrides?.api ?? createMockApi();
  return {
    store: new GitLabRecordStore<typeof testRecord>({
      projectId: 123,
      api,
      basePath: '.gitgov/tasks',
      ...overrides,
    }),
    api,
  };
}

describe('GitLabRecordStore', () => {
  describe('4.1. RecordStore Contract (EARS-A1 to A12)', () => {
    it('[EARS-A1] should return stored record when ID exists', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(testRecord)).toString('base64'),
        blob_id: 'blob-1',
      });

      const result = await store.get('task-001');
      expect(result).toEqual(testRecord);
    });

    it('[EARS-A2] should return null when ID does not exist', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      expect(await store.get('nonexistent')).toBeNull();
    });

    it('[EARS-A3] should persist value and return GitLabWriteResult with commitSha', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'new-blob',
        last_commit_id: 'commit-abc',
        content: Buffer.from('{}').toString('base64'),
      });

      const result = await store.put('task-001', testRecord);
      expect(result.commitSha).toBe('commit-abc');
    });

    it('[EARS-A4] should overwrite existing value and return new commitSha', async () => {
      const { store, api } = createStore();
      // First get to cache blob_id
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from(JSON.stringify(testRecord)).toString('base64'),
        blob_id: 'old-blob',
      });
      await store.get('task-001');

      // Put (update) — re-read returns same blob_id
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({ blob_id: 'old-blob' });
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        blob_id: 'new-blob', last_commit_id: 'commit-xyz',
        content: Buffer.from('{}').toString('base64'),
      });

      const result = await store.put('task-001', testRecord);
      expect(result.commitSha).toBe('commit-xyz');
    });

    it('[EARS-A5] should delete existing record and return commitSha', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.remove.mockResolvedValue({});
      mockApi(api).Branches.show.mockResolvedValue({ commit: { id: 'delete-commit-sha' } });

      const result = await store.delete('task-001');
      expect(result.commitSha).toBe('delete-commit-sha');
    });

    it('[EARS-A6] should complete without error and return commitSha undefined for non-existing ID', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.remove.mockRejectedValue(gitbeakerError(404));

      const result = await store.delete('nonexistent');
      expect(result.commitSha).toBeUndefined();
    });

    it('[EARS-A7] should return all stored IDs', async () => {
      const { store, api } = createStore();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/tasks/task-001.json', type: 'blob', name: 'task-001.json' },
        { path: '.gitgov/tasks/task-002.json', type: 'blob', name: 'task-002.json' },
      ]);

      const ids = await store.list();
      expect(ids).toEqual(['task-001', 'task-002']);
    });

    it('[EARS-A8] should return empty array for empty store', async () => {
      const { store, api } = createStore();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([]);

      expect(await store.list()).toEqual([]);
    });

    it('[EARS-A9] should return true for existing ID', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({ blob_id: 'x' });

      expect(await store.exists('task-001')).toBe(true);
    });

    it('[EARS-A10] should return false for non-existing ID', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      expect(await store.exists('nonexistent')).toBe(false);
    });

    it('[EARS-A11] should persist all entries in single atomic commit', async () => {
      const { store, api } = createStore();
      // existsOnRemote checks for each entry
      mockApi(api).RepositoryFiles.show
        .mockRejectedValueOnce(gitbeakerError(404))
        .mockRejectedValueOnce(gitbeakerError(404));
      mockApi(api).Commits.create.mockResolvedValue({ id: 'batch-commit' });

      const result = await store.putMany([
        { id: 'task-001', value: testRecord },
        { id: 'task-002', value: testRecord },
      ]);

      expect(mockApi(api).Commits.create).toHaveBeenCalledTimes(1);
      expect(result.commitSha).toBe('batch-commit');
    });

    it('[EARS-A12] should return commitSha undefined for empty entries', async () => {
      const { store } = createStore();
      const result = await store.putMany([]);
      expect(result.commitSha).toBeUndefined();
    });
  });

  describe('4.2. GitLab-Specific (EARS-B1 to B9)', () => {
    it('[EARS-B1] should fetch file via Gitbeaker RepositoryFiles.show and decode base64', async () => {
      const { store, api } = createStore();
      const original = { key: 'value' };
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(original)).toString('base64'),
        blob_id: 'blob-1',
      });

      const result = await store.get('test-id');
      expect(result).toEqual(original);
      expect(mockApi(api).RepositoryFiles.show).toHaveBeenCalledWith(
        123, '.gitgov/tasks/test-id.json', 'gitgov-state',
      );
    });

    it('[EARS-B2] should create file via POST for new records', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'new', last_commit_id: 'c1',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.put('new-task', testRecord);
      expect(mockApi(api).RepositoryFiles.create).toHaveBeenCalled();
    });

    it('[EARS-B2] should use opts.commitMessage when provided', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'b', last_commit_id: 'c',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.put('task-001', testRecord, { commitMessage: 'custom msg' });
      expect(mockApi(api).RepositoryFiles.create).toHaveBeenCalledWith(
        123, '.gitgov/tasks/task-001.json', 'gitgov-state',
        expect.any(String), 'custom msg', { encoding: 'base64' },
      );
    });

    it('[EARS-B2] should generate default commit message "put {id}"', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'b', last_commit_id: 'c',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.put('task-001', testRecord);
      expect(mockApi(api).RepositoryFiles.create).toHaveBeenCalledWith(
        123, expect.any(String), 'gitgov-state',
        expect.any(String), 'put task-001', { encoding: 'base64' },
      );
    });

    it('[EARS-B3] should update file via PUT with blob_id verification', async () => {
      const { store, api } = createStore();
      // Get to cache blob_id
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from('{}').toString('base64'), blob_id: 'cached',
      });
      await store.get('task-001');

      // Put update — verify blob_id match
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({ blob_id: 'cached' });
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        blob_id: 'new', last_commit_id: 'c2',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.put('task-001', testRecord);
      expect(mockApi(api).RepositoryFiles.edit).toHaveBeenCalled();
    });

    it('[EARS-B3] should throw CONFLICT when blob_id changed between get and put', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from('{}').toString('base64'), blob_id: 'original',
      });
      await store.get('task-001');

      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({ blob_id: 'changed-by-other' });

      await expect(store.put('task-001', testRecord)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('[EARS-B4] should delete file via Gitbeaker RepositoryFiles.remove', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.remove.mockResolvedValue({});
      mockApi(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });

      await store.delete('task-001');
      expect(mockApi(api).RepositoryFiles.remove).toHaveBeenCalledWith(
        123, '.gitgov/tasks/task-001.json', 'gitgov-state', 'delete task-001',
      );
    });

    it('[EARS-B4] should use opts.commitMessage for delete when provided', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.remove.mockResolvedValue({});
      mockApi(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });

      await store.delete('task-001', { commitMessage: 'remove task' });
      expect(mockApi(api).RepositoryFiles.remove).toHaveBeenCalledWith(
        123, expect.any(String), 'gitgov-state', 'remove task',
      );
    });

    it('[EARS-B5] should list directory via Tree API and extract IDs', async () => {
      const { store, api } = createStore();
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/tasks/t1.json', type: 'blob', name: 't1.json' },
        { path: '.gitgov/tasks/subdir', type: 'tree', name: 'subdir' },
      ]);

      const ids = await store.list();
      expect(ids).toEqual(['t1']);
    });

    it('[EARS-B5] should paginate Tree API results for list', async () => {
      const { store, api } = createStore();
      // allRepositoryTrees handles pagination internally — returns all items
      const items = Array.from({ length: 150 }, (_, i) => ({
        path: `.gitgov/tasks/task-${i}.json`, type: 'blob', name: `task-${i}.json`,
      }));
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue(items);

      const ids = await store.list();
      expect(ids).toHaveLength(150);
      expect(mockApi(api).Repositories.allRepositoryTrees).toHaveBeenCalledTimes(1);
    });

    it('[EARS-B6] should encode/decode IDs when idEncoder configured', async () => {
      const idEncoder = {
        encode: (id: string) => id.replace(/:/g, '_'),
        decode: (filename: string) => filename.replace(/_/g, ':'),
      };
      const { store, api } = createStore({ idEncoder });
      mockApi(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: '.gitgov/tasks/human_camilo.json', type: 'blob', name: 'human_camilo.json' },
      ]);

      const ids = await store.list();
      expect(ids).toEqual(['human:camilo']);
    });

    it('[EARS-B7] should cache blob_id from GET response for subsequent operations', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from('{}').toString('base64'), blob_id: 'cached-blob',
      });

      await store.get('task-001');

      // Subsequent put should use edit (update path) since blob_id is cached
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({ blob_id: 'cached-blob' });
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        blob_id: 'new', last_commit_id: 'c',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.put('task-001', testRecord);
      expect(mockApi(api).RepositoryFiles.edit).toHaveBeenCalled();
    });

    it('[EARS-B8] should create all files in single atomic commit via Commits API', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show
        .mockRejectedValueOnce(gitbeakerError(404))
        .mockRejectedValueOnce(gitbeakerError(404));
      mockApi(api).Commits.create.mockResolvedValue({ id: 'atomic-sha' });

      await store.putMany([
        { id: 't1', value: testRecord },
        { id: 't2', value: testRecord },
      ]);

      expect(mockApi(api).Commits.create).toHaveBeenCalledTimes(1);
      const actions = mockApi(api).Commits.create.mock.calls[0]![3] as Array<{ action: string }>;
      expect(actions).toHaveLength(2);
    });

    it('[EARS-B8] should use opts.commitMessage for putMany when provided', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mockApi(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await store.putMany([{ id: 't1', value: testRecord }], { commitMessage: 'custom batch' });
      expect(mockApi(api).Commits.create).toHaveBeenCalledWith(
        123, 'gitgov-state', 'custom batch', expect.any(Array),
      );
    });

    it('[EARS-B8] should generate default commit message for putMany', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mockApi(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await store.putMany([{ id: 't1', value: testRecord }, { id: 't2', value: testRecord }]);
      expect(mockApi(api).Commits.create).toHaveBeenCalledWith(
        123, 'gitgov-state', 'putMany 2 records', expect.any(Array),
      );
    });

    it('[EARS-B8] should use create action for new records and update for existing', async () => {
      const { store, api } = createStore();
      // First exists → 404 (new), second exists → 200 (existing)
      mockApi(api).RepositoryFiles.show
        .mockRejectedValueOnce(gitbeakerError(404))
        .mockResolvedValueOnce({ blob_id: 'existing' });
      mockApi(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await store.putMany([
        { id: 'new-task', value: testRecord },
        { id: 'old-task', value: testRecord },
      ]);

      const actions = mockApi(api).Commits.create.mock.calls[0]![3] as Array<{ action: string }>;
      expect(actions[0]!.action).toBe('create');
      expect(actions[1]!.action).toBe('update');
    });

    it('[EARS-B9] should return empty array when basePath returns 404', async () => {
      const { store, api } = createStore();
      mockApi(api).Repositories.allRepositoryTrees.mockRejectedValue(gitbeakerError(404));

      expect(await store.list()).toEqual([]);
    });
  });

  describe('4.3. Error Handling (EARS-C1 to C6)', () => {
    it('[EARS-C1] should throw GitLabApiError INVALID_ID for path traversal', async () => {
      const { store } = createStore();
      await expect(store.get('../etc/passwd')).rejects.toMatchObject({ code: 'INVALID_ID' });
      await expect(store.get('')).rejects.toMatchObject({ code: 'INVALID_ID' });
    });

    it('[EARS-C2] should throw GitLabApiError PERMISSION_DENIED for 401/403', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(403));
      await expect(store.get('task-001')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('[EARS-C3] should throw GitLabApiError CONFLICT for 409 or stale blob_id', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockRejectedValue(gitbeakerError(409));
      await expect(store.put('task-001', testRecord)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('[EARS-C4] should throw GitLabApiError SERVER_ERROR for 5xx', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(500));
      await expect(store.get('task-001')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    });

    it('[EARS-C5] should throw GitLabApiError NETWORK_ERROR for network failures', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(new TypeError('fetch failed'));
      await expect(store.get('task-001')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('[EARS-C6] should throw GitLabApiError INVALID_RESPONSE for null content', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({ content: null, blob_id: null });
      await expect(store.get('task-001')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });
});
