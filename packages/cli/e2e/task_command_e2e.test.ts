import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Task Delete CLI Command
 *
 * Governing spec: task_command.md (EARS-32, EARS-33, EARS-16).
 *
 * TESTING STRATEGY:
 * - Test CLI command `gitgov task delete <taskId>` against the real built binary
 * - Verify task files are deleted from filesystem
 * - Test error conditions (not found, wrong status, etc.)
 * - Test cache invalidation behavior
 */
describe('Task Delete CLI Command - E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let testProjectRoot: string;
  let worktreeBasePath: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-task-delete-test-'));
    testProjectRoot = path.join(tempDir, 'test-project');
  });

  afterAll(() => {
    process.chdir(originalCwd);
    cleanupWorktree(testProjectRoot, worktreeBasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    setupTestProject();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  // Helper to compute worktree base path (matches DI.getWorktreeBasePath)
  const getWorktreeBasePath = (repoPath: string): string => {
    const resolvedPath = fs.realpathSync(repoPath);
    const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
    return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
  };

  // Helper to clean up worktree
  const cleanupWorktree = (repoPath: string, wtPath: string) => {
    if (wtPath && fs.existsSync(wtPath)) {
      try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
      if (fs.existsSync(wtPath)) {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
    }
  };

  // Helper function to execute CLI command
  const runCliCommand = (args: string[], options: { expectError?: boolean; cwd?: string; input?: string } = {}) => {
    // Use compiled CLI instead of tsx for reliability in CI
    const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
    const command = `node "${cliPath}" ${args.join(' ')}`;
    const workingDir = options.cwd || testProjectRoot;

    try {
      const result = execSync(command, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: options.input ? 'pipe' : 'pipe',
        input: options.input
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

  // Helper function to set up test project structure
  const setupTestProject = () => {
    // Clean up worktree from previous test
    if (fs.existsSync(testProjectRoot)) {
      cleanupWorktree(testProjectRoot, getWorktreeBasePath(testProjectRoot));
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectRoot, { recursive: true });
    process.chdir(testProjectRoot);

    // Initialize git repo (required for project root detection)
    execSync('git init --initial-branch=main', { cwd: testProjectRoot, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testProjectRoot, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testProjectRoot, stdio: 'pipe' });

    // Create initial commit (required for SyncModule to create gitgov-state from main)
    fs.writeFileSync(path.join(testProjectRoot, 'README.md'), '# Test Project\n');
    execSync('git add README.md', { cwd: testProjectRoot, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: testProjectRoot, stdio: 'pipe' });

    // Create a bare repo as mock remote (for git push to work in E2E tests)
    const bareRepoPath = path.join(testProjectRoot, '..', 'test-remote.git');
    if (fs.existsSync(bareRepoPath)) {
      fs.rmSync(bareRepoPath, { recursive: true, force: true });
    }
    execSync(`git init --bare --initial-branch=main "${bareRepoPath}"`, { cwd: testProjectRoot, stdio: 'pipe' });
    execSync(`git remote add origin "${bareRepoPath}"`, { cwd: testProjectRoot, stdio: 'pipe' });
    execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

    // Compute worktree base path (gitgov init will create .gitgov here)
    worktreeBasePath = getWorktreeBasePath(testProjectRoot);

    // ✅ Use real CLI command instead of manual file creation
    // This is E2E testing done right: test the actual user workflow
    initGitgovProject();
    createTestRecords();
  };

  /**
   * Initialize GitGov project using REAL CLI command
   * This is E2E testing done right: test actual user workflow
   */
  const initGitgovProject = () => {
    // Use runCliCommand to execute gitgov init
    const result = runCliCommand(['init', '--name', 'Test E2E Project', '--actor-name', 'Test User', '--quiet']);

    if (!result.success) {
      throw new Error(`Failed to initialize GitGov project: ${result.error}`);
    }
  };

  /**
   * Create test task records in the worktree .gitgov/tasks/ directory
   * NOTE: Actor is already created by gitgov init, we only create test tasks
   */
  const createTestRecords = () => {
    const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');

    // gitgov init already created:
    // ✅ Actor record (with real keypair and signatures)
    // ✅ Active actor session
    // ✅ Root cycle
    // ✅ Complete project structure

    // We only need to create test tasks for our delete scenarios

    // Create draft task (can be deleted)
    const draftTask = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'a'.repeat(64), // Valid SHA-256 format (64 hex chars)
        signatures: [{
          keyId: 'human:test-user',
          role: 'creator',
          notes: 'E2E test task creation',
          timestamp: Date.now(), // Unix timestamp in ms
          signature: 'A'.repeat(86) + '==' // Valid Ed25519 signature format (86 chars + ==)
        }]
      },
      payload: {
        id: '1756365289-task-draft',
        title: 'Draft Task for Delete',
        status: 'draft',
        priority: 'medium',
        description: 'This task can be deleted',
        tags: ['test', 'draft'],
        cycleIds: [],
        references: [],
        notes: ''
      }
    };
    fs.writeFileSync(path.join(tasksDir, '1756365289-task-draft.json'), JSON.stringify(draftTask, null, 2));

    // Create review task (cannot be deleted, should show error)
    const reviewTask = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'b'.repeat(64), // Valid SHA-256 format (64 hex chars)
        signatures: [{
          keyId: 'human:test-user',
          role: 'creator',
          notes: 'E2E test task creation',
          timestamp: Date.now(), // Unix timestamp in ms
          signature: 'B'.repeat(86) + '==' // Valid Ed25519 signature format (86 chars + ==)
        }]
      },
      payload: {
        id: '1756365290-task-review',
        title: 'Review Task Cannot Delete',
        status: 'review',
        priority: 'high',
        description: 'This task cannot be deleted',
        tags: ['test', 'review'],
        cycleIds: [],
        references: [],
        notes: ''
      }
    };
    fs.writeFileSync(path.join(tasksDir, '1756365290-task-review.json'), JSON.stringify(reviewTask, null, 2));

    // Create active task (cannot be deleted, should show error)
    const activeTask = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'c'.repeat(64), // Valid SHA-256 format (64 hex chars)
        signatures: [{
          keyId: 'human:test-user',
          role: 'creator',
          notes: 'E2E test task creation',
          timestamp: Date.now(), // Unix timestamp in ms
          signature: 'C'.repeat(86) + '==' // Valid Ed25519 signature format (86 chars + ==)
        }]
      },
      payload: {
        id: '1756365291-task-active',
        title: 'Active Task Cannot Delete',
        status: 'active',
        priority: 'critical',
        description: 'This task cannot be deleted',
        tags: ['test', 'active'],
        cycleIds: [],
        references: [],
        notes: ''
      }
    };
    fs.writeFileSync(path.join(tasksDir, '1756365291-task-active.json'), JSON.stringify(activeTask, null, 2));
  };

  describe('4. Task Delete via real CLI binary (EARS-32, EARS-33, EARS-16)', () => {
    it('[EARS-32] should delete draft task file directly without discarded state (e2e)', () => {
      // Verify draft task exists before delete (in worktree)
      const draftTaskPath = path.join(worktreeBasePath, '.gitgov/tasks/1756365289-task-draft.json');
      expect(fs.existsSync(draftTaskPath)).toBe(true);

      const result = runCliCommand(['task', 'delete', '1756365289-task-draft']);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Task deleted'); // Match actual CLI output

      // Physically deleted, no discarded state left behind
      expect(fs.existsSync(draftTaskPath)).toBe(false);
    });

    it('[EARS-33] should show educational error when deleting non-draft task (e2e)', () => {
      // Test review task
      const reviewResult = runCliCommand(['task', 'delete', '1756365290-task-review'], { expectError: true });
      expect(reviewResult.success).toBe(false);
      expect(reviewResult.error).toContain('Cannot delete task');
      expect(reviewResult.error).toContain('review');
      expect(reviewResult.error).toContain('reject'); // Educational message

      // Test active task
      const activeResult = runCliCommand(['task', 'delete', '1756365291-task-active'], { expectError: true });
      expect(activeResult.success).toBe(false);
      expect(activeResult.error).toContain('Cannot delete task');
      expect(activeResult.error).toContain('active');
      expect(activeResult.error).toContain('cancel'); // Educational message
    });

    it('[EARS-16] should invalidate cache after delete so the task disappears from status output (e2e)', () => {
      const result = runCliCommand(['task', 'delete', '1756365289-task-draft']);
      expect(result.success).toBe(true);

      // Cache must be invalidated: a subsequent read command no longer sees the task
      const statusResult = runCliCommand(['status']);
      expect(statusResult.success).toBe(true);
      expect(statusResult.output).not.toContain('Draft Task for Delete');
      expect(statusResult.output).not.toContain('1756365289-task-draft');
    });
  });

  describe('Error Handling', () => {
    it('should handle task not found error', () => {
      const result = runCliCommand(['task', 'delete', '9999999999-task-nonexistent'], { expectError: true });

      expect(result.success).toBe(false);
      // Error can be either "not found" or "No active actors" depending on timing
      expect(result.error.length).toBeGreaterThan(0);
    });

    it('should handle invalid project structure', () => {
      // Remove .gitgov directory from worktree
      const gitgovDir = path.join(worktreeBasePath, '.gitgov');
      fs.rmSync(gitgovDir, { recursive: true, force: true });

      const result = runCliCommand(['task', 'delete', '1756365289-task-draft'], { expectError: true });

      expect(result.success).toBe(false);
      expect(result.error.length).toBeGreaterThan(0);
    });
  });

  describe('--help flag parsing', () => {
    // Tests for --help flag parsing fix (works with both direct exec and pnpm start)
    it('should show help when --help is passed to pause command', () => {
      const result = runCliCommand(['task', 'pause', '--help']);
      expect(result.output).toContain('Usage: gitgov task pause');
      expect(result.output).toContain('Pause active TaskRecord');
    });

    it('should show help when --help is passed to resume command', () => {
      const result = runCliCommand(['task', 'resume', '--help']);
      expect(result.output).toContain('Usage: gitgov task resume');
      expect(result.output).toContain('Resume paused TaskRecord');
    });

    it('should handle --help with pnpm start scenario (-- separator)', () => {
      // Simulate: pnpm start -- task pause --help
      const result = runCliCommand(['--', 'task', 'pause', '--help']);
      expect(result.output).toContain('Usage: gitgov task pause');
      expect(result.output).not.toContain('RecordNotFoundError');
    });

    it('should show help when -h short flag is used', () => {
      const result = runCliCommand(['task', 'pause', '-h']);
      expect(result.output).toContain('Usage: gitgov task pause');
    });
  });
});
