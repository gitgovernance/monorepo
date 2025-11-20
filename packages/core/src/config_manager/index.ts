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
  state?: {
    branch?: string;        // Opcional, default: "gitgov-state"
    sync?: {
      strategy?: "manual" | "immediate" | "batched";
      maxRetries?: number;
      pushIntervalSeconds?: number;
      batchIntervalSeconds?: number;
    };
    defaults?: {
      pullScheduler?: {
        defaultIntervalSeconds?: number;
        defaultEnabled?: boolean;
        defaultContinueOnNetworkError?: boolean;
        defaultStopOnConflict?: boolean;
      };
      fileWatcher?: {
        defaultDebounceMs?: number;
        defaultIgnoredPatterns?: string[];
      };
    };
  };
}

/**
 * GitGovernance Session State Types
 * Based on session_state.md blueprint
 */

export interface SyncStatus {
  lastSyncPush?: string; // ISO 8601 timestamp
  lastSyncPull?: string; // ISO 8601 timestamp
  status?: 'synced' | 'pending' | 'pulling' | 'pushing' | 'conflict';
  lastError?: string;
}

export interface ActorState {
  activeTaskId?: string | undefined; // Current task being worked on (undefined = no active task)
  activeCycleId?: string | undefined; // Current cycle being worked on (undefined = no active cycle)
  lastSync?: string;
  syncStatus?: SyncStatus;
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
  syncPreferences?: {
    pullScheduler?: {
      enabled?: boolean;
      pullIntervalSeconds?: number;
      continueOnNetworkError?: boolean;
      stopOnConflict?: boolean;
    };
    fileWatcher?: {
      enabled?: boolean;
      debounceMs?: number;
      ignoredPatterns?: string[];
    };
  };
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

    // Update lastSession if the actor is a human (not an agent)
    // This ensures lastSession reflects the last human interaction with the CLI
    if (actorId.startsWith('human:')) {
      session.lastSession = {
        actorId,
        timestamp: new Date().toISOString()
      };
    }

    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Get cloud session token
   */
  async getCloudSessionToken(): Promise<string | null> {
    const session = await this.loadSession();
    return session?.cloud?.sessionToken || null;
  }

  /**
   * Get complete context information for an actor
   * Useful for agents to understand current working context
   * Returns information from both config.json (project-level) and .session.json (actor-level)
   */
  async getActorContext(actorId: string): Promise<{
    actorId: string;
    activeCycleId: string | null;
    activeTaskId: string | null;
    rootCycle: string | null;
    projectInfo: { id: string; name: string } | null;
    syncStatus: SyncStatus | null;
  }> {
    const [actorState, rootCycle, projectInfo] = await Promise.all([
      this.getActorState(actorId),
      this.getRootCycle(),
      this.getProjectInfo()
    ]);

    return {
      actorId,
      activeCycleId: actorState?.activeCycleId || null,
      activeTaskId: actorState?.activeTaskId || null,
      rootCycle,
      projectInfo,
      syncStatus: actorState?.syncStatus || null
    };
  }

  /**
   * Get sync configuration from config.json
   * Returns sync strategy and related settings with defaults
   */
  async getSyncConfig(): Promise<{
    strategy: "manual" | "immediate" | "batched";
    maxRetries: number;
    pushIntervalSeconds: number;
    batchIntervalSeconds: number;
  } | null> {
    const config = await this.loadConfig();
    if (!config?.state?.sync) return null;

    return {
      strategy: config.state.sync.strategy || "manual",
      maxRetries: config.state.sync.maxRetries || 3,
      pushIntervalSeconds: config.state.sync.pushIntervalSeconds || 30,
      batchIntervalSeconds: config.state.sync.batchIntervalSeconds || 60
    };
  }

