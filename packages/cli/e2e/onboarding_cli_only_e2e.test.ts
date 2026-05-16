/**
 * onboarding_cli_only_e2e.test.ts — Phase E (EARS OB-E1 to OB-E6)
 *
 * Spec: e2e-private/specs/onboarding_flow.md §3.4, §4.4
 *
 * Escenario 1: CLI puro sin SaaS. Owner y collaborator trabajan solo con el CLI.
 * No requiere servicios, no requiere SaaS, no requiere Playwright.
 * Solo git repos locales con bare remote.
 *
 * Keys: per-repo en {worktree}/.gitgov/keys/ (aislamiento criptografico).
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const getWorktreeBasePath = (repoPath: string): string => {
  const resolvedPath = fs.realpathSync(repoPath);
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
  return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
};

const getKeysDir = (worktreePath: string): string => path.join(worktreePath, '.gitgov', 'keys');

const runCliCommand = (args: string[], options: { cwd: string; expectError?: boolean }) => {
  const cliPath = path.resolve(__dirname, '../build/dist/gitgov.mjs');
  const escapedArgs = args.map(a => a.includes(' ') ? `"${a}"` : a);
  try {
    const result = execSync(`node "${cliPath}" ${escapedArgs.join(' ')}`, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
    });
    return { success: true, output: result, error: '' };
  } catch (error: any) {
    if (options.expectError) {
      return { success: false, output: error.stdout || '', error: error.stderr || error.message || '' };
    }
    throw new Error(`CLI failed: ${error.stderr || error.message}\nStdout: ${error.stdout || ''}`);
  }
};

const cleanupWorktree = (repoPath: string, wtPath: string) => {
  try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
  if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true, force: true });
};

describe('Phase E — CLI-only Owner + Collaborator (OB-E1 to OB-E6)', () => {
  let tempDir: string;
  let ownerRepoPath: string;
  let remotePath: string;
  let ownerWorktree: string;
  let collabRepoPath: string;
  let collabWorktree: string;
  const worktreesToClean: Array<{ repo: string; wt: string }> = [];

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-ob-e-'));

    remotePath = path.join(tempDir, 'remote.git');
    fs.mkdirSync(remotePath);
    execSync('git init --bare', { cwd: remotePath, stdio: 'pipe' });

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

  // [OB-E1]
  it('[OB-E1] owner init creates .gitgov/ with actor, agent, keys, config', () => {
    const result = runCliCommand(
      ['init', '--name', 'E2E CLI-only', '--actor-name', 'Owner User', '--login', 'owner', '--quiet'],
      { cwd: ownerRepoPath },
    );
    expect(result.success).toBe(true);

    const gitgovDir = path.join(ownerWorktree, '.gitgov');
    expect(fs.existsSync(path.join(gitgovDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(gitgovDir, 'policy.yml'))).toBe(true);

    const actorsDir = path.join(gitgovDir, 'actors');
    const actorFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json'));
    expect(actorFiles.length).toBeGreaterThanOrEqual(2);

    const keysDir = getKeysDir(ownerWorktree);
    const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
    expect(keyFiles.length).toBeGreaterThanOrEqual(1);
  });

  // [OB-E2]
  it('[OB-E2] owner push creates gitgov-state on remote', () => {
    const result = runCliCommand(['sync', 'push'], { cwd: ownerRepoPath });
    expect(result.success).toBe(true);

    const lsTree = execSync('git ls-tree -r --name-only origin/gitgov-state', {
      cwd: ownerRepoPath, encoding: 'utf8',
    });
    expect(lsTree).toContain('.gitgov/config.json');
    expect(lsTree).toContain('.gitgov/actors/');
  });

  // [OB-E3]
  it('[OB-E3] collaborator clones and joins with new keypair via gitgov init', () => {
    collabRepoPath = path.join(tempDir, 'collab-repo');
    execSync(`git clone "${remotePath}" "${collabRepoPath}"`, { stdio: 'pipe' });
    execSync('git config user.name "Collab"', { cwd: collabRepoPath, stdio: 'pipe' });
    execSync('git config user.email "collab@test.com"', { cwd: collabRepoPath, stdio: 'pipe' });

    collabWorktree = getWorktreeBasePath(collabRepoPath);
    worktreesToClean.push({ repo: collabRepoPath, wt: collabWorktree });

    const result = runCliCommand(
      ['init', '--name', 'E2E CLI-only', '--actor-name', 'Collab User', '--login', 'collab', '--quiet'],
      { cwd: collabRepoPath },
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('Joined existing project');

    const collabKeysDir = getKeysDir(collabWorktree);
    const collabKeyFiles = fs.readdirSync(collabKeysDir).filter(f => f.endsWith('.key'));
    expect(collabKeyFiles.length).toBeGreaterThanOrEqual(1);
    expect(collabKeyFiles.some(f => f.includes('collab'))).toBe(true);
  });

  // [OB-E4]
  it('[OB-E4] collaborator signs task and lint passes Three Gates', () => {
    runCliCommand(['sync', 'pull'], { cwd: collabRepoPath });
    runCliCommand(['task', 'new', 'Collab Task', '-d', 'Created by collaborator'], { cwd: collabRepoPath });

    const lintResult = runCliCommand(['lint'], { cwd: collabRepoPath });
    expect(lintResult.success).toBe(true);
  });

  // [OB-E5]
  it('[OB-E5] both actors on gitgov-state with different publicKeys', () => {
    const pushResult = runCliCommand(['sync', 'push'], { cwd: collabRepoPath });
    expect(pushResult.success).toBe(true);

    execSync('git fetch origin gitgov-state', { cwd: ownerRepoPath, stdio: 'pipe' });
    const lsTree = execSync('git ls-tree -r --name-only origin/gitgov-state', {
      cwd: ownerRepoPath, encoding: 'utf8',
    });

    const actorFiles = lsTree.split('\n').filter(f => f.includes('.gitgov/actors/') && f.endsWith('.json'));
    expect(actorFiles.length).toBeGreaterThanOrEqual(2);

    const ownerActorsDir = path.join(ownerWorktree, '.gitgov', 'actors');
    runCliCommand(['sync', 'pull'], { cwd: ownerRepoPath });
    const allActorFiles = fs.readdirSync(ownerActorsDir).filter(f => f.endsWith('.json'));
    const publicKeys = new Set<string>();
    for (const f of allActorFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(ownerActorsDir, f), 'utf-8'));
      if (content.payload?.publicKey) publicKeys.add(content.payload.publicKey);
    }
    expect(publicKeys.size).toBeGreaterThanOrEqual(2);
  });

  // [OB-E6]
  it('[OB-E6] read-only collaborator audits locally but push fails', () => {
    const roRepoPath = path.join(tempDir, 'readonly-repo');
    execSync(`git clone "${remotePath}" "${roRepoPath}"`, { stdio: 'pipe' });
    execSync('git config user.name "ReadOnly"', { cwd: roRepoPath, stdio: 'pipe' });
    execSync('git config user.email "ro@test.com"', { cwd: roRepoPath, stdio: 'pipe' });

    const roWorktree = getWorktreeBasePath(roRepoPath);
    worktreesToClean.push({ repo: roRepoPath, wt: roWorktree });

    runCliCommand(
      ['init', '--name', 'E2E CLI-only', '--actor-name', 'RO User', '--login', 'readonly', '--quiet'],
      { cwd: roRepoPath },
    );

    // Simulate read-only by removing push URL
    execSync('git remote set-url --push origin /nonexistent/path', { cwd: roRepoPath, stdio: 'pipe' });

    const pushResult = runCliCommand(['sync', 'push'], { cwd: roRepoPath, expectError: true });
    expect(pushResult.success).toBe(false);
  });
});
