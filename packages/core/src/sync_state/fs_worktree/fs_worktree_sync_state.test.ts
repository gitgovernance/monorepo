/**
 * FsWorktreeSyncStateModule Tests
 * @blueprint fs_worktree_sync_state_module.md
 *
 * SAFETY: These tests use TEMPORARY Git repositories in /tmp.
 * They NEVER touch the production repository.
 *
 * Each test creates an isolated temp repo with a bare remote and cleans up.
 *
 * TESTING APPROACH: Same as FsSyncStateModule — uses local bare repos as
 * remotes (no HTTP server needed). Focus is on business logic, not protocol.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import { FsWorktreeSyncStateModule } from './fs_worktree_sync_state';
import { LocalGitModule } from '../../git/local';
import type { ExecOptions, ExecResult } from '../../git/types';
import {
  ActorIdentityMismatchError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  RebaseAlreadyInProgressError,
} from '../sync_state.errors';
import type { IIdentityAdapter } from '../../adapters/identity_adapter';
import type { LintReport } from '../../lint';
import type { ILintModule } from '../../lint';
import type { IRecordProjector } from '../../record_projection';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════

function createExecCommand(
  repoRoot: string
): (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult> {
  return async (command: string, args: string[], options?: ExecOptions) => {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: options?.cwd || repoRoot,
        env: { ...process.env, ...options?.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code || 0 });
      });

      proc.on('error', (error) => {
        resolve({ stdout, stderr: error.message, exitCode: 1 });
      });
    });
  };
}

async function createTempRepo(): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    `gitgov-wt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const normalizedPath = fs.realpathSync(tempDir);

  const gitModule = new LocalGitModule({
    repoRoot: normalizedPath,
    execCommand: createExecCommand(normalizedPath),
  });

  await gitModule.init();
  await gitModule.setConfig('user.name', 'Test User');
  await gitModule.setConfig('user.email', 'test@example.com');
  await gitModule.setConfig('core.editor', 'true');
  await gitModule.setConfig('sequence.editor', 'true');

  // Create initial commit
  await execAsync('echo "# Test Repo" > README.md', { cwd: normalizedPath });
  await execAsync('git add .', { cwd: normalizedPath });
  await execAsync('git commit -m "Initial commit"', { cwd: normalizedPath });

  return normalizedPath;
}

async function createRemoteRepo(): Promise<string> {
  const remoteDir = path.join(
    os.tmpdir(),
    `gitgov-wt-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(remoteDir, { recursive: true });
  const normalizedPath = fs.realpathSync(remoteDir);

  await execAsync('git init --bare', { cwd: normalizedPath });

  return normalizedPath;
}

function removeTempRepo(repoPath: string): void {
  if (repoPath.includes('/tmp/') && repoPath.includes('gitgov-wt-')) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
}

function createMockIdentityAdapter(actorId: string = 'test-actor'): IIdentityAdapter {
  return {
    getActorPublicKey: jest.fn().mockResolvedValue(null),
    getCurrentActor: jest.fn().mockResolvedValue({
      id: actorId,
      type: 'human' as const,
      displayName: 'Test Actor',
      publicKey: 'mock-public-key-base64-placeholder',
      roles: ['developer'],
    }),
    signRecord: jest.fn().mockImplementation(async (record: unknown) => record),
  } as unknown as IIdentityAdapter;
}

function createMockLintModule(passing: boolean = true): ILintModule {
  const defaultLintReport: LintReport = {
    summary: { filesChecked: 0, errors: passing ? 0 : 1, warnings: 0, fixable: 0, executionTime: 0 },
    results: [],
    metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' },
  };

  return {
    lint: jest.fn().mockResolvedValue(defaultLintReport),
    lintRecord: jest.fn().mockReturnValue([]),
    fixRecord: jest.fn().mockImplementation((record) => record),
  } as unknown as ILintModule;
}

function createMockRecordProjector(): jest.Mocked<IRecordProjector> {
  return {
    generateIndex: jest.fn().mockResolvedValue({
      success: true,
      recordsProcessed: 0,
      cacheSize: 0,
      cacheStrategy: 'json',
      errors: [],
    }),
    getIndexData: jest.fn().mockResolvedValue(null),
    isIndexUpToDate: jest.fn().mockResolvedValue(true),
    invalidateCache: jest.fn().mockResolvedValue(undefined),
    calculateActivityHistory: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IRecordProjector>;
}

/**
 * Helper: Create a FsWorktreeSyncStateModule with all mocks for a temp repo.
 */
function createModule(
  repoRoot: string,
  overrides?: {
    identity?: IIdentityAdapter;
    lint?: ILintModule;
    indexer?: jest.Mocked<IRecordProjector>;
  }
) {
  const gitModule = new LocalGitModule({
    repoRoot,
    execCommand: createExecCommand(repoRoot),
  });

  const identity = overrides?.identity ?? createMockIdentityAdapter();
  const lint = overrides?.lint ?? createMockLintModule();
  const indexer = overrides?.indexer ?? createMockRecordProjector();

  const configManager = {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    getAll: jest.fn().mockReturnValue({}),
  };

  const module = new FsWorktreeSyncStateModule(
    {
      git: gitModule,
      config: configManager as any,
      identity,
      lint,
      indexer,
    },
    { repoRoot },
  );

  return { module, gitModule, identity, lint, indexer };
}

/**
 * Helper: Setup a repo with remote, push main to remote, create worktree-friendly state.
 */
async function setupRepoWithRemote(): Promise<{
  repoPath: string;
  remotePath: string;
}> {
  const repoPath = await createTempRepo();
  const remotePath = await createRemoteRepo();

  // Add remote
  await execAsync(`git remote add origin ${remotePath}`, { cwd: repoPath });
  await execAsync('git push origin main', { cwd: repoPath }).catch(() =>
    execAsync('git push origin master', { cwd: repoPath })
  );

  return { repoPath, remotePath };
}

/**
 * Helper: Create gitgov-state branch with .gitgov structure, push to remote.
 */
