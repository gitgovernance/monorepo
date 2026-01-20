/**
 * FsConfigStore - Filesystem implementation of ConfigStore
 *
 * Handles persistence of config.json and .session.json to the local filesystem.
 * Also provides static utility methods for project root detection.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { existsSync } from 'fs';
import type { ConfigStore } from '../config_store';
import type { GitGovConfig, GitGovSession } from '../../config_manager';

// Project root cache for performance
let projectRootCache: string | null = null;
let lastSearchPath: string | null = null;

/**
 * Filesystem-based ConfigStore implementation.
 *
 * Stores configuration in .gitgov/config.json and session in .gitgov/.session.json.
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
  private configPath: string;
  private sessionPath: string;
  private actorsPath: string;

  constructor(projectRootPath: string) {
    this.configPath = path.join(projectRootPath, '.gitgov', 'config.json');
    this.sessionPath = path.join(projectRootPath, '.gitgov', '.session.json');
    this.actorsPath = path.join(projectRootPath, '.gitgov', 'actors');
  }

  /**
   * Load project configuration from .gitgov/config.json
   *
   * [EARS-1] Returns complete GitGovConfig for valid files
   * [EARS-2] Returns null for non-existent files (fail-safe)
   * [EARS-3] Returns null for invalid JSON (graceful degradation)
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as GitGovConfig;

      // Optional validation: Warn if rootCycle doesn't match expected format
      if (config.rootCycle && !/^\d+-cycle-[a-z0-9-]+$/.test(config.rootCycle)) {
        console.warn(
          `⚠️  Warning: rootCycle "${config.rootCycle}" doesn't match expected format ` +
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

  /**
   * Load local session from .gitgov/.session.json
   *
   * [EARS-7] Returns complete GitGovSession for valid files
   * [EARS-8] Returns null for non-existent files (fail-safe)
   */
  async loadSession(): Promise<GitGovSession | null> {
    try {
      const sessionContent = await fs.readFile(this.sessionPath, 'utf-8');
      return JSON.parse(sessionContent) as GitGovSession;
    } catch (error) {
      // Session file doesn't exist or is invalid - fail-safe behavior
      return null;
    }
  }

  /**
   * Save local session to .gitgov/.session.json
   */
  async saveSession(session: GitGovSession): Promise<void> {
    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Detect actor from .key files in .gitgov/actors/
   *
   * [EARS-53] Auto-detects actor from private key files.
   * Returns the actor ID if .key files exist, or null otherwise.
   *
   * @returns Actor ID (e.g., "human:camilo-v2") or null
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.actorsPath);

      // Find all .key files
      const keyFiles = files.filter(f => f.endsWith('.key'));

      // Get first .key file
      const firstKeyFile = keyFiles[0];
      if (!firstKeyFile) {
        return null;
      }

      // Extract actor ID from filename (remove .key extension)
      // e.g., "human:camilo-v2.key" -> "human:camilo-v2"
      const actorId = firstKeyFile.replace('.key', '');
      return actorId;
    } catch {
      // Directory doesn't exist or can't be read
      return null;
    }
  }

  // ==================== Static Utility Methods ====================
  // These implement ProjectRootFinder interface as static methods

  /**
   * Finds the project root by searching upwards for a .git directory.
   * Caches the result for subsequent calls.
   *
   * [EARS-15] Returns absolute path for directories within Git project
   * [EARS-16] Returns null for directories outside Git project
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
   * [EARS-17] Returns absolute path for GitGovernance projects
   * [EARS-18] Throws descriptive Error outside GitGovernance project
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
   * [EARS-19] Returns true for GitGovernance projects
   * [EARS-20] Returns false outside GitGovernance projects
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
