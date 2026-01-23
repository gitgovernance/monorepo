/**
 * FsConfigStore Unit Tests
 *
 * Tests FsConfigStore with mocked filesystem.
 * Session-related tests are in session_store/fs/fs_session_store.test.ts
 *
 * EARS Blocks:
 * - A: Instance Methods (§4.1)
 * - B: Static Search Methods (§4.2)
 * - C: Static Utility Methods (§4.3)
 * - D: Factory Functions (§4.4)
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

  // ==================== §4.1 Instance Methods (EARS-A) ====================

  describe('Instance Methods (EARS-A)', () => {
    it('[EARS-A1] WHEN loadConfig is invoked with valid config.json, THE SYSTEM SHALL return complete GitGovConfig', async () => {
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

    it('[EARS-A2] WHEN loadConfig is invoked with non-existent file, THE SYSTEM SHALL return null (fail-safe)', async () => {
      const store = new FsConfigStore(projectRoot);
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A3] WHEN loadConfig is invoked with invalid JSON, THE SYSTEM SHALL return null (graceful degradation)', async () => {
      const store = new FsConfigStore(projectRoot);
      mockedFs.readFile.mockResolvedValue('{ invalid json }');

      const result = await store.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A4] WHEN saveConfig is invoked, THE SYSTEM SHALL write config to .gitgov/config.json', async () => {
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

  // ==================== §4.2 Static Search Methods (EARS-B) ====================

  describe('Static Search Methods (EARS-B)', () => {
    it('[EARS-B1] WHEN findProjectRoot is invoked from within Git project, THE SYSTEM SHALL return absolute path', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = FsConfigStore.findProjectRoot('/test/project/src/deep');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B2] WHEN findProjectRoot is invoked outside Git project, THE SYSTEM SHALL return null', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.findProjectRoot('/some/random/path');

      expect(result).toBeNull();
    });

    it('[EARS-B3] WHEN findProjectRoot is invoked multiple times with same path, THE SYSTEM SHALL return cached result', () => {
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

    it('[EARS-B3] WHEN findProjectRoot is invoked from different path, THE SYSTEM SHALL invalidate cache', () => {
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

    it('[EARS-B4] WHEN findGitgovRoot finds both .gitgov and .git, THE SYSTEM SHALL prioritize .gitgov', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.gitgov' || p === '/test/project/.git';
      });

      const result = FsConfigStore.findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B5] WHEN findGitgovRoot does not find .gitgov but finds .git, THE SYSTEM SHALL fallback to .git', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = FsConfigStore.findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B6] WHEN findGitgovRoot finds neither .gitgov nor .git, THE SYSTEM SHALL return null', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.findGitgovRoot('/some/path');

      expect(result).toBeNull();
    });

    it('[EARS-B7] WHEN resetCache is invoked, THE SYSTEM SHALL clear project root cache', () => {
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

  // ==================== §4.3 Static Utility Methods (EARS-C) ====================

  describe('Static Utility Methods (EARS-C)', () => {
    it('[EARS-C1] WHEN getGitgovPath is invoked from GitGovernance project, THE SYSTEM SHALL return absolute path', () => {
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

    it('[EARS-C2] WHEN getGitgovPath is invoked outside GitGovernance project, THE SYSTEM SHALL throw Error', () => {
      mockedExistsSync.mockReturnValue(false);

      expect(() => FsConfigStore.getGitgovPath()).toThrow(
        'Could not find project root'
      );
    });

    it('[EARS-C3] WHEN isGitgovProject is invoked from GitGovernance project, THE SYSTEM SHALL return true', () => {
      mockedExistsSync.mockImplementation((p) => {
        return String(p).includes('.gitgov');
      });

      const originalCwd = process.cwd;
      process.cwd = () => '/test/project/src';

      const result = FsConfigStore.isGitgovProject();

      expect(result).toBe(true);
      process.cwd = originalCwd;
    });

    it('[EARS-C4] WHEN isGitgovProject is invoked outside GitGovernance project, THE SYSTEM SHALL return false', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = FsConfigStore.isGitgovProject();

      expect(result).toBe(false);
    });

    it('[EARS-C5] WHEN config.json has non-standard rootCycle format, THE SYSTEM SHALL emit warning', async () => {
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

  // ==================== §4.4 Factory Functions (EARS-D) ====================

  describe('Factory Functions (EARS-D)', () => {
    it('[EARS-D1] WHEN createConfigManager is invoked with explicit path, THE SYSTEM SHALL create ConfigManager', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const manager = createConfigManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadConfig).toBeDefined();
      expect(manager.getRootCycle).toBeDefined();
    });

    it('[EARS-D2] WHEN createConfigManager is invoked without arguments, THE SYSTEM SHALL auto-detect project root', () => {
      mockedExistsSync.mockImplementation((p) => p === '/detected/root/.git');

      const originalCwd = process.cwd;
      process.cwd = () => '/detected/root/src';

      const manager = createConfigManager();

      expect(manager).toBeDefined();
      process.cwd = originalCwd;
    });

    it('[EARS-D3] WHEN createSessionManager is invoked with explicit path, THE SYSTEM SHALL create SessionManager', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const manager = createSessionManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadSession).toBeDefined();
      expect(manager.getActorState).toBeDefined();
    });

    it('[EARS-D4] WHEN createSessionManager is invoked without arguments, THE SYSTEM SHALL auto-detect project root', () => {
      mockedExistsSync.mockImplementation((p) => p === '/detected/root/.git');

      const originalCwd = process.cwd;
      process.cwd = () => '/detected/root/src';

      const manager = createSessionManager();

      expect(manager).toBeDefined();
      process.cwd = originalCwd;
    });

    it('[EARS-D5] WHEN createManagers is invoked, THE SYSTEM SHALL create both ConfigManager and SessionManager', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const { configManager, sessionManager } = createManagers('/test/project');

      expect(configManager).toBeDefined();
      expect(configManager.loadConfig).toBeDefined();
      expect(sessionManager).toBeDefined();
      expect(sessionManager.loadSession).toBeDefined();
    });

    it('[EARS-D6] WHEN createManagers is invoked without arguments, THE SYSTEM SHALL auto-detect project root', () => {
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
