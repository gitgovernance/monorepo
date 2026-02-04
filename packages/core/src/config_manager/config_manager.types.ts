/**
 * ConfigManager Types
 */

/**
 * GitGovernance Configuration
 * Based on config_file.md blueprint
 */
export type GitGovConfig = {
  protocolVersion: string;
  projectId: string;
  projectName: string;
  rootCycle: string;
  state?: {
    branch?: string;
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
      lastFullAuditCommit?: string;
      lastFullAuditTimestamp?: string;
      lastFullAuditFindingsCount?: number;
    };
  };
};

/**
 * Audit state stored in config.json for incremental mode
 */
export type AuditState = {
  lastFullAuditCommit: string | null;
  lastFullAuditTimestamp: string | null;
  lastFullAuditFindingsCount: number | null;
};

/**
 * Sync configuration from config.json
 */
export type SyncConfig = {
  strategy: "manual" | "immediate" | "batched";
  maxRetries: number;
  pushIntervalSeconds: number;
  batchIntervalSeconds: number;
};

/**
 * Sync defaults from config.json
 */
export type SyncDefaults = {
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
};

/**
 * Audit state update payload
 */
export type AuditStateUpdate = {
  lastFullAuditCommit: string;
  lastFullAuditTimestamp: string;
  lastFullAuditFindingsCount: number;
};

/**
 * IConfigManager interface
 *
 * Provides typed access to GitGovernance project configuration.
 * Configuration is versioned in Git and shared between collaborators.
 */
export interface IConfigManager {
  /**
   * Load GitGovernance configuration
   */
  loadConfig(): Promise<GitGovConfig | null>;

  /**
   * Get root cycle from configuration
   */
  getRootCycle(): Promise<string | null>;

  /**
   * Get project information from configuration
   */
  getProjectInfo(): Promise<{ id: string; name: string } | null>;

  /**
   * Get sync configuration from config.json
   * Returns sync strategy and related settings with defaults
   */
  getSyncConfig(): Promise<SyncConfig | null>;

  /**
   * Get sync defaults from config.json
   * Returns recommended defaults for pullScheduler and fileWatcher
   */
  getSyncDefaults(): Promise<SyncDefaults>;

  /**
   * Get audit state from config.json
   * Returns last full audit commit and timestamp for incremental mode
   */
  getAuditState(): Promise<AuditState>;

  /**
   * Update audit state in config.json after a full audit
   * This is used to enable incremental audits
   */
  updateAuditState(auditState: AuditStateUpdate): Promise<void>;

  /**
   * Get state branch name from configuration
   */
  getStateBranch(): Promise<string>;
}
