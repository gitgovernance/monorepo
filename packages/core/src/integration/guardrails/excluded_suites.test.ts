/**
 * CI Guardrail: Excluded Suites
 *
 * Spec: guardrails_module.md §4.3
 *
 * EARS Requirements:
 * - EARS-CI06: Every `*.e2e.test.ts` in this package is declared with the reason it is excluded
 *   from the default run.
 *
 * WHY THIS EXISTS
 *
 * `jest.config.cjs` ignores `*.e2e.test.ts`, so `pnpm test` — what CI runs — never collects them.
 * That is the right call: they need a PostgreSQL database CI does not provide, and running them
 * there would either be red forever or cost minutes on infrastructure nobody wants to pay for.
 *
 * The problem is not the exclusion, it is that the exclusion is SILENT. `pnpm test` reports
 * "3085 passed" and says nothing about the tests it never looked at. A file can be added to the
 * excluded set and no one finds out.
 *
 * This test runs in the default suite — no database, no network, ~1ms — and fails when the
 * excluded population changes without someone writing down why. It does not verify the product;
 * it makes the hole auditable, which is what was missing when `src/integration` accumulated 64
 * type errors behind a `tsconfig` exclude for six months.
 *
 * NOTE ON THE OTHER LAYER: typechecking is separate and has no exclusions. `tsc` is static — it
 * opens no connections and needs no database — so there is never a reason to keep a file out of
 * it. That confusion is what caused the six months of drift.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Every `*.e2e.test.ts` in this package, with the reason it does not run in CI.
 *
 * Paths are relative to `packages/core`. Adding a file here is a deliberate act: it must name a
 * prerequisite CI genuinely cannot satisfy, not a convenience.
 */
const EXCLUDED_FROM_DEFAULT_RUN: Record<string, string> = {
  'src/integration/pipeline/pipeline_integration.e2e.test.ts':
    'requires PostgreSQL (DATABASE_URL -> gitgov_core_e2e). Run with `pnpm test:e2e`.',
};

/** Recursively collects every `*.e2e.test.ts` under `dir`, as paths relative to the package root. */
function findE2eFiles(dir: string, packageRoot: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findE2eFiles(full, packageRoot));
    } else if (entry.name.endsWith('.e2e.test.ts')) {
      out.push(path.relative(packageRoot, full));
    }
  }
  return out;
}

describe('CI Guardrail: Excluded Suites', () => {
  const packageRoot = path.join(__dirname, '../../..');

  describe('4.3. Excluded Suite Declaration (EARS-CI06)', () => {
    it('[EARS-CI06] should declare every excluded e2e suite with its reason', () => {
      const found = findE2eFiles(path.join(packageRoot, 'src'), packageRoot).sort();

      // Anti-vacuity: if the scan returned nothing — wrong path, renamed convention — the
      // comparison below would pass against an empty declaration and prove nothing.
      expect(found.length).toBeGreaterThan(0);

      const declared = Object.keys(EXCLUDED_FROM_DEFAULT_RUN).sort();

      // Both directions matter. Undeclared files are the failure this guards against; orphaned
      // entries mean the list has rotted and nobody can tell which of them still exist.
      expect(found).toEqual(declared);
    });

    it('[EARS-CI06] should give a non-empty reason for every declared suite', () => {
      const reasons = Object.values(EXCLUDED_FROM_DEFAULT_RUN);
      expect(reasons.length).toBeGreaterThan(0);

      for (const reason of reasons) {
        // A reason that says nothing is the same as no reason: it cannot be audited.
        expect(reason.trim().length).toBeGreaterThan(20);
      }
    });

    it('[EARS-CI06] should not be excluded from the default run itself', () => {
      // This file must run in CI or it guards nothing. If it ever gets renamed to `.e2e.test.ts`
      // it would exclude itself and silently stop protecting the very thing it exists for.
      expect(__filename.endsWith('.e2e.test.ts')).toBe(false);
      expect(__filename.endsWith('.test.ts')).toBe(true);
    });
  });
});
