import type { AuditOrchestrationResult } from '../types';

export type AuditFsProjectionOptions = {
  basePath: string;
  keepHistory?: boolean;
};

export interface IAuditFsProjection {
  persist(result: AuditOrchestrationResult): Promise<void>;
  readLatest(): Promise<AuditOrchestrationResult | null>;
  read(scanId: string): Promise<AuditOrchestrationResult | null>;
  list(): Promise<string[]>;
}
