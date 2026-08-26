/**
 * Block ISB: Init State Branch Precedence — INIT-L3
 * Spec: cli/specs/init_command.md §4.10
 *
 * `gitgov init --state-branch <custom>` must bind EVERYTHING to <custom> — even
 * when the repo already knows the refs of the default `gitgov-state`.
 *
 * Origin (found by the Tier 3 smoke run): with `origin/gitgov-state` present,
 * init bound the worktree to the DEFAULT and persisted that in config.json,
 * inheriting actors and state from another project WITHOUT an error. The three
 * D/E/F flows in e2e-private had been right since gitgov_2 and were red for
 * this reason.
 *
 * Deterministic and GitHub-free: a local bare remote (createBareRemote), which
 * is what separates "freshly created repo" from "real repo with refs".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getWorktreeBasePath } from '@gitgov/core/fs';

import { runGitgovCli, createTempGitRepo, createBareRemote, addRemote, cleanupWorktree } from './helpers';

const CUSTOM_BRANCH = `custom-state-${Date.now()}`;

let repoDir: string;
let tmpDir: string;
let remotePath: string;
let worktreePath: string;

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

describe('Block ISB: Init State Branch Precedence (INIT-L3)', () => {
  beforeAll(() => {
    // 1. Local repo + bare remote (no GitHub — deterministic, CI-friendly)
    const repo = createTempGitRepo();
    repoDir = repo.repoDir;
    tmpDir = repo.tmpDir;
    const remote = createBareRemote();
    remotePath = remote.remotePath;
    addRemote(repoDir, remotePath);
    git('push -u origin main', repoDir);

    // 2. Seed the DEFAULT `gitgov-state` on the remote — the real scenario:
    //    a repo that already knows the default's refs (another project, another dev).
    const seed = createTempGitRepo();
    execSync(`git remote add origin "${remotePath}"`, { cwd: seed.repoDir, stdio: 'pipe' });
    git('checkout --orphan gitgov-state', seed.repoDir);
    git('rm -rf --cached . || true', seed.repoDir);
    fs.rmSync(path.join(seed.repoDir, 'README.md'), { force: true });
    fs.mkdirSync(path.join(seed.repoDir, '.gitgov', 'actors'), { recursive: true });
    fs.writeFileSync(path.join(seed.repoDir, '.gitgov', 'actors', 'seed.json'), '{}\n');
    git('add -A', seed.repoDir);
    git('commit -m "seed default state branch"', seed.repoDir);
    git('push origin gitgov-state', seed.repoDir);
    fs.rmSync(seed.tmpDir, { recursive: true, force: true });

    // 3. The dev's repo knows the default's refs (what any real repo does)
    git('fetch origin', repoDir);

    cleanupWorktree(repoDir);
    worktreePath = getWorktreeBasePath(repoDir);
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }, 120000);

  afterAll(() => {
    cleanupWorktree(repoDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(remotePath), { recursive: true, force: true });
  });

  it('[INIT-L3] should bind worktree and config to the custom state branch when default refs exist', () => {
    const result = runGitgovCli(
      `init --force-local --name "ISB" --actor-name Dev --login isb-dev --quiet --state-branch ${CUSTOM_BRANCH}`,
      { cwd: repoDir, timeout: 120000 },
    );
    expect(result.success, `${result.output}\n${result.error}`).toBe(true);

    // (a) The worktree is bound to the CUSTOM branch, not the default
    const worktrees = git('worktree list', repoDir);
    expect(worktrees, `worktree list:\n${worktrees}`).toContain(`[${CUSTOM_BRANCH}]`);
    expect(worktrees, 'the worktree must NOT stay on the default').not.toContain('[gitgov-state]');

    // (b) The custom branch exists locally (created as orphan or from the remote)
    const branches = git('branch --list', repoDir);
    expect(branches, `branches:\n${branches}`).toContain(CUSTOM_BRANCH);

    // (c) config.json persists the custom one — otherwise EVERY later command
    //     (sync, login) reads the wrong branch: the contamination is persistent
    const configRaw = fs.readFileSync(path.join(worktreePath, '.gitgov', 'config.json'), 'utf8');
    const config = JSON.parse(configRaw) as { state?: { branch?: string } };
    expect(config.state?.branch, `config.json: ${configRaw}`).toBe(CUSTOM_BRANCH);

    // (d) Zero inheritance from the default: the actor seeded there must not appear
    const actorsDir = path.join(worktreePath, '.gitgov', 'actors');
    const actors = fs.existsSync(actorsDir) ? fs.readdirSync(actorsDir) : [];
    expect(actors, `actors inherited from the default: ${actors.join(', ')}`).not.toContain('seed.json');
  }, 180000);
});
