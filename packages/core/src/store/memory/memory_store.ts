import type { Store } from '../store';

/**
 * Options for MemoryStore
 */
export interface MemoryStoreOptions<T> {
  /** Initial data */
  initial?: Map<string, T>;

  /** Clone data on get/put (default: true) */
  deepClone?: boolean;
}

/**
 * MemoryStore<T> - In-memory implementation of Store<T>
 *
 * Designed for unit tests and scenarios without persistence.
 * By default, clones values on get/put to prevent accidental mutations.
 *
 * @example
 * // Test setup
 * const store = new MemoryStore<TaskRecord>();
 * await store.put('test-task-1', mockTask);
 *
 * // Assertions
 * expect(await store.exists('test-task-1')).toBe(true);
 * expect(store.size()).toBe(1);
 *
 * // Cleanup
 * store.clear();
 */
export class MemoryStore<T> implements Store<T> {
  private readonly data: Map<string, T>;
  private readonly deepClone: boolean;

  constructor(options: MemoryStoreOptions<T> = {}) {
    this.data = options.initial ?? new Map();
    this.deepClone = options.deepClone ?? true;
  }

  private clone(value: T): T {
    if (!this.deepClone) return value;
    return JSON.parse(JSON.stringify(value));
  }

  async get(id: string): Promise<T | null> {
    const value = this.data.get(id);
    return value !== undefined ? this.clone(value) : null;
  }

  async put(id: string, value: T): Promise<void> {
    this.data.set(id, this.clone(value));
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }

  async list(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async exists(id: string): Promise<boolean> {
    return this.data.has(id);
  }

  // ─────────────────────────────────────────────────────────
  // Test Helpers (not part of Store<T>, only for tests)
  // ─────────────────────────────────────────────────────────

  /** Clears all records from the store */
  clear(): void {
    this.data.clear();
  }

  /** Returns the number of records */
  size(): number {
    return this.data.size;
  }

  /** Returns a copy of the internal Map (for assertions) */
  getAll(): Map<string, T> {
    return new Map(this.data);
  }
}