async function setupStateBranch(repoPath: string): Promise<void> {
  // Create orphan branch
  await execAsync('git checkout --orphan gitgov-state', { cwd: repoPath });
  await execAsync('git reset --hard', { cwd: repoPath });

  // Create .gitgov structure (add .gitkeep to each dir so git tracks them)
  const gitgovDir = path.join(repoPath, '.gitgov');
  fs.mkdirSync(gitgovDir, { recursive: true });
  for (const dir of ['tasks', 'cycles', 'actors', 'agents', 'feedbacks', 'executions', 'changelogs', 'workflows']) {
    fs.mkdirSync(path.join(gitgovDir, dir), { recursive: true });
    fs.writeFileSync(path.join(gitgovDir, dir, '.gitkeep'), '');
  }
  fs.writeFileSync(path.join(gitgovDir, 'config.json'), JSON.stringify({
    protocolVersion: '1.0.0',
    projectId: 'test-project',
    projectName: 'Test Project',
    rootCycle: '123-cycle-root',
    state: { branch: 'gitgov-state' },
  }, null, 2));

  await execAsync('git add .gitgov', { cwd: repoPath });
  await execAsync('git commit -m "gitgov: initialize state branch"', { cwd: repoPath });

  // Push to remote
  await execAsync('git push origin gitgov-state', { cwd: repoPath });

  // Return to main
  await execAsync('git checkout main', { cwd: repoPath }).catch(() =>
    execAsync('git checkout master', { cwd: repoPath })
  );

  // Clean up .gitgov from working dir (it's on gitgov-state, not main)
  fs.rmSync(gitgovDir, { recursive: true, force: true });
}

/**
 * Helper: Create a real rebase conflict in the worktree.
 *
 * Strategy:
 *   1. In worktree: create a JSON file in .gitgov/tasks/ and commit
 *   2. Clone the bare remote to a temp dir, checkout gitgov-state, push a
 *      conflicting change to the same file
 *   3. In worktree: fetch + rebase → conflict
 *
 * Uses a clone (not the main repo) because git won't let you checkout a branch
 * that's already checked out in a worktree.
 */
