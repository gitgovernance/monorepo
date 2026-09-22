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

const runCliCommand = (args: string[], options: { cwd: string; expectError?: boolean; env?: NodeJS.ProcessEnv }) => {
  const cliPath = path.resolve(__dirname, '../build/dist/gitgov.mjs');
  const escapedArgs = args.map(a => a.includes(' ') ? `"${a}"` : a);
  try {
    const result = execSync(`node "${cliPath}" ${escapedArgs.join(' ')}`, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000,
      ...(options.env && { env: options.env }),
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

    // [OB-E6] The audit half. Until 2026-09-13 this test never ran `gitgov audit`, although its
    // name and its EARS both say the read-only collaborator audits locally.
    const auditResult = runCliCommand(['audit', '--scope', 'full', '--output', 'json'], { cwd: roRepoPath });
    const audit = JSON.parse(auditResult.output.slice(auditResult.output.indexOf('{')));
    expect(audit.summary).toBeDefined();
    expect(Array.isArray(audit.agentResults)).toBe(true);

    const pushResult = runCliCommand(['sync', 'push'], { cwd: roRepoPath, expectError: true });
    expect(pushResult.success).toBe(false);
  });

  // [OB-E7] init followed by audit. No e2e ran this pair before 2026-09-13: audit_command_e2e
  // registers the agent with `gitgov agent new`, which rewrites the engine init left behind. Through
  // that gap the first audit reported 0 findings over a live secret (first_experience audit 1c19).
  const initRepoWithSecret = (name: string) => {
    const repo = path.join(tempDir, name);
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    execSync('git init --initial-branch=main', { cwd: repo, stdio: 'pipe' });
    execSync('git config user.name "Owner"', { cwd: repo, stdio: 'pipe' });
    execSync('git config user.email "owner@test.com"', { cwd: repo, stdio: 'pipe' });
    fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
    fs.writeFileSync(path.join(repo, 'src', 'config.ts'), 'export const STRIPE_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";\n');
    execSync('git add -A && git commit -m "add secret"', { cwd: repo, stdio: 'pipe' });
    worktreesToClean.push({ repo, wt: getWorktreeBasePath(repo) });
    runCliCommand(['init', '--name', `E2E ${name}`, '--login', 'owner', '--quiet'], { cwd: repo, env: repoOnlyEnv() });
    return repo;
  };

  const parseAudit = (output: string) => JSON.parse(output.slice(output.indexOf('{')));

  // Resolution must depend on the repo alone. Run under pnpm, vitest inherits a NODE_PATH that
  // includes the workspace's hoisted node_modules/.pnpm/node_modules, where every @gitgov agent
  // lives — so an agent "not installed" in a temp repo resolves anyway, and an installed one
  // passes without its install being what made it resolve. Measured 2026-09-13: with NODE_PATH
  // inherited, OB-E8 saw security-audit run and find the secret.
  const repoOnlyEnv = (): NodeJS.ProcessEnv => {
    const env = { ...process.env };
    delete env['NODE_PATH'];
    return env;
  };

  it('[OB-E7] owner init then audit finds a hardcoded secret with no agent installed in the repo', () => {
    const repo = initRepoWithSecret('secret-repo-installed');
    // NOTHING is installed here, and that is the assertion. Until 2026-09-23 this test
    // symlinked the agent into the repo's node_modules, because the default specialists did
    // not travel with the CLI — so the green measured a repo that had installed the agent,
    // which is not what a user gets. With `builtin:security-audit` the agent ships inside the
    // bundle (ARUN-O1, PROJ-F2), so the precondition is gone and the promise is unconditional:
    // install the CLI, init, audit, findings.
    expect(fs.existsSync(path.join(repo, 'node_modules', '@gitgov', 'agent-security-audit'))).toBe(false);

    // Policy fails the audit when it finds the secret, so the command exits non-zero
    const result = runCliCommand(['audit', '--scope', 'full', '--output', 'json'], { cwd: repo, expectError: true, env: repoOnlyEnv() });
    expect(result.success).toBe(false);
    const audit = parseAudit(result.output);
    const securityAudit = audit.agentResults.find((r: { agentId: string }) => r.agentId === 'agent:security-audit');
    expect(securityAudit?.status).toBe('success');
    expect(audit.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('[OB-E8] owner init then audit reports the agent error instead of a clean success when it does not resolve', () => {
    // The other half of E7, and it survives the built-in change with its subject corrected:
    // "the default agent does not resolve" stopped being reachable for security-audit, but an
    // agent that does NOT ship with the CLI still is — review-advisor, opt-in by decision A25
    // because it needs an LLM.
    //
    // The requirement is that a non-resolving agent SAYS it failed, rather than reporting an
    // empty success. That was the second of the two defects behind `0 findings on a live
    // secret`: the orchestrator read a runner response of status "error" as success, fixed by
    // AORCH-B5 in #171. The spec carried this EARS at red since 2026-09-14 waiting for that
    // merge, and the test was never reincorporated after it landed on 2026-09-15.
    const repo = initRepoWithSecret('secret-repo-not-installed');
    expect(fs.existsSync(path.join(repo, 'node_modules', '@gitgov', 'agent-review-advisor'))).toBe(false);

    const result = runCliCommand(['audit', '--scope', 'full', '--output', 'json'], { cwd: repo, expectError: true, env: repoOnlyEnv() });
    const audit = parseAudit(result.output);

    // Review agents report in `reviewResults`, not `agentResults` — measured on the real
    // output, where the two lists are separate keys. The distinction is not cosmetic: it is
    // why a review agent failing does not change the exit code (A15 / AORCH-F4).
    const reviewAdvisor = audit.reviewResults.find((r: { agentId: string }) => r.agentId === 'agent:review-advisor');
    expect(reviewAdvisor).toBeDefined(); // anti-vacuity: no result means nothing was asserted
    expect(reviewAdvisor?.status).toBe('error');
    expect(reviewAdvisor?.errorMessage).toContain('agent-review-advisor');

    // And the built-in one still runs in the same command: a review agent failing to resolve
    // does not take the audit down with it (A15 / AORCH-F4 keep review agents out of the exit
    // code). Without this line the test would also pass on a CLI where nothing runs at all.
    const securityAudit = audit.agentResults.find((r: { agentId: string }) => r.agentId === 'agent:security-audit');
    expect(securityAudit?.status).toBe('success');
  });
});
