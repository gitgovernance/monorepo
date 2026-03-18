/**
 * Tests for GitLabConfigStore
 *
 * Blueprint: gitlab_config_store_module.md
 * EARS: A1-A4 (interface), B1-B7 (GitLab-specific), C1-C6 (errors)
 */

import { GitLabConfigStore } from './gitlab_config_store';
import type { GitLabConfigStoreOptions } from './gitlab_config_store.types';
import { GitLabApiError } from '../gitlab';

// ═══════════════════════════════════════════════════════════════════════
// Mock Gitbeaker
// ═══════════════════════════════════════════════════════════════════════

function createMockApi() {
  return {
    RepositoryFiles: {
      show: jest.fn(),
      create: jest.fn(),
      edit: jest.fn(),
    },
  } as unknown as GitLabConfigStoreOptions['api'];
}

function mockApi(api: GitLabConfigStoreOptions['api']) {
  return api as unknown as {
    RepositoryFiles: { show: jest.Mock; create: jest.Mock; edit: jest.Mock };
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

const validConfig = {
  protocolVersion: '1.0',
  projectId: 'test-project',
  projectName: 'Test',
  rootCycle: '001-cycle-init',
};

function createStore(overrides?: Partial<GitLabConfigStoreOptions>) {
  const api = overrides?.api ?? createMockApi();
  const opts: GitLabConfigStoreOptions = {
    projectId: 123,
    api,
    ref: 'gitgov-state',
    basePath: '.gitgov',
    ...overrides,
  };
  return { store: new GitLabConfigStore(opts), api };
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('GitLabConfigStore', () => {
  describe('4.1. ConfigStore Contract (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return GitGovConfig when config.json exists and is valid', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'blob-123',
        last_commit_id: 'commit-abc',
      });

      const config = await store.loadConfig();
      expect(config).toEqual(validConfig);
    });

    it('[EARS-A2] should return null when config.json does not exist', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      const config = await store.loadConfig();
      expect(config).toBeNull();
    });

    it('[EARS-A3] should return null when config.json contains invalid JSON', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from('not valid json {{{').toString('base64'),
        blob_id: 'blob-123',
      });

      const config = await store.loadConfig();
      expect(config).toBeNull();
    });

    it('[EARS-A4] should write config and return GitLabSaveResult with commitSha and blobId', async () => {
      const { store, api } = createStore();
      // No cached blob_id → create
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'new-blob',
        last_commit_id: 'commit-xyz',
      });

      const result = await store.saveConfig(validConfig);
      expect(result.commitSha).toBe('commit-xyz');
      expect(result.blobId).toBe('new-blob');
    });
  });

  describe('4.2. GitLab-Specific (EARS-B1 to B7)', () => {
    it('[EARS-B1] should fetch config.json via Gitbeaker RepositoryFiles.show and decode base64', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'blob-123',
      });

      await store.loadConfig();

      expect(mockApi(api).RepositoryFiles.show).toHaveBeenCalledWith(
        123,
        '.gitgov/config.json',
        'gitgov-state',
      );
    });

    it('[EARS-B2] should cache blob_id from loadConfig response', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'cached-blob',
      });

      await store.loadConfig();

      // Now saveConfig should use edit (update) not create
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'cached-blob',
        last_commit_id: 'commit-1',
      });
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});

      await store.saveConfig(validConfig);
      expect(mockApi(api).RepositoryFiles.edit).toHaveBeenCalled();
      expect(mockApi(api).RepositoryFiles.create).not.toHaveBeenCalled();
    });

    it('[EARS-B3] should use PUT (RepositoryFiles.edit) for updates when blob_id cached', async () => {
      const { store, api } = createStore();
      // Load first to cache blob_id
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'original-blob',
        last_commit_id: 'commit-1',
      });
      await store.loadConfig();

      // Save should use edit
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});

      await store.saveConfig(validConfig);
      expect(mockApi(api).RepositoryFiles.edit).toHaveBeenCalledWith(
        123,
        '.gitgov/config.json',
        'gitgov-state',
        expect.any(String),
        'chore(config): update gitgov config.json',
        { encoding: 'base64' },
      );
    });

    it('[EARS-B4] should use POST (RepositoryFiles.create) for initial config creation', async () => {
      const { store, api } = createStore();
      // No loadConfig → no cached blob_id → create
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'new-blob',
        last_commit_id: 'commit-new',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.saveConfig(validConfig);
      expect(mockApi(api).RepositoryFiles.create).toHaveBeenCalledWith(
        123,
        '.gitgov/config.json',
        'gitgov-state',
        expect.any(String),
        'chore(config): update gitgov config.json',
        { encoding: 'base64' },
      );
    });

    it('[EARS-B5] should update cached blob_id from API response after successful saveConfig', async () => {
      const { store, api } = createStore();
      // Create first config
      mockApi(api).RepositoryFiles.create.mockResolvedValue({});
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'first-blob',
        last_commit_id: 'commit-1',
        content: Buffer.from('{}').toString('base64'),
      });

      await store.saveConfig(validConfig);

      // Second save should use edit with the cached first-blob
      mockApi(api).RepositoryFiles.show.mockResolvedValue({
        blob_id: 'first-blob',
        last_commit_id: 'commit-2',
        content: Buffer.from('{}').toString('base64'),
      });
      mockApi(api).RepositoryFiles.edit.mockResolvedValue({});

      await store.saveConfig(validConfig);
      expect(mockApi(api).RepositoryFiles.edit).toHaveBeenCalled();
    });

    it('[EARS-B6] should use default values for optional options', async () => {
      const api = createMockApi();
      const store = new GitLabConfigStore({ projectId: 456, api });

      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      await store.loadConfig();

      expect(mockApi(api).RepositoryFiles.show).toHaveBeenCalledWith(
        456,
        '.gitgov/config.json',
        'gitgov-state',
      );
    });

    it('[EARS-B7] should throw CONFLICT when blob_id changed between load and save', async () => {
      const { store, api } = createStore();

      // Load and cache blob_id
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'original-blob',
      });
      await store.loadConfig();

      // On save, re-read returns different blob_id (conflict detected)
      mockApi(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from(JSON.stringify(validConfig)).toString('base64'),
        blob_id: 'changed-by-someone-else',
      });

      await expect(store.saveConfig(validConfig)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Config was modified by another process',
      });
    });
  });

  describe('4.3. Error Handling (EARS-C1 to C6)', () => {
    it('[EARS-C1] should throw GitLabApiError PERMISSION_DENIED on saveConfig', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockRejectedValue(gitbeakerError(403));

      await expect(store.saveConfig(validConfig)).rejects.toThrow(GitLabApiError);
      await expect(store.saveConfig(validConfig)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('[EARS-C2] should throw GitLabApiError CONFLICT on saveConfig', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockRejectedValue(gitbeakerError(409));

      await expect(store.saveConfig(validConfig)).rejects.toThrow(GitLabApiError);
      await expect(store.saveConfig(validConfig)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('[EARS-C3] should throw GitLabApiError SERVER_ERROR on saveConfig', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.create.mockRejectedValue(gitbeakerError(500));

      await expect(store.saveConfig(validConfig)).rejects.toThrow(GitLabApiError);
      await expect(store.saveConfig(validConfig)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    });

    it('[EARS-C4] should throw GitLabApiError PERMISSION_DENIED on loadConfig', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(401));

      await expect(store.loadConfig()).rejects.toThrow(GitLabApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('[EARS-C5] should throw GitLabApiError SERVER_ERROR on loadConfig', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(500));

      await expect(store.loadConfig()).rejects.toThrow(GitLabApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    });

    it('[EARS-C6] should throw GitLabApiError NETWORK_ERROR for network failures', async () => {
      const { store, api } = createStore();
      mockApi(api).RepositoryFiles.show.mockRejectedValue(networkError());

      await expect(store.loadConfig()).rejects.toThrow(GitLabApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });
  });
});
