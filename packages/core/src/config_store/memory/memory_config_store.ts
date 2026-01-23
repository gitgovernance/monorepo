/**
 * MemoryConfigStore - In-memory implementation of ConfigStore
 *
 * Useful for testing and serverless environments where filesystem
 * access is not available or not desired.
 *
 * NOTE: Session state is handled by MemorySessionStore, not this class.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
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
   * @returns GitGovConfig or null if not set
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    return this.config;
  }

  /**
   * Save configuration to memory
   */
  async saveConfig(config: GitGovConfig): Promise<void> {
    this.config = config;
  }

  // ==================== Test Helper Methods ====================

  /**
   * Set configuration directly (for test setup)
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
   */
  clear(): void {
    this.config = null;
  }
}
