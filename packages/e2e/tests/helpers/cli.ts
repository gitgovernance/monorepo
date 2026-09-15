/**
 * CLI Helpers — Execute the CLI built in the checkout under test for E2E tests.
 * [HLP-A1] Real binary execution (sync), [HLP-A4] Async spawn for interactive commands,
 * [HLP-A5] Resolution of the binary both of them run.
 * [HLP-A2] Git repo creation, [HLP-A3] Worktree cleanup.
 */
import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { getWorktreeBasePath } from '@gitgov/core/fs';

/** [HLP-A5] Environment variable that points the helpers at another CLI binary. */
export const GITGOV_CLI_BIN_ENV = 'GITGOV_CLI_BIN';

/**
 * [HLP-A5] Monorepo root of the checkout these helpers belong to. Resolved through symlinks:
 * e2e-private reaches this file through a per-file symlink, and each checkout's symlink points
 * at its own monorepo, so the root is the checkout under test in the main clone and in any
 * worktree alike.
 */
export const CHECKOUT_ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'));

/** [HLP-A5] The CLI build of the checkout under test. */
export const CHECKOUT_CLI_BIN = path.join(CHECKOUT_ROOT, 'packages', 'cli', 'build', 'dist', 'gitgov.mjs');

export type GitgovCliBinary = {
  /** Path as configured: the checkout build or the override. */
  bin: string;
  /** What actually runs; equals `bin` when the file does not exist. */
  realpath: string;
  source: 'checkout' | 'GITGOV_CLI_BIN';
  /** Whether `realpath` lies inside `CHECKOUT_ROOT`. */
  insideCheckout: boolean;
};

/**
 * [HLP-A5] The binary the CLI helpers execute. Never a `gitgov` found on PATH: on a machine
 * with a globally linked CLI that is whatever checkout was linked last, and tests run from a
 * worktree would exercise another branch's code with every preflight green.
 */
export function resolveGitgovCli(env: NodeJS.ProcessEnv = process.env): GitgovCliBinary {
  const override = env[GITGOV_CLI_BIN_ENV];
  const bin = override ? path.resolve(override) : CHECKOUT_CLI_BIN;
  const realpath = fs.existsSync(bin) ? fs.realpathSync(bin) : bin;
  return {
    bin,
    realpath,
    source: override ? 'GITGOV_CLI_BIN' : 'checkout',
    insideCheckout: realpath.startsWith(CHECKOUT_ROOT + path.sep),
  };
}

let loggedCli = false;

/** [HLP-A1] Logged once per process, so every run's output says which binary it tested. */
function cliUnderTest(): GitgovCliBinary {
  const cli = resolveGitgovCli();
  if (!loggedCli) {
    loggedCli = true;
    console.log(`[HLP-A1] gitgov CLI under test: ${cli.realpath} (source: ${cli.source})`);
  }
  return cli;
}

export type CliResult = {
  success: boolean;
  output: string;
  error: string | null;
};

export type SpawnedCli = {
  process: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  waitForOutput: (match: string | RegExp, timeoutMs?: number) => Promise<string>;
  waitForExit: (timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
  kill: () => void;
};

// [HLP-A1] Execute the CLI of the checkout under test (resolveGitgovCli), with the node running the tests
export function runGitgovCli(args: string, options: { cwd: string; expectError?: boolean; timeout?: number; env?: Record<string, string> }): CliResult {
  const command = `"${process.execPath}" "${cliUnderTest().bin}" ${args}`;
  try {
    const result = execSync(command, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeout ?? 30000,
      env: options.env ? { ...process.env, ...options.env } : undefined,
    });

    if (options.expectError) {
      return { success: false, output: result, error: 'Expected error but succeeded' };
    }
    return { success: true, output: result, error: null };
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    const stderr = execError.stderr ?? '';
    const stdout = execError.stdout ?? '';
    const message = execError.message ?? '';
    const combinedOutput = `${stdout}\n${stderr}\n${message}`.trim();

    if (options.expectError) {
      return { success: false, output: stdout || combinedOutput, error: stderr || combinedOutput };
    }
    throw new Error(`CLI command failed: ${stderr || message}\nStdout: ${stdout}`);
  }
}

// [HLP-A2] Create a temp git repo with initial commit
export function createTempGitRepo(): { tmpDir: string; repoDir: string } {
  const rawTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const tmpDir = fs.realpathSync(rawTmpDir);
  const repoDir = path.join(tmpDir, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  execSync('git init --initial-branch=main', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: repoDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# E2E Test\n');
  execSync('git add README.md && git commit -m "Initial commit"', { cwd: repoDir, stdio: 'pipe' });
  return { tmpDir, repoDir };
}

export function createBareRemote(): { remotePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-remote-'));
  const remotePath = path.join(tmpDir, 'remote.git');
  fs.mkdirSync(remotePath, { recursive: true });
  execSync('git init --bare --initial-branch=main', { cwd: remotePath, stdio: 'pipe' });
  return { remotePath };
}

export function addRemote(repoPath: string, remotePath: string): void {
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
}

// [HLP-A4] Spawn the same CLI as HLP-A1 as an async child process (for interactive/long-running commands)
export function spawnGitgovCli(args: string, options: { cwd: string; timeout?: number; env?: Record<string, string> }): SpawnedCli {
  const child = spawn(process.execPath, [cliUnderTest().bin, ...args.split(/\s+/)], {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  });

  let out = '';
  let err = '';
  child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
  child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });

  return {
    process: child,
    stdout: () => out,
    stderr: () => err,
    waitForOutput(match, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for output matching ${match}`)), timeoutMs);
        const check = () => {
          const combined = out + err;
          const found = typeof match === 'string' ? combined.includes(match) : match.test(combined);
          if (found) { clearTimeout(timer); resolve(combined); }
        };
        child.stdout?.on('data', check);
        child.stderr?.on('data', check);
        check();
      });
    },
    waitForExit(timeoutMs = 30000) {
      return new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve({ stdout: out, stderr: err, exitCode: child.exitCode });
          return;
        }
        const timer = setTimeout(() => {
          child.kill();
          resolve({ stdout: out, stderr: err, exitCode: null });
        }, timeoutMs);
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout: out, stderr: err, exitCode: code });
        });
      });
    },
    kill() { child.kill(); },
  };
}

// [HLP-A3] Clean up worktree created by CLI init
export function cleanupWorktree(repoPath: string): void {
  const wtPath = getWorktreeBasePath(repoPath);
  if (fs.existsSync(wtPath)) {
    try {
      execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' });
    } catch { /* ignore */ }
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }
}
