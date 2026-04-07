/**
 * Audit Prisma Helpers — cleanup of audit tables (Finding, Waiver, Scan).
 * Separated from protocol to maintain protocol/audit boundary.
 *
 * DB: DATABASE_URL_AUDIT (default: gitgov_e2e_audit)
 */
import { createTestPrisma } from './prisma';
import type { PrismaClient } from './prisma';

/**
 * AuditClient — compile-time restriction.
 * Only exposes audit tables. Protocol tables (gitgovTask, etc.) are NOT accessible.
 * This prevents accidental cross-domain access at the type level.
 */
export type AuditClient = Pick<PrismaClient,
  | 'finding'
  | 'waiver'
  | 'scan'
  | '$transaction'
  | '$disconnect'
>;

const AUDIT_DB_URL = process.env['DATABASE_URL_AUDIT']
  ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_audit';

/** Create PrismaClient connected to the audit-dedicated DB */
export function createAuditPrisma(): AuditClient {
  return createTestPrisma(AUDIT_DB_URL);
}

/** Clean audit tables only (Finding, Waiver, Scan) */
export async function cleanupAudit(prisma: AuditClient): Promise<void> {
  await prisma.$transaction([
    prisma.finding.deleteMany({}),
    prisma.waiver.deleteMany({}),
    prisma.scan.deleteMany({}),
  ]);
}
