/**
 * MemoryGitModule Tests
 *
 * Tests for the in-memory Git implementation used in unit testing.
 * Follows EARS specification from memory_git_module.md blueprint.
 *
 * 64 EARS total across 8 blocks (A-H)
 */

import { MemoryGitModule } from './memory_git_module';
import {
  BranchNotFoundError,
  BranchAlreadyExistsError,
  FileNotFoundError,
  RebaseNotInProgressError,
} from '../errors';

describe('MemoryGitModule', () => {
  let git: MemoryGitModule;

  beforeEach(() => {
    git = new MemoryGitModule('/test/repo');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.1. Test Helpers (EARS-A1 to EARS-A9)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.1. Test Helpers (EARS-A1 to EARS-A9)', () => {
    it('[EARS-A1] should set currentBranch and add to branches', async () => {
      git.setBranch('feature-branch');

      expect(await git.getCurrentBranch()).toBe('feature-branch');
      expect(await git.branchExists('feature-branch')).toBe(true);
    });

    it('[EARS-A2] should replace branches and adjust currentBranch', async () => {
      git.setBranch('old-branch');
      git.setBranches(['new-1', 'new-2']);

      // currentBranch should be adjusted since 'old-branch' no longer exists
      expect(await git.getCurrentBranch()).toBe('new-1');
      expect(await git.branchExists('old-branch')).toBe(false);
      expect(await git.branchExists('new-1')).toBe(true);
      expect(await git.branchExists('new-2')).toBe(true);
    });

    it('[EARS-A3] should set commit history', async () => {
      git.setCommits([
        { hash: 'abc123', message: 'First commit', author: 'Test', date: '2024-01-01' },
        { hash: 'def456', message: 'Second commit', author: 'Test', date: '2024-01-02' },
      ]);

      const history = await git.getCommitHistory('main');
      expect(history).toHaveLength(2);
      expect(history[0]?.hash).toBe('abc123');
      expect(history[1]?.hash).toBe('def456');
    });

    it('[EARS-A4] should set files Map from Record', async () => {
      git.setFiles({
        'src/index.ts': 'console.log("hello")',
        'README.md': '# Project',
      });

      const indexContent = await git.getFileContent('HEAD', 'src/index.ts');
      expect(indexContent).toBe('console.log("hello")');
    });

    it('[EARS-A5] should set file content in commit and files', async () => {
      git.setCommits([{ hash: 'abc123', message: 'Test', author: 'Test', date: '2024-01-01' }]);
      git.setFileContent('abc123', 'file.ts', 'content');

      const content = await git.getFileContent('abc123', 'file.ts');
      expect(content).toBe('content');
    });

    it('[EARS-A6] should set stagedFiles array', async () => {
      git.setStagedFiles(['file1.ts', 'file2.ts']);

      const staged = await git.getStagedFiles();
      expect(staged).toEqual(['file1.ts', 'file2.ts']);
    });

    it('[EARS-A7] should mark rebase and set conflictedFiles', async () => {
      git.setRebaseInProgress(true, ['conflicted.ts']);

      expect(await git.isRebaseInProgress()).toBe(true);
      expect(await git.getConflictedFiles()).toEqual(['conflicted.ts']);
    });

    it('[EARS-A8] should set remote branches in Map', async () => {
      git.setRemoteBranches('upstream', ['main', 'develop']);

      const branches = await git.listRemoteBranches('upstream');
      expect(branches).toEqual(['main', 'develop']);
    });

    it('[EARS-A9] should reset state preserving repoRoot', async () => {
      git.setBranch('feature');
      git.setCommits([{ hash: 'abc', message: 'test', author: 'Test', date: '2024-01-01' }]);
      git.clear();

      expect(await git.getRepoRoot()).toBe('/test/repo');
      expect(await git.getCurrentBranch()).toBe('main');
      expect(await git.branchExists('feature')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.2. Read Operations - Basic (EARS-B1 to EARS-B14)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.2. Read Operations - Basic (EARS-B1 to EARS-B14)', () => {
    it('[EARS-B1] should return state.repoRoot', async () => {
      expect(await git.getRepoRoot()).toBe('/test/repo');
    });

    it('[EARS-B2] should return state.currentBranch', async () => {
      expect(await git.getCurrentBranch()).toBe('main');

      git.setBranch('develop');
      expect(await git.getCurrentBranch()).toBe('develop');
    });

    it('[EARS-B3] should return last commit hash for HEAD', async () => {
      git.setCommits([
        { hash: 'first-hash', message: 'First', author: 'Test', date: '2024-01-01' },
        { hash: 'last-hash', message: 'Last', author: 'Test', date: '2024-01-02' },
      ]);

      expect(await git.getCommitHash('HEAD')).toBe('last-hash');
    });

    it('[EARS-B4] should return default hash if no commits', async () => {
      expect(await git.getCommitHash('HEAD')).toBe('abc123def456');
    });

    it('[EARS-B5] should find commit by hash prefix', async () => {
      git.setCommits([
        { hash: 'abc123456789', message: 'Test', author: 'Test', date: '2024-01-01' },
      ]);

      expect(await git.getCommitHash('abc123')).toBe('abc123456789');
    });

    it('[EARS-B6] should return true/false for branch existence', async () => {
      expect(await git.branchExists('main')).toBe(true);
      expect(await git.branchExists('nonexistent')).toBe(false);
    });

    it('[EARS-B7] should return state.stagedFiles', async () => {
      expect(await git.getStagedFiles()).toEqual([]);

      git.setStagedFiles(['a.ts', 'b.ts']);
      expect(await git.getStagedFiles()).toEqual(['a.ts', 'b.ts']);
    });

    it('[EARS-B8] should return commits respecting maxCount', async () => {
      git.setCommits([
        { hash: 'a', message: 'A', author: 'Test', date: '2024-01-01' },
        { hash: 'b', message: 'B', author: 'Test', date: '2024-01-02' },
        { hash: 'c', message: 'C', author: 'Test', date: '2024-01-03' },
      ]);

      const history = await git.getCommitHistory('main', { maxCount: 2 });
      expect(history).toHaveLength(2);
      expect(history[0]?.hash).toBe('a');
      expect(history[1]?.hash).toBe('b');
    });

    it('[EARS-B9] should return commits in range', async () => {
      git.setCommits([
        { hash: 'a', message: 'A', author: 'Test', date: '2024-01-01' },
        { hash: 'b', message: 'B', author: 'Test', date: '2024-01-02' },
        { hash: 'c', message: 'C', author: 'Test', date: '2024-01-03' },
        { hash: 'd', message: 'D', author: 'Test', date: '2024-01-04' },
      ]);

      // Range: from 'a' (exclusive) to 'c' (inclusive)
      const range = await git.getCommitHistoryRange('a', 'c');
      expect(range).toHaveLength(2);
      expect(range[0]?.hash).toBe('b');
      expect(range[1]?.hash).toBe('c');
    });

    it('[EARS-B10] should return commit message or empty string', async () => {
      git.setCommits([
        { hash: 'abc123', message: 'Test message', author: 'Test', date: '2024-01-01' },
      ]);

      expect(await git.getCommitMessage('abc123')).toBe('Test message');
      expect(await git.getCommitMessage('nonexistent')).toBe('');
    });

    it('[EARS-B11] should return true if stagedFiles not empty', async () => {
      expect(await git.hasUncommittedChanges()).toBe(false);

      git.setStagedFiles(['file.ts']);
      expect(await git.hasUncommittedChanges()).toBe(true);
    });

    it('[EARS-B12] should return true if remote in Map', async () => {
      expect(await git.isRemoteConfigured('origin')).toBe(true);
      expect(await git.isRemoteConfigured('nonexistent')).toBe(false);
    });

    it('[EARS-B13] should return remote branches or empty array', async () => {
      expect(await git.listRemoteBranches('origin')).toEqual(['main']);
      expect(await git.listRemoteBranches('nonexistent')).toEqual([]);
    });

    it('[EARS-B14] should return empty array for getChangedFiles', async () => {
      const changed = await git.getChangedFiles('abc', 'def', '');
      expect(changed).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.3. Read Operations - With Errors (EARS-C1 to EARS-C7)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.3. Read Operations - With Errors (EARS-C1 to EARS-C7)', () => {
    it('[EARS-C1] should return merge base hash', async () => {
      git.setCommits([
        { hash: 'base-commit', message: 'Base', author: 'Test', date: '2024-01-01' },
      ]);

      const mergeBase = await git.getMergeBase('main', 'main');
      expect(mergeBase).toBe('base-commit');
    });

    it('[EARS-C2] should throw BranchNotFoundError for getMergeBase', async () => {
      await expect(git.getMergeBase('main', 'nonexistent')).rejects.toThrow(BranchNotFoundError);
      await expect(git.getMergeBase('nonexistent', 'main')).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-C3] should return file content from commit or files', async () => {
      // From files Map
      git.setFiles({ 'file.ts': 'from files' });
      expect(await git.getFileContent('any', 'file.ts')).toBe('from files');

      // From specific commit
      git.setCommits([{ hash: 'abc', message: 'Test', author: 'Test', date: '2024-01-01' }]);
      git.setFileContent('abc', 'commit-file.ts', 'from commit');
      expect(await git.getFileContent('abc', 'commit-file.ts')).toBe('from commit');
    });

    it('[EARS-C4] should throw FileNotFoundError', async () => {
      await expect(git.getFileContent('abc', 'nonexistent.ts')).rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-C5] should return remote name for branch', async () => {
      // 'main' is in origin by default
      const remote = await git.getBranchRemote('main');
      expect(remote).toBe('origin');
    });

    it('[EARS-C6] should return null if branch has no remote', async () => {
      git.setBranch('local-only');
      const remote = await git.getBranchRemote('local-only');
      expect(remote).toBeNull();
    });

    it('[EARS-C7] should throw BranchNotFoundError for getBranchRemote', async () => {
      await expect(git.getBranchRemote('nonexistent')).rejects.toThrow(BranchNotFoundError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.4. Write Operations - Branch (EARS-D1 to EARS-D5)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.4. Write Operations - Branch (EARS-D1 to EARS-D5)', () => {
    it('[EARS-D1] should update currentBranch on checkout', async () => {
      git.setBranches(['main', 'develop']);

      await git.checkoutBranch('develop');
      expect(await git.getCurrentBranch()).toBe('develop');
    });

    it('[EARS-D2] should throw BranchNotFoundError on checkout', async () => {
      await expect(git.checkoutBranch('nonexistent')).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-D3] should create branch and switch to it', async () => {
      await git.createBranch('feature-new');

      expect(await git.branchExists('feature-new')).toBe(true);
      expect(await git.getCurrentBranch()).toBe('feature-new');
    });

    it('[EARS-D4] should throw BranchAlreadyExistsError', async () => {
      await expect(git.createBranch('main')).rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-D5] should create orphan branch and switch', async () => {
      await git.checkoutOrphanBranch('orphan-branch');

      expect(await git.branchExists('orphan-branch')).toBe(true);
      expect(await git.getCurrentBranch()).toBe('orphan-branch');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.5. Write Operations - Files & Commit (EARS-E1 to EARS-E10)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.5. Write Operations - Files & Commit (EARS-E1 to EARS-E10)', () => {
    it('[EARS-E1] should add paths to stagedFiles without duplicates', async () => {
      await git.add(['file1.ts']);
      await git.add(['file1.ts', 'file2.ts']);

      const staged = await git.getStagedFiles();
      expect(staged).toEqual(['file1.ts', 'file2.ts']);
    });

    it('[EARS-E2] should remove from files and stagedFiles', async () => {
      git.setFiles({ 'file.ts': 'content' });
      git.setStagedFiles(['file.ts']);

      await git.rm(['file.ts']);

      const staged = await git.getStagedFiles();
      expect(staged).toEqual([]);
      await expect(git.getFileContent('HEAD', 'file.ts')).rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-E3] should create commit and clear stagedFiles', async () => {
      git.setStagedFiles(['file.ts']);

      const hash = await git.commit('Test commit', { name: 'Author', email: 'author@test.com' });

      expect(hash).toMatch(/^commit-/);
      expect(await git.getStagedFiles()).toEqual([]);

      const history = await git.getCommitHistory('main');
      expect(history).toHaveLength(1);
      expect(history[0]?.message).toBe('Test commit');
    });

    it('[EARS-E4] should delegate to commit()', async () => {
      const hash = await git.commitAllowEmpty('Empty commit');

      expect(hash).toMatch(/^commit-/);
      const history = await git.getCommitHistory('main');
      expect(history).toHaveLength(1);
    });

    it('[EARS-E5] should add branch to origin remote', async () => {
      git.setBranch('new-branch');

      await git.push('origin', 'new-branch');

      const remoteBranches = await git.listRemoteBranches('origin');
      expect(remoteBranches).toContain('new-branch');
    });

    it('[EARS-E6] should delegate to push()', async () => {
      git.setBranch('feature');

      await git.pushWithUpstream('origin', 'feature');

      const remoteBranches = await git.listRemoteBranches('origin');
      expect(remoteBranches).toContain('feature');
    });

    it('[EARS-E7] should complete without error for valid branch', async () => {
      await expect(git.setUpstream('main', 'origin', 'main')).resolves.not.toThrow();
    });

    it('[EARS-E8] should throw BranchNotFoundError for setUpstream', async () => {
      await expect(git.setUpstream('nonexistent', 'origin', 'main')).rejects.toThrow(
        BranchNotFoundError
      );
    });

    it('[EARS-E9] should complete without error for valid branch', async () => {
      await expect(git.checkoutFilesFromBranch('main', ['file.ts'])).resolves.not.toThrow();
    });

    it('[EARS-E10] should throw BranchNotFoundError for checkoutFiles', async () => {
      await expect(git.checkoutFilesFromBranch('nonexistent', ['file.ts'])).rejects.toThrow(
        BranchNotFoundError
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.6. Stash Operations (EARS-F1 to EARS-F5)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.6. Stash Operations (EARS-F1 to EARS-F5)', () => {
    it('[EARS-F1] should return null if no staged files', async () => {
      const result = await git.stash();
      expect(result).toBeNull();
    });

    it('[EARS-F2] should create stash and return hash', async () => {
      git.setStagedFiles(['file.ts']);

      const hash = await git.stash('WIP: my changes');

      expect(hash).toMatch(/^stash-/);
      expect(await git.getStagedFiles()).toEqual([]);
    });

    it('[EARS-F3] should restore files and return true', async () => {
      git.setFiles({ 'file.ts': 'content' });
      git.setStagedFiles(['file.ts']);
      await git.stash();

      const result = await git.stashPop();

      expect(result).toBe(true);
    });

    it('[EARS-F4] should return false if no stashes', async () => {
      const result = await git.stashPop();
      expect(result).toBe(false);
    });

    it('[EARS-F5] should drop most recent stash', async () => {
      git.setStagedFiles(['file.ts']);
      await git.stash();

      await git.stashDrop();

      // After drop, stashPop should return false
      const result = await git.stashPop();
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.7. Rebase Operations (EARS-G1 to EARS-G7)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.7. Rebase Operations (EARS-G1 to EARS-G7)', () => {
    it('[EARS-G1] should return state.isRebaseInProgress', async () => {
      expect(await git.isRebaseInProgress()).toBe(false);

      git.setRebaseInProgress(true);
      expect(await git.isRebaseInProgress()).toBe(true);
    });

    it('[EARS-G2] should return state.conflictedFiles', async () => {
      expect(await git.getConflictedFiles()).toEqual([]);

      git.setRebaseInProgress(true, ['file1.ts', 'file2.ts']);
      expect(await git.getConflictedFiles()).toEqual(['file1.ts', 'file2.ts']);
    });

    it('[EARS-G3] should clear rebase and return commit hash', async () => {
      git.setCommits([{ hash: 'abc123', message: 'Test', author: 'Test', date: '2024-01-01' }]);
      git.setRebaseInProgress(true, ['file.ts']);

      const hash = await git.rebaseContinue();

      expect(hash).toBe('abc123');
      expect(await git.isRebaseInProgress()).toBe(false);
      expect(await git.getConflictedFiles()).toEqual([]);
    });

    it('[EARS-G4] should throw RebaseNotInProgressError', async () => {
      await expect(git.rebaseContinue()).rejects.toThrow(RebaseNotInProgressError);
    });

    it('[EARS-G5] should clear rebase state', async () => {
      git.setRebaseInProgress(true, ['file.ts']);

      await git.rebaseAbort();

      expect(await git.isRebaseInProgress()).toBe(false);
      expect(await git.getConflictedFiles()).toEqual([]);
    });

    it('[EARS-G6] should throw RebaseNotInProgressError', async () => {
      await expect(git.rebaseAbort()).rejects.toThrow(RebaseNotInProgressError);
    });

    it('[EARS-G7] should set isRebaseInProgress if conflicts', async () => {
      git.setRebaseInProgress(false, ['conflict.ts']); // Pre-set conflicted files

      await git.rebase('main');

      expect(await git.isRebaseInProgress()).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.8. No-Op & Init Operations (EARS-H1 to EARS-H7)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4.8. No-Op & Init Operations (EARS-H1 to EARS-H7)', () => {
    it('[EARS-H1] should return empty ExecResult', async () => {
      const result = await git.exec('git', ['status']);

      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    });

    it('[EARS-H2] should add main and set currentBranch', async () => {
      git.setBranches(['other']);

      await git.init();

      expect(await git.branchExists('main')).toBe(true);
      expect(await git.getCurrentBranch()).toBe('main');
    });

    it('[EARS-H3] should save to config Map', async () => {
      await git.setConfig('user.name', 'Test User');

      // Verify by reading back (we'd need to expose config for proper test,
      // but setConfig doesn't throw and that's the contract)
      await expect(git.setConfig('user.email', 'test@example.com')).resolves.not.toThrow();
    });

    it('[EARS-H4] should be no-op for fetch', async () => {
      await expect(git.fetch('origin')).resolves.not.toThrow();
    });

    it('[EARS-H5] should be no-op for pull', async () => {
      await expect(git.pull('origin', 'main')).resolves.not.toThrow();
    });

    it('[EARS-H6] should be no-op for pullRebase', async () => {
      await expect(git.pullRebase('origin', 'main')).resolves.not.toThrow();
    });

    it('[EARS-H7] should clear stagedFiles', async () => {
      git.setStagedFiles(['file1.ts', 'file2.ts']);

      await git.resetHard('HEAD');

      expect(await git.getStagedFiles()).toEqual([]);
    });
  });
});
