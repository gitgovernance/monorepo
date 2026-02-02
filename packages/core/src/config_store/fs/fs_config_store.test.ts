/**
 * FsConfigStore Unit Tests
 *
 * Tests FsConfigStore with mocked filesystem.
 * All EARS prefixes map to fs_config_store_module.md blueprint.
 *
 * Session-related tests are in session_store/fs/fs_session_store.test.ts
 * Discovery-related tests are in utils/project_discovery.test.ts
 *
 * EARS Blocks:
 * - A: Instance Methods (§4.1)
 * - B: Factory Function (§4.2)
 */

import { FsConfigStore, createConfigManager } from './fs_config_store';
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
  });

  // ==================== §4.1 Instance Methods (EARS-A1 to A5) ====================

  describe('4.1. Instance Methods (EARS-A1 to A5)', () => {
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

    it('[EARS-A5] WHEN config.json has non-standard rootCycle format, THE SYSTEM SHALL emit warning', async () => {
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

  // ==================== §4.2 Factory Function (EARS-B1) ====================

  describe('4.2. Factory Function (EARS-B1)', () => {
    it('[EARS-B1] WHEN createConfigManager is invoked with explicit path, THE SYSTEM SHALL create ConfigManager', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      const manager = createConfigManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadConfig).toBeDefined();
      expect(manager.getRootCycle).toBeDefined();
    });
  });
});
