/**
 * Block ISB: Init State Branch Precedence — INIT-L3
 * Spec: cli/specs/init_command.md §4.10
 *
 * `gitgov init --state-branch <custom>` debe atar TODO a <custom> — incluso
 * cuando el repo ya conoce los refs del default `gitgov-state`.
 *
 * Origen (s78b-28, hallazgo del smoke Tier 3): con `origin/gitgov-state`
 * presente, el init ataba el worktree al DEFAULT y lo persistia en config.json,
 * heredando actores y estado de otro proyecto SIN error. Los 3 flows D/E/F de
 * e2e-private llevaban razon desde gitgov_2 y estaban rojos por esta causa.
 *
 * Determinista y sin GitHub: bare remote local (createBareRemote), que es lo
 * que hace la diferencia entre "repo recien creado" y "repo real con refs".
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
    // 1. Repo local + bare remote (sin GitHub — determinista, CI-friendly)
    const repo = createTempGitRepo();
    repoDir = repo.repoDir;
    tmpDir = repo.tmpDir;
    const remote = createBareRemote();
    remotePath = remote.remotePath;
    addRemote(repoDir, remotePath);
    git('push -u origin main', repoDir);

    // 2. Sembrar el DEFAULT `gitgov-state` en el remoto — el escenario real:
    //    un repo que ya conoce los refs del default (otro proyecto, otro dev).
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

    // 3. El repo del dev conoce los refs del default (lo que hace cualquier repo real)
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

    // (a) El worktree queda atado a la branch CUSTOM, no al default
    const worktrees = git('worktree list', repoDir);
    expect(worktrees, `worktree list:\n${worktrees}`).toContain(`[${CUSTOM_BRANCH}]`);
    expect(worktrees, 'el worktree NO debe quedar en el default').not.toContain('[gitgov-state]');

    // (b) La branch custom existe localmente (creada como orphan o desde el remoto)
    const branches = git('branch --list', repoDir);
    expect(branches, `branches:\n${branches}`).toContain(CUSTOM_BRANCH);

    // (c) config.json persiste la custom — si no, TODOS los comandos siguientes
    //     (sync, login) leen el branch equivocado: la contaminacion es persistente
    const configRaw = fs.readFileSync(path.join(worktreePath, '.gitgov', 'config.json'), 'utf8');
    const config = JSON.parse(configRaw) as { state?: { branch?: string } };
    expect(config.state?.branch, `config.json: ${configRaw}`).toBe(CUSTOM_BRANCH);

    // (d) Cero herencia del default: el actor sembrado ahi no debe aparecer
    const actorsDir = path.join(worktreePath, '.gitgov', 'actors');
    const actors = fs.existsSync(actorsDir) ? fs.readdirSync(actorsDir) : [];
    expect(actors, `actores heredados del default: ${actors.join(', ')}`).not.toContain('seed.json');
  }, 180000);
});
