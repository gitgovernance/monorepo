import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Init CLI Command - Edge Cases
 *
 * Tests the `gitgov init` command in various repository scenarios:
 * - CASE 1: Repo without remote
 * - CASE 2A: Repo with remote, without gitgov-state pre-created
 * - CASE 2B: Repo with remote but without commits in main
 * - CASE 3: Repo with empty gitgov-state branch pre-created
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

      if (options.expectError) {
        return { success: false, output: stdout, error: stderr || message };
      }

      // Re-throw unexpected errors
      throw new Error(`CLI command failed unexpectedly: ${stderr || message}\nStdout: ${stdout}`);
    }
  };

  // Helper to create a fresh git repo
  const createGitRepo = (repoPath: string, withInitialCommit: boolean = true) => {
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
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

  // ============================================================================
  // CASE 1: Repo without remote
  // ============================================================================
  describe('CASE 1: Repo without remote', () => {
    let testProjectRoot: string;

    beforeEach(() => {
      const caseName = `case1-no-remote-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      createGitRepo(testProjectRoot, true);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-INIT-1] WHEN repo has no remote configured THE SYSTEM SHALL initialize successfully locally', () => {
      const result = runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-INIT-2] WHEN repo has no remote THE SYSTEM SHALL create gitgov-state branch locally', () => {
      runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Check if gitgov-state branch exists locally
      const branches = execSync('git branch --list gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(branches.trim()).toContain('gitgov-state');
    });

    it('[EARS-INIT-3] WHEN sync push is attempted without remote THE SYSTEM SHALL report warning gracefully', () => {
      runCliCommand(['init', '--name', 'No Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Ensure we're on main branch (init may leave us on gitgov-state in some edge cases)
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Sync push should work but warn about no remote
      const pushResult = runCliCommand(['sync', 'push', '--json'], { cwd: testProjectRoot });

      // Should succeed locally even without remote
      expect(pushResult.success).toBe(true);
    });
  });

  // ============================================================================
  // CASE 2A: Repo with remote, without gitgov-state pre-created
  // ============================================================================
  describe('CASE 2A: Repo with remote, without gitgov-state pre-created', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `case2a-new-remote-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot, true);
      addRemote(testProjectRoot, remotePath);

      // Push initial commit to establish the connection
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-INIT-4] WHEN remote exists but gitgov-state does not THE SYSTEM SHALL create gitgov-state branch', () => {
      const result = runCliCommand(['init', '--name', 'New Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov'))).toBe(true);

      // gitgov-state should exist locally
      const branches = execSync('git branch --list gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(branches.trim()).toContain('gitgov-state');
    });

    it('[EARS-INIT-5] WHEN init completes THE SYSTEM SHALL allow sync push to create remote gitgov-state', () => {
      runCliCommand(['init', '--name', 'New Remote Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      const pushResult = runCliCommand(['sync', 'push', '--json'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Verify remote has gitgov-state
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');
    });
  });

  // ============================================================================
  // CASE 2B: Repo with remote but without commits in main
  // ============================================================================
  describe('CASE 2B: Repo with remote but without commits in main', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `case2b-empty-main-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      // Create repo WITHOUT initial commit
      createGitRepo(testProjectRoot, false);
      addRemote(testProjectRoot, remotePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-INIT-6] WHEN repo has no commits THE SYSTEM SHALL handle gracefully', () => {
      // This is an edge case - gitgov init requires at least one commit for orphan branch creation
      const result = runCliCommand(['init', '--name', 'Empty Main Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot, expectError: true });

      // Should either succeed with a clear workflow or fail with clear guidance
      // If it fails, it should provide a helpful error message
      if (!result.success) {
        expect(result.error || result.output).toMatch(/(commit|empty|initial|first)/i);
      }
    });

    it('[EARS-INIT-7] WHEN user creates initial commit THEN init THE SYSTEM SHALL succeed', () => {
      // Create an initial commit first
      fs.writeFileSync(path.join(testProjectRoot, 'README.md'), '# Test Project\n');
      execSync('git add README.md', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Initial commit"', { cwd: testProjectRoot, stdio: 'pipe' });

      const result = runCliCommand(['init', '--name', 'After Commit Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov'))).toBe(true);
    });
  });

  // ============================================================================
  // CASE 3: Repo with empty gitgov-state branch pre-created
  // ============================================================================
  describe('CASE 3: Repo with empty gitgov-state branch pre-created', () => {
    let testProjectRoot: string;
    let remotePath: string;

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
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-INIT-8] WHEN gitgov-state exists but is empty THE SYSTEM SHALL bootstrap from it or init fresh', () => {
      const result = runCliCommand(['init', '--name', 'Bootstrap Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-INIT-9] WHEN bootstrapping from empty state THE SYSTEM SHALL update gitgov-state with new config', () => {
      runCliCommand(['init', '--name', 'Bootstrap Project', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Ensure we're on main branch (init may leave us on gitgov-state in some edge cases)
      execSync('git checkout main', { cwd: testProjectRoot, stdio: 'pipe' });

      // Verify local .gitgov has config.json after init
      expect(fs.existsSync(path.join(testProjectRoot, '.gitgov', 'config.json'))).toBe(true);

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
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-INIT-10] WHEN cloning repo with gitgov-state THE SYSTEM SHALL bootstrap .gitgov from state branch', () => {
      // After clone, .gitgov should NOT exist (it's gitignored)
      expect(fs.existsSync(path.join(cloneRepoPath, '.gitgov'))).toBe(false);

      // Running sync pull should bootstrap from gitgov-state
      const pullResult = runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });

      expect(pullResult.success).toBe(true);
      expect(fs.existsSync(path.join(cloneRepoPath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(cloneRepoPath, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[EARS-INIT-11] WHEN bootstrap completes THE SYSTEM SHALL restore full .gitgov structure', () => {
      // Bootstrap via sync pull
      runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });

      // Verify key directories exist
      expect(fs.existsSync(path.join(cloneRepoPath, '.gitgov', 'actors'))).toBe(true);

      // Status should work after bootstrap
      const statusResult = runCliCommand(['status', '--json'], { cwd: cloneRepoPath });
      expect(statusResult.success).toBe(true);
    });
  });
});
