/**
 * CI Guardrail: Clean Exports
 *
 * Spec: guardrails_module.md §4.1-4.2
 *
 * Each published entrypoint of `@gitgov/core` declares which Node builtins it is
 * allowed to reach. This file checks the BUILT bundles against those declarations.
 *
 * EARS Requirements:
 * - EARS-CI01: Analyze imports of the @gitgov/core entrypoint
 * - EARS-CI02: Fail if an entrypoint imports a Node builtin outside its declared allowlist
 * - EARS-CI03: Name the module, the line and the snippet on failure
 * - EARS-CI04: The memory subpath must reach no filesystem builtin
 * - EARS-CI05: The fs subpath is expected to reach filesystem builtins
 *
 * WHY AN ALLOWLIST AND NOT A LIST OF PROHIBITED MODULES
 *
 * Until 2026-08-26 this file matched against `['fs','path','child_process','chokidar']`.
 * A denylist can only catch what somebody remembered to write down, and the property
 * being protected — "this entrypoint runs outside Node" — is closed on the allowed side
 * and open on the forbidden side: Node keeps adding builtins, each reachable as `x` and
 * as `node:x`. Two real misses came out of that shape:
 *
 *   - `module` was absent for seven months. `local_backend.ts` pulls `createRequire`
 *     into the root bundle and nothing reported it.
 *   - `os`, `net`, `dns`, `worker_threads` and every future builtin were equally invisible.
 *
 * Inverting it makes an unknown builtin fail by default: to allow one you have to write
 * down why. The list below is the whole policy, and every entry carries its reason.
 *
 * WHAT THIS DOES NOT PROVE
 *
 * An allowlist over import specifiers raises the floor; it does not establish that an
 * entrypoint runs in a browser. `process.env`, `globalThis.require` and `eval` are not
 * imports and are invisible here. Green means "no undeclared Node builtin is imported",
 * nothing stronger.
 */

import * as fs from 'fs';
import * as path from 'path';
import { builtinModules } from 'module';

/**
 * Node builtins each entrypoint may reach, with the reason it is allowed.
 *
 * The criterion is NOT "is it a Node builtin" — it is "can the target runtime of this
 * entrypoint run it". That is why the lists differ: `/fs` exists precisely to hold what
 * the root may not touch.
 *
 * Only entrypoints listed here are checked. `/github`, `/prisma` and `/audit` are NOT,
 * and adding them is a separate decision — see the note at the end of this comment.
 */
const ALLOWED_BUILTINS: Record<string, { allow: string[]; why: Record<string, string> }> = {
  // @gitgov/core — must stay importable by runtime-agnostic consumers (saas-web imports
  // types from here). Anything not listed is a violation.
  'index.js': {
    allow: ['crypto', 'events', 'util'],
    why: {
      crypto:
        'KNOWN GAP, allowed under protest. The bundle reaches generateKeyPairSync, ' +
        'createCipheriv and diffieHellman. Browsers expose Web Crypto, a DIFFERENT API — ' +
        'not a polyfill — so the root is not browser-safe even when this test is green. ' +
        'Closing it means reworking Ed25519 signing (RecordSigner, Crypto), its own project. ' +
        'Forbidding it today would only produce a permanently red guardrail nobody can fix.',
      events: 'EventEmitter is plain JavaScript. Every bundler substitutes it without loss.',
      util: 'promisify is plain JavaScript, same reasoning as events.',
    },
  },

  // @gitgov/core/memory — in-memory implementations, meant to run on serverless runtimes.
  // The property here is "no filesystem", not "browser-safe": crypto and util are fine
  // on every serverless target.
  'shared/memory/memory.js': {
    allow: ['crypto', 'util'],
    why: {
      crypto: 'Signing and hashing. Available on every serverless runtime this targets.',
      util: 'promisify. Plain JavaScript.',
    },
  },
};

/**
 * Builtins the fs subpath is expected to reach — EARS-CI05.
 * Their presence is the guarantee, not a violation: a `/fs` that stopped importing them
 * would mean the Node-only implementations left the subpath they are supposed to live in.
 *
 * Only `fs` and `path`, on purpose. `child_process` is also imported today, by
 * `CliLlmProvider` — but that is incidental, not what `/fs` means. Requiring it would
 * turn the guardrail red the day that class legitimately moves elsewhere: a correct
 * change punished by a policy that mistook a current fact for a guarantee.
 */
const FS_SUBPATH_EXPECTED = ['fs', 'path'];

/** Every builtin, with `node:` stripped and subpaths (`fs/promises`) reduced to their root. */
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));

function normalize(specifier: string): string {
  return specifier.replace(/^node:/, '').split('/')[0] ?? '';
}

/**
 * Every module specifier the bundle imports, with the line it came from.
 *
 * Covers the four shapes a specifier can take. The bare side-effect form
 * (`import 'child_process';`) was missing until 2026-08-26: esbuild emits it whenever it
 * drops an unused binding but must keep the import, so a real violation sat in the bundle
 * while the guardrail reported clean. It was found by a negative control — reintroducing
 * a prohibited import produced exactly that shape and nothing was reported.
 */
