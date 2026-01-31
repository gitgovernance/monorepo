/**
 * IWatcherStateModule - State Watcher Interface
 *
 * Defines the contract for watching .gitgov/ changes and emitting events.
 * Unidirectional: read-only observation, never writes back.
 *
 * Implementations:
 * - FsWatcherStateModule: Uses chokidar fs watcher (watcher_state/fs/)
 * - Future: CloudWatcherStateModule via realtime subscription
 *
 * @module watcher_state
 */

import type { WatcherStateStatus } from "./watcher_state.types";

export interface IWatcherStateModule {
  /** Start watching .gitgov/ directories for changes */
  start(): Promise<void>;

  /** Stop watching and release all resources */
  stop(): Promise<void>;

  /** Whether the watcher is currently active */
  isRunning(): boolean;

  /** Current status snapshot */
  getStatus(): WatcherStateStatus;
}
