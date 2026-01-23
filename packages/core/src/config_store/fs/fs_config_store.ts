/**
 * FsConfigStore - Filesystem implementation of ConfigStore
 *
 * Handles persistence of config.json to the local filesystem.
 * Also provides static utility methods for project root detection.
 *
 * NOTE: Session state (.session.json) is handled by FsSessionStore.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 * @see packages/blueprints/03_products/protocol/10_appendices/config_file.md
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { existsSync } from 'fs';
import type { ConfigStore } from '../config_store';
import type { GitGovConfig } from '../../config_manager';
import { ConfigManager } from '../../config_manager';
import { SessionManager } from '../../session_manager';
import { FsSessionStore } from '../../session_store/fs';

// Project root cache for performance
let projectRootCache: string | null = null;
let lastSearchPath: string | null = null;

/**
 * Filesystem-based ConfigStore implementation.
 *
 * Stores configuration in .gitgov/config.json.
 * Implements fail-safe pattern: returns null instead of throwing for missing files.
 *
 * @example
 * ```typescript
 * const store = new FsConfigStore('/path/to/project');
 * const config = await store.loadConfig();
 * if (config) {
 *   console.log(config.projectName);
 * }
 * ```
 */
export class FsConfigStore implements ConfigStore {
  private readonly configPath: string;

  constructor(projectRootPath: string) {
    this.configPath = path.join(projectRootPath, '.gitgov', 'config.json');
  }

  /**
   * Load project configuration from .gitgov/config.json
   *
   * [EARS-A1] Returns complete GitGovConfig for valid files
   * [EARS-A2] Returns null for non-existent files (fail-safe)
   * [EARS-A3] Returns null for invalid JSON (graceful degradation)
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as GitGovConfig;

      // Optional validation: Warn if rootCycle doesn't match expected format
      if (config.rootCycle && !/^\d+-cycle-[a-z0-9-]+$/.test(config.rootCycle)) {
        console.warn(
          `Warning: rootCycle "${config.rootCycle}" doesn't match expected format ` +
          `"{timestamp}-cycle-{slug}". This may cause issues with cycle navigation.`
        );
      }

      return config;
    } catch (error) {
      // Config file doesn't exist or is invalid - fail-safe behavior
      return null;
    }
  }

  /**
   * Save project configuration to .gitgov/config.json
   */
  async saveConfig(config: GitGovConfig): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  // ==================== Static Utility Methods ====================
  // These implement ProjectRootFinder interface as static methods

  /**
   * Finds the project root by searching upwards for a .git directory.
   * Caches the result for subsequent calls.
   *
   * [EARS-B1] Returns absolute path for directories within Git project
   * [EARS-B2] Returns null for directories outside Git project
   *
   * @param startPath - Starting path (default: process.cwd())
   * @returns Absolute path to project root, or null if not found
   */
  static findProjectRoot(startPath: string = process.cwd()): string | null {
    // In test environment, allow cache reset via global
    if (typeof (global as any).projectRoot !== 'undefined' && (global as any).projectRoot === null) {
      projectRootCache = null;
      lastSearchPath = null;
    }

    // Reset cache if we're searching from a different directory
    if (lastSearchPath && lastSearchPath !== startPath) {
      projectRootCache = null;
      lastSearchPath = null;
    }

    if (projectRootCache && lastSearchPath === startPath) {
      return projectRootCache;
    }

    // Update last search path
    lastSearchPath = startPath;

    let currentPath = startPath;
    // Prevent infinite loop by stopping at the filesystem root
    while (currentPath !== path.parse(currentPath).root) {
      if (existsSync(path.join(currentPath, '.git'))) {
        projectRootCache = currentPath;
        return projectRootCache;
      }
      currentPath = path.dirname(currentPath);
    }

    // Final check at the root directory
    if (existsSync(path.join(currentPath, '.git'))) {
      projectRootCache = currentPath;
      return projectRootCache;
    }

    return null;
  }

