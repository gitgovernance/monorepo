/**
 * IdEncoder for transforming IDs to storage-safe filenames.
 * Useful for characters not allowed in filesystem (e.g., `:` on Windows)
 * or URL-unsafe characters in remote backends.
 */
export interface IdEncoder {
  /** Transform ID to storage-safe string */
  encode: (id: string) => string;
  /** Recover original ID from encoded string */
  decode: (encoded: string) => string;
}

/**
 * Default encoder: `:` → `_` (for IDs like "human:camilo")
 * Reversible because IDs cannot contain `_` (see id_generator.ts)
 */
export const DEFAULT_ID_ENCODER: IdEncoder = {
  encode: (id: string) => id.replace(/:/g, '_'),
  decode: (encoded: string) => encoded.replace(/_/g, ':'),
};

/**
 * RecordStore<V, R, O> - Generic interface for record persistence
 *
 * Abstracts CRUD operations without assuming storage backend.
 * Each implementation decides how to persist (fs, memory, db, remote).
 *
 * @typeParam V - Value type (the record being stored)
 * @typeParam R - Return type for write operations (default: void for local, GitHubWriteResult for GitHub)
 * @typeParam O - Options type for write operations (default: void for local, GitHubWriteOpts for GitHub)
 */
export interface RecordStore<V, R = void, O = void> {
  /**
   * Gets a record by ID
   * @returns The record or null if it doesn't exist
   */
  get(id: string): Promise<V | null>;

  /**
   * Persists a record
   * @param id - Unique identifier
   * @param value - The record to persist
   */
  put(id: string, value: V, ...opts: O extends void ? [] : [opts?: O]): Promise<R>;

  // [EARS-A13] Stages a record for a posterior commit without committing immediately.
  // Backends without transaction-boundary (Fs, Memory) persist immediately (= put).
  // GitHub backend serializes + gitModule.add (stage) without commit — the caller
  // commits via finalize() or gitModule.commit(). Closes IKS-P9.
  putDeferred(id: string, value: V, ...opts: O extends void ? [] : [opts?: O]): Promise<R>;

  /**
   * Persists multiple records in a single operation.
   * Local backends iterate sequentially; GitHub backend uses atomic commits.
   */
  putMany(entries: Array<{ id: string; value: V }>, ...opts: O extends void ? [] : [opts?: O]): Promise<R>;

  /**
   * Deletes a record
   * @param id - Identifier of the record to delete
   */
  delete(id: string, ...opts: O extends void ? [] : [opts?: O]): Promise<R>;

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
