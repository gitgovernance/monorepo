/**
 * ConfigManager Unit Tests
 *
 * Tests for ConfigManager which handles project configuration (config.json).
 * Session-related tests are in session_manager.test.ts.
 */

import { ConfigManager } from './index';
import { MemoryConfigStore } from '../config_store/memory';
import type { GitGovConfig } from './index';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let store: MemoryConfigStore;

  beforeEach(() => {
    store = new MemoryConfigStore();
    configManager = new ConfigManager(store);
  });

  // --- Configuration Methods (EARS-A1 to EARS-A9) ---

  describe('loadConfig', () => {
    it('[EARS-A1] WHEN loadConfig is invoked with valid config, THE SYSTEM SHALL return complete GitGovConfig object', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project-123',
        projectName: 'Test Project',
        rootCycle: 'root-cycle-456',
        state: { branch: 'gitgov-state' }
      };

      store.setConfig(mockConfig);

      const result = await configManager.loadConfig();

      expect(result).toEqual(mockConfig);
    });

    it('[EARS-A2] WHEN loadConfig is invoked with no config set, THE SYSTEM SHALL return null without throwing error', async () => {
      // store has no config set (default)

      const result = await configManager.loadConfig();

      expect(result).toBeNull();
    });
  });

  describe('getRootCycle', () => {
    it('[EARS-A4] WHEN getRootCycle is invoked with configuration that has rootCycle defined, THE SYSTEM SHALL return the root cycle ID', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
      };

      store.setConfig(mockConfig);

      const result = await configManager.getRootCycle();

      expect(result).toBe('root-cycle-123');
    });

    it('[EARS-A5] WHEN getRootCycle is invoked with configuration without rootCycle defined, THE SYSTEM SHALL return null', async () => {
      // Note: This test simulates an invalid/incomplete config
      const incompleteConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test'
        // Missing rootCycle - invalid config
      } as GitGovConfig;

      store.setConfig(incompleteConfig);

      const result = await configManager.getRootCycle();

      expect(result).toBeNull();
    });

    it('WHEN getRootCycle is invoked with no config, THE SYSTEM SHALL return null', async () => {
      // No config set

      const result = await configManager.getRootCycle();

      expect(result).toBeNull();
    });
  });

  describe('getProjectInfo', () => {
    it('[EARS-A6] WHEN getProjectInfo is invoked with valid configuration, THE SYSTEM SHALL return object with projectId and projectName', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'project-456',
        projectName: 'My Project',
        rootCycle: 'root-cycle-789'
      };

      store.setConfig(mockConfig);

      const result = await configManager.getProjectInfo();

      expect(result).toEqual({
        id: 'project-456',
        name: 'My Project'
      });
    });

    it('WHEN getProjectInfo is invoked with no config, THE SYSTEM SHALL return null', async () => {
      // No config set

      const result = await configManager.getProjectInfo();

      expect(result).toBeNull();
    });
  });

  // --- Sync Configuration Methods (EARS-A7 to EARS-A9) ---

  describe('getSyncConfig', () => {
    it('[EARS-A7] WHEN getSyncConfig is invoked with state.sync defined, THE SYSTEM SHALL return object with strategy, maxRetries, and intervals', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          sync: {
            strategy: 'immediate',
            maxRetries: 5,
            pushIntervalSeconds: 60,
            batchIntervalSeconds: 120
          }
        }
      };

      store.setConfig(mockConfig);

      const result = await configManager.getSyncConfig();

      expect(result).toEqual({
        strategy: 'immediate',
        maxRetries: 5,
        pushIntervalSeconds: 60,
        batchIntervalSeconds: 120
      });
    });

    it('[EARS-A8] WHEN getSyncConfig is invoked without state.sync, THE SYSTEM SHALL return null', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
        // No state.sync
      };

      store.setConfig(mockConfig);

      const result = await configManager.getSyncConfig();

      expect(result).toBeNull();
    });

    it('WHEN getSyncConfig is invoked with partial state.sync, THE SYSTEM SHALL return defaults for missing values', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          sync: {
            strategy: 'batched'
            // Other values not set
          }
        }
      };

      store.setConfig(mockConfig);

      const result = await configManager.getSyncConfig();

      expect(result).toEqual({
        strategy: 'batched',
        maxRetries: 3, // Default
        pushIntervalSeconds: 30, // Default
        batchIntervalSeconds: 60 // Default
      });
    });
  });

  describe('getSyncDefaults', () => {
    it('[EARS-A9] WHEN getSyncDefaults is invoked, THE SYSTEM SHALL return defaults from config or hardcoded fallbacks', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 45,
              defaultEnabled: true,
              defaultContinueOnNetworkError: false,
              defaultStopOnConflict: true
            },
            fileWatcher: {
              defaultDebounceMs: 500,
              defaultIgnoredPatterns: ['*.log', '*.bak']
            }
          }
        }
      };

      store.setConfig(mockConfig);

      const result = await configManager.getSyncDefaults();

      expect(result).toEqual({
        pullScheduler: {
          defaultIntervalSeconds: 45,
          defaultEnabled: true,
          defaultContinueOnNetworkError: false,
          defaultStopOnConflict: true
        },
        fileWatcher: {
          defaultDebounceMs: 500,
          defaultIgnoredPatterns: ['*.log', '*.bak']
        }
      });
    });

    it('WHEN getSyncDefaults is invoked without state.defaults, THE SYSTEM SHALL return hardcoded fallbacks', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
        // No state.defaults
      };

      store.setConfig(mockConfig);

      const result = await configManager.getSyncDefaults();

      expect(result).toEqual({
        pullScheduler: {
          defaultIntervalSeconds: 30,
          defaultEnabled: false,
          defaultContinueOnNetworkError: true,
          defaultStopOnConflict: false
        },
        fileWatcher: {
          defaultDebounceMs: 300,
          defaultIgnoredPatterns: ["*.tmp", ".DS_Store", "*.swp"]
        }
      });
    });

    it('WHEN getSyncDefaults is invoked with no config, THE SYSTEM SHALL return hardcoded fallbacks', async () => {
      // No config set

      const result = await configManager.getSyncDefaults();

      expect(result).toEqual({
        pullScheduler: {
          defaultIntervalSeconds: 30,
          defaultEnabled: false,
          defaultContinueOnNetworkError: true,
          defaultStopOnConflict: false
        },
        fileWatcher: {
          defaultDebounceMs: 300,
          defaultIgnoredPatterns: ["*.tmp", ".DS_Store", "*.swp"]
        }
      });
    });
  });

  // --- Audit State Methods ---

  describe('getAuditState', () => {
    it('WHEN getAuditState is invoked with audit state in config, THE SYSTEM SHALL return audit state', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          audit: {
            lastFullAuditCommit: 'abc123',
            lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
            lastFullAuditFindingsCount: 5
          }
        }
      };

      store.setConfig(mockConfig);

      const result = await configManager.getAuditState();

      expect(result).toEqual({
        lastFullAuditCommit: 'abc123',
        lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
        lastFullAuditFindingsCount: 5
      });
    });

    it('WHEN getAuditState is invoked without audit state, THE SYSTEM SHALL return nulls', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
      };

      store.setConfig(mockConfig);

      const result = await configManager.getAuditState();

      expect(result).toEqual({
        lastFullAuditCommit: null,
        lastFullAuditTimestamp: null,
        lastFullAuditFindingsCount: null
      });
    });

    it('WHEN getAuditState is invoked with no config, THE SYSTEM SHALL return nulls', async () => {
      // No config set

      const result = await configManager.getAuditState();

      expect(result).toEqual({
        lastFullAuditCommit: null,
        lastFullAuditTimestamp: null,
        lastFullAuditFindingsCount: null
      });
    });
  });

  describe('updateAuditState', () => {
    it('WHEN updateAuditState is invoked, THE SYSTEM SHALL update audit state in config', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
      };

      store.setConfig(mockConfig);

      await configManager.updateAuditState({
        lastFullAuditCommit: 'def456',
        lastFullAuditTimestamp: '2025-01-10T12:00:00Z',
        lastFullAuditFindingsCount: 10
      });

      const updatedConfig = store.getConfig();
      expect(updatedConfig?.state?.audit).toEqual({
        lastFullAuditCommit: 'def456',
        lastFullAuditTimestamp: '2025-01-10T12:00:00Z',
        lastFullAuditFindingsCount: 10
      });
    });

    it('WHEN updateAuditState is invoked with existing state, THE SYSTEM SHALL preserve other state fields', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          branch: 'custom-branch',
          sync: { strategy: 'immediate' }
        }
      };

      store.setConfig(mockConfig);

      await configManager.updateAuditState({
        lastFullAuditCommit: 'abc123',
        lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
        lastFullAuditFindingsCount: 5
      });

      const updatedConfig = store.getConfig();
      expect(updatedConfig?.state?.branch).toBe('custom-branch');
      expect(updatedConfig?.state?.sync?.strategy).toBe('immediate');
      expect(updatedConfig?.state?.audit?.lastFullAuditCommit).toBe('abc123');
    });

    it('WHEN updateAuditState is invoked without config, THE SYSTEM SHALL throw error', async () => {
      // No config set

      await expect(configManager.updateAuditState({
        lastFullAuditCommit: 'abc123',
        lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
        lastFullAuditFindingsCount: 5
      })).rejects.toThrow('Cannot update audit state: config.json not found');
    });
  });

  // --- State Branch Method ---

  describe('getStateBranch', () => {
    it('WHEN getStateBranch is invoked with custom branch in config, THE SYSTEM SHALL return custom branch', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          branch: 'custom-state-branch'
        }
      };

      store.setConfig(mockConfig);

      const result = await configManager.getStateBranch();

      expect(result).toBe('custom-state-branch');
    });

    it('WHEN getStateBranch is invoked without branch in config, THE SYSTEM SHALL return default branch', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
        // No state.branch
      };

      store.setConfig(mockConfig);

      const result = await configManager.getStateBranch();

      expect(result).toBe('gitgov-state');
    });

    it('WHEN getStateBranch is invoked with no config, THE SYSTEM SHALL return default branch', async () => {
      // No config set

      const result = await configManager.getStateBranch();

      expect(result).toBe('gitgov-state');
    });
  });
});
