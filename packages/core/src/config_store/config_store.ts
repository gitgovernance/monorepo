/**
 * ConfigStore Interface
 *
 * Abstraction for config.json persistence.
 * Enables backend-agnostic access to GitGovernance project configuration
 * (filesystem, memory for tests, or future cloud backends).
 *
 * NOTE: Session state (.session.json) is handled by SessionStore, not ConfigStore.
 * This separation allows different backends for config (immutable, versioned)
 * vs session (ephemeral, local).
 */

import type { GitGovConfig } from '../config_manager';

/**
 * Interface for project configuration persistence.
 *
 * ConfigStore manages the project config.json file which is:
 * - Versioned in Git (shared between collaborators)
 * - Contains project-level settings (protocolVersion, projectId, rootCycle, etc.)
 * - Rarely changes after initial setup
 *
 * Implementations:
 * - FsConfigStore: Filesystem-based (.gitgov/config.json)
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
export interface ConfigStore<R = void> {
  /**
   * Load project configuration from config.json
   *
   * @returns GitGovConfig or null if not found/invalid
   */
  loadConfig(): Promise<GitGovConfig | null>;

  /**
   * Save project configuration to config.json
   *
   * @param config - Configuration to persist
   * @returns Void for local backends; GitHubSaveResult for GitHub backend
   */
  saveConfig(config: GitGovConfig): Promise<R>;
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
