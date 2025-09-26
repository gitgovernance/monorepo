import { promises as fs, constants } from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config_manager';
import type { GitGovRecord, GitGovRecordPayload, CustomRecord } from '../types';

type StorablePayload = Exclude<GitGovRecordPayload, CustomRecord>;

// Define an interface for the filesystem dependencies for mocking
export interface FsDependencies {
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
  readFile: typeof fs.readFile;
  readdir: typeof fs.readdir;
  unlink: typeof fs.unlink;
  access: typeof fs.access;
}

export class RecordStore<T extends StorablePayload> {
  private recordType: string;
  private recordsDir: string;
  private fs: FsDependencies;

  constructor(
    recordType: string,
    rootPath?: string,
    fsDeps: FsDependencies = fs
  ) {
    const foundRoot = rootPath || ConfigManager.findProjectRoot();
    if (!foundRoot) {
      throw new Error("Could not find project root. RecordStore requires a valid project root.");
    }
    this.recordType = recordType;
    this.recordsDir = path.join(foundRoot, '.gitgov', this.recordType);
    this.fs = fsDeps;
  }

  private getRecordPath(recordId: string): string {
    const safeId = recordId.replace(/:/g, '_');
    return path.join(this.recordsDir, `${safeId}.json`);
  }

  private async ensureDirExists(): Promise<void> {
    await this.fs.mkdir(this.recordsDir, { recursive: true });
  }

  async write(record: GitGovRecord & { payload: T }): Promise<void> {
    await this.ensureDirExists();
    const filePath = this.getRecordPath(record.payload.id);
    const content = JSON.stringify(record, null, 2);
    await this.fs.writeFile(filePath, content, 'utf-8');
  }


  async read(recordId: string): Promise<(GitGovRecord & { payload: T }) | null> {
    const filePath = this.getRecordPath(recordId);
    try {
      const content = await this.fs.readFile(filePath, 'utf-8');
      const record = JSON.parse(content) as GitGovRecord & { payload: T };

      return record;
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }


  async delete(recordId: string): Promise<void> {
    const filePath = this.getRecordPath(recordId);
    try {
      await this.fs.unlink(filePath);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await this.fs.readdir(this.recordsDir, { withFileTypes: true });
      return files
        .filter(file => file.isFile() && file.name.endsWith('.json'))
        .map(file => file.name.replace(/\.json$/, '').replace(/_/g, ':'));
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async exists(recordId: string): Promise<boolean> {
    const filePath = this.getRecordPath(recordId);
    try {
      await this.fs.access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