function findImports(filePath: string): { specifier: string; line: number; snippet: string }[] {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const found: { specifier: string; line: number; snippet: string }[] = [];

  const patterns = [
    /from\s*['"`]([^'"`]+)['"`]/,
    /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
    /^\s*import\s+['"`]([^'"`]+)['"`]/,
  ];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match?.[1]) {
        found.push({ specifier: match[1], line: index + 1, snippet: line.trim().slice(0, 80) });
        break; // one specifier per line is enough; bundles emit one import per line
      }
    }
  });

  return found;
}

/** Builtins an entrypoint imports that its allowlist does not declare. */
function findUndeclaredBuiltins(
  filePath: string,
  allowed: string[]
): { module: string; line: number; snippet: string }[] {
  return findImports(filePath)
    .map((i) => ({ ...i, module: normalize(i.specifier) }))
    .filter((i) => BUILTINS.has(i.module) && !allowed.includes(i.module))
    .map(({ module, line, snippet }) => ({ module, line, snippet }));
}

/** EARS-CI03: the report must name the module, the line and the source snippet. */
function buildReport(
  entrypoint: string,
  findings: { module: string; line: number; snippet: string }[]
): string {
  const rows = findings.map((f) => `  - ${f.module} (line ${f.line}): ${f.snippet}`).join('\n');
  return (
    `[EARS-CI03] Undeclared Node builtins in ${entrypoint}:\n${rows}\n\n` +
    `Either move the code behind a subpath that allows them (@gitgov/core/fs), or add ` +
    `the builtin to ALLOWED_BUILTINS with the reason it is safe for this entrypoint.`
  );
}

describe('CI Guardrail: Clean Exports', () => {
  const distPath = path.join(__dirname, '../../../dist/src');

  function readEntrypoint(relative: string): string {
    const full = path.join(distPath, relative);
    if (!fs.existsSync(full)) {
      throw new Error(`Build output not found: ${full}. Run 'pnpm build' first.`);
    }
    return full;
  }

  describe('4.1. Main Entrypoint Validation (EARS-CI01 to CI03)', () => {
    it('[EARS-CI01] should analyze imports of main entrypoint', () => {
      const indexPath = readEntrypoint('index.js');
      const imports = findImports(indexPath);

      // Anti-vacuity: every other assertion in this file reads a zero from this scan.
      // If the scan returned nothing — wrong path, changed bundle format — the checks
      // below would pass without inspecting anything.
      expect(imports.length).toBeGreaterThan(0);
      expect(imports.some((i) => BUILTINS.has(normalize(i.specifier)))).toBe(true);
    });

    it('[EARS-CI02] should import no Node builtin outside its declared allowlist', () => {
      const entry = ALLOWED_BUILTINS['index.js']!;
      const findings = findUndeclaredBuiltins(readEntrypoint('index.js'), entry.allow);

      if (findings.length > 0) {
        throw new Error(buildReport('@gitgov/core', findings));
      }

      expect(findings).toHaveLength(0);
    });

    it('[EARS-CI03] should name module, line and snippet in the failure report', () => {
      // The report used to be built and then handed to `fail()`, a Jasmine global Jest
      // does not expose: the call raised `ReferenceError: fail is not defined` BEFORE
      // printing, so this requirement was dead code for seven months. Nothing verified
      // the report itself, because it only runs on the failure path.
      const report = buildReport('@gitgov/core', [
        { module: 'child_process', line: 9, snippet: "import { execSync } from 'child_process';" },
      ]);

      expect(report).toContain('child_process');
      expect(report).toContain('line 9');
      expect(report).toContain("import { execSync } from 'child_process';");
      expect(report).toContain('[EARS-CI03]');
    });
  });

  describe('4.2. Subpath Validation (EARS-CI04 to CI05)', () => {
    it('[EARS-CI04] should import no Node builtin outside the memory allowlist', () => {
      const entry = ALLOWED_BUILTINS['shared/memory/memory.js']!;
      const memoryPath = readEntrypoint('shared/memory/memory.js');
      const findings = findUndeclaredBuiltins(memoryPath, entry.allow);

      if (findings.length > 0) {
        throw new Error(buildReport('@gitgov/core/memory', findings));
      }

      // The old version of this test asserted against the prohibited-module list, so it
      // reported green while the bundle imported `crypto` and `util` — neither was on
      // that list. The claim "serverless-safe" was never measured. Now those two are
      // declared with a reason, and anything else fails.
      expect(findings).toHaveLength(0);
    });

    it('[EARS-CI05] should import fs and path (expected for filesystem implementations)', () => {
      const fsPath = readEntrypoint('shared/fs/fs.js');
      const imported = new Set(findImports(fsPath).map((i) => normalize(i.specifier)));

      // Asserting on the parsed specifiers rather than on `content.toContain('fs')`,
      // which matched the substring 'fs' anywhere in the bundle — including in the word
      // `@gitgov/core/fs` — and so could not have failed.
      for (const expected of FS_SUBPATH_EXPECTED) {
        expect(imported.has(expected)).toBe(true);
      }
    });
  });
});
