import * as fs from 'fs/promises';
import * as path from 'path';
import type { IProjectionSink, IndexData, ProjectionContext } from '../record_projector.types';

export type FsProjectionSinkOptions = {
  basePath: string;
};

/**
 * FsProjectionSink - Filesystem IProjectionSink for CLI.
 *
 * Writes IndexData as JSON to .gitgov/index.json using atomic write
 * (write to temp file + rename) to prevent corruption on crash.
 */
export class FsProjectionSink implements IProjectionSink {
  private readonly indexPath: string;

  constructor(options: FsProjectionSinkOptions) {
    this.indexPath = path.join(options.basePath, 'index.json');
  }

  async persist(data: IndexData, _context: ProjectionContext): Promise<void> {
    const dir = path.dirname(this.indexPath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write: write to temp + rename
    const tmpPath = `${this.indexPath}.tmp`;
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, this.indexPath);
  }

  async read(_context: ProjectionContext): Promise<IndexData | null> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(content) as IndexData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async exists(_context: ProjectionContext): Promise<boolean> {
    try {
      await fs.access(this.indexPath);
      return true;
    } catch {
      return false;
    }
  }

  async clear(_context: ProjectionContext): Promise<void> {
    try {
      await fs.unlink(this.indexPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}
