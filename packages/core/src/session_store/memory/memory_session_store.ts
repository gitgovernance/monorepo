/**
 * MemorySessionStore - In-memory implementation of SessionStore
 *
 * Useful for testing and serverless environments where filesystem
 * access is not available or not desired.
 *
 * @see packages/blueprints/03_products/protocol/10_appendices/session_state.md
 */

import type { SessionStore } from '../session_store';
import type { GitGovSession } from '../../session_manager';

/**
 * In-memory SessionStore implementation for tests.
 *
 * Stores session state in memory without filesystem I/O.
 * Provides methods to pre-populate data for testing scenarios.
 *
 * @example
 * ```typescript
 * const store = new MemorySessionStore();
 *
 * // Pre-populate for testing
 * store.setSession({
 *   lastSession: { actorId: 'human:test', timestamp: '2024-01-01T00:00:00Z' },
 *   actorState: {}
 * });
 *
 * // Use in ConfigManager
 * const manager = new ConfigManager(configStore, store);
 * const session = await manager.loadSession();
 * ```
 */
export class MemorySessionStore implements SessionStore {
  private session: GitGovSession | null = null;
  private keyFiles: string[] = [];

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
   * In MemorySessionStore, .key files are simulated via setKeyFiles().
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
   * Set simulated .key files (for EARS-B9 testing)
   * @param keyFiles - Array of key filenames (e.g., ["human:camilo.key"])
   */
  setKeyFiles(keyFiles: string[]): void {
    this.keyFiles = keyFiles;
  }

  /**
   * Clear all stored data (for test cleanup)
   */
  clear(): void {
    this.session = null;
    this.keyFiles = [];
  }
}
