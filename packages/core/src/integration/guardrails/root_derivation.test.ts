/**
 * CI Guardrail: Root Derivation
 *
 * Spec: guardrails_module.md §4.4
 *
 * EARS Requirements:
 * - EARS-CI07: Every `process.cwd()` in source is declared with a category and a reason.
 *
 * THE PATTERN THIS EXISTS FOR
 *
 * A collaborator receives a root another component already resolved and, instead of receiving it,
 * re-derives it from the environment with `process.cwd()`. It is right for as long as the command
 * is invoked from the repo, and wrong the moment the two roots diverge — which is exactly what
 * worktree mode does: `repoRoot` is the user's repo, `projectRoot` is `~/.gitgov/worktrees/<hash>`,
 * and only one of them has `node_modules`.
 *
 * Four occurrences: WTSYNC-A5/A6 → EARS-B2 → EARS-C16 (PROJ-B7) → INIT-M3. Three previous fixes did
 * not prevent the fourth, because nothing stopped a fifth from being written.
 *
 * WHY A GATE AND NOT A FIFTH PATCH
 *
 * The argument is about the detector, not the problem. A hand census hunting for THIS pattern, on
 * purpose, missed 4 of 25 sites in the package it did measure and 10 of 10 in the package it did
 * not. A patch closes what the census happened to see and inherits its measurement error.
 *
 * WHAT THIS DOES NOT PROVE
 *
 * A declared site is not a correct site — the categories record someone's judgement, not a proof.
 * Green means "no undeclared root derivation", nothing stronger.
 */

import * as fs from 'fs';
import * as path from 'path';

type Category =
  /** The CLI is the entry point: cwd IS where the user invoked it. Nothing resolved it earlier. */
  | 'origin'
  /** Printed for the user to read. Never used to resolve anything. */
  | 'display'
  /** Resolving a relative path the user typed on the command line. */
  | 'user-input'
  /** Last resort after every injected value was absent. */
  | 'fallback';

type Declaration = { category: Category; why: string };

/**
 * Every `process.cwd()` in source, keyed by the exact source line, with why it is legitimate.
 *
 * Keyed by LINE TEXT, not by `file:line`: line numbers shift with every edit above them, and a
 * fossil entry pointing at a line that moved would silently authorise code nobody approved.
 *
 * Adding an entry is a deliberate act. The question to answer is not "does this work" — it works
 * whenever the command is invoked from the repo — but "did somebody already resolve this root?"
 * If the answer is yes, the site is the defect and the fix is to receive the root, not declare it.
 */
