/**
 * E2E Global Setup — ensures domain-specific databases exist and have the schema pushed.
 *
 * Creates databases on first run, reuses on subsequent runs.
 * Runs `prisma db push` to sync schema without dropping existing data.
 *
 * Databases:
 *   - gitgov_e2e_protocol  (DATABASE_URL_PROTOCOL)
 *   - gitgov_e2e_audit     (DATABASE_URL_AUDIT)
 */
import { execSync } from 'child_process';
import pg from 'pg';
import path from 'path';
import { config } from 'dotenv';

config();

const ADMIN_URL = process.env['DATABASE_URL_ADMIN']
  ?? 'postgresql://gitgov:gitgov@localhost:5432/postgres';

const DATABASES = [
  {
    name: extractDbName(process.env['DATABASE_URL_PROTOCOL']
      ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_protocol'),
    url: process.env['DATABASE_URL_PROTOCOL']
      ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_protocol',
  },
  {
    name: extractDbName(process.env['DATABASE_URL_AUDIT']
      ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_audit'),
    url: process.env['DATABASE_URL_AUDIT']
      ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_audit',
  },
];

function extractDbName(url: string): string {
  // postgresql://user:pass@host:port/dbname → dbname
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match?.[1] ?? 'gitgov_e2e';
}

async function ensureDatabase(dbName: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: ADMIN_URL });
  try {
    const result = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1', [dbName],
    );
    if (result.rows.length === 0) {
      // CREATE DATABASE can't run inside a transaction
      await pool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[globalSetup] Created database: ${dbName}`);
      return true;
    }
    return false;
  } finally {
    await pool.end();
  }
}

function pushSchema(databaseUrl: string): void {
  const schemaPath = path.resolve(__dirname, '../../core/prisma/schema');
  execSync(
    `npx prisma db push --schema "${schemaPath}" --url "${databaseUrl}" --accept-data-loss`,
    {
      stdio: 'pipe',
      timeout: 30_000,
    },
  );
}

export async function setup(): Promise<void> {
  for (const db of DATABASES) {
    try {
      const created = await ensureDatabase(db.name);
      pushSchema(db.url);
      console.log(`[globalSetup] ${db.name}: schema synced${created ? ' (new)' : ''}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[globalSetup] Failed for ${db.name}: ${msg}`);
      throw error;
    }
  }
}
