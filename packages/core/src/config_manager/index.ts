/**
 * ConfigManager - Configuration and Session Manager
 *
 * Provides typed access to GitGovernance configuration and session state.
 * Uses ConfigStore abstraction for backend-agnostic persistence.
 *
 * @see packages/blueprints/03_products/core/specs/modules/config_session_module.md
 */

import type { ConfigStore } from '../store/config_store';
import { FsConfigStore } from '../store/fs/config_store';

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
    audit?: {
      /** Commit SHA of last full audit (for incremental mode) */
      lastFullAuditCommit?: string;
      /** ISO 8601 timestamp of last full audit */
      lastFullAuditTimestamp?: string;
      /** Number of findings in last full audit */
      lastFullAuditFindingsCount?: number;
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

/**
 * Audit state stored in config.json for incremental mode
 */
export interface AuditState {
  lastFullAuditCommit: string | null;
  lastFullAuditTimestamp: string | null;
  lastFullAuditFindingsCount: number | null;
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
 *
 * Provides typed access to GitGovernance configuration and session state.
 * Uses ConfigStore abstraction for backend-agnostic persistence (filesystem, memory, etc.).
 *
 * @example
 * ```typescript
 * // Production usage (uses FsConfigStore internally)
 * const manager = createConfigManager();
 * const config = await manager.loadConfig();
 *
 * // Test usage with MemoryConfigStore
 * const store = new MemoryConfigStore();
 * store.setConfig({ ... });
 * const manager = new ConfigManager(store);
 * ```
 */
export class ConfigManager {
  private readonly configStore: ConfigStore;

  /**
   * Create a ConfigManager with a ConfigStore backend.
   *
   * @param configStore - Store implementation for config/session persistence (REQUIRED)
   */
  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Load GitGovernance configuration
   */
  async loadConfig(): Promise<GitGovConfig | null> {
    return this.configStore.loadConfig();
  }

  /**
   * Load GitGovernance session state
   * [EARS-B9] Auto-detects actor from .key files if no session or no actorId exists
   */
  async loadSession(): Promise<GitGovSession | null> {
    let session = await this.configStore.loadSession();

    // [EARS-B9] If session exists but no lastSession.actorId, try to auto-detect
    if (session && !session.lastSession?.actorId) {
      const detectedActorId = await this.detectActorFromKeyFiles();
      if (detectedActorId) {
        session.lastSession = {
          actorId: detectedActorId,
          timestamp: new Date().toISOString()
        };
        // Save the auto-detected session
        await this.configStore.saveSession(session);
      }
    }

    // [EARS-B9] If no session, try to create from .key files
    if (!session) {
      const detectedActorId = await this.detectActorFromKeyFiles();
      if (detectedActorId) {
        const newSession: GitGovSession = {
          lastSession: {
            actorId: detectedActorId,
            timestamp: new Date().toISOString()
          },
          actorState: {}
        };
        // Save the auto-detected session
        try {
          await this.configStore.saveSession(newSession);
          return newSession;
        } catch {
          // Failed to save, return the session anyway
          return newSession;
        }
      }
    }

    return session;
  }

  /**
   * [EARS-B9] Detect actor from .key files in .gitgov/actors/
   * Returns the actor ID if .key files exist, or null otherwise.
   * Private keys (.key files) indicate which actors can sign on this machine.
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    if (this.configStore.detectActorFromKeyFiles) {
      return this.configStore.detectActorFromKeyFiles();
    }
    return null;
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

    await this.configStore.saveSession(session);
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

    await this.configStore.saveSession(session);
  }

  /**
   * Get audit state from config.json
   * Returns last full audit commit and timestamp for incremental mode
   */
  async getAuditState(): Promise<AuditState> {
    const config = await this.loadConfig();
    return {
      lastFullAuditCommit: config?.state?.audit?.lastFullAuditCommit || null,
      lastFullAuditTimestamp: config?.state?.audit?.lastFullAuditTimestamp || null,
      lastFullAuditFindingsCount: config?.state?.audit?.lastFullAuditFindingsCount ?? null
    };
  }

  /**
   * Update audit state in config.json after a full audit
   * This is used to enable incremental audits
   */
  async updateAuditState(auditState: {
    lastFullAuditCommit: string;
    lastFullAuditTimestamp: string;
    lastFullAuditFindingsCount: number;
  }): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('Cannot update audit state: config.json not found');
    }

    if (!config.state) {
      config.state = {};
    }

    config.state.audit = {
      lastFullAuditCommit: auditState.lastFullAuditCommit,
      lastFullAuditTimestamp: auditState.lastFullAuditTimestamp,
      lastFullAuditFindingsCount: auditState.lastFullAuditFindingsCount
    };

    await this.configStore.saveConfig(config);
  }

  // ==================== Static Utility Methods ====================
  // These delegate to FsConfigStore for backward compatibility

  /**
   * Finds the project root by searching upwards for a .git directory.
   * Caches the result for subsequent calls.
   * @param startPath The path to start searching from. Defaults to the current working directory.
   * @returns The absolute path to the project root, or null if not found.
   */
  static findProjectRoot(startPath: string = process.cwd()): string | null {
    return FsConfigStore.findProjectRoot(startPath);
  }

  /**
   * Finds the appropriate project root by searching upwards.
   * First looks for .gitgov (initialized project), then .git (for init).
   * @param startPath The path to start searching from. Defaults to the current working directory.
   * @returns The absolute path to the project root, or null if not found.
   */
  static findGitgovRoot(startPath: string = process.cwd()): string | null {
    return FsConfigStore.findGitgovRoot(startPath);
  }

  /**
   * Gets the .gitgov directory path from project root
   */
  static getGitgovPath(): string {
    return FsConfigStore.getGitgovPath();
  }

  /**
   * Checks if current directory is a GitGovernance project
   */
  static isGitgovProject(): boolean {
    return FsConfigStore.isGitgovProject();
  }
}

/**
 * Create a ConfigManager instance for the current project.
 *
 * This factory function provides backward compatibility by automatically
 * creating an FsConfigStore for filesystem-based persistence.
 *
 * @param projectRoot - Optional project root path (for testing)
 * @returns ConfigManager instance with FsConfigStore backend
 *
 * @example
 * ```typescript
 * // Production usage
 * const manager = createConfigManager();
 *
 * // Testing with custom project root
 * const manager = createConfigManager('/tmp/test-project');
 * ```
 */
export function createConfigManager(projectRoot?: string): ConfigManager {
  const resolvedRoot = projectRoot || ConfigManager.findProjectRoot() || process.cwd();
  const configStore = new FsConfigStore(resolvedRoot);
  return new ConfigManager(configStore);
}
