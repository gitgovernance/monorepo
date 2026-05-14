/**
 * onboarding_cli_only_e2e.test.ts — Phase E (EARS OB-E1 to OB-E6)
 *
 * Spec: e2e-private/specs/onboarding_flow.md §3.4, §4.4
 *
 * Escenario 1: CLI puro sin SaaS. Owner y collaborator trabajan solo con el CLI.
 * No requiere servicios, no requiere SaaS, no requiere Playwright.
 * Solo git repos locales con bare remote.
 *
 * Setup:
 * - Bare repository as remote (git init --bare)
 * - Owner repo: gitgov init → sync push
 * - Collaborator repo: git clone → gitgov init (join path) → trabaja → sync push
 *
 * Keys: per-repo en {worktree}/.gitgov/keys/ (aislamiento criptografico).
 * Cada actor tiene su propio keypair. PublicKeys son diferentes entre owner y collaborator.
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper: compute worktree base path (matches core getWorktreeBasePath)
const getWorktreeBasePath = (repoPath: string): string => {
  const resolvedPath = fs.realpathSync(repoPath);
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
  return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
};

// Helper: keys dir is per-worktree
const getKeysDir = (worktreePath: string): string => path.join(worktreePath, '.gitgov', 'keys');

// Helper: run gitgov CLI command
const runCliCommand = (args: string[], options: { cwd: string }) => {
  const cliPath = path.resolve(__dirname, '../build/dist/gitgov.mjs');
  try {
    const result = execSync(`node "${cliPath}" ${args.join(' ')}`, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
    });
    return { success: true, output: result, error: null };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message || '',
    };
  }
};

// Helper: clean up worktree
const cleanupWorktree = (repoPath: string, wtPath: string) => {
  try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
  if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true, force: true });
};

describe('Phase E — CLI-only Owner + Collaborator (OB-E1 to OB-E6)', () => {
  let tempDir: string;
  let ownerRepoPath: string;
  let remotePath: string;
  let ownerWorktree: string;
  const worktreesToClean: Array<{ repo: string; wt: string }> = [];

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-ob-e-'));

    // Create bare remote
    remotePath = path.join(tempDir, 'remote.git');
    fs.mkdirSync(remotePath);
    execSync('git init --bare', { cwd: remotePath, stdio: 'pipe' });

    // Create owner repo
    ownerRepoPath = path.join(tempDir, 'owner-repo');
    fs.mkdirSync(ownerRepoPath);
    execSync('git init --initial-branch=main', { cwd: ownerRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Owner"', { cwd: ownerRepoPath, stdio: 'pipe' });
    execSync('git config user.email "owner@test.com"', { cwd: ownerRepoPath, stdio: 'pipe' });
    fs.writeFileSync(path.join(ownerRepoPath, 'README.md'), '# Test Project\n');
    execSync('git add README.md', { cwd: ownerRepoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: ownerRepoPath, stdio: 'pipe' });
    execSync(`git remote add origin "${remotePath}"`, { cwd: ownerRepoPath, stdio: 'pipe' });
    execSync('git push -u origin main', { cwd: ownerRepoPath, stdio: 'pipe' });

    ownerWorktree = getWorktreeBasePath(ownerRepoPath);
    worktreesToClean.push({ repo: ownerRepoPath, wt: ownerWorktree });
  });

  afterAll(() => {
    for (const { repo, wt } of worktreesToClean) {
      cleanupWorktree(repo, wt);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Owner flow (OB-E1..E2)
  // ══════════════════════════════════════════════════════════════════════════

  // [OB-E1] gitgov init creates full project structure in worktree:
  //   config.json, policy.yml, actors/ (human + agent:gitgov-audit + specialists),
  //   keys/ with keypair, cycles/ with root cycle.
  //   Keys in {worktree}/.gitgov/keys/ — NOT ~/.gitgov/keys/ (per-repo isolation).
  // [OB-E2] gitgov sync push creates gitgov-state branch on bare remote.
  //   Verify: git ls-tree -r origin/gitgov-state shows actors/, config.json, etc.
  it.todo('[OB-E1..E2] owner init creates project and push creates gitgov-state');

  // ══════════════════════════════════════════════════════════════════════════
  // Collaborator flow (OB-E3..E5) — sequential, depends on owner flow above
  // ══════════════════════════════════════════════════════════════════════════

  // [OB-E3] Collaborator clones → gitgov init → DI fetches gitgov-state →
  //   detects "already initialized" (INIT-J1) → join path (INIT-J2) →
  //   ensureActorInProject → new keypair (different from owner's).
  //   Expect: stdout "Joined existing project as {actorId}" + new .key file.
  // [OB-E4] Collaborator: task new + lint → Three Gates pass.
  //   Signed with collaborator's key, not owner's.
  // [OB-E5] Collaborator: sync push → gitgov-state has BOTH ActorRecords
  //   with different publicKey values. All signatures verify.
  //   Verify: git ls-tree shows 2+ actor files + publicKeys differ.
  it.todo('[OB-E3..E5] collaborator joins, signs, and both actors on gitgov-state');

  // ══════════════════════════════════════════════════════════════════════════
  // Read-only collaborator (OB-E6) — independent flow
  // ══════════════════════════════════════════════════════════════════════════

  // [OB-E6] Collaborator with read-only git access.
  //   Can: clone, gitgov init (join), gitgov audit (local scan + findings + policy).
  //   Cannot: gitgov sync push (git push fails with permission denied).
  //   Validates: CLI governance works for read-only contributors.
  it.todo('[OB-E6] read-only collaborator audits locally but push fails');
});
