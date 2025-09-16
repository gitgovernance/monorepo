import { promises as fs } from 'fs';
import * as path from 'path';
import { existsSync } from 'fs';

// Project root cache for performance
let projectRoot: string | null = null;
let lastSearchPath: string | null = null;

/**
 * GitGovernance Configuration Types
 * Based on config_file.md blueprint
 */

export interface GitGovConfig {
  protocolVersion: string;  // Obligatorio según config_file.md
  projectId: string;        // Obligatorio según config_file.md
  projectName: string;      // Obligatorio según config_file.md
  rootCycle: string;        // Obligatorio: ID del ciclo raíz (creado durante 'gitgov init')
  blueprints?: {
    root?: string;          // Opcional, default: "./blueprints"
  };
  state?: {
    branch?: string;        // Opcional, default: "gitgov-state"
  };
  cloud?: {
    projectId?: string;     // Opcional, para SaaS integration
    providerMappings?: Record<string, string>; // Opcional
  };
}

/**
 * GitGovernance Session State Types
 * Based on session_state.md blueprint
 */

export interface ActorState {
  activeTaskId?: string;
  activeCycleId?: string;
  lastSync?: string;
  [key: string]: any; // Allow additional actor-specific state
}

export interface GitGovSession {
  cloud?: {
    sessionToken?: string;
  };
  lastSession?: {
    actorId: string;
    timestamp: string;
  };
  actorState?: Record<string, ActorState>;
}

/**
 * Configuration Manager Class
 * Provides typed access to GitGovernance configuration and session state
 */
export class ConfigManager {
  private configPath: string;
  private sessionPath: string;

  constructor(projectRootPath: string = ConfigManager.findProjectRoot() || process.cwd()) {
    this.configPath = path.join(projectRootPath, '.gitgov', 'config.json');
    this.sessionPath = path.join(projectRootPath, '.gitgov', '.session.json');
  }

  /**
   * Load GitGovernance configuration
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(configContent) as GitGovConfig;
    } catch (error) {
      // Config file doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Load GitGovernance session state
   */
  async loadSession(): Promise<GitGovSession | null> {
    try {
      const sessionContent = await fs.readFile(this.sessionPath, 'utf-8');
      return JSON.parse(sessionContent) as GitGovSession;
    } catch (error) {
      // Session file doesn't exist or is invalid
      return null;
    }
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
   * Get actor state for a specific actor
   */
  async getActorState(actorId: string): Promise<ActorState | null> {
    const session = await this.loadSession();
    return session?.actorState?.[actorId] || null;
  }

  /**
   * Update actor state for a specific actor
   */
  async updateActorState(actorId: string, state: Partial<ActorState>): Promise<void> {
    const session = await this.loadSession() || {};
    if (!session.actorState) session.actorState = {};

    session.actorState[actorId] = {
      ...session.actorState[actorId],
      ...state,
      lastSync: new Date().toISOString()
    };

    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Get cloud session token
   */
  async getCloudSessionToken(): Promise<string | null> {
    const session = await this.loadSession();
    return session?.cloud?.sessionToken || null;
  }

  // --- Static Utility Methods (consolidated from project-utils) ---

  /**
   * Finds the project root by searching upwards for a .git directory.
   * Caches the result for subsequent calls.
   * @param startPath The path to start searching from. Defaults to the current working directory.
   * @returns The absolute path to the project root, or null if not found.
   */
  static findProjectRoot(startPath: string = process.cwd()): string | null {
    // In test environment, allow cache reset via global
    if (typeof (global as any).projectRoot !== 'undefined' && (global as any).projectRoot === null) {
      projectRoot = null;
      lastSearchPath = null;
    }

    // Reset cache if we're searching from a different directory
    if (lastSearchPath && lastSearchPath !== startPath) {
      projectRoot = null;
      lastSearchPath = null;
    }

    if (projectRoot && lastSearchPath === startPath) {
      return projectRoot;
    }

    // Update last search path
    lastSearchPath = startPath;

    let currentPath = startPath;
    // Prevent infinite loop by stopping at the filesystem root
    while (currentPath !== path.parse(currentPath).root) {
      if (existsSync(path.join(currentPath, '.git'))) {
        projectRoot = currentPath;
        return projectRoot;
      }
      currentPath = path.dirname(currentPath);
    }

    // Final check at the root directory
    if (existsSync(path.join(currentPath, '.git'))) {
      projectRoot = currentPath;
      return projectRoot;
    }

    return null;
  }

  /**
   * Finds the appropriate project root by searching upwards.
   * First looks for .gitgov (initialized project), then .git (for init).
   * @param startPath The path to start searching from. Defaults to the current working directory.
   * @returns The absolute path to the project root, or null if not found.
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
   */
  static getGitgovPath(): string {
    const root = ConfigManager.findGitgovRoot();
    if (!root) {
      throw new Error("Could not find project root. Make sure you are inside a GitGovernance repository.");
    }
    return path.join(root, '.gitgov');
  }

  /**
   * Checks if current directory is a GitGovernance project
   */
  static isGitgovProject(): boolean {
    try {
      const gitgovPath = ConfigManager.getGitgovPath();
      return existsSync(gitgovPath);
    } catch {
      return false;
    }
  }
}

/**
 * Create a ConfigManager instance for the current project
 */
export function createConfigManager(projectRoot?: string): ConfigManager {
  return new ConfigManager(projectRoot);
}
