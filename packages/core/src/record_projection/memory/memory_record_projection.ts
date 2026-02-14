import type { IRecordProjection, IndexData, ProjectionContext } from '../record_projection.types';

/**
 * MemoryRecordProjection - In-memory IRecordProjection for testing.
 *
 * Stores IndexData in a Map keyed by context.repoIdentifier.
 * Used exclusively in tests to avoid filesystem I/O.
 */
export class MemoryRecordProjection implements IRecordProjection {
  private storage = new Map<string, IndexData>();

  async persist(data: IndexData, context: ProjectionContext): Promise<void> {
    const key = context.repoIdentifier ?? '__default__';
    this.storage.set(key, data);
  }

  async read(context: ProjectionContext): Promise<IndexData | null> {
    const key = context.repoIdentifier ?? '__default__';
    return this.storage.get(key) ?? null;
  }

  async exists(context: ProjectionContext): Promise<boolean> {
    const key = context.repoIdentifier ?? '__default__';
    return this.storage.has(key);
  }

  async clear(context: ProjectionContext): Promise<void> {
    const key = context.repoIdentifier ?? '__default__';
    this.storage.delete(key);
  }
}
