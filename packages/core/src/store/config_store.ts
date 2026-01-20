/**
 * ConfigStore Interface
 *
 * Abstraction for config.json and .session.json persistence.
 * Enables backend-agnostic access to GitGovernance configuration
 * (filesystem, memory for tests, or future cloud backends).
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 */

import type { GitGovConfig, GitGovSession } from '../config_manager';

/**
 * Interface for configuration and session persistence.
 *
 * Unlike Store<T> which handles multiple records by ID, ConfigStore
 * manages exactly two singletons: project config and local session.
 *
 * Implementations:
 * - FsConfigStore: Filesystem-based (.gitgov/config.json, .gitgov/.session.json)
 * - MemoryConfigStore: In-memory for tests
 *
 * @example
 * ```typescript
 * // Production with filesystem
 * const store = new FsConfigStore('/path/to/project');
 * const config = await store.loadConfig();
 *
 * // Tests with memory
 * const store = new MemoryConfigStore();
 * store.setConfig({ protocolVersion: '1.0', ... });
 * ```
 */
export interface ConfigStore {
  /**
   * Load project configuration from config.json
   * @returns GitGovConfig or null if not found/invalid
   */
  loadConfig(): Promise<GitGovConfig | null>;

  /**
   * Save project configuration to config.json
   * @param config - Configuration to persist
   */
  saveConfig(config: GitGovConfig): Promise<void>;

  /**
   * Load local session from .session.json
   * @returns GitGovSession or null if not found/invalid
   */
  loadSession(): Promise<GitGovSession | null>;

  /**
   * Save local session to .session.json
   * @param session - Session to persist
   */
  saveSession(session: GitGovSession): Promise<void>;

  /**
   * Detect actor from .key files in actors directory.
   * Optional - only meaningful for filesystem implementations.
   *
   * [EARS-53] Auto-detects actor when session doesn't have actorId.
   *
   * @returns Actor ID (e.g., "human:camilo") or null if not found
   */
  detectActorFromKeyFiles?(): Promise<string | null>;
}

/**
 * Interface for project root detection utilities.
 *
 * These are filesystem-specific operations that help locate
 * the GitGovernance project root. Only FsConfigStore implements these.
 *
 * NOTE: These are static methods on FsConfigStore, not instance methods.
 */
export interface ProjectRootFinder {
  /**
   * Find Git project root by searching upward for .git directory
   * @param startPath - Starting path (default: process.cwd())
   * @returns Absolute path to project root or null
   */
  findProjectRoot(startPath?: string): string | null;

  /**
   * Find GitGovernance project root by searching upward for .gitgov or .git
   * @param startPath - Starting path (default: process.cwd())
   * @returns Absolute path to project root or null
   */
  findGitgovRoot(startPath?: string): string | null;

  /**
   * Get absolute path to .gitgov directory
   * @throws Error if not in a GitGovernance project
   */
  getGitgovPath(): string;

  /**
   * Check if current directory is a GitGovernance project
   */
  isGitgovProject(): boolean;
}
