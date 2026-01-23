/**
 * FsConfigStore Unit Tests
 *
 * Tests FsConfigStore with mocked filesystem.
 * Session-related tests are in session_store/fs/fs_session_store.test.ts
 */

import { FsConfigStore, createConfigManager, createSessionManager, createManagers } from './fs_config_store';
import type { GitGovConfig } from '../../config_manager';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
  existsSync: jest.fn(),
}));

import { promises as fs } from 'fs';
import { existsSync } from 'fs';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('FsConfigStore', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    FsConfigStore.resetCache();
  });

  // ==================== Instance Methods ====================

  describe('loadConfig', () => {
    it('[EARS-A1] should return complete GitGovConfig for valid files', async () => {
      const store = new FsConfigStore(projectRoot);
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test Project',
        rootCycle: '1234567890-cycle-test',
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        '/test/project/.gitgov/config.json',
        'utf-8'
      );
    });

    it('[EARS-A2] should return null for non-existent files (fail-safe)', async () => {
      const store = new FsConfigStore(projectRoot);
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A3] should return null for invalid JSON (graceful degradation)', async () => {
      const store = new FsConfigStore(projectRoot);
      mockedFs.readFile.mockResolvedValue('{ invalid json }');

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-C5] should warn for non-standard rootCycle format', async () => {
      const store = new FsConfigStore(projectRoot);
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test Project',
        rootCycle: 'invalid-format', // Non-standard format
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await store.loadConfig();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('doesn\'t match expected format')
      );
      warnSpy.mockRestore();
    });
  });

  describe('saveConfig', () => {
    it('[EARS-A4] should write config to .gitgov/config.json', async () => {
      const store = new FsConfigStore(projectRoot);
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test Project',
        rootCycle: '1234567890-cycle-test',
      };
      mockedFs.writeFile.mockResolvedValue();

      await store.saveConfig(mockConfig);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '/test/project/.gitgov/config.json',
        JSON.stringify(mockConfig, null, 2),
        'utf-8'
      );
    });
  });

  // ==================== Static Methods ====================

  describe('findProjectRoot', () => {
    it('[EARS-B1] should return absolute path for directories within Git project', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = FsConfigStore.findProjectRoot('/test/project/src/deep');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B2] should return null for directories outside Git project', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.findProjectRoot('/some/random/path');

      expect(result).toBeNull();
    });

    it('[EARS-B3] should cache result for subsequent calls', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const startPath = '/test/project/src';
      FsConfigStore.findProjectRoot(startPath);
      FsConfigStore.findProjectRoot(startPath);

      // existsSync should only be called multiple times on first search
      // Second call should use cache
      const callsForGit = (mockedExistsSync.mock.calls as string[][]).filter(
        (c) => c[0] === '/test/project/.git'
      );
      expect(callsForGit.length).toBe(1);
    });

    it('[EARS-B3] should invalidate cache when searching from different path', () => {
      FsConfigStore.resetCache();
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git' || p === '/other/project/.git';
      });

      FsConfigStore.findProjectRoot('/test/project/src');
      FsConfigStore.findProjectRoot('/other/project/src');

      // Both paths should trigger searches
      expect(mockedExistsSync).toHaveBeenCalledWith('/test/project/.git');
      expect(mockedExistsSync).toHaveBeenCalledWith('/other/project/.git');
    });
  });

  describe('findGitgovRoot', () => {
    it('[EARS-B4] should prioritize .gitgov over .git', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.gitgov' || p === '/test/project/.git';
      });

      const result = FsConfigStore.findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B5] should fall back to .git when .gitgov not found', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = FsConfigStore.findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B6] should return null when neither .gitgov nor .git found', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.findGitgovRoot('/some/path');

      expect(result).toBeNull();
    });
  });

  describe('getGitgovPath', () => {
    it('[EARS-C1] should return absolute path for GitGovernance projects', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.gitgov';
      });

      // Need to mock process.cwd for this test
      const originalCwd = process.cwd;
      process.cwd = () => '/test/project/src';

      const result = FsConfigStore.getGitgovPath();

      expect(result).toBe('/test/project/.gitgov');
      process.cwd = originalCwd;
    });

    it('[EARS-C2] should throw descriptive Error outside GitGovernance project', () => {
      mockedExistsSync.mockReturnValue(false);

      expect(() => FsConfigStore.getGitgovPath()).toThrow(
        'Could not find project root'
      );
    });
  });

  describe('isGitgovProject', () => {
    it('[EARS-C3] should return true for GitGovernance projects', () => {
      mockedExistsSync.mockImplementation((p) => {
        return String(p).includes('.gitgov');
      });

      const originalCwd = process.cwd;
      process.cwd = () => '/test/project/src';

      const result = FsConfigStore.isGitgovProject();

      expect(result).toBe(true);
      process.cwd = originalCwd;
    });

    it('[EARS-C4] should return false outside GitGovernance projects', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.isGitgovProject();

      expect(result).toBe(false);
    });
  });

  describe('resetCache', () => {
    it('[EARS-B7] should clear project root cache', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      // First call - populates cache
      FsConfigStore.findProjectRoot('/test/project/src');
      mockedExistsSync.mockClear();

      // Second call with same path - uses cache
      FsConfigStore.findProjectRoot('/test/project/src');
      expect(mockedExistsSync).not.toHaveBeenCalled();

      // Reset cache
      FsConfigStore.resetCache();
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      // Third call - should search again
      FsConfigStore.findProjectRoot('/test/project/src');
      expect(mockedExistsSync).toHaveBeenCalled();
    });
  });

  // ==================== Factory Functions ====================

  describe('createConfigManager', () => {
    it('[EARS-D1] should create ConfigManager with FsConfigStore backend', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const manager = createConfigManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadConfig).toBeDefined();
      expect(manager.getRootCycle).toBeDefined();
    });

    it('[EARS-D2] should auto-detect project root when not provided', () => {
      mockedExistsSync.mockImplementation((p) => p === '/detected/root/.git');

      const originalCwd = process.cwd;
      process.cwd = () => '/detected/root/src';

      const manager = createConfigManager();

      expect(manager).toBeDefined();
      process.cwd = originalCwd;
    });
  });

  describe('createSessionManager', () => {
    it('[EARS-D3] should create SessionManager with FsSessionStore backend', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const manager = createSessionManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadSession).toBeDefined();
      expect(manager.getActorState).toBeDefined();
    });

    it('[EARS-D4] should auto-detect project root when not provided', () => {
      mockedExistsSync.mockImplementation((p) => p === '/detected/root/.git');

      const originalCwd = process.cwd;
      process.cwd = () => '/detected/root/src';

      const manager = createSessionManager();

      expect(manager).toBeDefined();
      process.cwd = originalCwd;
    });
  });

  describe('createManagers', () => {
    it('[EARS-D5] should create both ConfigManager and SessionManager', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const { configManager, sessionManager } = createManagers('/test/project');

      expect(configManager).toBeDefined();
      expect(configManager.loadConfig).toBeDefined();
      expect(sessionManager).toBeDefined();
      expect(sessionManager.loadSession).toBeDefined();
    });

    it('[EARS-D6] should auto-detect project root when not provided', () => {
      mockedExistsSync.mockImplementation((p) => p === '/detected/root/.git');

      const originalCwd = process.cwd;
      process.cwd = () => '/detected/root/src';

      const { configManager, sessionManager } = createManagers();

      expect(configManager).toBeDefined();
      expect(sessionManager).toBeDefined();
      process.cwd = originalCwd;
    });
  });
});