  /**
   * Get sync defaults from config.json
   * Returns recommended defaults for pullScheduler and fileWatcher
   */
  async getSyncDefaults(): Promise<{
    pullScheduler: {
      defaultIntervalSeconds: number;
      defaultEnabled: boolean;
      defaultContinueOnNetworkError: boolean;
      defaultStopOnConflict: boolean;
    };
    fileWatcher: {
      defaultDebounceMs: number;
      defaultIgnoredPatterns: string[];
    };
  }> {
    const config = await this.loadConfig();

    return {
      pullScheduler: {
        defaultIntervalSeconds: config?.state?.defaults?.pullScheduler?.defaultIntervalSeconds || 30,
        defaultEnabled: config?.state?.defaults?.pullScheduler?.defaultEnabled || false,
        defaultContinueOnNetworkError: config?.state?.defaults?.pullScheduler?.defaultContinueOnNetworkError ?? true,
        defaultStopOnConflict: config?.state?.defaults?.pullScheduler?.defaultStopOnConflict || false
      },
      fileWatcher: {
        defaultDebounceMs: config?.state?.defaults?.fileWatcher?.defaultDebounceMs || 300,
        defaultIgnoredPatterns: config?.state?.defaults?.fileWatcher?.defaultIgnoredPatterns || ["*.tmp", ".DS_Store", "*.swp"]
      }
    };
  }

  /**
   * Resolve PullScheduler configuration with priority logic:
   * 1. Local preferences (.session.json syncPreferences)
   * 2. Project defaults (config.json state.defaults)
   * 3. Hardcoded fallbacks
   */
  async resolvePullSchedulerConfig(): Promise<{
    enabled: boolean;
    pullIntervalSeconds: number;
    continueOnNetworkError: boolean;
    stopOnConflict: boolean;
  }> {
    const [session, defaults] = await Promise.all([
      this.loadSession(),
      this.getSyncDefaults()
    ]);

    const localPrefs = session?.syncPreferences?.pullScheduler;

    return {
      enabled: localPrefs?.enabled ?? defaults.pullScheduler.defaultEnabled,
      pullIntervalSeconds: localPrefs?.pullIntervalSeconds ?? defaults.pullScheduler.defaultIntervalSeconds,
      continueOnNetworkError: localPrefs?.continueOnNetworkError ?? defaults.pullScheduler.defaultContinueOnNetworkError,
      stopOnConflict: localPrefs?.stopOnConflict ?? defaults.pullScheduler.defaultStopOnConflict
    };
  }

  /**
   * Resolve FileWatcher configuration with priority logic:
   * 1. Local preferences (.session.json syncPreferences)
   * 2. Project defaults (config.json state.defaults)
   * 3. Hardcoded fallbacks
   */
  async resolveFileWatcherConfig(): Promise<{
    enabled: boolean;
    debounceMs: number;
    ignoredPatterns: string[];
  }> {
    const [session, defaults] = await Promise.all([
      this.loadSession(),
      this.getSyncDefaults()
    ]);

    const localPrefs = session?.syncPreferences?.fileWatcher;

    return {
      enabled: localPrefs?.enabled ?? false,
      debounceMs: localPrefs?.debounceMs ?? defaults.fileWatcher.defaultDebounceMs,
      ignoredPatterns: localPrefs?.ignoredPatterns ?? defaults.fileWatcher.defaultIgnoredPatterns
    };
  }

  /**
   * Update sync preferences in .session.json
   * These are local machine preferences that override project defaults
   */
  async updateSyncPreferences(preferences: {
    pullScheduler?: Partial<{
      enabled: boolean;
      pullIntervalSeconds: number;
      continueOnNetworkError: boolean;
      stopOnConflict: boolean;
    }>;
    fileWatcher?: Partial<{
      enabled: boolean;
      debounceMs: number;
      ignoredPatterns: string[];
    }>;
  }): Promise<void> {
    const session = await this.loadSession() || {};

    if (!session.syncPreferences) {
      session.syncPreferences = {};
    }

    if (preferences.pullScheduler) {
      session.syncPreferences.pullScheduler = {
        ...session.syncPreferences.pullScheduler,
        ...preferences.pullScheduler
      };
    }

    if (preferences.fileWatcher) {
      session.syncPreferences.fileWatcher = {
        ...session.syncPreferences.fileWatcher,
        ...preferences.fileWatcher
      };
    }

    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

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
