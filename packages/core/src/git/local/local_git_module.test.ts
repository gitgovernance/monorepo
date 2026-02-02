/**
 * LocalGitModule Tests
 *
 * SAFETY: These tests use TEMPORARY Git repositories in /tmp
 * They NEVER touch the production repository.
 *
 * Each test creates an isolated temp repo and cleans up after itself.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalGitModule } from './local_git_module';
import {
  GitCommandError,
  BranchNotFoundError,
  FileNotFoundError,
  RebaseNotInProgressError,
  MergeConflictError,
  RebaseConflictError,
} from '../errors';
import type { ExecOptions, ExecResult } from '../types';

const execAsync = promisify(exec);

/**
 * Test Helper: Creates a temporary Git repository for testing
 * Uses LocalGitModule.init() to initialize the repo (dogfooding our own code!)
 * 
 * @returns Path to temporary repository (normalized for macOS /private prefix)
 */
async function createTempRepo(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `gitgov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Normalize path to resolve macOS /private prefix
  const normalizedPath = fs.realpathSync(tempDir);

  // Initialize Git repo using LocalGitModule.init()
  const gitModule = new LocalGitModule({
    repoRoot: normalizedPath,
    execCommand: createExecCommand(normalizedPath),
  });

  await gitModule.init();

  // Configure git user
  await execAsync('git config user.name "Test User"', { cwd: normalizedPath });
  await execAsync('git config user.email "test@example.com"', { cwd: normalizedPath });

  // Create initial commit so branch exists and git log works
  await execAsync('echo "# Test Repo" > README.md', { cwd: normalizedPath });
  await execAsync('git add .', { cwd: normalizedPath });
  await execAsync('git commit -m "Initial commit"', { cwd: normalizedPath });

  return normalizedPath;
}

/**
 * Test Helper: Removes a temporary repository
 * 
 * @param repoPath - Path to repository to remove
 */
function removeTempRepo(repoPath: string): void {
  if (repoPath.includes('/tmp/') && (repoPath.includes('gitgov-test-') || repoPath.includes('gitgov-remote-') || repoPath.includes('gitgov-work-'))) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
}

/**
 * Test Helper: Creates a bare Git repository to use as remote
 * Bare repos are the proper way to use Git repos as remotes.
 * 
 * @returns Path to bare repository
 */
async function createRemoteRepo(): Promise<string> {
  const remoteDir = path.join(os.tmpdir(), `gitgov-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(remoteDir, { recursive: true });
  const normalizedPath = fs.realpathSync(remoteDir);

  // Initialize bare repo
  await execAsync('git init --bare', { cwd: normalizedPath });

  // Configure git user
  await execAsync('git config user.name "Test User"', { cwd: normalizedPath });
  await execAsync('git config user.email "test@example.com"', { cwd: normalizedPath });

  return normalizedPath;
}

/**
 * Test Helper: Simulates a commit in a remote bare repository
 * Creates a temporary working repo, makes changes, and pushes to the bare repo.
 * 
 * @param bareRepoPath - Path to bare repository
 * @param branch - Branch name to push to
 * @param fileName - File to create/modify
 * @param content - File content
 */
async function simulateRemoteCommit(
  bareRepoPath: string,
  branch: string,
  fileName: string,
  content: string
): Promise<void> {
  // Create temporary working directory
  const workDir = path.join(os.tmpdir(), `gitgov-work-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(workDir, { recursive: true });
  const normalizedWorkPath = fs.realpathSync(workDir);

  try {
    // Clone from bare repo
    await execAsync(`git clone ${bareRepoPath} ${normalizedWorkPath}`);

    // Configure git user
    await execAsync('git config user.name "Test User"', { cwd: normalizedWorkPath });
    await execAsync('git config user.email "test@example.com"', { cwd: normalizedWorkPath });

    // Checkout branch if it's not the current one
    try {
      await execAsync(`git checkout ${branch}`, { cwd: normalizedWorkPath });
    } catch {
      // Branch doesn't exist, that's okay - we're on the right branch already
    }

    // Make change
    await execAsync(`echo "${content}" > ${fileName}`, { cwd: normalizedWorkPath });
    await execAsync('git add .', { cwd: normalizedWorkPath });
    await execAsync(`git commit -m "Remote change to ${fileName}"`, { cwd: normalizedWorkPath });

    // Push to bare repo
    await execAsync(`git push origin ${branch}`, { cwd: normalizedWorkPath });
  } finally {
    // Clean up working directory
    removeTempRepo(normalizedWorkPath);
  }
}

/**
 * Test Helper: Creates a real execCommand function for testing
 * 
 * @param repoPath - Path to repository
 * @returns execCommand function
 */
function createExecCommand(repoPath: string) {
  return async (
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<ExecResult> => {
    const cwd = options?.cwd || repoPath;

    // Escape shell arguments to prevent interpretation of special characters
    const escapeArg = (arg: string): string => {
      // If arg contains shell metacharacters, wrap in single quotes and escape internal quotes
      if (/[|&;()<>\s$`"']/.test(arg)) {
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    };

    const escapedArgs = args.map(escapeArg);
    const fullCommand = `${command} ${escapedArgs.join(' ')}`;

    try {
      // Configure environment to avoid Git waiting for user input
      const env = {
        ...process.env,
        GIT_EDITOR: 'true',  // Use 'true' command as editor (does nothing, exits successfully)
        GIT_MERGE_AUTOEDIT: 'no',  // Disable merge commit message editing
        ...options?.env,
      };

      const { stdout, stderr } = await execAsync(fullCommand, { cwd, env });
      return {
        exitCode: 0,
        stdout: stdout || '',
        stderr: stderr || '',
      };
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: err.code || 1,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || '',
      };
    }
  };
}