const ALLOWED_ROOT_DERIVATIONS: Record<string, Declaration> = {
  // ── packages/cli — init ────────────────────────────────────────────────────────────────
  'const repoRoot = process.cwd();': {
    category: 'origin',
    why: 'init runs before any root exists; cwd is where the user invoked the CLI and IS the repo root it then hands to the container via setInitMode().',
  },
  'const projectRoot = process.cwd();': {
    category: 'origin',
    why: 'Same as above, in validateEnvironment: nothing has resolved a root yet at this point.',
  },
  'const currentDir = process.cwd();': {
    category: 'origin',
    why: 'Default project name is derived from the directory the user invoked the CLI in.',
  },
  'console.log(`Initialized GitGovernance in ${process.cwd()}\\n`);': {
    category: 'display',
    why: 'Printed for the user. Not used to resolve anything.',
  },
  'console.log(`  Project:  ${process.cwd()}`);': {
    category: 'display',
    why: 'status output. Not used to resolve anything.',
  },

  // ── packages/cli — agent install flow ──────────────────────────────────────────────────
  'const absPath = isAbsolute(pkg) ? pkg : resolve(process.cwd(), pkg);': {
    category: 'user-input',
    why: 'Resolves a relative path the user typed. cwd is the correct base for user-supplied relative paths, by POSIX convention.',
  },
  "const req = createRequire(join(process.cwd(), 'package.json'));": {
    category: 'origin',
    why: 'Installing into the user\'s project: the package manager operates on the invocation directory, which is what the user means by "here".',
  },
  "const pm = existsSync(join(process.cwd(), 'pnpm-lock.yaml')) ? 'pnpm'": {
    category: 'origin',
    why: 'Detects which package manager the invocation directory uses, to install with the same one.',
  },
  ": existsSync(join(process.cwd(), 'yarn.lock')) ? 'yarn' : 'npm';": {
    category: 'origin',
    why: 'Continuation of the package manager detection above.',
  },
  "execSync(installCmd, { cwd: process.cwd(), stdio: 'pipe' });": {
    category: 'origin',
    why: 'Runs the install in the invocation directory, matching the manager detected above.',
  },

  // ── packages/cli — task ────────────────────────────────────────────────────────────────
  ': path.resolve(process.cwd(), filePath);': {
    category: 'user-input',
    why: 'Resolves a relative --file path the user typed.',
  },

  // ── packages/cli — DI ──────────────────────────────────────────────────────────────────
  'const cwd = options?.cwd || repoRoot || process.cwd();': {
    category: 'fallback',
    why: 'Last resort after the explicit option and the resolved repoRoot are both absent. The ORDER is the guarantee: a resolved root always wins.',
  },
  'const cwd = options?.cwd || this.projectRoot || process.cwd();': {
    category: 'fallback',
    why: 'Same shape: falls through only when nothing was injected.',
  },

  // ── packages/cli — login ───────────────────────────────────────────────────────────────
  "execSync('git rev-parse --git-dir', { cwd: process.cwd(), stdio: 'pipe', timeout: 5000 });": {
    category: 'origin',
    why: 'Probes whether the invocation directory is a git repo. The question is about cwd itself.',
  },
  'cwd: process.cwd(),': {
    category: 'origin',
    why: 'git probes run against the invocation directory, which is the subject of the question being asked.',
  },
  'execSync(`git rev-parse --verify ${stateBranch}`, { cwd: process.cwd(), stdio: \'pipe\', timeout: 2000 });': {
    category: 'origin',
    why: 'Probes the invocation directory for the state branch.',
  },
  'const repoRoot = findProjectRoot(process.cwd());': {
    category: 'origin',
    why: 'This IS the resolution step: it walks up from the invocation directory to find the repo root. Nobody resolved it earlier — this is where it happens.',
  },

  // ── packages/core ──────────────────────────────────────────────────────────────────────
  'this.cwd = config.cwd ?? process.cwd();': {
    category: 'fallback',
    why: 'CliLlmProvider falls back only when no cwd was injected.',
  },
  'export function findProjectRoot(startPath: string = process.cwd()): string | null {': {
    category: 'fallback',
    why: 'Default parameter. Every caller that knows a root passes it; the default serves the CLI entry point.',
  },
  'const baseDir = options.baseDir || process.cwd();': {
    category: 'fallback',
    why: 'SourceAuditor falls back only when no baseDir was supplied.',
  },
  'const cwd = this.repoRoot || process.cwd();': {
    category: 'fallback',
    why: 'LocalGitModule falls back only when constructed without a repoRoot.',
  },
};

/** Source roots scanned. `packages/cli` is included even though CI does not run it — see §4.4. */
const SCANNED_ROOTS = [
  path.join(__dirname, '../../../src'),
  path.join(__dirname, '../../../../cli/src'),
];

type Site = { file: string; line: number; text: string };

/**
 * Strips line and block comments so a documented `process.cwd()` is not reported as a use of one.
 *
 * This matters concretely: of the nine occurrences in `packages/core/src`, five are comments, and
 * four of those were written while fixing PROJ-B7. A gate that flagged them would be reporting the
 * documentation of its own cause — and would be switched off within a week.
 */
function stripComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;

  for (const raw of source.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const blockStart = line.indexOf('/*');
    if (blockStart !== -1) {
      const end = line.indexOf('*/', blockStart + 2);
      if (end === -1) { inBlock = true; line = line.slice(0, blockStart); }
      else line = line.slice(0, blockStart) + line.slice(end + 2);
    }
    const lineStart = line.indexOf('//');
    if (lineStart !== -1) line = line.slice(0, lineStart);
    out.push(line);
  }
  return out;
}

