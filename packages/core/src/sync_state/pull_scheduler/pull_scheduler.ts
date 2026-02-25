/**
 * PullScheduler - Periodic State Synchronization
 *
 * Background scheduler that automatically pulls state changes from remote
 * at configured intervals.
 *
 * All EARS prefixes map to pull_scheduler_module.md
 *
 * @module sync_state/pull_scheduler
 */

import type { ISyncStateModule } from "../sync_state";
import type { ConfigManager } from "../../config_manager/config_manager";
import type { SessionManager } from "../../session_manager/session_manager";
import type { ConflictInfo } from "../sync_state.types";
import type { IEventStream } from "../../event_bus";
import type { Logger } from "../../logger";

/**
 * Result of a pull operation executed by the scheduler
 */
export type PullSchedulerResult = {
  /** Whether the operation was successful */
  success: boolean;
  /** Whether new changes were detected */
  hasChanges: boolean;
  /** Whether a conflict was detected */
  conflictDetected: boolean;
  /** Conflict information if applicable */
  conflictInfo?: ConflictInfo;
  /** Timestamp of the operation */
  timestamp: string;
  /** Error if operation failed */
  error?: string;
};

/**
 * Configuration for the PullScheduler
 */
export type PullSchedulerConfig = {
  /** Whether the scheduler is enabled */
  enabled: boolean;
  /** Pull interval in seconds */
  pullIntervalSeconds: number;
  /** Whether to continue after network errors */
  continueOnNetworkError: boolean;
  /** Whether to stop if a conflict is detected */
  stopOnConflict: boolean;
};

/**
 * Dependencies required by PullScheduler
 */
export type PullSchedulerDependencies = {
  /** ISyncStateModule for pull operations */
  syncModule: ISyncStateModule;
  /** ConfigManager for loading project configuration */
  configManager: ConfigManager;
  /** SessionManager for loading session preferences */
  sessionManager: SessionManager;
  /** Logger for event registration (optional) */
  logger?: Logger;
  /** EventBus for emitting events (optional) */
  eventBus?: IEventStream;
};

/**
 * PullScheduler - Automatic background synchronization
 *
 * Periodically pulls state changes from remote to keep local state up-to-date.
 * Useful for collaboration scenarios where multiple actors are working simultaneously.
 *
 * [EARS-PS-A1 to EARS-PS-B4]
 *
 * @example
 * ```typescript
 * const scheduler = new PullScheduler({
 *   syncModule,
 *   configManager
 * });
 *
 * await scheduler.start(); // Start periodic pulling
 * // ... scheduler runs in background ...
 * scheduler.stop(); // Stop scheduler
 * ```
 */
export class PullScheduler {
  private syncModule: ISyncStateModule;
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private logger: Logger | undefined;
  private eventBus: IEventStream | undefined;
  private config: PullSchedulerConfig;
  private intervalId?: NodeJS.Timeout;
  private running: boolean = false;
  private pulling: boolean = false;

  constructor(dependencies: PullSchedulerDependencies) {
    if (!dependencies.syncModule) {
      throw new Error("ISyncStateModule is required for PullScheduler");
    }
    if (!dependencies.configManager) {
      throw new Error("ConfigManager is required for PullScheduler");
    }
    if (!dependencies.sessionManager) {
      throw new Error("SessionManager is required for PullScheduler");
    }

    this.syncModule = dependencies.syncModule;
    this.configManager = dependencies.configManager;
    this.sessionManager = dependencies.sessionManager;
    this.logger = dependencies.logger;
    this.eventBus = dependencies.eventBus;

    // Default configuration (will be loaded lazily in start())
    this.config = {
      enabled: false,
      pullIntervalSeconds: 30,
      continueOnNetworkError: true,
      stopOnConflict: false,
    };
  }

