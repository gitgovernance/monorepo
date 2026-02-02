import type { IEventStream } from "../event_bus";

export interface WatcherStateModuleOptions {
  gitgovPath: string;
  debounceMs?: number; // default: 300
}

export interface WatcherStateModuleDependencies {
  eventBus: IEventStream;
  options: WatcherStateModuleOptions;
}

export interface WatcherStateStatus {
  isRunning: boolean;
  watchedDirectories: string[];
  eventsEmitted: number;
  lastError: Error | undefined;
}