/** Every `process.cwd()` in code — comments excluded — under `dir`. */
function findRootDerivations(dir: string): Site[] {
  const found: Site[] = [];
  if (!fs.existsSync(dir)) return found;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { found.push(...findRootDerivations(full)); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;

    const raw = fs.readFileSync(full, 'utf-8');
    stripComments(raw).forEach((line, i) => {
      if (line.includes('process.cwd()')) {
        found.push({ file: full, line: i + 1, text: line.trim() });
      }
    });
  }
  return found;
}

describe('CI Guardrail: Root Derivation', () => {
  const sites = SCANNED_ROOTS.flatMap(findRootDerivations);

  describe('4.4. Root Derivation Allowlist (EARS-CI07)', () => {
    it('[EARS-CI07] should declare every root derivation with a category and a reason', () => {
      // Anti-vacuity: if the scan found nothing — wrong path, renamed API — every assertion below
      // would pass against an empty set and prove nothing.
      expect(sites.length).toBeGreaterThan(0);

      const undeclared = sites.filter((s) => !(s.text in ALLOWED_ROOT_DERIVATIONS));

      if (undeclared.length > 0) {
        const rows = undeclared
          .map((s) => `  - ${path.relative(path.join(__dirname, '../../../..'), s.file)}:${s.line}\n      ${s.text}`)
          .join('\n');
        throw new Error(
          `[EARS-CI07] Undeclared root derivations:\n${rows}\n\n` +
          `Before declaring one, answer: did something else already resolve this root? If yes, the ` +
          `site is the defect — receive the root instead of re-deriving it (see PROJ-B7, INIT-M3). ` +
          `If no, add the line to ALLOWED_ROOT_DERIVATIONS with its category and the reason.`,
        );
      }

      expect(undeclared).toHaveLength(0);
    });

    it('[EARS-CI07] should fail when a declared site no longer exists', () => {
      // The other direction. Without it the list rots: nobody can tell which entries still describe
      // live code, so nobody dares delete any, and it grows monotonically until it means nothing.
      const present = new Set(sites.map((s) => s.text));
      const orphans = Object.keys(ALLOWED_ROOT_DERIVATIONS).filter((k) => !present.has(k));

      if (orphans.length > 0) {
        throw new Error(
          `[EARS-CI07] Orphaned entries — declared but no longer in the source:\n` +
          orphans.map((o) => `  - ${o}`).join('\n') +
          `\n\nRemove them. An entry whose site is gone authorises nothing and hides that the list is stale.`,
        );
      }

      expect(orphans).toHaveLength(0);
    });

    it('[EARS-CI07] should not report process.cwd() inside comments', () => {
      const stripped = stripComments([
        'const a = 1;',
        '// const root = process.cwd();',
        '/* const other = process.cwd(); */',
        '/**',
        ' * Documented: process.cwd() was removed here.',
        ' */',
        'const real = process.cwd();',
      ].join('\n'));

      const hits = stripped.filter((l) => l.includes('process.cwd()'));

      // Exactly one: the line that is actually code. Four commented mentions are invisible.
      expect(hits).toHaveLength(1);
      expect(hits[0]?.trim()).toBe('const real = process.cwd();');
    });

    it('[EARS-CI07] should give a category and a non-empty reason for every declaration', () => {
      const entries = Object.entries(ALLOWED_ROOT_DERIVATIONS);
      expect(entries.length).toBeGreaterThan(0);

      const valid: Category[] = ['origin', 'display', 'user-input', 'fallback'];

      // A reason that says nothing is the same as no reason: it cannot be audited. Collecting the
      // offenders instead of asserting per-iteration so the failure names every one of them at once.
      const badCategory = entries.filter(([, d]) => !valid.includes(d.category)).map(([s]) => s);
      const badReason = entries.filter(([, d]) => d.why.trim().length <= 20).map(([s]) => s);

      if (badCategory.length || badReason.length) {
        throw new Error(
          `[EARS-CI07] Malformed declarations:\n` +
          badCategory.map((s) => `  - invalid category: ${s}`).join('\n') +
          badReason.map((s) => `  - reason too short: ${s}`).join('\n'),
        );
      }

      expect(badCategory).toHaveLength(0);
      expect(badReason).toHaveLength(0);
    });
  });
});