  /**
   * Loads configuration from ConfigManager with cascade merge:
   * 1. Local preferences in .session.json (highest priority)
   * 2. Project defaults in config.json
   * 3. Hardcoded defaults (fallback)
   */
  private async loadConfig(): Promise<PullSchedulerConfig> {
    try {
      // Load project defaults from config.json
      const projectConfig = await this.configManager.loadConfig();
      const projectDefaults = projectConfig?.state?.defaults?.pullScheduler ?? {};

      // Load local preferences from .session.json
      const session = await this.sessionManager.loadSession();
      const localPreferences = session?.syncPreferences?.pullScheduler ?? {};

      // Merge with cascade priority
      return {
        enabled:
          localPreferences.enabled ?? projectDefaults.defaultEnabled ?? false,
        pullIntervalSeconds:
          localPreferences.pullIntervalSeconds ??
          projectDefaults.defaultIntervalSeconds ??
          30,
        continueOnNetworkError:
          localPreferences.continueOnNetworkError ??
          projectDefaults.defaultContinueOnNetworkError ??
          true,
        stopOnConflict:
          localPreferences.stopOnConflict ??
          projectDefaults.defaultStopOnConflict ??
          false,
      };
    } catch {
      // If config loading fails, return defaults
      return {
        enabled: false,
        pullIntervalSeconds: 30,
        continueOnNetworkError: true,
        stopOnConflict: false,
      };
    }
  }

  /**
   * Starts the scheduler with configured interval
   *
   * [EARS-PS-A1, EARS-PS-A2]
   *
   * @throws Error if scheduler fails to load configuration
   */
  async start(): Promise<void> {
    // [EARS-PS-A2] Idempotent - return if already running
    if (this.running) {
      return;
    }

    // Load configuration
    this.config = await this.loadConfig();

    // Check if enabled
    if (!this.config.enabled) {
      return;
    }

    // [EARS-PS-A1] Start interval
    this.intervalId = setInterval(() => {
      void this.pullNow(); // Fire and forget
    }, this.config.pullIntervalSeconds * 1000);

    this.running = true;
  }

  /**
   * Stops the scheduler and cleans up resources
   *
   * [EARS-PS-A3]
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
    }

    this.running = false;
  }

  /**
   * Checks if the scheduler is currently running
   *
   * [EARS-PS-A4]
   *
   * @returns true if running, false otherwise
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Executes a pull operation immediately
   *
   * This method can be called manually or is automatically invoked by the scheduler.
   * Handles conflicts, network errors, and concurrent pull prevention.
   *
   * [EARS-PS-B1, EARS-PS-B2, EARS-PS-B3, EARS-PS-B4]
   *
   * @returns Result of the pull operation
   */
  async pullNow(): Promise<PullSchedulerResult> {
    // [EARS-PS-B4] Prevent concurrent pulls
    if (this.pulling) {
      return {
        success: true,
        hasChanges: false,
        conflictDetected: false,
        timestamp: new Date().toISOString(),
        error: "Pull already in progress",
      };
    }

    this.pulling = true;

    try {
      // Execute pull
      const pullResult = await this.syncModule.pullState();

      // [EARS-PS-B1] Detect changes
      const hasChanges = pullResult.hasChanges || false;

      // [EARS-PS-B2] Detect conflicts
      if (pullResult.conflictDetected) {
        const result: PullSchedulerResult = {
          success: false,
          hasChanges: false,
          conflictDetected: true,
          timestamp: new Date().toISOString(),
          ...(pullResult.conflictInfo && { conflictInfo: pullResult.conflictInfo }),
        };

        // [EARS-PS-B2] Emit conflict event
        this.eventBus?.publish({
          type: 'conflict.detected',
          timestamp: Date.now(),
          payload: { conflictInfo: pullResult.conflictInfo },
          source: 'pull_scheduler',
        });

        // Stop scheduler if configured to do so
        if (this.config.stopOnConflict) {
          this.stop();
        }

        return result;
      }

      // [EARS-PS-B1] Emit state.updated event if changes detected
      if (hasChanges) {
        this.eventBus?.publish({
          type: 'state.updated',
          timestamp: Date.now(),
          payload: { hasChanges },
          source: 'pull_scheduler',
        });
      }

      // Success
      return {
        success: true,
        hasChanges,
        conflictDetected: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // [EARS-PS-B3] Handle network errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      // [EARS-PS-B3] Log error
      this.logger?.error(`PullScheduler error: ${errorMessage}`);

      const isNetworkError =
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("connection");

      // Continue if configured to do so
      if (isNetworkError && this.config.continueOnNetworkError) {
        return {
          success: false,
          hasChanges: false,
          conflictDetected: false,
          timestamp: new Date().toISOString(),
          error: errorMessage,
        };
      }

      // Re-throw non-recoverable errors
      throw error;
    } finally {
      this.pulling = false;
    }
  }
}
