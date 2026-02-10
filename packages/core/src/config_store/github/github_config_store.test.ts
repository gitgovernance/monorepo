/**
 * GitHubConfigStore Unit Tests
 *
 * Tests GitHubConfigStore implementation of the ConfigStore interface
 * using GitHub Contents API for config.json persistence.
 *
 * All EARS prefixes map to the github_config_store_module blueprint.
 *
 * EARS Blocks:
 * - A: ConfigStore Contract (loadConfig/saveConfig behavior)
 * - B: GitHub Contents API Integration (fetch, SHA caching)
 * - C: Error Handling (permission, conflict, server errors)
 */

import { GitHubConfigStore } from './github_config_store';
import type { GitHubConfigStoreOptions } from './github_config_store.types';
import type { GitHubFetchFn } from '../../github/github.types';
import { GitHubApiError } from '../../github/github.types';
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
  token: 'ghp_test_token_123',
  ref: 'main',
  basePath: '.gitgov',
  apiBaseUrl: 'https://api.github.com',
};

/**
 * Create a mock Response object with the given status and body.
 */
function createMockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

/**
 * Create a GitHub Contents API response for a file with base64-encoded content.
 */
function createContentsResponse(content: string, sha: string = 'abc123sha') {
  return {
    name: 'config.json',
    path: '.gitgov/config.json',
    sha,
    size: content.length,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  };
}

// ==================== Tests ====================

