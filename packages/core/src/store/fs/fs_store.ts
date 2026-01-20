import * as fs from 'fs/promises';
import * as path from 'path';
import type { Store, Serializer, FsStoreOptions } from '../store';

const DEFAULT_SERIALIZER: Serializer = {
  stringify: (value) => JSON.stringify(value, null, 2),
  parse: (text) => JSON.parse(text),
};

/**
 * Validates that an ID does not contain path traversal.
 * Blocks: `..`, `/`, `\`
 * Allows: single `.` (e.g., "human.camilo")
 */
function validateId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error('ID must be a non-empty string');
  }
  if (id.includes('..') || /[\/\\]/.test(id)) {
    throw new Error(`Invalid ID: "${id}". IDs cannot contain /, \\, or ..`);
  }
}

/**
 * FsStore<T> - Filesystem implementation of Store<T>
 *
 * Persists records as JSON files on disk.
 *
 * @example
 * const store = new FsStore<TaskRecord>({
 *   basePath: '.gitgov/tasks',
 * });
 *
 * await store.put('123-task-foo', task);
 * const task = await store.get('123-task-foo');
 */
export class FsStore<T> implements Store<T> {
  private readonly basePath: string;
  private readonly extension: string;
  private readonly serializer: Serializer;
  private readonly createIfMissing: boolean;

  constructor(options: FsStoreOptions) {
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.serializer = options.serializer ?? DEFAULT_SERIALIZER;
    this.createIfMissing = options.createIfMissing ?? true;
  }

  private getFilePath(id: string): string {
    validateId(id);
    return path.join(this.basePath, `${id}${this.extension}`);
  }

  async get(id: string): Promise<T | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.serializer.parse<T>(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async put(id: string, value: T): Promise<void> {
    const filePath = this.getFilePath(id);
    if (this.createIfMissing) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    const content = this.serializer.stringify(value);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files
        .filter((f) => f.endsWith(this.extension))
        .map((f) => f.slice(0, -this.extension.length));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
