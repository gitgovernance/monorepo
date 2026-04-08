/**
 * CLI Helpers — Execute the globally installed gitgov CLI for E2E tests.
 * [HLP-A1] Real binary execution, [HLP-A2] Git repo creation, [HLP-A3] Worktree cleanup.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWorktreeBasePath } from '@gitgov/core/fs';

export type CliResult = {
  success: boolean;
  output: string;
  error: string | null;
};

// [HLP-A1] Execute the globally installed gitgov CLI
export function runGitgovCli(args: string, options: { cwd: string; expectError?: boolean; timeout?: number }): CliResult {
  const command = `gitgov ${args}`;
  try {
    const result = execSync(command, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeout ?? 30000,
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
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