async function setupRebaseConflict(
  remotePath: string,
  worktreePath: string,
): Promise<{ conflictedFile: string; cloneDir: string }> {
  const conflictedFile = 'tasks/conflicted-task.json';
  const fullConflictPath = path.join(worktreePath, '.gitgov', conflictedFile);

  // 1. In worktree: create file and commit
  fs.mkdirSync(path.dirname(fullConflictPath), { recursive: true });
  fs.writeFileSync(fullConflictPath, JSON.stringify({
    id: 'task-conflict',
    title: 'Local version',
    status: 'open',
  }, null, 2));
  await execAsync('git add .gitgov/', { cwd: worktreePath });
  await execAsync('git commit -m "gitgov: local change"', { cwd: worktreePath });

  // 2. Clone remote, make conflicting change on gitgov-state
  const cloneDir = path.join(
    os.tmpdir(),
    `gitgov-wt-clone-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await execAsync(`git clone ${remotePath} "${cloneDir}"`);
  await execAsync('git checkout gitgov-state', { cwd: cloneDir });
  await execAsync('git config user.name "Remote User"', { cwd: cloneDir });
  await execAsync('git config user.email "remote@example.com"', { cwd: cloneDir });

  const cloneConflictPath = path.join(cloneDir, '.gitgov', conflictedFile);
  fs.mkdirSync(path.dirname(cloneConflictPath), { recursive: true });
  fs.writeFileSync(cloneConflictPath, JSON.stringify({
    id: 'task-conflict',
    title: 'Remote version',
    status: 'closed',
  }, null, 2));
  await execAsync('git add .gitgov/', { cwd: cloneDir });
  await execAsync('git commit -m "gitgov: remote change"', { cwd: cloneDir });
  await execAsync('git push origin gitgov-state', { cwd: cloneDir });

  // 3. In worktree: fetch + rebase → conflict
  await execAsync('git fetch origin', { cwd: worktreePath });
  try {
    await execAsync('git rebase origin/gitgov-state', { cwd: worktreePath });
  } catch {
    // Expected: rebase conflict
  }

  return { conflictedFile, cloneDir };
}

// ═══════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════

describe('FsWorktreeSyncStateModule', () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const p of cleanupPaths) {
      removeTempRepo(p);
    }
    cleanupPaths.length = 0;
  });

  // ═══════════════════════════════════════════════
  // 4.1. Worktree Management (WTSYNC-A1 to A6)
  // ═══════════════════════════════════════════════

  describe('4.1. Worktree Management (WTSYNC-A1 to A7)', () => {
    it('[WTSYNC-A1] should create worktree when none exists', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      const worktreePath = module.getWorktreePath();

      expect(fs.existsSync(worktreePath)).toBe(false);

      await module.ensureWorktree();

      expect(fs.existsSync(worktreePath)).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', 'config.json'))).toBe(true);
    });

    it('[WTSYNC-A2] should verify health and return when worktree is healthy', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);

      // First call creates worktree
      await module.ensureWorktree();

      // Second call should verify and return without changes
      const before = fs.statSync(path.join(module.getWorktreePath(), '.git')).mtimeMs;
      await module.ensureWorktree();
      const after = fs.statSync(path.join(module.getWorktreePath(), '.git')).mtimeMs;

      // .git file should not have been recreated
      expect(after).toBe(before);
    });

    it('[WTSYNC-A3] should remove and recreate corrupted worktree', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      const worktreePath = module.getWorktreePath();

      // Create worktree
      await module.ensureWorktree();
      expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);

      // Corrupt it by removing .git file
      fs.unlinkSync(path.join(worktreePath, '.git'));

      // Should detect corruption and recreate
      await module.ensureWorktree();
      expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);
    });

    it('[WTSYNC-A4] should return correct worktree path', async () => {
      const tempDir = await createTempRepo();
      cleanupPaths.push(tempDir);

      const { module } = createModule(tempDir);

      expect(module.getWorktreePath()).toBe(path.join(tempDir, '.gitgov-worktree'));
    });

    it('[WTSYNC-A5] should create local tracking branch from remote', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      // Create gitgov-state on remote only
      await setupStateBranch(repoPath);

      // Delete local gitgov-state branch (keep only on remote)
      await execAsync('git branch -D gitgov-state', { cwd: repoPath });

      const { module } = createModule(repoPath);

      // Should detect remote branch and create local tracking + worktree
      await module.ensureWorktree();

      expect(fs.existsSync(module.getWorktreePath())).toBe(true);
    });

    it('[WTSYNC-A6] should create orphan branch when none exists anywhere', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      // No gitgov-state anywhere
      const { module } = createModule(repoPath);

      await module.ensureWorktree();

      expect(fs.existsSync(module.getWorktreePath())).toBe(true);

      // Verify the branch exists
      const { stdout: branches } = await execAsync('git branch', { cwd: repoPath });
      expect(branches).toContain('gitgov-state');
    });

    it('[WTSYNC-A7] should NOT create .gitignore on fresh state branch initialization', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // Verify the worktree has NO .gitignore at root
      const worktreePath = module.getWorktreePath();
      expect(fs.existsSync(path.join(worktreePath, '.gitignore'))).toBe(false);

      // Verify the state branch tree has NO .gitignore
      const { stdout: tree } = await execAsync(
        'git ls-tree -r --name-only gitgov-state',
        { cwd: repoPath }
      );
      expect(tree.trim()).toBe(''); // orphan empty tree — no files at all
    });

    it('[WTSYNC-A7] should remove legacy .gitignore from existing state branch', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      // Simulate legacy FsSyncState init: create state branch WITH .gitignore
      await execAsync('git checkout --orphan gitgov-state', { cwd: repoPath });
      await execAsync('git rm -rf . 2>/dev/null || true', { cwd: repoPath });
      fs.writeFileSync(path.join(repoPath, '.gitignore'), '# Legacy\nindex.json\n.session.json\n');
      await execAsync('git add .gitignore', { cwd: repoPath });
      await execAsync('git commit -m "Initialize state branch with .gitignore"', { cwd: repoPath });
      await execAsync('git checkout main', { cwd: repoPath });

      // Verify .gitignore exists on state branch before cleanup
      const { stdout: treeBefore } = await execAsync(
        'git ls-tree --name-only gitgov-state',
        { cwd: repoPath }
      );
      expect(treeBefore.trim()).toContain('.gitignore');

      // Now create worktree — should clean up legacy .gitignore
      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // Verify .gitignore is GONE
      const worktreePath = module.getWorktreePath();
      expect(fs.existsSync(path.join(worktreePath, '.gitignore'))).toBe(false);

      // Verify the state branch no longer has .gitignore
      const { stdout: treeAfter } = await execAsync(
        'git ls-tree --name-only gitgov-state',
        { cwd: repoPath }
      );
      expect(treeAfter.trim()).not.toContain('.gitignore');
    });
  });

  // ═══════════════════════════════════════════════
  // 4.2. Push Operations (WTSYNC-B1 to B16)
  // ═══════════════════════════════════════════════

  describe('4.2. Push Operations (WTSYNC-B1 to B16)', () => {
    async function setupPushTest(): Promise<{
      repoPath: string;
      remotePath: string;
      module: FsWorktreeSyncStateModule;
      identity: IIdentityAdapter;
      lint: ILintModule;
      indexer: jest.Mocked<IRecordProjector>;
    }> {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      await setupStateBranch(repoPath);

      const result = createModule(repoPath);

      // Create worktree
      await result.module.ensureWorktree();

      return { repoPath, remotePath, ...result };
    }

    it('[WTSYNC-B1] should verify actor identity before push', async () => {
      const { module } = await setupPushTest();

      // Push with correct actor
      const result = await module.pushState({ actorId: 'test-actor' });
      // No changes to push, but identity verification passes
      expect(result.success).toBe(true);
    });

    it('[WTSYNC-B1] should throw ActorIdentityMismatchError when identity does not match', async () => {
      const { module } = await setupPushTest();

      await expect(module.pushState({ actorId: 'wrong-actor' }))
        .rejects.toThrow(ActorIdentityMismatchError);
    });

    it('[WTSYNC-B2] should run lint validation on source records', async () => {
      const { module, lint } = await setupPushTest();

      await module.pushState({ actorId: 'test-actor' });

      expect(lint.lint).toHaveBeenCalled();
    });

    it('[WTSYNC-B2] should return error when lint validation fails', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const failingLint = createMockLintModule(false);
      const { module } = createModule(repoPath, { lint: failingLint });
      await module.ensureWorktree();

      // Create a change so delta is non-empty
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-001.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'task-001' }));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Lint validation failed');
    });

    it('[WTSYNC-B3] should calculate delta of changed files', async () => {
      const { module } = await setupPushTest();

      // Create a new task file in the worktree
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-001.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'task-001', type: 'task' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.filesSynced).toBeGreaterThan(0);
    });

    it('[WTSYNC-B4] should copy syncable files to worktree', async () => {
      const { module } = await setupPushTest();

      // Create a syncable file
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-002.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'task-002' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBeGreaterThan(0);
    });

    it('[WTSYNC-B5] should commit changes in worktree with structured message', async () => {
      const { module } = await setupPushTest();

      // Create task
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-003.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'task-003' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.commitMessage).toContain('gitgov: sync state [actor:test-actor]');

      // Verify commit exists in worktree
      const { stdout: log } = await execAsync('git log --oneline -1', { cwd: module.getWorktreePath() });
      expect(log).toContain('gitgov: sync state');
    });

    it('[WTSYNC-B6] should pull --rebase in worktree to reconcile with remote', async () => {
      const { module, remotePath } = await setupPushTest();

      // Create task and push
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-004.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'task-004' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Verify it's on remote
      const { stdout: remoteLog } = await execAsync(
        'git log gitgov-state --oneline',
        { cwd: remotePath }
      );
      expect(remoteLog).toContain('sync state');
    });

    it('[WTSYNC-B7] should return conflictDetected true when rebase fails', async () => {
      const { module, remotePath } = await setupPushTest();

      // Create a conflicting change on remote (via a second worktree)
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-clone-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other User"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      // Create conflicting task
      const conflictPath = path.join(tempClone, '.gitgov', 'tasks', 'task-conflict.json');
      fs.writeFileSync(conflictPath, JSON.stringify({ id: 'task-conflict', by: 'remote' }, null, 2));
      await execAsync('git add .gitgov/tasks/task-conflict.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add conflicting task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Now create same file locally with different content
      const localConflictPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-conflict.json');
      fs.writeFileSync(localConflictPath, JSON.stringify({ id: 'task-conflict', by: 'local' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });

      // add/add conflict on same file is guaranteed during rebase
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo?.type).toBe('rebase_conflict');
    });

    it('[WTSYNC-B15] should throw RebaseAlreadyInProgressError when rebase is already in progress', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // Create a rebase conflict (leaves rebase in progress)
      const { cloneDir } = await setupRebaseConflict(remotePath, module.getWorktreePath());
      cleanupPaths.push(cloneDir);

      // Push should refuse while rebase is in progress
      await expect(module.pushState({ actorId: 'test-actor' }))
        .rejects.toThrow(RebaseAlreadyInProgressError);
    });

    it('[WTSYNC-B8] should include implicitPull info when rebase brings remote changes', async () => {
      const { module, remotePath } = await setupPushTest();

      // Push a remote change first (different file)
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-clone2-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other User"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      const remoteTaskPath = path.join(tempClone, '.gitgov', 'tasks', 'task-remote.json');
      fs.writeFileSync(remoteTaskPath, JSON.stringify({ id: 'task-remote' }, null, 2));
      await execAsync('git add .gitgov/tasks/task-remote.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Now push a local change (different file, no conflict)
      const localTaskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'task-local.json');
      fs.writeFileSync(localTaskPath, JSON.stringify({ id: 'task-local' }, null, 2));

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Remote change on different file → rebase succeeds with implicit pull
      expect(result.implicitPull).toBeDefined();
      expect(result.implicitPull!.hasChanges).toBe(true);
      expect(result.implicitPull!.reindexed).toBe(true);
    });

    it('[WTSYNC-B9] should only copy files in SYNC_DIRECTORIES and SYNC_ROOT_FILES', async () => {
      const { module } = await setupPushTest();
      const worktreePath = module.getWorktreePath();

      // Create files in valid sync dirs
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'valid.json'),
        JSON.stringify({ id: 'valid' })
      );

      // Create file in non-sync dir
      fs.mkdirSync(path.join(worktreePath, '.gitgov', 'scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'scripts', 'bad.json'),
        '{"bad": true}'
      );

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Verify scripts/bad.json was NOT committed
      const { stdout: committed } = await execAsync(
        'git log --oneline --name-only -1',
        { cwd: worktreePath }
      );
      expect(committed).toContain('tasks/valid.json');
      expect(committed).not.toContain('scripts/bad.json');
    });

    it('[WTSYNC-B10] should exclude files matching SYNC_EXCLUDED_PATTERNS', async () => {
      const { module } = await setupPushTest();
      const worktreePath = module.getWorktreePath();

      // Create .key file (should be excluded)
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'actors', 'actor.key'),
        'private-key-data'
      );

      // Create valid actor file
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'actors', 'actor.json'),
        JSON.stringify({ id: 'actor' })
      );

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Verify .key was NOT staged
      const { stdout: committed } = await execAsync(
        'git log --oneline --name-only -1',
        { cwd: worktreePath }
      );
      expect(committed).not.toContain('.key');
    });

    it('[WTSYNC-B11] should remove locally deleted files from worktree', async () => {
      const { module, remotePath } = await setupPushTest();
      const worktreePath = module.getWorktreePath();

      // Create and commit a file first
      const taskPath = path.join(worktreePath, '.gitgov', 'tasks', 'to-delete.json');
      fs.writeFileSync(taskPath, JSON.stringify({ id: 'to-delete' }));
      await execAsync('git add .gitgov/tasks/to-delete.json', { cwd: worktreePath });
      await execAsync('git commit -m "add file to delete later"', { cwd: worktreePath });

      // Now delete it
      fs.unlinkSync(taskPath);

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Verify the deletion was committed — file should not exist on remote
      const { stdout: remoteTree } = await execAsync(
        'git ls-tree -r --name-only gitgov-state',
        { cwd: remotePath }
      );
      expect(remoteTree).not.toContain('tasks/to-delete.json');
    });

    it('[WTSYNC-B12] should not commit or push when dryRun is true', async () => {
      const { module } = await setupPushTest();
      const worktreePath = module.getWorktreePath();

      // Create a file
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'dryrun.json'),
        JSON.stringify({ id: 'dryrun' })
      );

      const { stdout: beforeLog } = await execAsync('git log --oneline', { cwd: worktreePath });

      const result = await module.pushState({ actorId: 'test-actor', dryRun: true });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBeGreaterThan(0);
      expect(result.commitHash).toBeNull();

      const { stdout: afterLog } = await execAsync('git log --oneline', { cwd: worktreePath });
      expect(afterLog).toBe(beforeLog); // No new commits
    });

    it('[WTSYNC-B13] should skip rebase reconciliation when force is true', async () => {
      const { module } = await setupPushTest();
      const worktreePath = module.getWorktreePath();

      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'force-push.json'),
        JSON.stringify({ id: 'force-push' })
      );

      const result = await module.pushState({ actorId: 'test-actor', force: true });
      expect(result.success).toBe(true);
      expect(result.conflictDetected).toBe(false);
    });

    it('[WTSYNC-B14] should push to remote after successful commit and rebase', async () => {
      const { module, remotePath } = await setupPushTest();

      fs.writeFileSync(
        path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'pushed.json'),
        JSON.stringify({ id: 'pushed' })
      );

      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);

      // Verify on remote
      const { stdout: remoteLog } = await execAsync(
        'git log gitgov-state --oneline',
        { cwd: remotePath }
      );
      expect(remoteLog).toContain('sync state');
    });

    it('[WTSYNC-B16] should push existing commits when no uncommitted changes but local is ahead of remote', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create a task, commit it locally in the worktree, and push
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'task-ahead.json'),
        JSON.stringify({ id: 'task-ahead' })
      );
      await module.pushState({ actorId: 'test-actor' });

      // Delete the remote branch to simulate remote data loss
      await execAsync(`git branch -D gitgov-state`, { cwd: remotePath });

      // Now push again — no uncommitted changes, but local is ahead (remote branch gone)
      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);
      expect(result.commitHash).not.toBeNull();
      expect(result.filesSynced).toBe(0); // No new files, just re-pushed existing commits

      // Verify the remote branch was recreated
      const { stdout: remoteBranches } = await execAsync('git branch', { cwd: remotePath });
      expect(remoteBranches).toContain('gitgov-state');
    });

    it('[WTSYNC-B16] should push when no uncommitted changes and remote branch does not exist', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      const { module } = createModule(repoPath);
      // Create state branch locally (ensureStateBranch) + worktree, but never push to remote
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Add a task and commit in the worktree (but don't push)
      // Orphan branch starts empty — create .gitgov/tasks/ directory first
      fs.mkdirSync(path.join(worktreePath, '.gitgov', 'tasks'), { recursive: true });
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'task-new.json'),
        JSON.stringify({ id: 'task-new' })
      );
      await execAsync('git add .gitgov/tasks/task-new.json', { cwd: worktreePath });
      await execAsync('git commit -m "gitgov: local commit"', { cwd: worktreePath });

      // Now call pushState — delta is 0 (no uncommitted changes) but remote has no branch
      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);
      expect(result.commitHash).not.toBeNull();

      // Verify the remote now has the branch
      const { stdout: remoteBranches } = await execAsync('git branch', { cwd: remotePath });
      expect(remoteBranches).toContain('gitgov-state');
    });

    it('[WTSYNC-B16] should return no changes when no uncommitted changes and local equals remote', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Push a task to get local and remote in sync
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'task-synced.json'),
        JSON.stringify({ id: 'task-synced' })
      );
      await module.pushState({ actorId: 'test-actor' });

      // Push again with nothing new — should report no changes
      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).toBeNull(); // Nothing to push
      expect(result.commitMessage).toBeNull();
    });

    it('[WTSYNC-B16] should reconcile via rebase when local is ahead and remote also has new commits', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Step 1: Push a file via pushState to establish remote baseline
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'baseline-task.json'),
        JSON.stringify({ id: 'baseline-task' })
      );
      await module.pushState({ actorId: 'test-actor' });

      // Step 2: Push a DIFFERENT file from a clone (creates remote-only commit)
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-diverge-${Date.now()}`);
      cleanupPaths.push(tempClone);
      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });
      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'remote-only-task.json'),
        JSON.stringify({ id: 'remote-only-task' })
      );
      await execAsync('git add .gitgov/tasks/remote-only-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add diverging task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Step 3: Create a local-only commit directly in worktree (NOT pushed)
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'local-only-task.json'),
        JSON.stringify({ id: 'local-only-task' })
      );
      await execAsync('git add .gitgov/tasks/local-only-task.json', { cwd: worktreePath });
      await execAsync('git commit -m "gitgov: local-only commit"', { cwd: worktreePath });

      // Now: local is ahead (has local-only-task commit), remote also has new commit (remote-only-task)
      // delta=0 (no uncommitted changes) but histories have diverged

      // Step 4: pushState should reconcile (pull --rebase) then push
      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).not.toBeNull();

      // Step 5: Verify both files exist on remote
      const { stdout: remoteLog } = await execAsync(
        'git log gitgov-state --name-only --oneline',
        { cwd: remotePath }
      );
      expect(remoteLog).toContain('tasks/local-only-task.json');
      expect(remoteLog).toContain('tasks/remote-only-task.json');
    });

    it('[WTSYNC-B16] should return conflictDetected when reconciliation hits a conflict', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Step 1: Push baseline via pushState
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'baseline.json'),
        JSON.stringify({ id: 'baseline' })
      );
      await module.pushState({ actorId: 'test-actor' });

      // Step 2: Push SAME file with different content from a clone (creates conflict)
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-conflict-recon-${Date.now()}`);
      cleanupPaths.push(tempClone);
      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });
      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'conflict-file.json'),
        JSON.stringify({ id: 'conflict-file', by: 'remote' }, null, 2)
      );
      await execAsync('git add .gitgov/tasks/conflict-file.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add conflict file"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Step 3: Create SAME file locally with different content, commit directly (NOT pushed)
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'conflict-file.json'),
        JSON.stringify({ id: 'conflict-file', by: 'local' }, null, 2)
      );
      await execAsync('git add .gitgov/tasks/conflict-file.json', { cwd: worktreePath });
      await execAsync('git commit -m "gitgov: local conflict commit"', { cwd: worktreePath });

      // Now: delta=0 (no uncommitted changes), local ahead, remote also ahead,
      // AND both modified the same file → reconciliation will conflict

      // Step 4: pushState should detect conflict during reconciliation
      const result = await module.pushState({ actorId: 'test-actor' });
      expect(result.success).toBe(false);
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo?.type).toBe('rebase_conflict');
      expect(result.conflictInfo?.affectedFiles).toContain('.gitgov/tasks/conflict-file.json');
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════
  // 4.3. Pull Operations (WTSYNC-C1 to C9)
  // ═══════════════════════════════════════════════

  describe('4.3. Pull Operations (WTSYNC-C1 to C9)', () => {
    async function setupPullTest(): Promise<{
      repoPath: string;
      remotePath: string;
      module: FsWorktreeSyncStateModule;
      indexer: jest.Mocked<IRecordProjector>;
    }> {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);

      await setupStateBranch(repoPath);

      const result = createModule(repoPath);
      await result.module.ensureWorktree();

      return { repoPath, remotePath, module: result.module, indexer: result.indexer };
    }

    it('[WTSYNC-C1] should ensure worktree exists before pull', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);

      // Worktree doesn't exist yet — pullState should create it
      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(fs.existsSync(module.getWorktreePath())).toBe(true);
    });

    it('[WTSYNC-C2] should fetch from remote before pulling', async () => {
      const { module, remotePath } = await setupPullTest();

      // Push a change to remote that local doesn't know about
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-fetch-${Date.now()}`);
      cleanupPaths.push(tempClone);
      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });
      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'fetch-test.json'),
        JSON.stringify({ id: 'fetch-test' })
      );
      await execAsync('git add .gitgov/tasks/fetch-test.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task for fetch test"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Pull should fetch the remote change and bring it locally
      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);

      // Verify the fetched file exists in worktree
      const fetchedFile = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'fetch-test.json');
      expect(fs.existsSync(fetchedFile)).toBe(true);
    });

    it('[WTSYNC-C3] should rebase on fetched changes', async () => {
      const { module, remotePath } = await setupPullTest();

      // Push a change to remote
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-pull-clone-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'remote-task.json'),
        JSON.stringify({ id: 'remote-task' })
      );
      await execAsync('git add .gitgov/tasks/remote-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);

      // Verify file exists in worktree
      expect(fs.existsSync(
        path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'remote-task.json')
      )).toBe(true);
    });

    it('[WTSYNC-C4] should return conflictDetected true when rebase fails during pull', async () => {
      const { module, remotePath } = await setupPullTest();
      const worktreePath = module.getWorktreePath();

      // Create a local commit in worktree
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'conflict-task.json'),
        JSON.stringify({ id: 'conflict-task', by: 'local' })
      );
      await execAsync('git add .gitgov/tasks/conflict-task.json', { cwd: worktreePath });
      await execAsync('git commit -m "local: add task"', { cwd: worktreePath });

      // Create conflicting change on remote
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-conflict-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'conflict-task.json'),
        JSON.stringify({ id: 'conflict-task', by: 'remote' })
      );
      await execAsync('git add .gitgov/tasks/conflict-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add conflicting task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      const result = await module.pullState();

      // add/add conflict on same file is guaranteed during rebase
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo?.type).toBe('rebase_conflict');
    });

    it('[WTSYNC-C5] should re-index records after successful pull with changes', async () => {
      const { module, remotePath, indexer } = await setupPullTest();

      // Push remote change
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-reindex-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'reindex-task.json'),
        JSON.stringify({ id: 'reindex-task' })
      );
      await execAsync('git add .gitgov/tasks/reindex-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(result.reindexed).toBe(true);
      expect(indexer.generateIndex).toHaveBeenCalled();
    });

    it('[WTSYNC-C6] should auto-commit local syncable changes before pull', async () => {
      const { module, remotePath } = await setupPullTest();
      const worktreePath = module.getWorktreePath();

      // MODIFY a tracked file (config.json) — git pull --rebase REFUSES with unstaged tracked changes
      // This proves auto-commit is necessary: without it, pull would fail
      const configPath = path.join(worktreePath, '.gitgov', 'config.json');
      const originalConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const modifiedConfig = { ...originalConfig, projectName: 'Modified By Local' };
      fs.writeFileSync(configPath, JSON.stringify(modifiedConfig, null, 2));

      // Also create a new untracked syncable file
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'local-task.json'),
        JSON.stringify({ id: 'local-task' })
      );

      // Push a DIFFERENT change from remote (no conflict with config.json)
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-autocommit-${Date.now()}`);
      cleanupPaths.push(tempClone);

      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });

      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'remote-task.json'),
        JSON.stringify({ id: 'remote-task' })
      );
      await execAsync('git add .gitgov/tasks/remote-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Pull should auto-commit local changes (tracked mod + untracked new) then rebase
      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);

      // Modified config.json should have our local change (auto-committed, survived rebase)
      const finalConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(finalConfig.projectName).toBe('Modified By Local');

      // New local file should still exist (was auto-committed, not lost)
      expect(fs.existsSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'local-task.json')
      )).toBe(true);

      // Remote file should also exist (pulled in)
      expect(fs.existsSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'remote-task.json')
      )).toBe(true);
    });

    it('[WTSYNC-C6] should NOT commit LOCAL_ONLY files during auto-commit', async () => {
      const { module, remotePath } = await setupPullTest();
      const worktreePath = module.getWorktreePath();

      // Create LOCAL_ONLY files alongside syncable changes
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', '.session.json'),
        JSON.stringify({ actorId: 'local-only' })
      );
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'index.json'),
        JSON.stringify({ records: [] })
      );

      // Modify tracked syncable file to trigger auto-commit
      const configPath = path.join(worktreePath, '.gitgov', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      fs.writeFileSync(configPath, JSON.stringify({ ...config, modified: true }, null, 2));

      // Push remote change to force a real pull
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-localonly-${Date.now()}`);
      cleanupPaths.push(tempClone);
      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });
      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'remote-task.json'),
        JSON.stringify({ id: 'remote-task' })
      );
      await execAsync('git add .gitgov/tasks/remote-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Pull triggers auto-commit of syncable changes only
      const result = await module.pullState();
      expect(result.success).toBe(true);

      // Verify LOCAL_ONLY files are NOT in git history (never committed to the branch)
      const { stdout: gitFiles } = await execAsync(
        'git ls-tree -r --name-only HEAD -- .gitgov/',
        { cwd: worktreePath }
      );
      expect(gitFiles).not.toContain('.session.json');
      expect(gitFiles).not.toContain('index.json');

      // But they should still exist on disk (untracked)
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', '.session.json'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', 'index.json'))).toBe(true);
    });

    it('[WTSYNC-C7] should discard local changes when force is true', async () => {
      const { module } = await setupPullTest();
      const worktreePath = module.getWorktreePath();

      // Create untracked syncable file (should be cleaned by force)
      const untrackedPath = path.join(worktreePath, '.gitgov', 'tasks', 'to-discard.json');
      fs.writeFileSync(untrackedPath, JSON.stringify({ id: 'discard' }));

      // Modify a tracked file (should be reverted by checkout)
      const configPath = path.join(worktreePath, '.gitgov', 'config.json');
      const originalConfig = fs.readFileSync(configPath, 'utf-8');
      fs.writeFileSync(configPath, JSON.stringify({ ...JSON.parse(originalConfig), modified: true }, null, 2));

      // Force pull should succeed
      const result = await module.pullState({ force: true });
      expect(result.success).toBe(true);

      // Untracked syncable file must be gone (cleaned)
      expect(fs.existsSync(untrackedPath)).toBe(false);

      // Tracked file must be restored to original (checkout reverted it)
      const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(restoredConfig.modified).toBeUndefined();
    });

    it('[WTSYNC-C7] should preserve LOCAL_ONLY files (.session.json, index.json, .key) when force is true', async () => {
      const { module, remotePath } = await setupPullTest();
      const worktreePath = module.getWorktreePath();

      // Create LOCAL_ONLY files in the worktree
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', '.session.json'),
        JSON.stringify({ lastSession: { actorId: 'test-actor', timestamp: new Date().toISOString() } })
      );
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'index.json'),
        JSON.stringify({ version: 1, records: [] })
      );
      fs.mkdirSync(path.join(worktreePath, '.gitgov', 'actors'), { recursive: true });
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'actors', 'test-actor.key'),
        'private-key-content'
      );

      // Create a local syncable change (will be discarded by force)
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', 'tasks', 'local-change.json'),
        JSON.stringify({ id: 'local-change' })
      );

      // Push a remote change to trigger actual pull
      const tempClone = path.join(os.tmpdir(), `gitgov-wt-force-local-${Date.now()}`);
      cleanupPaths.push(tempClone);
      await execAsync(`git clone ${remotePath} ${tempClone}`);
      await execAsync('git config user.name "Other"', { cwd: tempClone });
      await execAsync('git config user.email "other@test.com"', { cwd: tempClone });
      await execAsync('git checkout gitgov-state', { cwd: tempClone });
      fs.writeFileSync(
        path.join(tempClone, '.gitgov', 'tasks', 'remote-task.json'),
        JSON.stringify({ id: 'remote-task' })
      );
      await execAsync('git add .gitgov/tasks/remote-task.json', { cwd: tempClone });
      await execAsync('git commit -m "remote: add task"', { cwd: tempClone });
      await execAsync('git push origin gitgov-state', { cwd: tempClone });

      // Force pull — should discard local changes but PRESERVE local-only files
      const result = await module.pullState({ force: true });
      expect(result.success).toBe(true);

      // LOCAL_ONLY files must still exist
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', '.session.json'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', 'index.json'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', 'actors', 'test-actor.key'))).toBe(true);

      // Verify LOCAL_ONLY content was not corrupted
      const sessionContent = JSON.parse(fs.readFileSync(path.join(worktreePath, '.gitgov', '.session.json'), 'utf-8'));
      expect(sessionContent.lastSession.actorId).toBe('test-actor');
      expect(fs.readFileSync(path.join(worktreePath, '.gitgov', 'actors', 'test-actor.key'), 'utf-8')).toBe('private-key-content');

      // Syncable untracked file must be gone (discarded by force)
      expect(fs.existsSync(path.join(worktreePath, '.gitgov', 'tasks', 'local-change.json'))).toBe(false);
    });

    it('[WTSYNC-C8] should return hasChanges false when no remote changes exist', async () => {
      const { module } = await setupPullTest();

      const result = await module.pullState();
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
    });

    it('[WTSYNC-C9] should throw RebaseAlreadyInProgressError when rebase is already in progress', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // Create a rebase conflict (leaves rebase in progress)
      const { cloneDir } = await setupRebaseConflict(remotePath, module.getWorktreePath());
      cleanupPaths.push(cloneDir);

      // Pull should refuse while rebase is in progress
      await expect(module.pullState())
        .rejects.toThrow(RebaseAlreadyInProgressError);
    });
  });

  // ═══════════════════════════════════════════════
  // 4.4. Resolve Operations (WTSYNC-D1 to D7)
  // ═══════════════════════════════════════════════

  describe('4.4. Resolve Operations (WTSYNC-D1 to D7)', () => {
    it('[WTSYNC-D1] should throw NoRebaseInProgressError when no rebase in progress', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      await expect(module.resolveConflict({ reason: 'test', actorId: 'test-actor' }))
        .rejects.toThrow(NoRebaseInProgressError);
    });

    it('[WTSYNC-D2] should check for conflict markers in worktree files', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // Create a file with conflict markers
      const taskPath = path.join(module.getWorktreePath(), '.gitgov', 'tasks', 'conflicted.json');
      fs.writeFileSync(taskPath, '<<<<<<< HEAD\n{"local": true}\n=======\n{"remote": true}\n>>>>>>> origin');

      const markers = await module.checkConflictMarkers(['tasks/conflicted.json']);
      expect(markers).toContain('tasks/conflicted.json');
    });

    it('[WTSYNC-D3] should throw ConflictMarkersPresentError when markers remain', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create real rebase conflict
      const { cloneDir } = await setupRebaseConflict(remotePath, worktreePath);
      cleanupPaths.push(cloneDir);

      // File still has conflict markers — do NOT resolve
      await expect(module.resolveConflict({ reason: 'test', actorId: 'test-actor' }))
        .rejects.toThrow(ConflictMarkersPresentError);
    });

    it('[WTSYNC-D4] should re-sign resolved records with updated checksum and signature', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const identity = createMockIdentityAdapter();
      const { module } = createModule(repoPath, { identity });
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create real rebase conflict
      const { conflictedFile, cloneDir } = await setupRebaseConflict(remotePath, worktreePath);
      cleanupPaths.push(cloneDir);

      // Resolve manually: write clean JSON (remove conflict markers)
      const resolvedContent = JSON.stringify({
        id: 'task-conflict',
        title: 'Resolved version',
        status: 'resolved',
      }, null, 2);
      fs.writeFileSync(path.join(worktreePath, '.gitgov', conflictedFile), resolvedContent);

      await module.resolveConflict({ reason: 'test resolution', actorId: 'test-actor' });

      // signRecord was called with the resolved record
      expect(identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-conflict' }),
        'test-actor',
        'resolver',
        'test resolution',
      );
    });

    it('[WTSYNC-D5] should continue rebase after re-signing records', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create real rebase conflict
      const { conflictedFile, cloneDir } = await setupRebaseConflict(remotePath, worktreePath);
      cleanupPaths.push(cloneDir);

      // Resolve manually
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', conflictedFile),
        JSON.stringify({ id: 'task-conflict', title: 'Resolved', status: 'done' }, null, 2),
      );

      await module.resolveConflict({ reason: 'rebase done', actorId: 'test-actor' });

      // After resolve, rebase should no longer be in progress
      expect(await module.isRebaseInProgress()).toBe(false);
    });

    it('[WTSYNC-D6] should create resolution commit with actor and reason', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create real rebase conflict
      const { conflictedFile, cloneDir } = await setupRebaseConflict(remotePath, worktreePath);
      cleanupPaths.push(cloneDir);

      // Resolve manually
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', conflictedFile),
        JSON.stringify({ id: 'task-conflict', title: 'Resolved', status: 'done' }, null, 2),
      );

      const result = await module.resolveConflict({ reason: 'merge fix', actorId: 'test-actor' });

      // Verify resolution commit message in git log
      const { stdout: log } = await execAsync(
        `git -C "${worktreePath}" log --oneline -1`,
      );
      expect(log).toContain('resolve conflict');
      expect(log).toContain('[actor:test-actor]');
      expect(result.resolutionCommitHash).toBeTruthy();
    });

    it('[WTSYNC-D7] should push resolution to remote and re-index', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const indexer = createMockRecordProjector();
      const { module } = createModule(repoPath, { indexer });
      await module.ensureWorktree();
      const worktreePath = module.getWorktreePath();

      // Create real rebase conflict
      const { conflictedFile, cloneDir } = await setupRebaseConflict(remotePath, worktreePath);
      cleanupPaths.push(cloneDir);

      // Resolve manually
      fs.writeFileSync(
        path.join(worktreePath, '.gitgov', conflictedFile),
        JSON.stringify({ id: 'task-conflict', title: 'Resolved', status: 'done' }, null, 2),
      );

      await module.resolveConflict({ reason: 'all good', actorId: 'test-actor' });

      // Verify generateIndex was called
      expect(indexer.generateIndex).toHaveBeenCalled();

      // Verify pushed to remote
      const { stdout: remoteLog } = await execAsync(
        `git --git-dir="${remotePath}" log gitgov-state --oneline -1`,
      );
      expect(remoteLog).toContain('resolve conflict');
    });
  });

  // ═══════════════════════════════════════════════
  // 4.5. Integrity and Audit (WTSYNC-E1 to E8)
  // ═══════════════════════════════════════════════

  describe('4.5. Integrity and Audit (WTSYNC-E1 to E8)', () => {
    it('[WTSYNC-E1] should verify resolution integrity in commit history', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      const violations = await module.verifyResolutionIntegrity();
      expect(Array.isArray(violations)).toBe(true);
      expect(violations.length).toBe(0); // No rebase commits = no violations
    });

    it('[WTSYNC-E2] should validate record signatures when verifySignatures is true', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const lint = createMockLintModule();
      const { module } = createModule(repoPath, { lint });
      await module.ensureWorktree();

      await module.auditState({ verifySignatures: true });
      expect(lint.lint).toHaveBeenCalledWith(
        expect.objectContaining({ validateSignatures: true })
      );
    });

    it('[WTSYNC-E3] should validate record checksums when verifyChecksums is true', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const lint = createMockLintModule();
      const { module } = createModule(repoPath, { lint });
      await module.ensureWorktree();

      await module.auditState({ verifyChecksums: true });
      expect(lint.lint).toHaveBeenCalledWith(
        expect.objectContaining({ validateChecksums: true })
      );
    });

    it('[WTSYNC-E4] should verify expected files exist in worktree', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      const report = await module.auditState({ verifyExpectedFiles: true });
      // State branch was set up with proper structure
      expect(report.passed).toBe(true);
    });

    it('[WTSYNC-E5] should resolve all scopes to worktree records', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // All three scopes should resolve to the same source (worktree)
      const reportCurrent = await module.auditState({ scope: 'current' });
      const reportState = await module.auditState({ scope: 'state-branch' });
      const reportAll = await module.auditState({ scope: 'all' });

      expect(reportCurrent.scope).toBe('current');
      expect(reportState.scope).toBe('state-branch');
      expect(reportAll.scope).toBe('all');
      // All should pass equally since they all read from same worktree
      expect(reportCurrent.passed).toBe(reportState.passed);
      expect(reportState.passed).toBe(reportAll.passed);
    });

    it('[WTSYNC-E6] should detect rebase in progress by checking worktree gitdir', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // No rebase in progress
      const inProgress = await module.isRebaseInProgress();
      expect(inProgress).toBe(false);
    });

    it('[WTSYNC-E7] should return structured conflict diff from worktree during rebase', async () => {
      const { repoPath, remotePath } = await setupRepoWithRemote();
      cleanupPaths.push(repoPath, remotePath);
      await setupStateBranch(repoPath);

      const { module } = createModule(repoPath);
      await module.ensureWorktree();

      // No conflicted files — should return empty
      const diff = await module.getConflictDiff();
      expect(diff.files).toEqual([]);
      expect(diff.message).toContain('0 file(s) in conflict');
    });

    it('[WTSYNC-E8] should return configured state branch name', async () => {
      const tempDir = await createTempRepo();
      cleanupPaths.push(tempDir);

      const { module } = createModule(tempDir);

      const branchName = await module.getStateBranchName();
      expect(branchName).toBe('gitgov-state');
    });
  });
});
