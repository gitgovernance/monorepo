/**
 * PullScheduler Tests
 *
 * Tests for the periodic state synchronization scheduler.
 * 
 * [EARS-F1 to F8]
 */

import { PullScheduler } from "./pull_scheduler";
import type { FsSyncStateModule } from "./fs/fs_sync_state";
import type { ConfigManager } from "../config_manager";
import type { SessionManager } from "../session_manager";
import type { SyncStatePullResult } from "./sync_state.types";

/**
 * Mock FsSyncStateModule for testing
 */
function createMockFsSyncStateModule(): jest.Mocked<FsSyncStateModule> {
  return {
    pullState: jest.fn(),
  } as unknown as jest.Mocked<FsSyncStateModule>;
}

/**
 * Mock ConfigManager for testing
 */
function createMockConfigManager(config: Record<string, unknown> = {}): jest.Mocked<ConfigManager> {
  return {
    loadConfig: jest.fn().mockResolvedValue(config),
  } as unknown as jest.Mocked<ConfigManager>;
}

/**
 * Mock SessionManager for testing
 */
function createMockSessionManager(): jest.Mocked<SessionManager> {
  return {
    loadSession: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<SessionManager>;
}

describe("PullScheduler", () => {
  let mockFsSyncStateModule: jest.Mocked<FsSyncStateModule>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let scheduler: PullScheduler;

  beforeEach(() => {
    mockFsSyncStateModule = createMockFsSyncStateModule();
    mockConfigManager = createMockConfigManager();
    mockSessionManager = createMockSessionManager();

    scheduler = new PullScheduler({
      syncModule: mockFsSyncStateModule,
      configManager: mockConfigManager,
      sessionManager: mockSessionManager,
    });

    // Clear all timers
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    scheduler.stop();
    jest.useRealTimers();
  });

  // ===== EARS-F1 to F4: Start and Control =====

  describe("6.4.1. Start and Control (EARS-F1 to F4)", () => {
    it("[EARS-F1] should start scheduler with configured interval", async () => {
      // Setup: Configure scheduler as enabled
      mockSessionManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncStatePullResult);

      // Execute
      await scheduler.start();

      // Verify scheduler is running
      expect(scheduler.isRunning()).toBe(true);

      // Fast-forward time to trigger pull
      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Let promises resolve

      // Verify pullState was called
      expect(mockFsSyncStateModule.pullState).toHaveBeenCalledTimes(1);
    });

    it("[EARS-F2] should be idempotent if already running", async () => {
      // Setup
      mockSessionManager.loadSession.mockResolvedValue({
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
      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncStatePullResult);

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockFsSyncStateModule.pullState).toHaveBeenCalledTimes(1);
    });

    it("[EARS-F3] should stop scheduler and cleanup resources", async () => {
      // Setup
      mockSessionManager.loadSession.mockResolvedValue({
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30,
          },
        },
      });

      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncStatePullResult);

      // Execute
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();

      // Verify
      expect(scheduler.isRunning()).toBe(false);

      // Fast-forward and verify no pulls happen
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(mockFsSyncStateModule.pullState).not.toHaveBeenCalled();
    });

    it("[EARS-F4] should return correct scheduler state", async () => {
      // Initially not running
      expect(scheduler.isRunning()).toBe(false);

      // Setup and start
      mockSessionManager.loadSession.mockResolvedValue({
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

  // ===== EARS-F5 to F8: Pull Operation and Event Handling =====

  describe("6.4.2. Pull Operation and Event Handling (EARS-F5 to F8)", () => {
    it("[EARS-F5] should emit event when detects new changes", async () => {
      // Setup: Pull returns changes
      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: true,
        reindexed: true,
        conflictDetected: false,
      } as SyncStatePullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.conflictDetected).toBe(false);
    });

    it("[EARS-F6] should handle conflicts appropriately", async () => {
      // Setup: Pull returns conflict
      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: false,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: "rebase_conflict",
          message: "Conflict in file",
          affectedFiles: [".gitgov/tasks/123.json"],
        },
      } as SyncStatePullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(false);
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo).toBeDefined();
      expect(result.conflictInfo?.affectedFiles).toContain(".gitgov/tasks/123.json");
    });

    it("[EARS-F6] should stop scheduler if stopOnConflict is true", async () => {
      // Setup: Configure to stop on conflict
      mockSessionManager.loadSession.mockResolvedValue({
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
      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: false,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: "rebase_conflict",
          message: "Conflict",
        },
      } as SyncStatePullResult);

      // Execute
      await scheduler.pullNow();

      // Verify scheduler stopped
      expect(scheduler.isRunning()).toBe(false);
    });

    it("[EARS-F7] should continue after network errors", async () => {
      // Setup: Configure to continue on network error
      mockSessionManager.loadSession.mockResolvedValue({
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
      mockFsSyncStateModule.pullState.mockRejectedValue(new Error("network timeout"));

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(false);
      expect(result.error).toContain("network timeout");

      // Verify scheduler still running
      expect(scheduler.isRunning()).toBe(true);
    });

    it("[EARS-F8] should avoid concurrent pulls", async () => {
      // Setup: Slow pull operation using Promise
      let resolvePull: (value: SyncStatePullResult) => void;
      const pullPromise = new Promise<SyncStatePullResult>((resolve) => {
        resolvePull = resolve;
      });

      mockFsSyncStateModule.pullState.mockReturnValue(pullPromise);

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
      } as SyncStatePullResult);

      // Wait for first pull to complete
      const result1 = await pull1Promise;
      expect(result1.success).toBe(true);

      // Verify pullState was only called once
      expect(mockFsSyncStateModule.pullState).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Additional Edge Cases =====

  describe("Additional Edge Cases", () => {
    it("should not start if scheduler is not enabled in config", async () => {
      // Setup: Scheduler disabled
      mockSessionManager.loadSession.mockResolvedValue({
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
      mockSessionManager.loadSession.mockRejectedValue(new Error("Session not found"));

      // Execute
      await scheduler.start();

      // Verify: Should not start (default is disabled)
      expect(scheduler.isRunning()).toBe(false);
    });

    it("should handle no changes gracefully", async () => {
      // Setup: Pull returns no changes
      mockFsSyncStateModule.pullState.mockResolvedValue({
        success: true,
        reindexed: false,
        conflictDetected: false,
      } as SyncStatePullResult);

      // Execute
      const result = await scheduler.pullNow();

      // Verify
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.conflictDetected).toBe(false);
    });
  });
});

