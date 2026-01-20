/**
 * MemoryConfigStore - In-memory implementation of ConfigStore
 *
 * Useful for testing and serverless environments where filesystem
 * access is not available or not desired.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 */

import type { ConfigStore } from '../config_store';
import type { GitGovConfig, GitGovSession } from '../../config_manager';

/**
 * In-memory ConfigStore implementation for tests.
 *
 * Stores configuration and session in memory without filesystem I/O.
 * Provides methods to pre-populate data for testing scenarios.
 *
 * @example
 * ```typescript
 * const store = new MemoryConfigStore();
 *
 * // Pre-populate for testing
 * store.setConfig({
 *   protocolVersion: '1.0',
 *   projectId: 'test-project',
 *   projectName: 'Test Project',
 *   rootCycle: '1234567890-cycle-test'
 * });
 *
 * // Use in ConfigManager
 * const manager = new ConfigManager(store);
 * const config = await manager.loadConfig();
 * ```
 */
export class MemoryConfigStore implements ConfigStore {
  private config: GitGovConfig | null = null;
  private session: GitGovSession | null = null;
  private keyFiles: string[] = [];

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

  /**
   * Load session from memory
   * @returns GitGovSession or null if not set
   */
  async loadSession(): Promise<GitGovSession | null> {
    return this.session;
  }

  /**
   * Save session to memory
   */
  async saveSession(session: GitGovSession): Promise<void> {
    this.session = session;
  }

  /**
   * Detect actor from simulated .key files
   *
   * In MemoryConfigStore, .key files are simulated via setKeyFiles().
   *
   * @returns Actor ID or null if no key files configured
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    const firstKeyFile = this.keyFiles[0];
    if (!firstKeyFile) {
      return null;
    }
    // Extract actor ID from filename (remove .key extension)
    return firstKeyFile.replace('.key', '');
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
   * Set session directly (for test setup)
   */
  setSession(session: GitGovSession | null): void {
    this.session = session;
  }

  /**
   * Get current session (for test assertions)
   */
  getSession(): GitGovSession | null {
    return this.session;
  }

  /**
   * Set simulated .key files (for EARS-53 testing)
   * @param keyFiles - Array of key filenames (e.g., ["human:camilo.key"])
   */
  setKeyFiles(keyFiles: string[]): void {
    this.keyFiles = keyFiles;
  }

  /**
   * Clear all stored data (for test cleanup)
   */
  clear(): void {
    this.config = null;
    this.session = null;
    this.keyFiles = [];
  }
}
