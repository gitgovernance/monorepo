/**
 * MemoryConfigStore Unit Tests
 *
 * Tests for in-memory ConfigStore implementation.
 * Session-related tests are in session_store/memory/memory_session_store.test.ts
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

  // ==================== ConfigStore Interface ====================

  describe('loadConfig', () => {
    it('[EARS-A1] should return null when no config is set', async () => {
      const result = await store.loadConfig();
      expect(result).toBeNull();
    });

    it('[EARS-A2] should return config when set via setConfig', async () => {
      store.setConfig(mockConfig);

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A3] should return config when saved via saveConfig', async () => {
      await store.saveConfig(mockConfig);

      const result = await store.loadConfig();

      expect(result).toEqual(mockConfig);
    });
  });

  describe('saveConfig', () => {
    it('[EARS-A4] should persist config to memory', async () => {
      await store.saveConfig(mockConfig);

      expect(store.getConfig()).toEqual(mockConfig);
    });

    it('[EARS-A4] should overwrite existing config', async () => {
      store.setConfig(mockConfig);

      const newConfig: GitGovConfig = {
        ...mockConfig,
        projectName: 'Updated Project',
      };
      await store.saveConfig(newConfig);

      expect(store.getConfig()?.projectName).toBe('Updated Project');
    });
  });

  // ==================== Test Helper Methods ====================

  describe('setConfig / getConfig', () => {
    it('[EARS-B1] should set and get config synchronously', () => {
      store.setConfig(mockConfig);
      expect(store.getConfig()).toEqual(mockConfig);
    });

    it('[EARS-B2] should allow setting null config', () => {
      store.setConfig(mockConfig);
      store.setConfig(null);
      expect(store.getConfig()).toBeNull();
    });
  });

  describe('clear', () => {
    it('[EARS-B3] should clear all stored data', () => {
      store.setConfig(mockConfig);

      store.clear();

      expect(store.getConfig()).toBeNull();
    });
  });

  // ==================== Integration with ConfigManager ====================

  describe('ConfigManager integration', () => {
    // Import here to avoid circular dependency issues
    const { ConfigManager } = require('../../config_manager');

    it('[EARS-C1] should work with ConfigManager for loadConfig', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-C1] should work with ConfigManager for getRootCycle', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.getRootCycle();

      expect(result).toBe('1234567890-cycle-test');
    });

    it('[EARS-C1] should work with ConfigManager for getProjectInfo', async () => {
      store.setConfig(mockConfig);
      const manager = new ConfigManager(store);

      const result = await manager.getProjectInfo();

      expect(result).toEqual({
        id: 'test-project',
        name: 'Test Project'
      });
    });

    it('[EARS-C2] should work with ConfigManager for updateAuditState', async () => {
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
