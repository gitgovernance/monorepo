/**
 * ConfigManager Unit Tests
 *
 * Tests for ConfigManager which handles project configuration (config.json).
 * Session-related tests are in session_manager.test.ts.
 *
 * EARS Blocks:
 * - A: loadConfig (§4.1)
 * - B: getRootCycle (§4.2)
 * - C: getProjectInfo (§4.3)
 * - D: getSyncConfig (§4.4)
 * - E: getSyncDefaults (§4.5)
 * - F: getAuditState (§4.6)
 * - G: updateAuditState (§4.7)
 * - H: getStateBranch (§4.8)
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

  // ==================== §4.1 loadConfig (EARS-A) ====================

  describe('loadConfig (EARS-A)', () => {
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

  // ==================== §4.2 getRootCycle (EARS-B) ====================

  describe('getRootCycle (EARS-B)', () => {
    it('[EARS-B1] WHEN getRootCycle is invoked with rootCycle defined, THE SYSTEM SHALL return the root cycle ID', async () => {
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

    it('[EARS-B2] WHEN getRootCycle is invoked without rootCycle defined, THE SYSTEM SHALL return null', async () => {
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

    it('[EARS-B2] WHEN getRootCycle is invoked with no config, THE SYSTEM SHALL return null', async () => {
      // No config set

      const result = await configManager.getRootCycle();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.3 getProjectInfo (EARS-C) ====================

  describe('getProjectInfo (EARS-C)', () => {
    it('[EARS-C1] WHEN getProjectInfo is invoked with valid config, THE SYSTEM SHALL return object with projectId and projectName', async () => {
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

    it('[EARS-C2] WHEN getProjectInfo is invoked with no config, THE SYSTEM SHALL return null', async () => {
      // No config set

      const result = await configManager.getProjectInfo();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.4 getSyncConfig (EARS-D) ====================

  describe('getSyncConfig (EARS-D)', () => {
    it('[EARS-D1] WHEN getSyncConfig is invoked with state.sync defined, THE SYSTEM SHALL return object with strategy, maxRetries, and intervals', async () => {
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

    it('[EARS-D1] WHEN getSyncConfig is invoked with partial state.sync, THE SYSTEM SHALL return defaults for missing values', async () => {
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

    it('[EARS-D2] WHEN getSyncConfig is invoked without state.sync, THE SYSTEM SHALL return null', async () => {
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
  });

  // ==================== §4.5 getSyncDefaults (EARS-E) ====================

  describe('getSyncDefaults (EARS-E)', () => {
    it('[EARS-E1] WHEN getSyncDefaults is invoked with state.defaults defined, THE SYSTEM SHALL return defaults from config', async () => {
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

    it('[EARS-E2] WHEN getSyncDefaults is invoked without state.defaults, THE SYSTEM SHALL return hardcoded fallbacks', async () => {
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

    it('[EARS-E2] WHEN getSyncDefaults is invoked with no config, THE SYSTEM SHALL return hardcoded fallbacks', async () => {
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

  // ==================== §4.6 getAuditState (EARS-F) ====================

  describe('getAuditState (EARS-F)', () => {
    it('[EARS-F1] WHEN getAuditState is invoked with audit state in config, THE SYSTEM SHALL return audit state', async () => {
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

    it('[EARS-F2] WHEN getAuditState is invoked without audit state, THE SYSTEM SHALL return nulls', async () => {
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

    it('[EARS-F2] WHEN getAuditState is invoked with no config, THE SYSTEM SHALL return nulls', async () => {
      // No config set

      const result = await configManager.getAuditState();

      expect(result).toEqual({
        lastFullAuditCommit: null,
        lastFullAuditTimestamp: null,
        lastFullAuditFindingsCount: null
      });
    });
  });

  // ==================== §4.7 updateAuditState (EARS-G) ====================

  describe('updateAuditState (EARS-G)', () => {
    it('[EARS-G1] WHEN updateAuditState is invoked, THE SYSTEM SHALL update audit state in config', async () => {
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

    it('[EARS-G2] WHEN updateAuditState is invoked with existing state, THE SYSTEM SHALL preserve other state fields', async () => {
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

    it('[EARS-G3] WHEN updateAuditState is invoked without config, THE SYSTEM SHALL throw error', async () => {
      // No config set

      await expect(configManager.updateAuditState({
        lastFullAuditCommit: 'abc123',
        lastFullAuditTimestamp: '2025-01-09T10:00:00Z',
        lastFullAuditFindingsCount: 5
      })).rejects.toThrow('Cannot update audit state: config.json not found');
    });
  });

  // ==================== §4.8 getStateBranch (EARS-H) ====================

  describe('getStateBranch (EARS-H)', () => {
    it('[EARS-H1] WHEN getStateBranch is invoked with custom branch in config, THE SYSTEM SHALL return custom branch', async () => {
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

    it('[EARS-H2] WHEN getStateBranch is invoked without branch in config, THE SYSTEM SHALL return default branch', async () => {
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

    it('[EARS-H2] WHEN getStateBranch is invoked with no config, THE SYSTEM SHALL return default branch', async () => {
      // No config set

      const result = await configManager.getStateBranch();

      expect(result).toBe('gitgov-state');
    });
  });
});
