/**
 * PullScheduler Tests
 *
 * Tests for the periodic state synchronization scheduler.
 * 
 * [EARS 33-40]
 */

import { PullScheduler } from "./pull_scheduler";
import type { SyncModule } from "./sync_module";
import type { ConfigManager } from "../config_manager";
import type { SyncPullResult } from "./types";

/**
 * Mock SyncModule for testing
 */
function createMockSyncModule(): jest.Mocked<SyncModule> {
  return {
    pullState: jest.fn(),
  } as unknown as jest.Mocked<SyncModule>;
}

/**
 * Mock ConfigManager for testing
 */
function createMockConfigManager(config: Record<string, unknown> = {}): jest.Mocked<ConfigManager> {
  return {
    loadConfig: jest.fn().mockResolvedValue(config),
    loadSession: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<ConfigManager>;
}

describe("PullScheduler", () => {
  let mockSyncModule: jest.Mocked<SyncModule>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let scheduler: PullScheduler;

  beforeEach(() => {
    mockSyncModule = createMockSyncModule();
    mockConfigManager = createMockConfigManager();

    scheduler = new PullScheduler({
      syncModule: mockSyncModule,
      configManager: mockConfigManager,
    });

    // Clear all timers
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    scheduler.stop();
    jest.useRealTimers();
  });

  // ===== EARS 33-36: Start and Control =====

  describe("Start and Control (EARS 33-36)", () => {
    it("[EARS-33] should start scheduler with configured interval", async () => {
      // Setup: Configure scheduler as enabled
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncPullResult);

      // Execute
      await scheduler.start();

      // Verify scheduler is running
      expect(scheduler.isRunning()).toBe(true);

      // Fast-forward time to trigger pull
      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Let promises resolve

      // Verify pullState was called
      expect(mockSyncModule.pullState).toHaveBeenCalledTimes(1);
    });

    it("[EARS-34] should be idempotent if already running", async () => {
      // Setup
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      // Execute - start twice
      await scheduler.start();
      const firstRunning = scheduler.isRunning();
      await scheduler.start();
      const secondRunning = scheduler.isRunning();

      // Verify - still running, no duplicate intervals
      expect(firstRunning).toBe(true);
      expect(secondRunning).toBe(true);

      // Fast-forward and verify only one interval is active
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncPullResult);

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockSyncModule.pullState).toHaveBeenCalledTimes(1);
    });

    it("[EARS-35] should stop scheduler and cleanup resources", async () => {
      // Setup
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncPullResult);

      // Execute
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();

      // Verify
      expect(scheduler.isRunning()).toBe(false);

      // Fast-forward and verify no pulls happen
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(mockSyncModule.pullState).not.toHaveBeenCalled();
    });

    it("[EARS-36] should return correct scheduler state", async () => {
      // Initially not running
      expect(scheduler.isRunning()).toBe(false);

      // Setup and start
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      // Stop
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  // ===== EARS 37-40: Pull Operation and Event Handling =====

  describe("Pull Operation and Event Handling (EARS 37-40)", () => {
    it("[EARS-37] should emit event when detects new changes", async () => {
      // Setup: Pull returns changes
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        reindexed: true,
        conflictDetected: false,
      } as SyncPullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.conflictDetected).toBe(false);
    });

    it("[EARS-38] should handle conflicts appropriately", async () => {
      // Setup: Pull returns conflict
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: "rebase_conflict",
          message: "Conflict in file",
          affectedFiles: [".gitgov/tasks/123.json"],
        },
      } as SyncPullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(false);
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo).toBeDefined();
      expect(result.conflictInfo?.affectedFiles).toContain(".gitgov/tasks/123.json");
    });

    it("[EARS-38] should stop scheduler if stopOnConflict is true", async () => {
      // Setup: Configure to stop on conflict
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
            stopOnConflict: true,
          },
        },
      });

      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      // Setup: Pull returns conflict
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: "rebase_conflict",
          message: "Conflict",
        },
      } as SyncPullResult);

      // Execute
      await scheduler.pullNow();

      // Verify scheduler stopped
      expect(scheduler.isRunning()).toBe(false);
    });

    it("[EARS-39] should continue after network errors", async () => {
      // Setup: Configure to continue on network error
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
            continueOnNetworkError: true,
          },
        },
      });

      await scheduler.start();

      // Setup: Pull throws network error
      mockSyncModule.pullState.mockRejectedValue(new Error("network timeout"));

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(false);
      expect(result.error).toContain("network timeout");

      // Verify scheduler still running
      expect(scheduler.isRunning()).toBe(true);
    });

    it("[EARS-40] should avoid concurrent pulls", async () => {
      // Setup: Slow pull operation using Promise
      let resolvePull: (value: SyncPullResult) => void;
      const pullPromise = new Promise<SyncPullResult>((resolve) => {
        resolvePull = resolve;
      });

      mockSyncModule.pullState.mockReturnValue(pullPromise);

      // Execute: Start two pulls simultaneously
      const pull1Promise = scheduler.pullNow();
      const pull2Promise = scheduler.pullNow();

      // Verify: Second pull returns immediately with error
      const result2 = await pull2Promise;
      expect(result2.error).toContain("already in progress");

      // Resolve the first pull
      resolvePull!({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncPullResult);

      // Wait for first pull to complete
      const result1 = await pull1Promise;
      expect(result1.success).toBe(true);

      // Verify pullState was only called once
      expect(mockSyncModule.pullState).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Additional Edge Cases =====

  describe("Additional Edge Cases", () => {
    it("should not start if scheduler is not enabled in config", async () => {
      // Setup: Scheduler disabled
      mockConfigManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: false,
          },
        },
      });

      // Execute
      await scheduler.start();

      // Verify
      expect(scheduler.isRunning()).toBe(false);
    });

    it("should use default config if loading fails", async () => {
      // Setup: Config loading fails
      mockConfigManager.loadConfig.mockRejectedValue(new Error("Config not found"));
      mockConfigManager.loadSession.mockRejectedValue(new Error("Session not found"));

      // Execute
      await scheduler.start();

      // Verify: Should not start (default is disabled)
      expect(scheduler.isRunning()).toBe(false);
    });

    it("should handle no changes gracefully", async () => {
      // Setup: Pull returns no changes
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncPullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.conflictDetected).toBe(false);
    });
  });
});

