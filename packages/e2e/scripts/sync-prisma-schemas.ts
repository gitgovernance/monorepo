/**
 * sync-prisma-schemas.ts (E2E)
 *
 * Copies protocol.prisma and audit.prisma from core to e2e/prisma/schema/.
 * No merge needed — E2E uses core schemas directly (single-tenant, no extensions).
 *
 * Pattern: same as saas-api/scripts/sync-prisma-schemas.ts but simpler (copy only, no merge).
 * Architecture: packages/blueprints/03_products/core/specs/modules/shared/prisma/schema_layering.md
 *
 * Usage:
 *   pnpm prisma:sync
 *   tsx scripts/sync-prisma-schemas.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const E2E_ROOT = resolve(SCRIPT_DIR, '..');
const CORE_SCHEMA_DIR = resolve(E2E_ROOT, '../core/prisma/schema');
const E2E_SCHEMA_DIR = resolve(E2E_ROOT, 'prisma/schema');

const SCHEMAS_TO_COPY = ['protocol.prisma', 'audit.prisma'];

const HEADER = [
  '// ⚠️ COPIED from core — DO NOT EDIT',
  '// Source: packages/core/prisma/schema/',
  '// Re-generate: pnpm prisma:sync (in packages/e2e)',
  `// Synced at: ${new Date().toISOString()}`,
  '',
].join('\n');

for (const schema of SCHEMAS_TO_COPY) {
  const source = resolve(CORE_SCHEMA_DIR, schema);
  if (!existsSync(source)) {
    console.error(`❌ Source not found: ${source}`);
    process.exit(1);
  }

  const content = readFileSync(source, 'utf-8');
  // Remove the generator/datasource block (base.prisma has its own)
  const withoutGenerator = content
    .replace(/datasource\s+db\s*\{[^}]*\}/s, '')
    .replace(/generator\s+client\s*\{[^}]*\}/s, '')
    .trim();

  const outPath = resolve(E2E_SCHEMA_DIR, schema);
  writeFileSync(outPath, HEADER + '\n' + withoutGenerator + '\n');
  console.log(`  ✓ ${schema}`);
}

console.log('✅ E2E Prisma schemas synced from core');
