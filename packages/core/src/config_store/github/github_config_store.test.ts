/**
 * GitHubConfigStore Unit Tests
 *
 * Tests GitHubConfigStore implementation of the ConfigStore interface
 * using Octokit for config.json persistence via GitHub Contents API.
 *
 * All EARS prefixes map to the github_config_store_module blueprint.
 *
 * EARS Blocks:
 * - A: ConfigStore Contract (loadConfig/saveConfig behavior)
 * - B: GitHub-Specific Behavior (Octokit calls, SHA caching)
 * - C: Error Handling (permission, conflict, server errors)
 */

import { GitHubConfigStore } from './github_config_store';
import type { GitHubConfigStoreOptions } from './github_config_store.types';
import type { Octokit } from '@octokit/rest';
import { GitHubApiError } from '../../github';
import type { GitGovConfig } from '../../config_manager/config_manager.types';

// ==================== Test Helpers ====================

const mockConfig: GitGovConfig = {
  protocolVersion: '1.0',
  projectId: 'test-project',
  projectName: 'Test Project',
  rootCycle: '1234567890-cycle-test',
};

const defaultOptions: GitHubConfigStoreOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  ref: 'gitgov-state',
  basePath: '.gitgov',
};

/**
 * Create a mock Octokit instance with repos.getContent and repos.createOrUpdateFileContents.
 */
function createMockOctokit() {
  return {
    rest: {
      repos: {
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn(),
      },
    },
  } as unknown as Octokit & {
    rest: {
      repos: {
        getContent: jest.MockedFunction<any>;
        createOrUpdateFileContents: jest.MockedFunction<any>;
      };
    };
  };
}

/**
 * Create a GitHub Contents API file response for Octokit.
 */
function createFileResponse(content: string, sha = 'abc123sha') {
  return {
    data: {
      type: 'file' as const,
      name: 'config.json',
      path: '.gitgov/config.json',
      sha,
      size: content.length,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    },
  };
}

/**
 * Create an Octokit-like error with a status property (duck-typing compatible).
 */
function createOctokitError(status: number, message = 'Error'): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

// ==================== Tests ====================

