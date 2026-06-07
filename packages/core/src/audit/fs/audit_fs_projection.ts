import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AuditOrchestrationResult } from '../types';
import type { IAuditFsProjection, AuditFsProjectionOptions } from './audit_fs_projection.types';

export class AuditFsProjection implements IAuditFsProjection {
  private readonly basePath: string;
  private readonly keepHistory: boolean;
  private readonly indexPath: string;
  private readonly scansDir: string;

  constructor(options: AuditFsProjectionOptions) {
    this.basePath = options.basePath;
    this.keepHistory = options.keepHistory ?? false;
    this.indexPath = path.join(this.basePath, 'audit-index.json');
    this.scansDir = path.join(this.basePath, 'audit', 'scans');
  }

  // [AFRP-A1] persist writes audit-index.json
  async persist(result: AuditOrchestrationResult): Promise<void> {
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });

    const tmpPath = `${this.indexPath}.tmp`;
    const content = JSON.stringify(result, null, 2);
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, this.indexPath);

    // [AFRP-A4] persist with keepHistory writes timestamped file
    if (this.keepHistory) {
      await fs.mkdir(this.scansDir, { recursive: true });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const scanPath = path.join(this.scansDir, `${timestamp}.json`);
      await fs.writeFile(scanPath, content, 'utf-8');
    }
  }

  // [AFRP-A2] readLatest reads and parses audit-index.json
  // [AFRP-A3] readLatest returns null when missing
  async readLatest(): Promise<AuditOrchestrationResult | null> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(content) as AuditOrchestrationResult;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      return null;
    }
  }

  // [AFRP-B3] read specific scan by ID
  // [AFRP-B4] read non-existent returns null
  async read(scanId: string): Promise<AuditOrchestrationResult | null> {
    try {
      const scanPath = path.join(this.scansDir, `${scanId}.json`);
      const content = await fs.readFile(scanPath, 'utf-8');
      return JSON.parse(content) as AuditOrchestrationResult;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      return null;
    }
  }

  // [AFRP-B1] list returns sorted scan IDs
  // [AFRP-B2] list returns empty when no scans
  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.scansDir);
      return entries
        .filter(e => e.endsWith('.json'))
        .map(e => e.replace('.json', ''))
        .sort((a, b) => Number(b) - Number(a));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      return [];
    }
  }
}
