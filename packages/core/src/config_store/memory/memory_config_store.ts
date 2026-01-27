/**
 * MemoryConfigStore - In-memory implementation of ConfigStore
 *
 * Useful for testing and serverless environments where filesystem
 * access is not available or not desired.
 *
 * NOTE: Session state is handled by MemorySessionStore, not this class.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_store_module/memory_config_store_module.md
 * @see packages/blueprints/03_products/protocol/10_appendices/config_file.md
 */

import type { ConfigStore } from '../config_store';
import type { GitGovConfig } from '../../config_manager';

/**
 * In-memory ConfigStore implementation for tests.
 *
 * Stores configuration in memory without filesystem I/O.
 * Provides methods to pre-populate data for testing scenarios.
 *
 * @example
 * ```typescript
 * const configStore = new MemoryConfigStore();
 * const sessionStore = new MemorySessionStore();
 *
 * // Pre-populate for testing
 * configStore.setConfig({
 *   protocolVersion: '1.0',
 *   projectId: 'test-project',
 *   projectName: 'Test Project',
 *   rootCycle: '1234567890-cycle-test'
 * });
 *
 * // Use in ConfigManager
 * const manager = new ConfigManager(configStore, sessionStore);
 * const config = await manager.loadConfig();
 * ```
 */
export class MemoryConfigStore implements ConfigStore {
  private config: GitGovConfig | null = null;

  /**
   * Load configuration from memory
   *
   * [EARS-A1] Returns null if no config set
   * [EARS-A2] Returns config set via setConfig
   * [EARS-A3] Returns config saved via saveConfig
   *
   * @returns GitGovConfig or null if not set
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    return this.config;
  }

  /**
   * Save configuration to memory
   *
   * [EARS-A4] Persists config in memory, accessible via getConfig()
   */
  async saveConfig(config: GitGovConfig): Promise<void> {
    this.config = config;
  }

  // ==================== Test Helper Methods ====================

  /**
   * Set configuration directly (for test setup)
   *
   * [EARS-B1] Sets config synchronously, available via getConfig()
   * [EARS-B2] Accepts null to clear config
   */
  setConfig(config: GitGovConfig | null): void {
    this.config = config;
  }

  /**
   * Get current configuration (for test assertions)
   */
  getConfig(): GitGovConfig | null {
    return this.config;
  }

  /**
   * Clear all stored data (for test cleanup)
   *
   * [EARS-B3] Resets store to initial state (config = null)
   */
  clear(): void {
    this.config = null;
  }
}