  /**
   * Finds the appropriate project root by searching upwards.
   * First looks for .gitgov (initialized project), then .git (for init).
   *
   * @param startPath - Starting path (default: process.cwd())
   * @returns Absolute path to project root, or null if not found
   */
  static findGitgovRoot(startPath: string = process.cwd()): string | null {
    let currentPath = startPath;

    // First pass: Look for .gitgov (initialized GitGovernance project)
    while (currentPath !== path.parse(currentPath).root) {
      if (existsSync(path.join(currentPath, '.gitgov'))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }

    // Final check at root for .gitgov
    if (existsSync(path.join(currentPath, '.gitgov'))) {
      return currentPath;
    }

    // Second pass: Look for .git (for init command)
    currentPath = startPath;
    while (currentPath !== path.parse(currentPath).root) {
      if (existsSync(path.join(currentPath, '.git'))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }

    // Final check at root for .git
    if (existsSync(path.join(currentPath, '.git'))) {
      return currentPath;
    }

    return null;
  }

  /**
   * Gets the .gitgov directory path from project root
   *
   * [EARS-C1] Returns absolute path for GitGovernance projects
   * [EARS-C2] Throws descriptive Error outside GitGovernance project
   */
  static getGitgovPath(): string {
    const root = FsConfigStore.findGitgovRoot();
    if (!root) {
      throw new Error("Could not find project root. Make sure you are inside a GitGovernance repository.");
    }
    return path.join(root, '.gitgov');
  }

  /**
   * Checks if current directory is a GitGovernance project
   *
   * [EARS-C3] Returns true for GitGovernance projects
   * [EARS-C4] Returns false outside GitGovernance projects
   */
  static isGitgovProject(): boolean {
    try {
      const gitgovPath = FsConfigStore.getGitgovPath();
      return existsSync(gitgovPath);
    } catch {
      return false;
    }
  }

  /**
   * Reset the project root cache.
   * Useful for testing when switching between project contexts.
   */
  static resetCache(): void {
    projectRootCache = null;
    lastSearchPath = null;
  }
}

/**
 * Create a ConfigManager instance for the current project.
 *
 * Factory function that creates a ConfigManager with FsConfigStore backend.
 * Auto-detects project root if not provided.
 *
 * @param projectRoot - Optional project root path (auto-detected if not provided)
 * @returns ConfigManager instance with FsConfigStore backend
 */
export function createConfigManager(projectRoot?: string): ConfigManager {
  const resolvedRoot = projectRoot || FsConfigStore.findProjectRoot() || process.cwd();
  const configStore = new FsConfigStore(resolvedRoot);
  return new ConfigManager(configStore);
}

/**
 * Create a SessionManager instance for the current project.
 *
 * Factory function that creates a SessionManager with FsSessionStore backend.
 * Auto-detects project root if not provided.
 *
 * @param projectRoot - Optional project root path (auto-detected if not provided)
 * @returns SessionManager instance with FsSessionStore backend
 */
export function createSessionManager(projectRoot?: string): SessionManager {
  const resolvedRoot = projectRoot || FsConfigStore.findProjectRoot() || process.cwd();
  const sessionStore = new FsSessionStore(resolvedRoot);
  return new SessionManager(sessionStore);
}

/**
 * Create both ConfigManager and SessionManager for the current project.
 *
 * Convenience factory that creates both managers with Fs backends.
 * Use this when you need access to both config and session.
 *
 * @param projectRoot - Optional project root path (auto-detected if not provided)
 * @returns Object with configManager and sessionManager
 *
 * @example
 * ```typescript
 * const { configManager, sessionManager } = createManagers();
 * const rootCycle = await configManager.getRootCycle();
 * const actorState = await sessionManager.getActorState('human:alice');
 * ```
 */
export function createManagers(projectRoot?: string): {
  configManager: ConfigManager;
  sessionManager: SessionManager;
} {
  const resolvedRoot = projectRoot || FsConfigStore.findProjectRoot() || process.cwd();
  const configStore = new FsConfigStore(resolvedRoot);
  const sessionStore = new FsSessionStore(resolvedRoot);
  return {
    configManager: new ConfigManager(configStore),
    sessionManager: new SessionManager(sessionStore)
  };
}