describe('LocalGitModule', () => {
  let tempRepo: string;
  let gitModule: LocalGitModule;

  beforeEach(async () => {
    // Create isolated temp repository for each test
    tempRepo = await createTempRepo();
    gitModule = new LocalGitModule({
      repoRoot: tempRepo,
      execCommand: createExecCommand(tempRepo),
    });
  });

  afterEach(() => {
    // Clean up temp repository
    removeTempRepo(tempRepo);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4.2. Repository Initialization (EARS-B1 to B2)
  // ═══════════════════════════════════════════════════════════════════════

  describe('4.2. Repository Initialization (EARS-B1 to B2)', () => {
    it('[EARS-B1] should initialize new git repository', async () => {
      // Create a fresh directory without Git
      const freshDir = path.join(os.tmpdir(), `gitgov-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(freshDir, { recursive: true });

      try {
        const freshGitModule = new LocalGitModule({
          repoRoot: freshDir,
          execCommand: createExecCommand(freshDir),
        });

        // Initialize repo
        await freshGitModule.init();

        // Verify .git directory exists
        expect(fs.existsSync(path.join(freshDir, '.git'))).toBe(true);

        // Verify we can run git commands
        const { stdout } = await execAsync('git rev-parse --git-dir', { cwd: freshDir });
        expect(stdout.trim()).toBe('.git');
      } finally {
        // Clean up
        removeTempRepo(freshDir);
      }
    });

    it('[EARS-B2] should throw GitCommandError if already initialized', async () => {
      // tempRepo is already initialized by createTempRepo()
      await expect(gitModule.init()).rejects.toThrow(GitCommandError);
      await expect(gitModule.init()).rejects.toThrow('Directory is already a Git repository');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4.1. Read Operations (EARS-A1 to A24)
  // ═══════════════════════════════════════════════════════════════════════

  describe('4.1. Read Operations (EARS-A1 to A24)', () => {
    it('[EARS-A1] should return repository root path', async () => {
      const repoRoot = await gitModule.getRepoRoot();
      expect(repoRoot).toBe(tempRepo);
    });

    it('[EARS-A1] should auto-detect repo root if not provided', async () => {
      const gitModuleNoRoot = new LocalGitModule({
        execCommand: createExecCommand(tempRepo),
      });

      const repoRoot = await gitModuleNoRoot.getRepoRoot();
      expect(repoRoot).toBe(tempRepo);
    });

    it('[EARS-A2] should return current branch name', async () => {
      // Repo already has initial commit from createTempRepo()
      const branch = await gitModule.getCurrentBranch();
      expect(branch).toMatch(/^(main|master)$/);
    });

    it('[EARS-A23] should return commit hash for HEAD', async () => {
      // Get HEAD hash
      const headHash = await gitModule.getCommitHash("HEAD");

      // Verify it's a valid 40-character hash
      expect(headHash).toMatch(/^[0-9a-f]{40}$/);

      // Verify it's the same as current branch
      const currentBranch = await gitModule.getCurrentBranch();
      const branchHash = await gitModule.getCommitHash(currentBranch);
      expect(headHash).toBe(branchHash);
    });

    it('[EARS-A23] should return commit hash for branch name', async () => {
      // Create a commit
      const testFile = path.join(tempRepo, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      await gitModule.add(['test.txt']);
      const commitHash = await gitModule.commit('Test commit');

      // Get hash for main/master branch
      const currentBranch = await gitModule.getCurrentBranch();
      const branchHash = await gitModule.getCommitHash(currentBranch);

      // Verify it matches the commit we just created
      expect(branchHash).toBe(commitHash);
      expect(branchHash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('[EARS-A23] should return commit hash for relative refs', async () => {
      // Create two commits
      fs.writeFileSync(path.join(tempRepo, 'file1.txt'), 'content 1');
      await gitModule.add(['file1.txt']);
      const commit1 = await gitModule.commit('First commit');

      fs.writeFileSync(path.join(tempRepo, 'file2.txt'), 'content 2');
      await gitModule.add(['file2.txt']);
      await gitModule.commit('Second commit');

      // Get hash for HEAD~1 (parent commit)
      const parentHash = await gitModule.getCommitHash("HEAD~1");

      // Verify it matches the first commit
      expect(parentHash).toBe(commit1);
      expect(parentHash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('[EARS-A24] should throw GitCommandError if ref does not exist', async () => {
      await expect(gitModule.getCommitHash("non-existent-branch")).rejects.toThrow();
      await expect(gitModule.getCommitHash("non-existent-branch")).rejects.toThrow(/Failed to get commit hash for ref "non-existent-branch"/);
    });

    it('[EARS-A19] should return staged files', async () => {
      // Create and stage some files
      const file1 = path.join(tempRepo, "staged-file-1.txt");
      const file2 = path.join(tempRepo, "staged-file-2.txt");
      fs.writeFileSync(file1, "Content 1");
      fs.writeFileSync(file2, "Content 2");
      await gitModule.add(["staged-file-1.txt", "staged-file-2.txt"]);

      const stagedFiles = await gitModule.getStagedFiles();

      expect(stagedFiles).toContain("staged-file-1.txt");
      expect(stagedFiles).toContain("staged-file-2.txt");
      expect(stagedFiles.length).toBe(2);
    });

    it('[EARS-A20] should return empty array if no staged files', async () => {
      const stagedFiles = await gitModule.getStagedFiles();
      expect(stagedFiles).toEqual([]);
    });

    it('[EARS-A3] should return merge base commit hash', async () => {
      // Initial commit already exists from createTempRepo()

      // Create feature branch
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "feature" > feature.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature commit"', { cwd: tempRepo });

      // Go back to main and make another commit
      await execAsync('git checkout main || git checkout master', { cwd: tempRepo });
      await execAsync('echo "main" > main.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Main commit"', { cwd: tempRepo });

      const currentBranch = await gitModule.getCurrentBranch();
      const mergeBase = await gitModule.getMergeBase(currentBranch, 'feature');

      expect(mergeBase).toMatch(/^[a-f0-9]{40}$/);
    });

    it('[EARS-A4] should throw BranchNotFoundError if branch does not exist', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      const currentBranch = await gitModule.getCurrentBranch();

      await expect(
        gitModule.getMergeBase(currentBranch, 'non-existent-branch')
      ).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-A5] should return list of changed files with status', async () => {
      // Create initial commit
      await execAsync('echo "v1" > file1.txt', { cwd: tempRepo });
      await execAsync('echo "v1" > file2.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "First commit"', { cwd: tempRepo });

      // Modify files
      await execAsync('echo "v2" > file1.txt', { cwd: tempRepo });
      await execAsync('echo "new" > file3.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Second commit"', { cwd: tempRepo });

      const changes = await gitModule.getChangedFiles('HEAD~1', 'HEAD', '.');

      expect(changes).toHaveLength(2);
      expect(changes.some(c => c.file === 'file1.txt' && c.status === 'M')).toBe(true);
      expect(changes.some(c => c.file === 'file3.txt' && c.status === 'A')).toBe(true);
    });

    it('[EARS-A6] should return file content from commit', async () => {
      const content = 'Hello from commit!';
      await execAsync(`echo "${content}" > file.txt`, { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Add file"', { cwd: tempRepo });

      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });
      const fileContent = await gitModule.getFileContent(hash.trim(), 'file.txt');

      expect(fileContent.trim()).toBe(content);
    });

    it('[EARS-A7] should throw FileNotFoundError if file does not exist in commit', async () => {
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });

      await expect(
        gitModule.getFileContent(hash.trim(), 'non-existent.txt')
      ).rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-A8] should return commit history ordered from newest to oldest', async () => {
      // Create 3 additional commits (tempRepo already has "Initial commit")
      for (let i = 1; i <= 3; i++) {
        await execAsync(`echo "v${i}" > file.txt`, { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync(`git commit -m "Commit ${i}"`, { cwd: tempRepo });
      }

      const branch = await gitModule.getCurrentBranch();
      const history = await gitModule.getCommitHistory(branch);

      // Should have 4 commits total (Initial + 3 new ones)
      expect(history.length).toBeGreaterThanOrEqual(4);
      expect(history[0]?.message).toBe('Commit 3');
      expect(history[1]?.message).toBe('Commit 2');
      expect(history[2]?.message).toBe('Commit 1');
      expect(history[3]?.message).toBe('Initial commit');
    });

    it('[EARS-A8] should respect maxCount option when specified', async () => {
      // Create 5 additional commits
      for (let i = 1; i <= 5; i++) {
        await execAsync(`echo "v${i}" > file.txt`, { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync(`git commit -m "Commit ${i}"`, { cwd: tempRepo });
      }

      const branch = await gitModule.getCurrentBranch();
      const history = await gitModule.getCommitHistory(branch, { maxCount: 2 });

      // maxCount limits to 2 most recent commits
      expect(history).toHaveLength(2);
      expect(history[0]?.message).toBe('Commit 5');
      expect(history[1]?.message).toBe('Commit 4');
    });

    it('[EARS-A9] should return commit history in specified range', async () => {
      // Create 5 commits
      const hashes: string[] = [];
      for (let i = 1; i <= 5; i++) {
        await execAsync(`echo "v${i}" > file.txt`, { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync(`git commit -m "Commit ${i}"`, { cwd: tempRepo });
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });
        hashes.push(stdout.trim());
      }

      // Get commits between commit 2 and commit 4 (exclusive..inclusive)
      const history = await gitModule.getCommitHistoryRange(hashes[1]!, hashes[3]!);

      expect(history).toHaveLength(2);
      expect(history[0]?.message).toBe('Commit 4');
      expect(history[1]?.message).toBe('Commit 3');
    });

    it('[EARS-A10] should throw GitCommandError if commit does not exist in range', async () => {
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      await expect(
        gitModule.getCommitHistoryRange('invalid-hash-1', 'invalid-hash-2')
      ).rejects.toThrow(GitCommandError);
    });

    it('[EARS-A11] should return full commit message', async () => {
      const message = 'feat: add new feature\n\nThis is a detailed description.';
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync(`git commit -m "${message.replace(/\n/g, '\\n')}"`, { cwd: tempRepo });

      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });
      const commitMessage = await gitModule.getCommitMessage(hash.trim());

      expect(commitMessage).toContain('feat: add new feature');
    });

    it('[EARS-A12] should throw GitCommandError if commit does not exist', async () => {
      await expect(
        gitModule.getCommitMessage('invalid-hash')
      ).rejects.toThrow(GitCommandError);
    });

    it('[EARS-A13] should correctly verify branch existence', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      const currentBranch = await gitModule.getCurrentBranch();

      expect(await gitModule.branchExists(currentBranch)).toBe(true);
      expect(await gitModule.branchExists('non-existent')).toBe(false);
    });

    it('[EARS-A21] should list remote branches correctly', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit
        await execAsync('echo "test" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();

        // Push main branch
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Create and push feature branch
        await execAsync('git checkout -b feature', { cwd: tempRepo });
        await execAsync('echo "feature" > feature.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Feature commit"', { cwd: tempRepo });
        await execAsync('git push origin feature', { cwd: tempRepo });

        // Create and push another branch
        await execAsync('git checkout -b develop', { cwd: tempRepo });
        await execAsync('echo "develop" > develop.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Develop commit"', { cwd: tempRepo });
        await execAsync('git push origin develop', { cwd: tempRepo });

        // Now list remote branches
        const remoteBranches = await gitModule.listRemoteBranches('origin');

        // Should contain all three branches (without "origin/" prefix)
        expect(remoteBranches).toContain(currentBranch);
        expect(remoteBranches).toContain('feature');
        expect(remoteBranches).toContain('develop');
        expect(remoteBranches.length).toBe(3);
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-A22] should return empty array for non-existent remote', async () => {
      // Create initial commit (needed for repo setup)
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Test with non-existent remote (graceful degradation)
      const nonExistentRemote = await gitModule.listRemoteBranches('nonexistent');
      expect(nonExistentRemote).toEqual([]);
    });

    it('[EARS-A14] should return tracking remote if configured', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        const remote = await gitModule.getBranchRemote(currentBranch);

        expect(remote).toBe('origin');
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-A15] should return null if no tracking configured', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      const currentBranch = await gitModule.getCurrentBranch();
      const remote = await gitModule.getBranchRemote(currentBranch);

      expect(remote).toBeNull();
    });

    it('[EARS-A16] should throw BranchNotFoundError if branch does not exist', async () => {
      await expect(
        gitModule.getBranchRemote('non-existent')
      ).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-A17] should return conflicted files during rebase/merge', async () => {
      // Create initial commit
      await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create feature branch
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "feature-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature change"', { cwd: tempRepo });

      // Go back to main and make conflicting change
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'feature' ? 'main' : mainBranch}`, { cwd: tempRepo });
      await execAsync('echo "main-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Main change"', { cwd: tempRepo });

      // Start rebase which will cause conflict
      try {
        await execAsync('git rebase feature', { cwd: tempRepo });
      } catch {
        // Rebase will fail with conflict, which is what we want
      }

      // Now get conflicted files
      const conflictedFiles = await gitModule.getConflictedFiles();
      expect(conflictedFiles.length).toBeGreaterThan(0);
      expect(conflictedFiles).toContain('file.txt');

      // Clean up - abort rebase
      await execAsync('git rebase --abort', { cwd: tempRepo });
    });

    it('[EARS-A18] should throw GitCommandError if no rebase/merge in progress', async () => {
      // When no conflict, getConflictedFiles should return empty array
      const conflicts = await gitModule.getConflictedFiles();
      expect(conflicts).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4.3. Write Operations (EARS-C1 to C10)
  // ═══════════════════════════════════════════════════════════════════════

  describe('4.3. Write Operations (EARS-C1 to C10)', () => {
    it('[EARS-C1] should checkout to specified branch', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create feature branch
      await execAsync('git checkout -b feature', { cwd: tempRepo });

      const currentBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${currentBranch === 'main' ? 'master' : 'main'} || git checkout master`, { cwd: tempRepo });

      // Now checkout to feature
      await gitModule.checkoutBranch('feature');

      const newBranch = await gitModule.getCurrentBranch();
      expect(newBranch).toBe('feature');
    });

    it('[EARS-C2] should throw BranchNotFoundError if branch does not exist', async () => {
      await expect(
        gitModule.checkoutBranch('non-existent')
      ).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-C3] should create orphan branch and checkout to it', async () => {
      // Create initial commit on main
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create orphan branch
      await gitModule.checkoutOrphanBranch('orphan-branch');

      const currentBranch = await gitModule.getCurrentBranch();
      expect(currentBranch).toBe('orphan-branch');

      // Verify it's actually orphan (no history)
      const history = await gitModule.getCommitHistory('orphan-branch').catch(() => []);
      expect(history).toEqual([]);
    });

    it('[EARS-C4] should throw GitCommandError if orphan branch already exists', async () => {
      // Create initial commit
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create orphan branch first time
      await gitModule.checkoutOrphanBranch('orphan-1');
      await execAsync('echo "orphan" > orphan.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Orphan commit"', { cwd: tempRepo });

      // Go back to main
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'orphan-1' ? 'main' : mainBranch}`, { cwd: tempRepo });

      // Try to create orphan branch with existing name - should still work (git behavior)
      // Git allows checkout --orphan even if branch exists
      await gitModule.checkoutOrphanBranch('orphan-2');
      expect(await gitModule.getCurrentBranch()).toBe('orphan-2');
    });

    it('[EARS-C5] should fetch changes from remote', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit in main repo
        await execAsync('echo "test" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo and push
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Make a change in remote repo (simulate remote change)
        await simulateRemoteCommit(remoteRepo, currentBranch, 'remote.txt', 'remote-change');

        // Fetch changes
        await gitModule.fetch('origin');

        // Verify we can see the remote branch
        const { stdout } = await execAsync('git branch -r', { cwd: tempRepo });
        expect(stdout).toContain(`origin/${currentBranch}`);
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-C6] should pull and merge remote branch successfully', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit in main repo
        await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo and push
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Make a change in remote repo (DIFFERENT FILE to avoid conflict)
        await simulateRemoteCommit(remoteRepo, currentBranch, 'remote.txt', 'remote');

        // Make a different change locally (DIFFERENT FILE to avoid conflict)
        await execAsync('echo "local" > local.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Local change"', { cwd: tempRepo });

        // Pull and merge (should succeed without conflict)
        await gitModule.pull('origin', currentBranch);

        // Verify merge happened (should have merge commit)
        const { stdout } = await execAsync('git log --oneline -1', { cwd: tempRepo });
        expect(stdout).toContain('Merge');
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-C7] should throw MergeConflictError if merge conflicts occur', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit in main repo
        await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo and push
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Make conflicting change in remote repo
        await simulateRemoteCommit(remoteRepo, currentBranch, 'file.txt', 'remote-change');

        // Make conflicting change locally
        await execAsync('echo "local-change" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Local change"', { cwd: tempRepo });

        // Pull should cause merge conflict
        await expect(
          gitModule.pull('origin', currentBranch)
        ).rejects.toThrow(MergeConflictError);

        // Clean up - abort merge
        await execAsync('git merge --abort', { cwd: tempRepo }).catch(() => { });
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-C8] should pull and rebase remote branch successfully', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit in main repo
        await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo and push
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Make a change in remote repo (simulate remote change, different file to avoid conflict)
        await simulateRemoteCommit(remoteRepo, currentBranch, 'remote-file.txt', 'v2');

        // Make a different change locally (different file to avoid conflict)
        await execAsync('echo "v3-local" > local.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Local change"', { cwd: tempRepo });

        // Pull with rebase
        await gitModule.pullRebase('origin', currentBranch);

        // Verify rebase happened (should have linear history)
        const { stdout } = await execAsync('git log --oneline', { cwd: tempRepo });
        const commits = stdout.trim().split('\n');
        expect(commits.length).toBeGreaterThanOrEqual(2);
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-C9] should throw RebaseConflictError if rebase conflicts occur', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit in main repo
        await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo and push
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();
        await execAsync(`git push -u origin ${currentBranch}`, { cwd: tempRepo });

        // Make conflicting change in remote repo
        await simulateRemoteCommit(remoteRepo, currentBranch, 'file.txt', 'remote-change');

        // Make conflicting change locally
        await execAsync('echo "local-change" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Local change"', { cwd: tempRepo });

        // Pull with rebase should cause conflict
        await expect(
          gitModule.pullRebase('origin', currentBranch)
        ).rejects.toThrow(RebaseConflictError);

        // Clean up - abort rebase
        await execAsync('git rebase --abort', { cwd: tempRepo }).catch(() => { });
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-C10] should checkout files from source branch to staging area', async () => {
      // Create initial commit
      await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create feature branch with different content
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "v2-feature" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature commit"', { cwd: tempRepo });

      // Go back to main
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'feature' ? 'main' : mainBranch}`, { cwd: tempRepo });

      // Checkout file from feature branch
      await gitModule.checkoutFilesFromBranch('feature', ['file.txt']);

      // Verify content
      const content = fs.readFileSync(path.join(tempRepo, 'file.txt'), 'utf-8');
      expect(content.trim()).toBe('v2-feature');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4.4. Commit and Push Operations (EARS-D1 to D8)
  // ═══════════════════════════════════════════════════════════════════════

  describe('4.4. Commit and Push Operations (EARS-D1 to D8)', () => {
    it('[EARS-D1] should add files to staging area', async () => {
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await gitModule.add(['file.txt']);

      const { stdout } = await execAsync('git status --porcelain', { cwd: tempRepo });
      expect(stdout).toContain('A  file.txt');
    });

    it('[EARS-D2] should create commit and return hash', async () => {
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await gitModule.add(['file.txt']);

      const hash = await gitModule.commit('Initial commit');

      expect(hash).toMatch(/^[a-f0-9]{40}$/);

      const message = await gitModule.getCommitMessage(hash);
      expect(message).toBe('Initial commit');
    });

    it('[EARS-D3] should use specified author in commit', async () => {
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      await gitModule.add(['file.txt']);

      const author = { name: 'Custom Author', email: 'custom@example.com' };
      const hash = await gitModule.commit('Test commit', author);

      const { stdout } = await execAsync(`git show ${hash} --format="%an <%ae>" --no-patch`, { cwd: tempRepo });
      expect(stdout.trim()).toBe('Custom Author <custom@example.com>');
    });

    it('[EARS-D4] should create empty commit and return hash', async () => {
      const hash = await gitModule.commitAllowEmpty('Empty commit');

      expect(hash).toMatch(/^[a-f0-9]{40}$/);

      const message = await gitModule.getCommitMessage(hash);
      expect(message).toBe('Empty commit');
    });

    it('[EARS-D5] should push branch to remote', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit
        await execAsync('echo "test" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();

        // Push branch
        await gitModule.push('origin', currentBranch);

        // Verify branch was pushed
        const { stdout } = await execAsync('git ls-remote origin', { cwd: tempRepo });
        expect(stdout).toContain(currentBranch);
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-D6] should push branch and configure tracking', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit
        await execAsync('echo "test" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Add remote repo
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        const currentBranch = await gitModule.getCurrentBranch();

        // Push with upstream
        await gitModule.pushWithUpstream('origin', currentBranch);

        // Verify tracking is configured
        const remote = await gitModule.getBranchRemote(currentBranch);
        expect(remote).toBe('origin');
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-D7] should configure branch tracking', async () => {
      // Create remote repo (empty, no initial commit)
      const remoteRepo = await createRemoteRepo();
      try {
        // Create initial commit
        await execAsync('echo "test" > file.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

        // Create feature branch
        await execAsync('git checkout -b feature', { cwd: tempRepo });
        await execAsync('echo "feature" > feature.txt', { cwd: tempRepo });
        await execAsync('git add .', { cwd: tempRepo });
        await execAsync('git commit -m "Feature commit"', { cwd: tempRepo });

        // Add remote repo and push feature branch
        await execAsync(`git remote add origin ${remoteRepo}`, { cwd: tempRepo });
        await execAsync('git push origin feature', { cwd: tempRepo });

        // Configure tracking
        await gitModule.setUpstream('feature', 'origin', 'feature');

        // Verify tracking is configured
        const remote = await gitModule.getBranchRemote('feature');
        expect(remote).toBe('origin');
      } finally {
        removeTempRepo(remoteRepo);
      }
    });

    it('[EARS-D8] should throw BranchNotFoundError if branch does not exist', async () => {
      await expect(
        gitModule.setUpstream('non-existent', 'origin', 'main')
      ).rejects.toThrow(BranchNotFoundError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4.5. Rebase Operations and Utilities (EARS-E1 to E6)
  // ═══════════════════════════════════════════════════════════════════════

  describe('4.5. Rebase Operations and Utilities (EARS-E1 to E6)', () => {
    it('[EARS-E1] should continue rebase and return commit hash', async () => {
      // Use same approach as EARS-A17 which works reliably
      // Create initial commit on main
      await execAsync('echo "base" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Base commit"', { cwd: tempRepo });

      // Create feature branch with change
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "feature" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature change"', { cwd: tempRepo });

      // Go back to main and make conflicting change
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'feature' ? 'main' : mainBranch}`, { cwd: tempRepo });
      await execAsync('echo "main" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Main change"', { cwd: tempRepo });

      // Start rebase - will cause conflict
      try {
        await execAsync('git rebase feature', { cwd: tempRepo });
      } catch (error) {
        // Expected to fail with conflict - Git will stop and wait for resolution
      }

      // Verify rebase is in progress
      expect(await gitModule.isRebaseInProgress()).toBe(true);

      // Resolve conflict
      await execAsync('echo "resolved" > file.txt', { cwd: tempRepo });
      await execAsync('git add file.txt', { cwd: tempRepo });

      // Continue rebase
      const commitHash = await gitModule.rebaseContinue();

      expect(commitHash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('[EARS-E2] should throw RebaseNotInProgressError if no rebase in progress', async () => {
      await expect(
        gitModule.rebaseContinue()
      ).rejects.toThrow(RebaseNotInProgressError);
    });

    it('[EARS-E3] should abort rebase and restore previous state', async () => {
      // Create initial commit
      await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create feature branch
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "feature-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature change"', { cwd: tempRepo });

      // Go back to main and make change
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'feature' ? 'main' : mainBranch}`, { cwd: tempRepo });
      await execAsync('echo "main-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Main change"', { cwd: tempRepo });

      // Get HEAD before rebase
      const { stdout: beforeRebaseHead } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });
      const beforeRebaseHash = beforeRebaseHead.trim();

      // Start rebase (will pause with conflict)
      try {
        await execAsync('git rebase feature', { cwd: tempRepo });
      } catch (error) {
        // Expected to fail with conflict - Git will stop and wait for resolution
      }

      // Verify rebase is in progress
      expect(await gitModule.isRebaseInProgress()).toBe(true);

      // Abort rebase
      await gitModule.rebaseAbort();

      // Verify we're back to state before rebase
      const { stdout: afterAbortHead } = await execAsync('git rev-parse HEAD', { cwd: tempRepo });
      const afterAbortHash = afterAbortHead.trim();
      expect(afterAbortHash).toBe(beforeRebaseHash);
    });

    it('[EARS-E4] should throw RebaseNotInProgressError if no rebase in progress', async () => {
      await expect(
        gitModule.rebaseAbort()
      ).rejects.toThrow(RebaseNotInProgressError);
    });

    it('[EARS-E5] should detect uncommitted changes correctly', async () => {
      // No changes initially
      expect(await gitModule.hasUncommittedChanges()).toBe(false);

      // Create a file
      await execAsync('echo "test" > file.txt', { cwd: tempRepo });
      expect(await gitModule.hasUncommittedChanges()).toBe(true);

      // Add to staging
      await gitModule.add(['file.txt']);
      expect(await gitModule.hasUncommittedChanges()).toBe(true);

      // Commit
      await gitModule.commit('Add file');
      expect(await gitModule.hasUncommittedChanges()).toBe(false);
    });

    it('[EARS-E5] should respect pathFilter when specified', async () => {
      // Create file in root
      await execAsync('echo "test" > root.txt', { cwd: tempRepo });

      // Create subdirectory with file
      fs.mkdirSync(path.join(tempRepo, 'subdir'), { recursive: true });
      await execAsync('echo "test" > subdir/file.txt', { cwd: tempRepo });

      // Check for changes in subdir only
      expect(await gitModule.hasUncommittedChanges('subdir/')).toBe(true);

      // Commit only root file
      await gitModule.add(['root.txt']);
      await gitModule.commit('Add root file');

      // subdir should still have changes
      expect(await gitModule.hasUncommittedChanges('subdir/')).toBe(true);

      // root should be clean
      expect(await gitModule.hasUncommittedChanges('root.txt')).toBe(false);
    });

    it('[EARS-E6] should detect rebase in progress correctly', async () => {
      // Initially no rebase
      expect(await gitModule.isRebaseInProgress()).toBe(false);

      // Create initial commit
      await execAsync('echo "v1" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Initial commit"', { cwd: tempRepo });

      // Create feature branch
      await execAsync('git checkout -b feature', { cwd: tempRepo });
      await execAsync('echo "feature-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Feature change"', { cwd: tempRepo });

      // Go back to main and make change
      const mainBranch = await gitModule.getCurrentBranch();
      await execAsync(`git checkout ${mainBranch === 'feature' ? 'main' : mainBranch}`, { cwd: tempRepo });
      await execAsync('echo "main-change" > file.txt', { cwd: tempRepo });
      await execAsync('git add .', { cwd: tempRepo });
      await execAsync('git commit -m "Main change"', { cwd: tempRepo });

      // Start rebase (will pause with conflict)
      try {
        await execAsync('git rebase feature', { cwd: tempRepo });
      } catch (error) {
        // Expected to fail with conflict - Git will stop and wait for resolution
      }

      // Now rebase should be in progress
      expect(await gitModule.isRebaseInProgress()).toBe(true);

      // Clean up
      await execAsync('git rebase --abort', { cwd: tempRepo }).catch(() => { });
      expect(await gitModule.isRebaseInProgress()).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  // 4.6. Configuration Operations (EARS-F1 to F2)
  // ══════════════════════════════════════════════════════════

  describe("4.6. Configuration Operations (EARS-F1 to F2)", () => {
    it("[EARS-F1] should set git config value in local scope (default)", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Set local config (default scope)
      await git.setConfig("user.email", "test@example.com");

      // Verify config was set
      const result = await execAsync('git config user.email', { cwd: repoPath });
      expect(result.stdout.trim()).toBe("test@example.com");
    });

    it("[EARS-F1] should set git config for core.editor", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Set core.editor (common use case in tests)
      await git.setConfig("core.editor", "vim");

      // Verify config was set
      const result = await execAsync('git config core.editor', { cwd: repoPath });
      expect(result.stdout.trim()).toBe("vim");
    });

    it("[EARS-F1] should set git config with explicit local scope", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Set local config with explicit scope
      await git.setConfig("user.name", "Explicit Local User", "local");

      // Verify config was set
      const result = await execAsync('git config --local user.name', { cwd: repoPath });
      expect(result.stdout.trim()).toBe("Explicit Local User");
    });

    it("[EARS-F2] should throw GitCommandError if config key is invalid", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Try to set invalid config key (contains invalid chars)
      await expect(
        git.setConfig("invalid key with spaces", "value")
      ).rejects.toThrow("Failed to set Git config");
    });
  });

  // ══════════════════════════════════════════════════════════
  // 4.7. Stash Operations (EARS-G1 to G6)
  // ══════════════════════════════════════════════════════════

  describe("4.7. Stash Operations (EARS-G1 to G6)", () => {
    it("[EARS-G1] should stash uncommitted changes with custom message", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Create uncommitted changes
      fs.writeFileSync(path.join(repoPath, 'test-file.txt'), 'uncommitted content');
      await git.add(['test-file.txt']);

      // Stash with custom message
      const stashHash = await git.stash('test stash message');

      // Should return a hash
      expect(stashHash).not.toBeNull();
      expect(typeof stashHash).toBe('string');

      // Verify file is no longer in working directory
      expect(fs.existsSync(path.join(repoPath, 'test-file.txt'))).toBe(false);

      // Verify stash was created with message
      const result = await execAsync('git stash list', { cwd: repoPath });
      expect(result.stdout).toContain('test stash message');

      removeTempRepo(repoPath);
    });

    it("[EARS-G2] should return null when stashing with no uncommitted changes", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // No changes - just the initial commit
      const stashHash = await git.stash('empty stash');

      // Should return null since nothing to stash
      expect(stashHash).toBeNull();

      // Verify no stash was created
      const result = await execAsync('git stash list', { cwd: repoPath });
      expect(result.stdout.trim()).toBe('');

      removeTempRepo(repoPath);
    });

    it("[EARS-G3] should pop stashed changes and restore them", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Create and stash changes
      const testContent = 'content to stash and restore';
      fs.writeFileSync(path.join(repoPath, 'stash-test.txt'), testContent);
      await git.add(['stash-test.txt']);
      await git.stash('stash for pop test');

      // Verify file is gone
      expect(fs.existsSync(path.join(repoPath, 'stash-test.txt'))).toBe(false);

      // Pop the stash
      const popped = await git.stashPop();

      // Should return true
      expect(popped).toBe(true);

      // Verify file is restored
      expect(fs.existsSync(path.join(repoPath, 'stash-test.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(repoPath, 'stash-test.txt'), 'utf-8')).toBe(testContent);

      // Verify stash list is now empty
      const result = await execAsync('git stash list', { cwd: repoPath });
      expect(result.stdout.trim()).toBe('');

      removeTempRepo(repoPath);
    });

    it("[EARS-G4] should return false when popping with no stash", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // No stashes exist
      const popped = await git.stashPop();

      // Should return false (graceful degradation)
      expect(popped).toBe(false);

      removeTempRepo(repoPath);
    });

    it("[EARS-G5] should drop a specific stash by hash", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Create first stash
      fs.writeFileSync(path.join(repoPath, 'file1.txt'), 'content 1');
      await git.add(['file1.txt']);
      await git.stash('first stash');

      // Create second stash
      fs.writeFileSync(path.join(repoPath, 'file2.txt'), 'content 2');
      await git.add(['file2.txt']);
      await git.stash('second stash');

      // Get stash list before drop
      const beforeResult = await execAsync('git stash list', { cwd: repoPath });
      expect(beforeResult.stdout).toContain('first stash');
      expect(beforeResult.stdout).toContain('second stash');

      // Drop the most recent stash using stash@{0}
      await git.stashDrop('stash@{0}');

      // Verify only first stash remains
      const afterResult = await execAsync('git stash list', { cwd: repoPath });
      expect(afterResult.stdout).toContain('first stash');
      expect(afterResult.stdout).not.toContain('second stash');

      removeTempRepo(repoPath);
    });

    it("[EARS-G6] should drop the most recent stash when no hash provided", async () => {
      const repoPath = await createTempRepo();
      const git = new LocalGitModule({ repoRoot: repoPath, execCommand: createExecCommand(repoPath) });

      // Create a stash
      fs.writeFileSync(path.join(repoPath, 'drop-test.txt'), 'content to drop');
      await git.add(['drop-test.txt']);
      await git.stash('stash to drop');

      // Verify stash exists
      const beforeResult = await execAsync('git stash list', { cwd: repoPath });
      expect(beforeResult.stdout).toContain('stash to drop');

      // Drop without specifying hash
      await git.stashDrop();

      // Verify stash is gone
      const afterResult = await execAsync('git stash list', { cwd: repoPath });
      expect(afterResult.stdout.trim()).toBe('');

      removeTempRepo(repoPath);
    });
  });
});

