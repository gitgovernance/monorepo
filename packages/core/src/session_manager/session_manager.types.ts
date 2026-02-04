/**
 * SessionManager Types
 */

/**
 * Sync status for an actor's synchronization state.
 */
export type SyncStatus = {
  lastSyncPush?: string; // ISO 8601 timestamp
  lastSyncPull?: string; // ISO 8601 timestamp
  status?: 'synced' | 'pending' | 'pulling' | 'pushing' | 'conflict';
  lastError?: string;
};

/**
 * State for a specific actor on this machine.
 */
export type ActorState = {
  activeTaskId?: string | undefined;
  activeCycleId?: string | undefined;
  lastSync?: string;
  syncStatus?: SyncStatus;
  [key: string]: unknown;
};

/**
 * GitGovernance Session State
 * Based on session_state.md blueprint
 */
export type GitGovSession = {
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
};

/**
 * Sync preferences update payload
 */
export type SyncPreferencesUpdate = {
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
};

/**
 * ISessionManager interface
 *
 * Provides typed access to GitGovernance session state.
 * Session state is ephemeral, machine-local, and NOT versioned in Git.
 */
export interface ISessionManager {
  /**
   * Load GitGovernance session state
   * [EARS-B9] Auto-detects actor from .key files if no session or no actorId exists
   */
  loadSession(): Promise<GitGovSession | null>;

  /**
   * [EARS-B9] Detect actor from .key files in .gitgov/actors/
   */
  detectActorFromKeyFiles(): Promise<string | null>;

  /**
   * Get actor state for a specific actor
   */
  getActorState(actorId: string): Promise<ActorState | null>;

  /**
   * Update actor state for a specific actor
   */
  updateActorState(actorId: string, state: Partial<ActorState>): Promise<void>;

  /**
   * Get cloud session token
   */
  getCloudSessionToken(): Promise<string | null>;

  /**
   * Get sync preferences from session
   */
  getSyncPreferences(): Promise<GitGovSession['syncPreferences'] | null>;

  /**
   * Update sync preferences in .session.json
   * These are local machine preferences that override project defaults
   */
  updateSyncPreferences(preferences: SyncPreferencesUpdate): Promise<void>;

  /**
   * Get last session info (last human who interacted)
   */
  getLastSession(): Promise<{ actorId: string; timestamp: string } | null>;
}
