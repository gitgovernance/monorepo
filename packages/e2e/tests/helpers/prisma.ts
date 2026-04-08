/**
 * Prisma Helpers — PostgreSQL connection only.
 * Protocol-specific helpers: prisma_protocol.ts
 * Audit-specific helpers: prisma_audit.ts
 */
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../core/generated/prisma/index.js';

export type { PrismaClient };

// [HLP-B1] Connect to real PostgreSQL with explicit connection string
export function createTestPrisma(connectionString?: string): PrismaClient {
  const url = connectionString
    ?? process.env['DATABASE_URL']
    ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_dev';
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
