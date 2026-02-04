/**
 * FsConfigStore - Filesystem implementation of ConfigStore
 *
 * Handles persistence of config.json to the local filesystem.
 *
 * NOTE: Session state (.session.json) is handled by FsSessionStore.
 * NOTE: Project discovery utilities are in src/utils/project_discovery.ts
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { ConfigStore } from '../config_store';
import type { GitGovConfig } from '../../config_manager/config_manager.types';
import { ConfigManager } from '../../config_manager/config_manager';

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

      // [EARS-A5] Warn if rootCycle doesn't match expected format
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
   *
   * [EARS-A4] Writes config with JSON indentation
   */
  async saveConfig(config: GitGovConfig): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

/**
 * Create a ConfigManager instance for a project.
 *
 * [EARS-B1] Factory function that creates a ConfigManager with FsConfigStore backend.
 * Use this when you already have the projectRoot (e.g., from DI container).
 *
 * @param projectRoot - Absolute path to project root (REQUIRED)
 * @returns ConfigManager instance with FsConfigStore backend
 */
export function createConfigManager(projectRoot: string): ConfigManager {
  const configStore = new FsConfigStore(projectRoot);
  return new ConfigManager(configStore);
}
