/**
 * FsWatcherStateModule — Filesystem watcher for .gitgov/ changes
 *
 * Watches .gitgov/ subdirectories using chokidar and emits events
 * to the EventBus after debounce + checksum validation.
 */

import chokidar from "chokidar";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { SYNC_DIRECTORIES } from "../../sync_state/sync_state.types";
import { calculatePayloadChecksum } from "../../crypto/checksum";
import { createLogger } from "../../logger/logger";
import type { IWatcherStateModule } from "../watcher_state";
import type {
  WatcherStateModuleDependencies,
  WatcherStateStatus,
} from "../watcher_state.types";
import type { IEventStream } from "../../event_bus";
import {
  ProjectNotInitializedError,
  ChecksumMismatchError,
} from "../watcher_state.errors";

// --- Constants ---

const DEFAULT_DEBOUNCE_MS = 300;

const EVENT_TYPE_MAP = {
  add: "watcher.record.added",
  change: "watcher.record.changed",
  unlink: "watcher.record.deleted",
} as const;

// --- Implementation ---

export class FsWatcherStateModule implements IWatcherStateModule {
  private eventBus: IEventStream;
  private gitgovPath: string;
  private debounceMs: number;
  private logger = createLogger("[FsWatcherStateModule] ");
  private watchers: chokidar.FSWatcher[] = [];
  private watchedDirectories: string[] = [];
  private running = false;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private checksums = new Map<string, string>();
  private eventsEmitted = 0;
  private lastError?: Error;

  constructor(deps: WatcherStateModuleDependencies) {
    this.eventBus = deps.eventBus;
    this.gitgovPath = deps.options.gitgovPath;
    this.debounceMs = deps.options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * EARS-1: Creates watchers for existing directories in .gitgov/
   * EARS-2: Throws ProjectNotInitializedError if .gitgov/ doesn't exist
   */
  async start(): Promise<void> {
    if (!existsSync(this.gitgovPath)) {
      throw new ProjectNotInitializedError(this.gitgovPath);
    }

    for (const dir of SYNC_DIRECTORIES) {
      const dirPath = join(this.gitgovPath, dir);
      if (!existsSync(dirPath)) continue;

      const watcher = chokidar.watch(dirPath, {
        ignoreInitial: true,
        depth: 0,
      });

      watcher.on("add", (fp) => this.onFileChange(fp, "add"));
      watcher.on("change", (fp) => this.onFileChange(fp, "change"));
      watcher.on("unlink", (fp) => this.onFileChange(fp, "unlink"));

      this.watchers.push(watcher);
      this.watchedDirectories.push(dir);
    }

    this.running = true;
  }

  /** EARS-5: Closes watchers + cancels timers */
  async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
    this.watchedDirectories = [];

    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): WatcherStateStatus {
    return {
      isRunning: this.running,
      watchedDirectories: [...this.watchedDirectories],
      eventsEmitted: this.eventsEmitted,
      lastError: this.lastError,
    };
  }

  /**
   * EARS-3: Emits event after debounce
   * EARS-6: Debounce — N rapid changes → 1 event
   */
  private onFileChange(
    filePath: string,
    changeType: "add" | "change" | "unlink"
  ): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this.processFileChange(filePath, changeType);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * EARS-3: Emit event to EventBus
   * EARS-4: Skip event on checksum mismatch
   * EARS-7: Handle errors gracefully
   */
  private async processFileChange(
    filePath: string,
    changeType: "add" | "change" | "unlink"
  ): Promise<void> {
    try {
      if (changeType === "unlink") {
        this.checksums.delete(filePath);
        this.emitEvent(filePath, changeType);
        return;
      }

      const content = await readFile(filePath, "utf-8");
      const record = JSON.parse(content);

      if (record?.header?.payloadChecksum && record?.payload) {
        const calculated = calculatePayloadChecksum(record.payload);
        if (calculated !== record.header.payloadChecksum) {
          this.lastError = new ChecksumMismatchError(
            filePath,
            record.header.payloadChecksum,
            calculated
          );
          this.logger.error(this.lastError.message);
          return;
        }
      }

      const newChecksum = record?.header?.payloadChecksum as
        | string
        | undefined;
      if (newChecksum && newChecksum === this.checksums.get(filePath)) {
        return;
      }
      if (newChecksum) this.checksums.set(filePath, newChecksum);

      this.emitEvent(filePath, changeType);
    } catch (error) {
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error processing ${filePath}: ${this.lastError.message}`
      );
    }
  }

  private emitEvent(
    filePath: string,
    changeType: "add" | "change" | "unlink"
  ): void {
    const recordType = this.extractRecordType(filePath);
    const recordId = this.extractRecordId(filePath);
    const relPath = relative(join(this.gitgovPath, ".."), filePath);

    this.eventBus.publish({
      type: EVENT_TYPE_MAP[changeType],
      timestamp: Date.now(),
      source: "watcher",
      payload: { recordType, recordId, filePath: relPath },
    });
    this.eventsEmitted++;
  }

  private extractRecordType(filePath: string): string {
    return basename(dirname(filePath));
  }

  private extractRecordId(filePath: string): string {
    return basename(filePath, ".json");
  }
}
