/**
 * CI Guardrail: Environment Reads in Runtime-Agnostic Bundles
 *
 * Spec: guardrails_module.md §4.5
 *
 * - EARS-CI08: every `process.env` read in the runtime-agnostic bundles is declared with
 *   a reason; the check fails in both directions so the list cannot rot.
 *
 * WHY THIS EXISTS
 *
 * The builtins guardrail (clean_exports.test.ts) analyzes import specifiers, and its own
 * spec note admits the blind spot: `process.env`, `globalThis.require` and `eval` are not
 * imports and are invisible there. Measured 2026-08-29: `index.js` and `memory.js` each
 * reach `process.env["NODE_ENV"]` three times (the logger), with no `typeof process`
 * guard — in a browser, the bare `process` reference throws ReferenceError the moment a
 * logger is created. The root is already not browser-safe because of the declared crypto
 * gap, and /memory targets serverless where `process` exists — so today's reads are
 * declared, not forbidden. What this gate protects is that no NEW environment coupling
 * enters these bundles silently.
 */

import * as fs from 'fs';
import * as path from 'path';

const DIST = path.resolve(__dirname, '../../../dist/src');

/**
 * Env vars each runtime-agnostic bundle is allowed to read, with the reason.
 * Anything read and not declared fails; anything declared and no longer read fails.
 */
const ALLOWED_ENV_READS: Record<string, Record<string, string>> = {
  'index.js': {
    NODE_ENV:
      'The logger silences itself under test. Read WITHOUT a typeof-process guard — ' +
      'noted as debt in guardrails_module.md §4.5: fixing it is a logger change, not a gate change.',
    LOG_LEVEL: 'Logger verbosity override (logger.ts:60). Same guard debt as NODE_ENV.',
    GITGOV_LLM_API_KEY:
      'FindingDetector reads the LLM key from the environment (finding_detector.ts:50). ' +
      'Day-one declaration of an existing coupling: an API key read in the runtime-agnostic ' +
      'root ties LLM detection to Node-like runtimes. Moving it behind injected config is ' +
      'a FindingDetector design change, recorded — not silently blessed.',
  },
  'shared/memory/memory.js': {
    NODE_ENV: 'Same logger, bundled into the memory entrypoint. Same guard debt.',
  },
};

/**
 * Every env var a bundle reads, in the three shapes esbuild emits:
 * `process.env.X`, `process.env["X"]`, `process.env['X']`.
 */
function findEnvReads(filePath: string): { variable: string; count: number }[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const counts = new Map<string, number>();
  const forms = [
    /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /process\.env\[\s*"([^"]+)"\s*\]/g,
    /process\.env\[\s*'([^']+)'\s*\]/g,
  ];
  for (const re of forms) {
    for (const m of content.matchAll(re)) {
      const v = m[1]!;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([variable, count]) => ({ variable, count }));
}

describe('CI Guardrail: Environment Reads', () => {
  describe('4.5. Environment Reads in Runtime-Agnostic Bundles (EARS-CI08)', () => {
    it('[EARS-CI08] should declare every env var the agnostic bundles read', () => {
      let inspectedReads = 0;

      for (const [entrypoint, allowed] of Object.entries(ALLOWED_ENV_READS)) {
        const bundle = path.join(DIST, entrypoint);
        if (!fs.existsSync(bundle)) {
          throw new Error(`Bundle not found: ${bundle}. Run \`pnpm build\` first.`);
        }
        const reads = findEnvReads(bundle);
        inspectedReads += reads.reduce((n, r) => n + r.count, 0);

        const undeclared = reads.filter((r) => !(r.variable in allowed));
        if (undeclared.length > 0) {
          throw new Error(
            `[EARS-CI08] Undeclared env reads in ${entrypoint}:\n` +
            undeclared.map((r) => `  - process.env.${r.variable} (×${r.count})`).join('\n') +
            `\nDeclare each in ALLOWED_ENV_READS with its reason, or remove the read.`,
          );
        }
      }

      // Anti-vacuity: a zero over zero inspected reads is a blind instrument, not a result.
      // The logger reads NODE_ENV in both bundles today; if this ever legitimately reaches
      // zero, the allowlist entries become orphans and the companion test fails instead.
      expect(inspectedReads).toBeGreaterThan(0);
    });

    it('[EARS-CI08] should fail when a declared env read no longer exists', () => {
      const orphans: string[] = [];

      for (const [entrypoint, allowed] of Object.entries(ALLOWED_ENV_READS)) {
        const reads = new Set(findEnvReads(path.join(DIST, entrypoint)).map((r) => r.variable));
        for (const variable of Object.keys(allowed)) {
          if (!reads.has(variable)) orphans.push(`${entrypoint} :: ${variable}`);
        }
      }

      if (orphans.length > 0) {
        throw new Error(
          `[EARS-CI08] Orphaned allowlist entries (declared but no longer read):\n` +
          orphans.map((o) => `  - ${o}`).join('\n') +
          `\nRemove them so the list keeps describing reality.`,
        );
      }

      expect(orphans).toHaveLength(0);
    });
  });
});
