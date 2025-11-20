/**
 * PullScheduler - Periodic State Synchronization
 *
 * Background scheduler that automatically pulls state changes from remote
 * at configured intervals.
 *
 * @module sync/pull_scheduler
 */

import type { SyncModule } from "./sync_module";
import type { ConfigManager } from "../config_manager";

/**
 * Result of a pull operation executed by the scheduler
 */
export interface PullSchedulerResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Whether new changes were detected */
  hasChanges: boolean;
  /** Whether a conflict was detected */
  conflictDetected: boolean;
  /** Conflict information if applicable */
  conflictInfo?: {
    type: string;
    message: string;
    affectedFiles?: string[];
  };
  /** Timestamp of the operation */
  timestamp: string;
  /** Error if operation failed */
  error?: string;
}

/**
 * Configuration for the PullScheduler
 */
export interface PullSchedulerConfig {
  /** Whether the scheduler is enabled */
  enabled: boolean;
  /** Pull interval in seconds */
  pullIntervalSeconds: number;
  /** Whether to continue after network errors */
  continueOnNetworkError: boolean;
  /** Whether to stop if a conflict is detected */
  stopOnConflict: boolean;
}

/**
 * Dependencies required by PullScheduler
 */
export interface PullSchedulerDependencies {
  /** SyncModule for pull operations */
  syncModule: SyncModule;
  /** ConfigManager for loading configuration */
  configManager: ConfigManager;
}

/**
 * PullScheduler - Automatic background synchronization
 *
 * Periodically pulls state changes from remote to keep local state up-to-date.
 * Useful for collaboration scenarios where multiple actors are working simultaneously.
 *
 * [EARS-33 to EARS-40]
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
  private syncModule: SyncModule;
  private configManager: ConfigManager;
  private config: PullSchedulerConfig;
  private intervalId?: NodeJS.Timeout;
  private running: boolean = false;
  private pulling: boolean = false;

  constructor(dependencies: PullSchedulerDependencies) {
    if (!dependencies.syncModule) {
      throw new Error("SyncModule is required for PullScheduler");
    }
    if (!dependencies.configManager) {
      throw new Error("ConfigManager is required for PullScheduler");
    }

    this.syncModule = dependencies.syncModule;
    this.configManager = dependencies.configManager;

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
      const session = await this.configManager.loadSession();
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
   * [EARS-33, EARS-34]
   *
   * @throws Error if scheduler fails to load configuration
   *
   * @example
   * ```typescript
   * await scheduler.start();
   * // Scheduler now pulls every N seconds
   * ```
   */
  async start(): Promise<void> {
    // [EARS-34] Idempotent - return if already running
    if (this.running) {
      return;
    }

    // Load configuration
    this.config = await this.loadConfig();

    // Check if enabled
    if (!this.config.enabled) {
      return;
    }

    // [EARS-33] Start interval
    this.intervalId = setInterval(() => {
      void this.pullNow(); // Fire and forget
    }, this.config.pullIntervalSeconds * 1000);

    this.running = true;
  }

  /**
   * Stops the scheduler and cleans up resources
   *
   * [EARS-35]
   *
   * @example
   * ```typescript
   * scheduler.stop();
   * // Scheduler is now stopped
   * ```
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
   * [EARS-36]
   *
   * @returns true if running, false otherwise
   *
   * @example
   * ```typescript
   * if (scheduler.isRunning()) {
   *   console.log("Scheduler is active");
   * }
   * ```
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
   * [EARS-37, EARS-38, EARS-39, EARS-40]
   *
   * @returns Result of the pull operation
   *
   * @example
   * ```typescript
   * const result = await scheduler.pullNow();
   * if (result.hasChanges) {
   *   console.log("New changes detected");
   * }
   * ```
   */
  async pullNow(): Promise<PullSchedulerResult> {
    // [EARS-40] Prevent concurrent pulls
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

      // [EARS-37] Detect changes
      const hasChanges = pullResult.reindexed || false;

      // [EARS-38] Detect conflicts
      if (pullResult.conflictDetected) {
        const result: PullSchedulerResult = {
          success: false,
          hasChanges: false,
          conflictDetected: true,
          timestamp: new Date().toISOString(),
          ...(pullResult.conflictInfo && { conflictInfo: pullResult.conflictInfo }),
        };

        // Stop scheduler if configured to do so
        if (this.config.stopOnConflict) {
          this.stop();
        }

        return result;
      }

      // Success
      return {
        success: true,
        hasChanges,
        conflictDetected: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // [EARS-39] Handle network errors
      const errorMessage = error instanceof Error ? error.message : String(error);
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

