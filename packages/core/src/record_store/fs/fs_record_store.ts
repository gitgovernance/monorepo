import * as fs from 'fs/promises';
import * as path from 'path';
import type { RecordStore } from '../record_store';

/**
 * Serializer for FsRecordStore - allows custom serialization
 */
export interface Serializer {
  stringify: (value: unknown) => string;
  parse: <T>(text: string) => T;
}

/**
 * IdEncoder for transforming IDs to filesystem-safe filenames
 * Useful for characters not allowed in filesystem (e.g., `:` on Windows)
 */
export interface IdEncoder {
  /** Transform ID to filename-safe string */
  encode: (id: string) => string;
  /** Recover original ID from filename */
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
 * Options for FsRecordStore
 */
export interface FsRecordStoreOptions {
  /** Base directory for files */
  basePath: string;

  /** File extension (default: ".json") */
  extension?: string;

  /** Custom serializer (default: JSON with indent 2) */
  serializer?: Serializer;

  /** Create directory if it doesn't exist (default: true) */
  createIfMissing?: boolean;

  /** ID encoder for filesystem-safe filenames (default: undefined = no encoding) */
  idEncoder?: IdEncoder;
}

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
 * FsRecordStore<T> - Filesystem implementation of Store<T>
 *
 * Persists records as JSON files on disk.
 *
 * @example
 * const store = new FsRecordStore<TaskRecord>({
 *   basePath: '.gitgov/tasks',
 * });
 *
 * await store.put('123-task-foo', task);
 * const task = await store.get('123-task-foo');
 */
export class FsRecordStore<T> implements RecordStore<T> {
  private readonly basePath: string;
  private readonly extension: string;
  private readonly serializer: Serializer;
  private readonly createIfMissing: boolean;
  private readonly idEncoder: IdEncoder | undefined;

  constructor(options: FsRecordStoreOptions) {
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.serializer = options.serializer ?? DEFAULT_SERIALIZER;
    this.createIfMissing = options.createIfMissing ?? true;
    this.idEncoder = options.idEncoder;
  }

  private getFilePath(id: string): string {
    validateId(id);
    const fileId = this.idEncoder ? this.idEncoder.encode(id) : id;
    return path.join(this.basePath, `${fileId}${this.extension}`);
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
      const ids = files
        .filter((f) => f.endsWith(this.extension))
        .map((f) => f.slice(0, -this.extension.length));
      return this.idEncoder ? ids.map((id) => this.idEncoder!.decode(id)) : ids;
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
