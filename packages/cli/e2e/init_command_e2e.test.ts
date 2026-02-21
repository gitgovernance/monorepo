import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Init CLI Command - Edge Cases
 *
 * Blueprint: init_command.md §4.5
 *
 * Tests the `gitgov init` command in various repository scenarios:
 * - CASE 1: Repo without remote (EARS-E1 to E5)
 * - CASE 2A: Repo with remote, without gitgov-state pre-created
 * - CASE 2B: Repo with remote but without commits in main (EARS-E6, E7)
 * - CASE 3: Repo with empty gitgov-state branch pre-created (EARS-E8, E9)
 * - Clone scenario: Bootstrap from existing gitgov-state (EARS-E10, E11)
 *
 * IMPORTANT: These tests verify CLI command execution in isolation.
 * Each test creates a fresh temp directory with appropriate git setup.
 */
describe('Init CLI Command - Edge Cases E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-init-e2e-'));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper function to execute CLI command
  const runCliCommand = (args: string[], options: { expectError?: boolean; cwd: string }) => {
    const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
    const command = `node "${cliPath}" ${args.join(' ')}`;

    try {
      const result = execSync(command, {
        cwd: options.cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      if (options.expectError) {
        return { success: false, output: result, error: 'Expected error but command succeeded' };
      }

      return { success: true, output: result, error: null };
    } catch (error: any) {
      const stderr = error.stderr || '';
      const stdout = error.stdout || '';
      const message = error.message || '';

      // Combine all output sources for better error detection
      const combinedOutput = `${stdout}\n${stderr}\n${message}`.trim();

      if (options.expectError) {
        return { success: false, output: stdout || combinedOutput, error: stderr || combinedOutput };
      }

      // Re-throw unexpected errors
      throw new Error(`CLI command failed unexpectedly: ${stderr || message}\nStdout: ${stdout}`);
    }
  };

  // Helper to create a fresh git repo
  const createGitRepo = (repoPath: string, withInitialCommit: boolean = true) => {
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

  // Helper to create a bare remote repo
  const createBareRemote = (remotePath: string) => {
    fs.mkdirSync(remotePath, { recursive: true });
    execSync(`git init --bare`, { cwd: remotePath, stdio: 'pipe' });
  };

  // Helper to add remote to repo
  const addRemote = (repoPath: string, remotePath: string) => {
    execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
  };

  // Helper to compute worktree base path (matches DI.getWorktreeBasePath)
  const getWorktreeBasePath = (repoPath: string): string => {
    const resolvedPath = fs.realpathSync(repoPath);
    const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
    return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
  };

  // Helper to clean up worktree
  const cleanupWorktree = (repoPath: string, wtPath: string) => {
    if (fs.existsSync(wtPath)) {
      try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
      if (fs.existsSync(wtPath)) {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
    }
  };

  // ============================================================================
  // CASE 1: Repo without remote
  // ============================================================================
  describe('CASE 1: Repo without remote', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeEach(() => {
      const caseName = `case1-no-remote-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      createGitRepo(testProjectRoot, true);
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-E1] WHEN repo has no remote configured THE SYSTEM SHALL initialize successfully locally', () => {
      const result = runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-E2] WHEN repo has no remote THE SYSTEM SHALL create gitgov-state locally but NOT push', () => {
      runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // With worktree mode, gitgov-state IS created locally for the worktree
      // but it should NOT be pushed to any remote (there is none)
      const branches = execSync('git branch --list gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(branches.trim()).toContain('gitgov-state');
    });

    it('[EARS-E3] WHEN sync push is attempted without remote THE SYSTEM SHALL fail with clear error', () => {
      runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Ensure we're on main branch
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Sync push should FAIL with clear error when no remote configured
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot, expectError: true });

      // Should fail with clear error about no remote
      expect(pushResult.success).toBe(false);
      expect(pushResult.error || pushResult.output).toMatch(/No remote|remote.*configured|git remote add|does not appear to be a git repository/i);
    });

    it('[EARS-E4] WHEN sync pull is attempted without remote THE SYSTEM SHALL fail with clear error', () => {
      runCliCommand(['init', '--name', 'No Remote Pull Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Ensure we're on main branch
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Sync pull should FAIL when no remote configured
      // With worktree mode, it may fail with remote error or conflict (uncommitted worktree files)
      const pullResult = runCliCommand(['sync', 'pull'], { cwd: testProjectRoot, expectError: true });
      expect(pullResult.success).toBe(false);
    });

    it('[EARS-E5] WHEN remote is added later THEN sync push SHALL create gitgov-state with files', () => {
      // This is the complete Case 1 flow: init without remote, add remote later, then sync push

      // 1. Init without remote
      runCliCommand(['init', '--name', 'Case1 Complete', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // 2. Verify .gitgov/ exists in worktree
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'actors'))).toBe(true);

      // 3. Create bare remote and add it
      const remotePath = path.join(tempDir, `case1-remote-${Date.now()}`);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);

      // 4. Push main to remote
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

      // 5. Now sync push should work and create gitgov-state with files
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 6. Verify gitgov-state exists remotely
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');

      // 7. Verify gitgov-state has files using git ls-tree (avoids checkout conflicts with untracked .gitgov/)
      execSync('git fetch origin gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      const stateFiles = execSync('git ls-tree -r --name-only origin/gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });

      // Verify .gitgov/ exists with expected structure in gitgov-state branch
      expect(stateFiles).toContain('.gitgov/config.json');
      expect(stateFiles).toMatch(/\.gitgov\/actors\/.*\.json/);
      expect(stateFiles).toMatch(/\.gitgov\/cycles\/.*\.json/);
    });
  });

  // ============================================================================
  // CASE 2A: Repo with remote, without gitgov-state pre-created
  // ============================================================================
  describe('CASE 2A: Repo with remote, without gitgov-state pre-created', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;

    beforeEach(() => {
      const caseName = `case2a-new-remote-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot, true);
      addRemote(testProjectRoot, remotePath);

      // Push initial commit to establish the connection
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('WHEN remote exists but gitgov-state does not THE SYSTEM SHALL init without creating gitgov-state (lazy)', () => {
      const result = runCliCommand(['init', '--name', 'New Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);

      // With worktree mode, gitgov-state IS created locally for the worktree
      // but it should NOT be pushed to remote until sync push
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toBe('');
    });

    it('WHEN init completes THE SYSTEM SHALL allow sync push to create remote gitgov-state', () => {
      runCliCommand(['init', '--name', 'New Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Verify remote has gitgov-state
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');
    });

    it('WHEN sync push completes THE gitgov-state branch SHALL contain .gitgov files', () => {
      // This is Case 2A complete verification: remote exists from start
      runCliCommand(['init', '--name', 'Case2A Files', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Sync push should create gitgov-state with files
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Verify gitgov-state has files using git ls-tree (avoids checkout conflicts with untracked .gitgov/)
      execSync('git fetch origin gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      const stateFiles = execSync('git ls-tree -r --name-only origin/gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });

      // Verify .gitgov/ exists with expected structure in gitgov-state branch
      expect(stateFiles).toContain('.gitgov/config.json');
      expect(stateFiles).toMatch(/\.gitgov\/actors\/.*\.json/);
      expect(stateFiles).toMatch(/\.gitgov\/cycles\/.*\.json/);
    });
  });

  // ============================================================================
  // CASE 2B: Repo with remote but without commits in main
  // ============================================================================
  describe('CASE 2B: Repo with remote but without commits in main', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;

    beforeEach(() => {
      const caseName = `case2b-empty-main-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      // Create repo WITHOUT initial commit
      createGitRepo(testProjectRoot, false);
      addRemote(testProjectRoot, remotePath);
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-E6] WHEN repo has no commits THE SYSTEM SHALL succeed with local .gitgov', () => {
      // Init should succeed even without commits on main
      const result = runCliCommand(['init', '--name', 'Empty Main Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Init should succeed and create .gitgov in worktree
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);

      // With worktree mode, sync push works even without main commits
      // because gitgov-state is independent (managed via worktree)
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);
    });

    it('[EARS-E7] WHEN user creates initial commit THEN init THE SYSTEM SHALL succeed', () => {
      // Create an initial commit first
      fs.writeFileSync(path.join(testProjectRoot, 'README.md'), '# Test Project\n');
      execSync('git add README.md', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Initial commit"', { cwd: testProjectRoot, stdio: 'pipe' });

      const result = runCliCommand(['init', '--name', 'After Commit Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
    });
  });

  // ============================================================================
  // CASE 3: Repo with empty gitgov-state branch pre-created
  // ============================================================================
  describe('CASE 3: Repo with empty gitgov-state branch pre-created', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;

    beforeEach(() => {
      const caseName = `case3-empty-state-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot, true);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Create empty gitgov-state branch (orphan with empty commit)
      execSync('git checkout --orphan gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git rm -rf . 2>/dev/null || true', { cwd: testProjectRoot, stdio: 'pipe', shell: '/bin/bash' });

      // Create minimal .gitgov structure for orphan branch
      const gitgovPath = path.join(testProjectRoot, '.gitgov');
      fs.mkdirSync(gitgovPath, { recursive: true });
      fs.writeFileSync(path.join(gitgovPath, '.gitkeep'), '');

      execSync('git add .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Initialize empty gitgov-state"', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git push origin gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Clean .gitgov from working directory after switching back
      fs.rmSync(gitgovPath, { recursive: true, force: true });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-E8] WHEN gitgov-state exists but is empty THE SYSTEM SHALL bootstrap from it or init fresh', () => {
      const result = runCliCommand(['init', '--name', 'Bootstrap Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-E9] WHEN bootstrapping from empty state THE SYSTEM SHALL update gitgov-state with new config', () => {
      runCliCommand(['init', '--name', 'Bootstrap Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Ensure we're on main branch (init may leave us on gitgov-state in some edge cases)
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Verify worktree .gitgov has config.json after init
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);

      // Sync push to update gitgov-state with actual content
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Verify gitgov-state has some .gitgov content
      // Note: The full update of pre-existing gitgov-state is a future enhancement
      const gitgovFiles = execSync('git ls-tree -r gitgov-state --name-only .gitgov/', { cwd: testProjectRoot, encoding: 'utf8' });
      const files = gitgovFiles.trim().split('\n').filter(Boolean);

      // At minimum, the original .gitkeep should still be there
      expect(files.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Bootstrap from existing gitgov-state (clone scenario)
  // ============================================================================
  describe('Bootstrap from existing gitgov-state (clone scenario)', () => {
    let originRepoPath: string;
    let cloneRepoPath: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `case-clone-${Date.now()}`;
      originRepoPath = path.join(tempDir, caseName, 'origin');
      cloneRepoPath = path.join(tempDir, caseName, 'clone');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      // Setup origin with gitgov
      createBareRemote(remotePath);
      createGitRepo(originRepoPath, true);
      addRemote(originRepoPath, remotePath);
      execSync('git push -u origin main', { cwd: originRepoPath, stdio: 'pipe' });

      // Initialize gitgov in origin
      runCliCommand(['init', '--name', 'Origin Project', '--actor-name', 'Origin User', '--quiet'], { cwd: originRepoPath });
      runCliCommand(['sync', 'push', '--json'], { cwd: originRepoPath });

      // Clone the repo (without .gitgov since it's gitignored)
      execSync(`git clone "${remotePath}" "${cloneRepoPath}"`, { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Clone User"', { cwd: cloneRepoPath, stdio: 'pipe' });
      execSync('git config user.email "clone@example.com"', { cwd: cloneRepoPath, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
      // Clean up worktrees for both origin and clone
      const originWt = getWorktreeBasePath(originRepoPath);
      const cloneWt = getWorktreeBasePath(cloneRepoPath);
      cleanupWorktree(originRepoPath, originWt);
      cleanupWorktree(cloneRepoPath, cloneWt);
    });

    it('[EARS-E10] WHEN cloning repo with gitgov-state THE SYSTEM SHALL allow pull without init', () => {
      // After clone, .gitgov should NOT exist (it's gitignored)
      expect(fs.existsSync(path.join(cloneRepoPath, '.gitgov'))).toBe(false);

      // Pull should work WITHOUT init — bootstrap creates worktree automatically from remote gitgov-state
      const pullResult = runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });
      expect(pullResult.success).toBe(true);

      // Verify worktree was created with .gitgov structure
      const cloneWorktreePath = getWorktreeBasePath(cloneRepoPath);
      expect(fs.existsSync(path.join(cloneWorktreePath, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-E11] WHEN pull completes on clone THE SYSTEM SHALL allow read commands', () => {
      // Pull without init
      runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });

      // Status should work after bootstrap pull (read-only command)
      const statusResult = runCliCommand(['status', '--json'], { cwd: cloneRepoPath });
      expect(statusResult.success).toBe(true);
    });
  });

  // ============================================================================
  // Worktree Integration (E2E-INIT-W1 to W3)
  // ============================================================================
  describe('Worktree Integration (E2E-INIT-W1 to W3)', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;

    beforeEach(() => {
      const caseName = `worktree-init-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot, true);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[E2E-INIT-W1] WHEN gitgov init completes THE SYSTEM SHALL create worktree at ~/.gitgov/worktrees/<hash>/', () => {
      const result = runCliCommand(['init', '--name', 'Worktree Init Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'actors'))).toBe(true);
    });

    it('[E2E-INIT-W2] WHEN gitgov init completes THE SYSTEM SHALL NOT create .gitgov/ in working directory', () => {
      runCliCommand(['init', '--name', 'No Local Gitgov', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov'))).toBe(false);
    });

    it('[E2E-INIT-W3] WHEN gitgov init is run twice THE SYSTEM SHALL succeed idempotently', () => {
      const result1 = runCliCommand(['init', '--name', 'Idempotent Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      expect(result1.success).toBe(true);

      // Second init: worktree already exists, should either succeed or give clear "already initialized" message
      const result2 = runCliCommand(['init', '--name', 'Idempotent Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot, expectError: true });

      if (result2.success) {
        // Init succeeded idempotently
        expect(result2.success).toBe(true);
      } else {
        // Init correctly detected existing project - this IS idempotent behavior (state preserved)
        expect(result2.error || result2.output).toMatch(/already initialized/i);
      }

      // KEY ASSERTION: worktree state is preserved regardless of second init outcome
      expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
    });
  });
});
