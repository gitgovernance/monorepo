/**
 * MemoryConfigStore Unit Tests
 *
 * Tests MemoryConfigStore in-memory implementation.
 * All EARS prefixes map to memory_config_store_module.md blueprint.
 *
 * Session-related tests are in session_store/memory/memory_session_store.test.ts
 *
 * EARS Blocks:
 * - A: ConfigStore Interface (§3.1)
 * - B: Test Helpers (§3.2)
 * - C: ConfigManager Integration (§3.3)
 */

import { MemoryConfigStore } from './memory_config_store';
import type { GitGovConfig } from '../../config_manager';

describe('MemoryConfigStore', () => {
  let store: MemoryConfigStore;

  const mockConfig: GitGovConfig = {
    protocolVersion: '1.0',
    projectId: 'test-project',
    projectName: 'Test Project',
    rootCycle: '1234567890-cycle-test',
  };

  beforeEach(() => {
    store = new MemoryConfigStore();
  });

  // ==================== §3.1 ConfigStore Interface (EARS-A1 to A4) ====================

  describe('3.1. ConfigStore Interface (EARS-A1 to A4)', () => {
    it('[EARS-A1] WHEN loadConfig is invoked without config set, THE SYSTEM SHALL return null', async () => {
      const result = await store.loadConfig();
      expect(result).toBeNull();
    });

    it('[EARS-A2] WHEN loadConfig is invoked after setConfig, THE SYSTEM SHALL return the config', async () => {
      store.setConfig(mockConfig);

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A3] WHEN loadConfig is invoked after saveConfig, THE SYSTEM SHALL return the config', async () => {
      await store.saveConfig(mockConfig);

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A4] WHEN saveConfig is invoked, THE SYSTEM SHALL persist config to memory', async () => {
      await store.saveConfig(mockConfig);

      expect(store.getConfig()).toEqual(mockConfig);
    });

    it('[EARS-A4] WHEN saveConfig is invoked with existing config, THE SYSTEM SHALL overwrite it', async () => {
      store.setConfig(mockConfig);

      const newConfig: GitGovConfig = {
        ...mockConfig,
        projectName: 'Updated Project',
      };
      await store.saveConfig(newConfig);

      expect(store.getConfig()?.projectName).toBe('Updated Project');
    });
  });

  // ==================== §3.2 Test Helpers (EARS-B1 to B3) ====================

  describe('3.2. Test Helpers (EARS-B1 to B3)', () => {
    it('[EARS-B1] WHEN setConfig is invoked, THE SYSTEM SHALL set config synchronously via getConfig', () => {
      store.setConfig(mockConfig);
      expect(store.getConfig()).toEqual(mockConfig);
    });

    it('[EARS-B2] WHEN setConfig is invoked with null, THE SYSTEM SHALL clear the config', () => {
      store.setConfig(mockConfig);
      store.setConfig(null);
      expect(store.getConfig()).toBeNull();
    });

    it('[EARS-B3] WHEN clear is invoked, THE SYSTEM SHALL reset store to initial state', () => {
      store.setConfig(mockConfig);

      store.clear();

      expect(store.getConfig()).toBeNull();
    });
  });

  // ==================== §3.3 ConfigManager Integration (EARS-C1 to C2) ====================

  describe('3.3. ConfigManager Integration (EARS-C1 to C2)', () => {
    // Import here to avoid circular dependency issues
    const { ConfigManager } = require('../../config_manager');

    it('[EARS-C1] WHEN used with ConfigManager, THE SYSTEM SHALL work for loadConfig', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-C1] WHEN used with ConfigManager, THE SYSTEM SHALL work for getRootCycle', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.getRootCycle();

      expect(result).toBe('1234567890-cycle-test');
    });

    it('[EARS-C1] WHEN used with ConfigManager, THE SYSTEM SHALL work for getProjectInfo', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.getProjectInfo();

      expect(result).toEqual({
        id: 'test-project',
        name: 'Test Project'
      });
    });

    it('[EARS-C2] WHEN used with ConfigManager, THE SYSTEM SHALL work for updateAuditState', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      await manager.updateAuditState({
        lastFullAuditCommit: 'abc123',
        lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
        lastFullAuditFindingsCount: 5
      });

      const config = store.getConfig();
      expect(config?.state?.audit?.lastFullAuditCommit).toBe('abc123');
    });
  });
});
