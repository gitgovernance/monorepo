/**
 * ConfigManager - Project Configuration Manager
 *
 * Provides typed access to GitGovernance project configuration (config.json).
 * Configuration is versioned in Git and shared between collaborators.
 *
 * Uses ConfigStore abstraction for backend-agnostic persistence.
 *
 * NOTE: Session state (.session.json) is handled by SessionManager, not ConfigManager.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 * @see packages/blueprints/03_products/protocol/10_appendices/config_file.md
 */

import type { ConfigStore } from '../config_store/config_store';
import type {
  IConfigManager,
  GitGovConfig,
  AuditState,
  SyncConfig,
  SyncDefaults,
  AuditStateUpdate
} from './config_manager.types';

/**
 * Configuration Manager Class
 *
 * Provides typed access to GitGovernance project configuration.
 * Uses ConfigStore abstraction for backend-agnostic persistence.
 *
 * @example
 * ```typescript
 * // Production usage
 * import { FsConfigStore } from '@gitgov/core/fs';
 * const configStore = new FsConfigStore('/path/to/project');
 * const configManager = new ConfigManager(configStore);
 *
 * // Test usage
 * import { MemoryConfigStore } from '@gitgov/core/memory';
 * const configStore = new MemoryConfigStore();
 * configStore.setConfig({ ... });
 * const configManager = new ConfigManager(configStore);
 * ```
 */
export class ConfigManager implements IConfigManager {
  private readonly configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Load GitGovernance configuration
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    return this.configStore.loadConfig();
  }

  /**
   * Get root cycle from configuration
   */
  async getRootCycle(): Promise<string | null> {
    const config = await this.loadConfig();
    return config?.rootCycle || null;
  }

  /**
   * Get project information from configuration
   */
  async getProjectInfo(): Promise<{ id: string; name: string } | null> {
    const config = await this.loadConfig();
    if (!config) return null;

    return {
      id: config.projectId,
      name: config.projectName
    };
  }

  /**
   * Get sync configuration from config.json
   * Returns sync strategy and related settings with defaults
   */
  async getSyncConfig(): Promise<SyncConfig | null> {
    const config = await this.loadConfig();
    if (!config?.state?.sync) return null;

    return {
      strategy: config.state.sync.strategy || "manual",
      maxRetries: config.state.sync.maxRetries || 3,
      pushIntervalSeconds: config.state.sync.pushIntervalSeconds || 30,
      batchIntervalSeconds: config.state.sync.batchIntervalSeconds || 60
    };
  }

  /**
   * Get sync defaults from config.json
   * Returns recommended defaults for pullScheduler and fileWatcher
   */
  async getSyncDefaults(): Promise<SyncDefaults> {
    const config = await this.loadConfig();

    return {
      pullScheduler: {
        defaultIntervalSeconds: config?.state?.defaults?.pullScheduler?.defaultIntervalSeconds || 30,
        defaultEnabled: config?.state?.defaults?.pullScheduler?.defaultEnabled || false,
        defaultContinueOnNetworkError: config?.state?.defaults?.pullScheduler?.defaultContinueOnNetworkError ?? true,
        defaultStopOnConflict: config?.state?.defaults?.pullScheduler?.defaultStopOnConflict || false
      },
      fileWatcher: {
        defaultDebounceMs: config?.state?.defaults?.fileWatcher?.defaultDebounceMs || 300,
        defaultIgnoredPatterns: config?.state?.defaults?.fileWatcher?.defaultIgnoredPatterns || ["*.tmp", ".DS_Store", "*.swp"]
      }
    };
  }

  /**
   * Get audit state from config.json
   * Returns last full audit commit and timestamp for incremental mode
   */
  async getAuditState(): Promise<AuditState> {
    const config = await this.loadConfig();
    return {
      lastFullAuditCommit: config?.state?.audit?.lastFullAuditCommit || null,
      lastFullAuditTimestamp: config?.state?.audit?.lastFullAuditTimestamp || null,
      lastFullAuditFindingsCount: config?.state?.audit?.lastFullAuditFindingsCount ?? null
    };
  }

  /**
   * Update audit state in config.json after a full audit
   * This is used to enable incremental audits
   */
  async updateAuditState(auditState: AuditStateUpdate): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('Cannot update audit state: config.json not found');
    }

    if (!config.state) {
      config.state = {};
    }

    config.state.audit = {
      lastFullAuditCommit: auditState.lastFullAuditCommit,
      lastFullAuditTimestamp: auditState.lastFullAuditTimestamp,
      lastFullAuditFindingsCount: auditState.lastFullAuditFindingsCount
    };

    await this.configStore.saveConfig(config);
  }

  /**
   * Get state branch name from configuration
   */
  async getStateBranch(): Promise<string> {
    const config = await this.loadConfig();
    return config?.state?.branch || 'gitgov-state';
  }
}
