/**
 * FsWatcherStateModule — Unit Tests
 *
 * All EARS prefixes map to:
 *   packages/blueprints/03_products/core/specs/modules/watcher_state_module/fs_watcher_state_module.md
 *
 * §4.1 Lifecycle        → EARS-1, EARS-2
 * §4.2 Event Emission   → EARS-3, EARS-4
 * §4.3 Cleanup          → EARS-5
 * §4.4 Debounce         → EARS-6
 * §4.5 Error Handling   → EARS-7
 */

import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { realpathSync } from "fs";
import { EventBus } from "../../event_bus";
import type { BaseEvent } from "../../event_bus";
import type { GitGovRecordPayload } from "../../types";
import { calculatePayloadChecksum } from "../../crypto/checksum";
import { FsWatcherStateModule } from "./fs_watcher_state";
import { ProjectNotInitializedError } from "../watcher_state.errors";

const TEST_DEBOUNCE = 50;
const WAIT_MS = 600;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRecord(payload: Record<string, unknown>) {
  const payloadChecksum = calculatePayloadChecksum(
    payload as unknown as GitGovRecordPayload
  );
  return {
    header: { payloadChecksum },
    payload,
  };
}

describe("FsWatcherStateModule", () => {
  let tmpDir: string;
  let gitgovPath: string;
  let eventBus: EventBus;
  let mod: FsWatcherStateModule;
  let events: BaseEvent[];

  beforeEach(async () => {
    tmpDir = realpathSync(
      await mkdtemp(join(tmpdir(), "watcher-state-test-"))
    );
    gitgovPath = join(tmpDir, ".gitgov");
    eventBus = new EventBus();
    events = [];
    eventBus.subscribeToAll((e) => {
      events.push(e);
    });
  });

  afterEach(async () => {
    if (mod?.isRunning()) {
      await mod.stop();
    }
    eventBus.clearSubscriptions();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("4.1. Lifecycle (EARS-1 to EARS-2)", () => {
    it("[EARS-1] should create watchers for existing directories in .gitgov/", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });
      await mkdir(join(gitgovPath, "actors"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();

      expect(mod.isRunning()).toBe(true);

      const status = mod.getStatus();
      expect(status.watchedDirectories).toContain("tasks");
      expect(status.watchedDirectories).toContain("actors");
      expect(status.watchedDirectories).toHaveLength(2);
    });

    it("[EARS-2] should throw ProjectNotInitializedError if .gitgov/ does not exist", async () => {
      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await expect(mod.start()).rejects.toThrow(ProjectNotInitializedError);
      expect(mod.isRunning()).toBe(false);
    });
  });

  describe("4.2. Event Emission (EARS-3 to EARS-4)", () => {
    it("[EARS-3] should emit event to EventBus after debounce on file add", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();
      await wait(200);

      const record = makeRecord({ title: "Test task", status: "open" });
      await writeFile(
        join(gitgovPath, "tasks", "task-001.json"),
        JSON.stringify(record)
      );

      await wait(WAIT_MS);

      const addEvents = events.filter(
        (e) => e.type === "watcher.record.added"
      );
      expect(addEvents).toHaveLength(1);
      const evt = addEvents[0]!;
      expect(evt.source).toBe("watcher");
      expect(evt.payload).toEqual(
        expect.objectContaining({
          recordType: "tasks",
          recordId: "task-001",
        })
      );
    });

    it("[EARS-4] should skip event on checksum mismatch and log error", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();
      await wait(200);

      const badRecord = {
        header: { payloadChecksum: "00000000deadbeef" },
        payload: { title: "Bad checksum task" },
      };
      await writeFile(
        join(gitgovPath, "tasks", "task-bad.json"),
        JSON.stringify(badRecord)
      );

      await wait(WAIT_MS);

      const addEvents = events.filter(
        (e) => e.type === "watcher.record.added"
      );
      expect(addEvents).toHaveLength(0);

      const status = mod.getStatus();
      expect(status.lastError).toBeDefined();
      expect(status.lastError?.message).toContain("Checksum mismatch");
    });
  });

  describe("4.3. Cleanup (EARS-5)", () => {
    it("[EARS-5] should close watchers and cancel timers on stop()", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();
      expect(mod.isRunning()).toBe(true);

      await mod.stop();
      expect(mod.isRunning()).toBe(false);

      const status = mod.getStatus();
      expect(status.watchedDirectories).toHaveLength(0);

      const record = makeRecord({ title: "After stop" });
      await writeFile(
        join(gitgovPath, "tasks", "task-after.json"),
        JSON.stringify(record)
      );
      await wait(WAIT_MS);

      const addEvents = events.filter(
        (e) => e.type === "watcher.record.added"
      );
      expect(addEvents).toHaveLength(0);
    });
  });

  describe("4.4. Debounce (EARS-6)", () => {
    it("[EARS-6] should debounce multiple rapid changes into one event", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();
      await wait(200);

      const filePath = join(gitgovPath, "tasks", "task-rapid.json");

      const record1 = makeRecord({ title: "v1", status: "open" });
      await writeFile(filePath, JSON.stringify(record1));
      await wait(10);
      const record2 = makeRecord({ title: "v2", status: "open" });
      await writeFile(filePath, JSON.stringify(record2));
      await wait(10);
      const record3 = makeRecord({ title: "v3", status: "closed" });
      await writeFile(filePath, JSON.stringify(record3));

      await wait(WAIT_MS);

      const status = mod.getStatus();
      expect(status.eventsEmitted).toBeLessThanOrEqual(2);
      expect(status.eventsEmitted).toBeGreaterThanOrEqual(1);
    });
  });

  describe("4.5. Error Handling (EARS-7)", () => {
    it("[EARS-7] should handle non-fatal errors gracefully without stopping", async () => {
      await mkdir(join(gitgovPath, "tasks"), { recursive: true });

      mod = new FsWatcherStateModule({
        eventBus,
        options: { gitgovPath, debounceMs: TEST_DEBOUNCE },
      });
      await mod.start();
      await wait(200);

      await writeFile(
        join(gitgovPath, "tasks", "task-invalid.json"),
        "NOT VALID JSON {{{}"
      );

      await wait(WAIT_MS);

      expect(mod.isRunning()).toBe(true);

      const status = mod.getStatus();
      expect(status.lastError).toBeDefined();

      const addEvents = events.filter(
        (e) => e.type === "watcher.record.added"
      );
      expect(addEvents).toHaveLength(0);

      const validRecord = makeRecord({ title: "Valid after error" });
      await writeFile(
        join(gitgovPath, "tasks", "task-valid.json"),
        JSON.stringify(validRecord)
      );

      await wait(WAIT_MS);

      const addEventsAfter = events.filter(
        (e) => e.type === "watcher.record.added"
      );
      expect(addEventsAfter.length).toBeGreaterThanOrEqual(1);
    });
  });
});
