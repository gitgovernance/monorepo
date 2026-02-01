/**
 * RecordStore<T> - Generic interface for record persistence
 *
 * Abstracts CRUD operations without assuming storage backend.
 * Each implementation decides how to persist (fs, memory, db, remote).
 */
export interface RecordStore<T> {
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