describe('GitHubConfigStore', () => {
  let mockOctokit: ReturnType<typeof createMockOctokit>;
  let store: GitHubConfigStore;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    store = new GitHubConfigStore(defaultOptions, mockOctokit);
  });

  // ==================== 4.1. ConfigStore Contract (EARS-A1 to A4) ====================

  describe('4.1. ConfigStore Contract (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return GitGovConfig when config.json exists and is valid', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      mockOctokit.rest.repos.getContent.mockResolvedValue(createFileResponse(jsonContent));

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A2] should return null when config.json does not exist', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404, 'Not Found'));

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A3] should return null when config.json contains invalid JSON', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(
        createFileResponse('this is not valid json {{{'),
      );

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A4] should write config and return GitHubSaveResult with commitSha', async () => {
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha-123', message: 'update config' },
          content: { sha: 'new-blob-sha', path: '.gitgov/config.json', size: 100 },
        },
      });

      const result = await store.saveConfig(mockConfig);

      expect(result).toEqual({ commitSha: 'commit-sha-123' });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
      const callArgs = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0]![0];
      expect(callArgs.owner).toBe('test-org');
      expect(callArgs.repo).toBe('test-repo');
      expect(callArgs.path).toBe('.gitgov/config.json');
      expect(callArgs.message).toBe('chore(config): update gitgov config.json');
      expect(callArgs.branch).toBe('gitgov-state');

      // Verify the content is base64-encoded JSON
      const decoded = Buffer.from(callArgs.content, 'base64').toString('utf-8');
      expect(JSON.parse(decoded)).toEqual(mockConfig);
    });
  });

  // ==================== 4.2. GitHub-Specific Behavior (EARS-B1 to B7) ====================

  describe('4.2. GitHub-Specific Behavior (EARS-B1 to B7)', () => {
    it('[EARS-B1] should fetch config.json via Octokit getContent and decode base64', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      mockOctokit.rest.repos.getContent.mockResolvedValue(createFileResponse(jsonContent));

      const result = await store.loadConfig();

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledTimes(1);
      const callArgs = mockOctokit.rest.repos.getContent.mock.calls[0]![0];
      expect(callArgs).toEqual({
        owner: 'test-org',
        repo: 'test-repo',
        path: '.gitgov/config.json',
        ref: 'gitgov-state',
      });
      expect(result).toEqual(mockConfig);
    });

    it('[EARS-B2] should cache SHA from loadConfig response', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      mockOctokit.rest.repos.getContent.mockResolvedValue(
        createFileResponse(jsonContent, 'cached-sha-456'),
      );

      await store.loadConfig();

      // Verify SHA is cached by performing a saveConfig and checking the args
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha' },
          content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
        },
      });

      await store.saveConfig(mockConfig);

      const saveArgs = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0]![0];
      expect(saveArgs.sha).toBe('cached-sha-456');
    });

    it('[EARS-B3] should include cached sha in PUT for updates', async () => {
      // First: loadConfig to cache SHA
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      mockOctokit.rest.repos.getContent.mockResolvedValue(
        createFileResponse(jsonContent, 'existing-sha-789'),
      );
      await store.loadConfig();

      // Second: saveConfig should include sha
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha' },
          content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
        },
      });

      await store.saveConfig(mockConfig);

      const saveArgs = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0]![0];
      expect(saveArgs.sha).toBe('existing-sha-789');
    });

    it('[EARS-B4] should PUT without sha for initial config creation', async () => {
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha' },
          content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
        },
      });

      await store.saveConfig(mockConfig);

      const saveArgs = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0]![0];
      expect(saveArgs).not.toHaveProperty('sha');
    });

    it('[EARS-B5] should update cached SHA after successful saveConfig', async () => {
      // First save (no cached SHA — create)
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha-1' },
          content: { sha: 'blob-sha-after-first-save', path: '.gitgov/config.json', size: 100 },
        },
      });
      await store.saveConfig(mockConfig);

      // Second save should use the SHA from first save's response
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'commit-sha-2' },
          content: { sha: 'blob-sha-after-second-save', path: '.gitgov/config.json', size: 100 },
        },
      });
      await store.saveConfig(mockConfig);

      const secondCallArgs = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[1]![0];
      expect(secondCallArgs.sha).toBe('blob-sha-after-first-save');
    });

    it('[EARS-B6] should use default values for optional options', async () => {
      const minimalStore = new GitHubConfigStore(
        { owner: 'org', repo: 'repo' },
        mockOctokit,
      );

      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      await minimalStore.loadConfig();

      const callArgs = mockOctokit.rest.repos.getContent.mock.calls[0]![0];
      expect(callArgs.path).toBe('.gitgov/config.json');
      expect(callArgs.ref).toBe('gitgov-state');
    });

    it('[EARS-B7] should return null when API returns directory listing', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: [{ type: 'dir', name: '.gitgov' }],
      });

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-B7] should return null when API response has no content field', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: { type: 'file', sha: 'abc123', size: 0 },
      });

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });
  });

  // ==================== 4.3. Error Handling (EARS-C1 to C6) ====================

  describe('4.3. Error Handling (EARS-C1 to C6)', () => {
    it('[EARS-C1] should throw GitHubApiError PERMISSION_DENIED on saveConfig', async () => {
      // Test 401
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        createOctokitError(401, 'Bad credentials'),
      );
      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 401,
      });

      // Test 403
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        createOctokitError(403, 'Forbidden'),
      );
      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
    });

    it('[EARS-C2] should throw GitHubApiError CONFLICT on saveConfig', async () => {
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        createOctokitError(409, 'Conflict'),
      );

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('[EARS-C3] should throw GitHubApiError SERVER_ERROR on saveConfig', async () => {
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        createOctokitError(502, 'Bad Gateway'),
      );

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        statusCode: 502,
      });
    });

    it('[EARS-C4] should throw GitHubApiError PERMISSION_DENIED on loadConfig', async () => {
      // Test 401
      mockOctokit.rest.repos.getContent.mockRejectedValue(
        createOctokitError(401, 'Bad credentials'),
      );
      await expect(store.loadConfig()).rejects.toThrow(GitHubApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 401,
      });

      // Test 403
      mockOctokit.rest.repos.getContent.mockRejectedValue(
        createOctokitError(403, 'Forbidden'),
      );
      await expect(store.loadConfig()).rejects.toThrow(GitHubApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
    });

    it('[EARS-C5] should throw GitHubApiError SERVER_ERROR on loadConfig', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(
        createOctokitError(500, 'Internal Server Error'),
      );

      await expect(store.loadConfig()).rejects.toThrow(GitHubApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        statusCode: 500,
      });
    });

    it('[EARS-C6] should throw GitHubApiError NETWORK_ERROR for network failures', async () => {
      // Test loadConfig network error (plain Error without status = NETWORK_ERROR)
      mockOctokit.rest.repos.getContent.mockRejectedValue(
        new Error('fetch failed: ECONNREFUSED'),
      );
      await expect(store.loadConfig()).rejects.toThrow(GitHubApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });

      // Test saveConfig network error
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        new Error('fetch failed: ETIMEDOUT'),
      );
      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });

});
