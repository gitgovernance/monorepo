import type {
  ActorRecord,
  AgentRecord,
  TaskRecord,
  CycleRecord,
  ExecutionRecord,
  FeedbackRecord,
  ChangelogRecord,
} from '../types';

export interface Store<T> {
  /**
   * Gets a record by ID
   * @returns The record or null if it doesn't exist
   */
  get(id: string): Promise<T | null>;

  /**
   * Persists a record
   * @param id - Unique identifier
   * @param value - The record to persist
   */
  put(id: string, value: T): Promise<void>;

  /**
   * Deletes a record
   * @param id - Identifier of the record to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Lists all record IDs
   * @returns Array of IDs
   */
  list(): Promise<string[]>;

  /**
   * Checks if a record exists
   * @param id - Identifier to check
   */
  exists(id: string): Promise<boolean>;
}

export interface Stores {
  actors?: Store<ActorRecord>;
  agents?: Store<AgentRecord>;
  tasks?: Store<TaskRecord>;
  cycles?: Store<CycleRecord>;
  executions?: Store<ExecutionRecord>;
  feedbacks?: Store<FeedbackRecord>;
  changelogs?: Store<ChangelogRecord>;
}

/**
 * Serializer for FsStore - allows custom serialization
 */
export interface Serializer {
  stringify: (value: unknown) => string;
  parse: <T>(text: string) => T;
}

/**
 * Options for FsStore
 */
export interface FsStoreOptions {
  /** Base directory for files */
  basePath: string;

  /** File extension (default: ".json") */
  extension?: string;

  /** Custom serializer (default: JSON with indent 2) */
  serializer?: Serializer;

  /** Create directory if it doesn't exist (default: true) */
  createIfMissing?: boolean;
}
