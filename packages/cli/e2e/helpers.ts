/**
 * Shared E2E Test Helpers
 *
 * Common helpers used across all CLI E2E test files.
 * Each helper is the superset of all implementations found in
 * init, actor, sync, task, diagram, and dashboard E2E tests.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface RunCliResult {
  success: boolean;
  output: string;
  error: string | null;
}

export interface RunCliOptions {
  /** Expected to fail? If true, catches errors instead of throwing */
  expectError?: boolean;
  /** Working directory for the command */
  cwd: string;
  /** Stdin input to pipe to the command */
  input?: string;
  /** Extra environment variables merged into process.env */
  env?: Record<string, string>;
}

// ============================================================================
// CLI Execution
// ============================================================================

/**
 * Execute a gitgov CLI command via the compiled binary.
 *
 * - Escapes arguments containing spaces (from sync/actor pattern)
 * - Supports optional stdin input (from task pattern)
 * - cwd is required (most common pattern)
 */
export const runCliCommand = (args: string[], options: RunCliOptions): RunCliResult => {
  const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
  const escapedArgs = args.map(arg => {
    if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
      return `"${arg}"`;
    }
    return arg;
  });
  const command = `node "${cliPath}" ${escapedArgs.join(' ')}`;

  try {
    const result = execSync(command, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      ...(options.input && { input: options.input }),
      ...(options.env && { env: { ...process.env, ...options.env } }),
    });

    if (options.expectError) {
      return { success: false, output: result, error: 'Expected error but command succeeded' };
    }

    return { success: true, output: result, error: null };
  } catch (error: any) {
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    const message = error.message || '';

    const combinedOutput = `${stdout}\n${stderr}\n${message}`.trim();

    if (options.expectError) {
      return { success: false, output: stdout || combinedOutput, error: stderr || combinedOutput };
    }

    throw new Error(`CLI command failed unexpectedly: ${stderr || message}\nStdout: ${stdout}`);
  }
};

// ============================================================================
// Git Repository Helpers
// ============================================================================

/**
 * Create a fresh git repository with optional initial commit.
 *
 * @param repoPath - Directory for the new repo (created if missing)
 * @param withInitialCommit - Create README.md + initial commit (default: true)
 */
export const createGitRepo = (repoPath: string, withInitialCommit: boolean = true) => {
  fs.mkdirSync(repoPath, { recursive: true });
  execSync('git init --initial-branch=main', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });

  if (withInitialCommit) {
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Project\n');
    execSync('git add README.md', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
  }
};

/**
 * Create a bare git repository (for use as remote).
 *
 * @param remotePath - Directory for the bare repo
 */
export const createBareRemote = (remotePath: string) => {
  fs.mkdirSync(remotePath, { recursive: true });
  execSync('git init --bare --initial-branch=main', { cwd: remotePath, stdio: 'pipe' });
};

/**
 * Add a remote named "origin" to a local repository.
 *
 * @param repoPath - Local repo path
 * @param remotePath - Path to the bare remote
 */
export const addRemote = (repoPath: string, remotePath: string) => {
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
};

// ============================================================================
// Worktree Helpers
// ============================================================================

/**
 * Compute the worktree base path for a given project root.
 * Matches DI.getWorktreeBasePath logic: SHA256(realpath).slice(0,12)
 *
 * @param repoPath - Project root path
 * @returns Path under ~/.gitgov/worktrees/{hash}
 */
export const getWorktreeBasePath = (repoPath: string): string => {
  const resolvedPath = fs.realpathSync(repoPath);
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
  return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
};

/**
 * Clean up a git worktree and its directory.
 *
 * @param repoPath - Parent repo path (for git worktree remove)
 * @param wtPath - Worktree path to clean up
 */
export const cleanupWorktree = (repoPath: string, wtPath: string) => {
  if (wtPath && fs.existsSync(wtPath)) {
    try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }
};

// ============================================================================
// Compound Setup Helpers
// ============================================================================

/**
 * Full project setup: git repo + bare remote + remote added + gitgov init.
 * Returns the paths and a cleanup function.
 *
 * @param tempDir - Parent temp directory
 * @param label - Label for directory naming (e.g. 'lint-e2e')
 */
export const setupGitgovProject = (tempDir: string, label: string) => {
  const testProjectRoot = path.join(tempDir, `${label}-project`);
  const remotePath = path.join(tempDir, `${label}-remote.git`);

  createBareRemote(remotePath);
  createGitRepo(testProjectRoot, true);
  addRemote(testProjectRoot, remotePath);

  const worktreeBasePath = getWorktreeBasePath(testProjectRoot);

  // Initialize gitgov
  runCliCommand(
    ['init', '--name', `${label} Test`, '--actor-name', 'Test User', '--quiet'],
    { cwd: testProjectRoot }
  );

  return {
    testProjectRoot,
    remotePath,
    worktreeBasePath,
    cleanup: () => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    }
  };
};