describe('GitHubConfigStore', () => {
  let mockFetch: jest.Mock<ReturnType<GitHubFetchFn>, Parameters<GitHubFetchFn>>;
  let store: GitHubConfigStore;

  beforeEach(() => {
    mockFetch = jest.fn();
    store = new GitHubConfigStore(defaultOptions, mockFetch);
  });

  // ==================== 4.1. ConfigStore Contract (EARS-A1 to A4) ====================

  describe('4.1. ConfigStore Contract (EARS-A1 to A4)', () => {
    it('[EARS-A1] WHEN loadConfig receives valid JSON, THE SYSTEM SHALL return GitGovConfig', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      const contentsResponse = createContentsResponse(jsonContent);
      mockFetch.mockResolvedValue(createMockResponse(200, contentsResponse));

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A2] WHEN loadConfig receives 404, THE SYSTEM SHALL return null (fail-safe)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A3] WHEN loadConfig receives invalid JSON content, THE SYSTEM SHALL return null', async () => {
      const contentsResponse = createContentsResponse('this is not valid json {{{');
      mockFetch.mockResolvedValue(createMockResponse(200, contentsResponse));

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A4] WHEN saveConfig is invoked, THE SYSTEM SHALL write via PUT', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, {
        commit: { sha: 'commit-sha-123', message: 'update config' },
        content: { sha: 'new-blob-sha', path: '.gitgov/config.json', size: 100 },
      }));

      await store.saveConfig(mockConfig);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/test-org/test-repo/contents/.gitgov/config.json');
      expect(init?.method).toBe('PUT');

      const body = JSON.parse(init?.body as string);
      expect(body.message).toBe('chore(config): update gitgov config.json');
      expect(body.content).toBeTruthy();
      expect(body.branch).toBe('main');

      // Verify the content is base64-encoded JSON
      const decoded = Buffer.from(body.content, 'base64').toString('utf-8');
      expect(JSON.parse(decoded)).toEqual(mockConfig);
    });
  });

  // ==================== 4.2. GitHub Contents API Integration (EARS-B1 to B4) ====================

  describe('4.2. GitHub Contents API Integration (EARS-B1 to B4)', () => {
    it('[EARS-B1] WHEN loadConfig is invoked, THE SYSTEM SHALL fetch via Contents API and base64 decode', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      const contentsResponse = createContentsResponse(jsonContent);
      mockFetch.mockResolvedValue(createMockResponse(200, contentsResponse));

      const result = await store.loadConfig();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/test-org/test-repo/contents/.gitgov/config.json?ref=main');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toEqual(expect.objectContaining({
        'Authorization': 'Bearer ghp_test_token_123',
        'Accept': 'application/vnd.github.v3+json',
      }));
      expect(result).toEqual(mockConfig);
    });

    it('[EARS-B2] WHEN loadConfig succeeds, THE SYSTEM SHALL cache SHA from response', async () => {
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      const contentsResponse = createContentsResponse(jsonContent, 'cached-sha-456');
      mockFetch.mockResolvedValue(createMockResponse(200, contentsResponse));

      await store.loadConfig();

      // Verify SHA is cached by performing a saveConfig and checking the body
      mockFetch.mockResolvedValue(createMockResponse(200, {
        commit: { sha: 'commit-sha', message: 'update' },
        content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
      }));

      await store.saveConfig(mockConfig);

      const saveBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(saveBody.sha).toBe('cached-sha-456');
    });

    it('[EARS-B3] WHEN saveConfig is invoked after loadConfig, THE SYSTEM SHALL include cached sha for updates', async () => {
      // First: loadConfig to cache SHA
      const jsonContent = JSON.stringify(mockConfig, null, 2);
      const contentsResponse = createContentsResponse(jsonContent, 'existing-sha-789');
      mockFetch.mockResolvedValue(createMockResponse(200, contentsResponse));
      await store.loadConfig();

      // Second: saveConfig should include sha
      mockFetch.mockResolvedValue(createMockResponse(200, {
        commit: { sha: 'commit-sha', message: 'update' },
        content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
      }));

      await store.saveConfig(mockConfig);

      const saveBody = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(saveBody).toHaveProperty('sha', 'existing-sha-789');
    });

    it('[EARS-B4] WHEN saveConfig is invoked without prior loadConfig, THE SYSTEM SHALL omit sha for initial creation', async () => {
      mockFetch.mockResolvedValue(createMockResponse(201, {
        commit: { sha: 'commit-sha', message: 'create' },
        content: { sha: 'new-sha', path: '.gitgov/config.json', size: 100 },
      }));

      await store.saveConfig(mockConfig);

      const saveBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(saveBody).not.toHaveProperty('sha');
    });
  });

  // ==================== 4.3. Error Handling (EARS-C1 to C3) ====================

  describe('4.3. Error Handling (EARS-C1 to C3)', () => {
    it('[EARS-C1] WHEN saveConfig receives 401, THE SYSTEM SHALL throw GitHubApiError PERMISSION_DENIED', async () => {
      mockFetch.mockResolvedValue(createMockResponse(401, { message: 'Bad credentials' }));

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 401,
      });
    });

    it('[EARS-C1] WHEN saveConfig receives 403, THE SYSTEM SHALL throw GitHubApiError PERMISSION_DENIED', async () => {
      mockFetch.mockResolvedValue(createMockResponse(403, { message: 'Forbidden' }));

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        statusCode: 403,
      });
    });

    it('[EARS-C2] WHEN saveConfig receives 409, THE SYSTEM SHALL throw GitHubApiError CONFLICT', async () => {
      mockFetch.mockResolvedValue(createMockResponse(409, { message: 'Conflict' }));

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('[EARS-C3] WHEN loadConfig receives 5xx, THE SYSTEM SHALL throw GitHubApiError SERVER_ERROR', async () => {
      mockFetch.mockResolvedValue(createMockResponse(500, { message: 'Internal Server Error' }));

      await expect(store.loadConfig()).rejects.toThrow(GitHubApiError);
      await expect(store.loadConfig()).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        statusCode: 500,
      });
    });

    it('[EARS-C3] WHEN saveConfig receives 502, THE SYSTEM SHALL throw GitHubApiError SERVER_ERROR', async () => {
      mockFetch.mockResolvedValue(createMockResponse(502, { message: 'Bad Gateway' }));

      await expect(store.saveConfig(mockConfig)).rejects.toThrow(GitHubApiError);
      await expect(store.saveConfig(mockConfig)).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        statusCode: 502,
      });
    });
  });

  // ==================== Constructor Defaults ====================

  describe('Constructor Defaults', () => {
    it('should use default values for optional options', () => {
      const minimalStore = new GitHubConfigStore(
        { owner: 'org', repo: 'repo', token: 'tok' },
        mockFetch,
      );

      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      // Trigger a loadConfig to verify default URL construction
      void minimalStore.loadConfig().then(() => {
        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.github.com/repos/org/repo/contents/.gitgov/config.json?ref=main');
      });
    });
  });
});
