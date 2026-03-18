/**
 * Tests for GitLabGitModule
 *
 * Blueprint: gitlab_git_module.md
 * EARS: A1-A6 (read), B1-B4 (branches), C1-C7 (write), D1-D5 (no-ops), E1-E5 (errors)
 */

import { GitLabGitModule } from './gitlab_git_module';
import type { GitLabGitModuleOptions } from './gitlab_git_module.types';

// We need to import error types from core
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '@gitgov/core/git/errors';

function createMockApi() {
  return {
    RepositoryFiles: { show: jest.fn() },
    Repositories: { compare: jest.fn(), showBlob: jest.fn(), allRepositoryTrees: jest.fn() },
    Branches: { show: jest.fn(), all: jest.fn(), create: jest.fn() },
    Commits: { all: jest.fn(), show: jest.fn(), create: jest.fn() },
  } as unknown as GitLabGitModuleOptions['api'];
}

function mock(api: GitLabGitModuleOptions['api']) {
  return api as unknown as {
    RepositoryFiles: { show: jest.Mock };
    Repositories: { compare: jest.Mock; showBlob: jest.Mock };
    Branches: { show: jest.Mock; all: jest.Mock; create: jest.Mock };
    Commits: { all: jest.Mock; show: jest.Mock; create: jest.Mock };
  };
}

function gitbeakerError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>)['cause'] = { response: { status } };
  return err;
}

function createModule(overrides?: Partial<GitLabGitModuleOptions>) {
  const api = overrides?.api ?? createMockApi();
  return {
    git: new GitLabGitModule({ projectId: 123, api, ...overrides }),
    api,
  };
}

describe('GitLabGitModule', () => {
  describe('4.1. Read Operations — Content & Refs (EARS-A1 to A6)', () => {
    it('[EARS-A1] should return file content decoded from base64', async () => {
      const { git, api } = createModule();
      const content = '{"key":"value"}';
      mock(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from(content).toString('base64'),
        blob_id: 'b1',
      });

      expect(await git.getFileContent('sha1', 'test.json')).toBe(content);
    });

    it('[EARS-A1] should call Gitbeaker RepositoryFiles.show with correct params', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from('test').toString('base64'),
        blob_id: 'b1',
      });

      await git.getFileContent('commit-sha', '.gitgov/config.json');
      expect(mock(api).RepositoryFiles.show).toHaveBeenCalledWith(123, '.gitgov/config.json', 'commit-sha');
    });

    it('[EARS-A2] should fallback to Blobs API when content is null', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: null, blob_id: 'blob-sha' });
      mock(api).Repositories.showBlob.mockResolvedValue({
        content: Buffer.from('large content').toString('base64'),
      });

      expect(await git.getFileContent('sha', 'large.json')).toBe('large content');
    });

    it('[EARS-A3] should return commit SHA from Branches.show', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'abc123def456' } });

      expect(await git.getCommitHash('gitgov-state')).toBe('abc123def456');
    });

    it('[EARS-A4] should return ChangedFile array from compare endpoint', async () => {
      const { git, api } = createModule();
      mock(api).Repositories.compare.mockResolvedValue({
        diffs: [
          { new_path: '.gitgov/tasks/t1.json', new_file: true, deleted_file: false, renamed_file: false },
          { new_path: '.gitgov/tasks/t2.json', new_file: false, deleted_file: false, renamed_file: false },
          { new_path: '.gitgov/tasks/t3.json', new_file: false, deleted_file: true, renamed_file: false },
        ],
      });

      const files = await git.getChangedFiles('sha1', 'sha2', '.gitgov/');
      expect(files).toEqual([
        { status: 'A', file: '.gitgov/tasks/t1.json' },
        { status: 'M', file: '.gitgov/tasks/t2.json' },
        { status: 'D', file: '.gitgov/tasks/t3.json' },
      ]);
    });

    it('[EARS-A4] should filter changed files by pathFilter', async () => {
      const { git, api } = createModule();
      mock(api).Repositories.compare.mockResolvedValue({
        diffs: [
          { new_path: '.gitgov/tasks/t1.json', new_file: true, deleted_file: false, renamed_file: false },
          { new_path: 'README.md', new_file: false, deleted_file: false, renamed_file: false },
        ],
      });

      const files = await git.getChangedFiles('s1', 's2', '.gitgov/');
      expect(files).toHaveLength(1);
      expect(files[0]!.file).toBe('.gitgov/tasks/t1.json');
    });

    it('[EARS-A5] should return CommitInfo array with pagination', async () => {
      const { git, api } = createModule();
      mock(api).Commits.all.mockResolvedValue([
        { id: 'sha1', message: 'msg1', author_name: 'Dev', author_email: 'dev@test.com', authored_date: '2026-01-01' },
      ]);

      const commits = await git.getCommitHistory('main', { maxCount: 10 });
      expect(commits).toEqual([{
        hash: 'sha1', message: 'msg1', author: 'Dev <dev@test.com>', date: '2026-01-01',
      }]);
    });

    it('[EARS-A6] should return commit message from Commits.show', async () => {
      const { git, api } = createModule();
      mock(api).Commits.show.mockResolvedValue({ message: 'feat: add feature' });

      expect(await git.getCommitMessage('sha1')).toBe('feat: add feature');
    });
  });

  describe('4.2. Read Operations — Branches (EARS-B1 to B4)', () => {
    it('[EARS-B1] should return true when branch exists (HTTP 200)', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ name: 'gitgov-state' });

      expect(await git.branchExists('gitgov-state')).toBe(true);
    });

    it('[EARS-B1] should return false when branch does not exist (HTTP 404)', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockRejectedValue(gitbeakerError(404));

      expect(await git.branchExists('nonexistent')).toBe(false);
    });

    it('[EARS-B2] should return array of branch names', async () => {
      const { git, api } = createModule();
      mock(api).Branches.all.mockResolvedValue([
        { name: 'main' }, { name: 'gitgov-state' },
      ]);

      expect(await git.listRemoteBranches('origin')).toEqual(['main', 'gitgov-state']);
    });

    it('[EARS-B3] should return CommitInfo array from compare endpoint', async () => {
      const { git, api } = createModule();
      mock(api).Repositories.compare.mockResolvedValue({
        commits: [
          { id: 's1', message: 'm1', author_name: 'A', author_email: 'a@t.com', authored_date: '2026-01-01' },
        ],
      });

      const commits = await git.getCommitHistoryRange('from', 'to');
      expect(commits).toHaveLength(1);
      expect(commits[0]!.hash).toBe('s1');
    });

    it('[EARS-B3] should respect options.maxCount and options.pathFilter', async () => {
      const { git, api } = createModule();
      mock(api).Repositories.compare.mockResolvedValue({
        commits: [
          { id: 's1', message: 'm1', author_name: 'A', author_email: 'a@t.com', authored_date: '2026-01-01' },
          { id: 's2', message: 'm2', author_name: 'A', author_email: 'a@t.com', authored_date: '2026-01-02' },
        ],
      });

      const commits = await git.getCommitHistoryRange('from', 'to', { maxCount: 1 });
      expect(commits).toHaveLength(1);
    });

    it('[EARS-B4] should return SHA directly when ref is already a 40-char hex', async () => {
      const { git, api } = createModule();
      const sha = 'a'.repeat(40);

      expect(await git.getCommitHash(sha)).toBe(sha);
      expect(mock(api).Branches.show).not.toHaveBeenCalled();
    });
  });

  describe('4.3. Write Operations — Staging & Commit (EARS-C1 to C7)', () => {
    it('[EARS-C1] should use contentMap content directly', async () => {
      const { git } = createModule();
      await git.add(['.gitgov/test.json'], { contentMap: { '.gitgov/test.json': '{"a":1}' } });

      const staged = await git.getStagedFiles();
      expect(staged).toContain('.gitgov/test.json');
    });

    it('[EARS-C1] should read existing content via getFileContent and add to staging', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from('existing').toString('base64'),
        blob_id: 'b',
      });

      await git.add(['.gitgov/config.json']);
      expect(await git.getStagedFiles()).toContain('.gitgov/config.json');
    });

    it('[EARS-C2] should mark file paths as deleted in staging buffer', async () => {
      const { git } = createModule();
      await git.rm(['.gitgov/old.json']);

      expect(await git.getStagedFiles()).toContain('.gitgov/old.json');
    });

    it('[EARS-C3] should create atomic commit via single Commits.create call', async () => {
      const { git, api } = createModule();
      // Stage a file
      await git.add(['test.json'], { contentMap: { 'test.json': '{}' } });

      // Mock fileExistsOnRemote → false (create action)
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockResolvedValue({ id: 'commit-sha' });

      const sha = await git.commit('test commit');
      expect(sha).toBe('commit-sha');
      expect(mock(api).Commits.create).toHaveBeenCalledTimes(1);
    });

    it('[EARS-C3] should map staging buffer to correct actions array', async () => {
      const { git, api } = createModule();
      await git.add(['new.json'], { contentMap: { 'new.json': 'content' } });

      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await git.commit('msg');
      const actions = mock(api).Commits.create.mock.calls[0]![3] as Array<{ action: string; file_path: string }>;
      expect(actions[0]!.action).toBe('create');
      expect(actions[0]!.file_path).toBe('new.json');
    });

    it('[EARS-C3] should handle mixed create/update/delete actions', async () => {
      const { git, api } = createModule();
      // new.json via contentMap → create
      await git.add(['new.json'], { contentMap: { 'new.json': 'new' } });
      // existing.json via getFileContent → update
      mock(api).RepositoryFiles.show.mockResolvedValueOnce({
        content: Buffer.from('old content').toString('base64'), blob_id: 'b',
      });
      await git.add(['existing.json']);
      // old.json → delete
      await git.rm(['old.json']);

      mock(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await git.commit('mixed');
      const actions = mock(api).Commits.create.mock.calls[0]![3] as Array<{ action: string }>;
      expect(actions.map(a => a.action)).toEqual(['create', 'update', 'delete']);
    });

    it('[EARS-C4] should clear staging buffer after successful commit', async () => {
      const { git, api } = createModule();
      await git.add(['f.json'], { contentMap: { 'f.json': '{}' } });
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await git.commit('msg');
      expect(await git.getStagedFiles()).toEqual([]);
    });

    it('[EARS-C5] should throw GitError when staging buffer is empty', async () => {
      const { git } = createModule();
      await expect(git.commit('empty')).rejects.toThrow(GitError);
      await expect(git.commit('empty')).rejects.toThrow('Nothing to commit');
    });

    it('[EARS-C6] should create branch via Branches.create', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'parent-sha' } });
      mock(api).Branches.create.mockResolvedValue({});

      await git.createBranch('new-branch', 'gitgov-state');
      expect(mock(api).Branches.create).toHaveBeenCalledWith(123, 'new-branch', 'parent-sha');
    });

    it('[EARS-C6] should throw BranchAlreadyExistsError for existing branch', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Branches.create.mockRejectedValue(gitbeakerError(400));

      await expect(git.createBranch('existing')).rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-C7] should return staged file paths from buffer', async () => {
      const { git } = createModule();
      await git.add(['a.json', 'b.json'], { contentMap: { 'a.json': '1', 'b.json': '2' } });
      await git.rm(['c.json']);

      const staged = await git.getStagedFiles();
      expect(staged.sort()).toEqual(['a.json', 'b.json', 'c.json']);
    });
  });

  describe('4.4. No-ops & Not Supported (EARS-D1 to D5)', () => {
    it('[EARS-D1] should return sensible defaults for no-op methods', async () => {
      const { git } = createModule();
      expect(await git.getRepoRoot()).toBe('gitlab://123');
      expect(await git.getCurrentBranch()).toBe('gitgov-state');
      expect(await git.isRemoteConfigured('origin')).toBe(true);
      expect(await git.isRebaseInProgress()).toBe(false);
      expect(await git.getConflictedFiles()).toEqual([]);
    });

    it('[EARS-D1] should return true for hasUncommittedChanges when buffer non-empty', async () => {
      const { git } = createModule();
      expect(await git.hasUncommittedChanges()).toBe(false);
      await git.add(['f.json'], { contentMap: { 'f.json': '{}' } });
      expect(await git.hasUncommittedChanges()).toBe(true);
    });

    it('[EARS-D1] should allow commitAllowEmpty with empty staging buffer', async () => {
      const { git, api } = createModule();
      mock(api).Commits.create.mockResolvedValue({ id: 'empty-sha' });

      const sha = await git.commitAllowEmpty('empty commit');
      expect(sha).toBe('empty-sha');
    });

    it('[EARS-D1] should delegate commitAllowEmpty to Commits.create', async () => {
      const { git, api } = createModule();
      mock(api).Commits.create.mockResolvedValue({ id: 'sha' });

      await git.commitAllowEmpty('msg');
      expect(mock(api).Commits.create).toHaveBeenCalledTimes(1);
    });

    it('[EARS-D2] should update activeRef on checkoutBranch', async () => {
      const { git } = createModule();
      await git.checkoutBranch('feature-branch');
      expect(await git.getCurrentBranch()).toBe('feature-branch');
    });

    it('[EARS-D3] should throw GitError for unsupported methods', async () => {
      const { git } = createModule();
      await expect(git.rebase('main')).rejects.toThrow(GitError);
      await expect(git.rebaseContinue()).rejects.toThrow(GitError);
      await expect(git.resetHard('sha')).rejects.toThrow(GitError);
      await expect(git.checkoutOrphanBranch('orphan')).rejects.toThrow(GitError);
      await expect(git.checkoutFilesFromBranch('main', ['f'])).rejects.toThrow(GitError);
      await expect(git.getMergeBase('a', 'b')).rejects.toThrow(GitError);
    });

    it('[EARS-D4] should be no-op for push methods', async () => {
      const { git } = createModule();
      await expect(git.push('origin', 'main')).resolves.toBeUndefined();
      await expect(git.pushWithUpstream('origin', 'main')).resolves.toBeUndefined();
    });

    it('[EARS-D5] should return error ExecResult for exec()', async () => {
      const { git } = createModule();
      const result = await git.exec('git', ['status']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not supported');
    });
  });

  describe('4.5. Error Handling (EARS-E1 to E5)', () => {
    it('[EARS-E1] should throw FileNotFoundError for HTTP 404 on file ops', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));

      await expect(git.getFileContent('sha', 'missing.json')).rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-E2] should throw BranchNotFoundError for HTTP 404 on branch ops', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockRejectedValue(gitbeakerError(404));

      await expect(git.getCommitHash('nonexistent')).rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-E3] should throw GitError for HTTP 401 or 403', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(403));

      await expect(git.getFileContent('sha', 'f.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'f.json')).rejects.toThrow(/permission/i);
    });

    it('[EARS-E3] should translate HTTP 403 to GitError during commit', async () => {
      const { git, api } = createModule();
      await git.add(['f.json'], { contentMap: { 'f.json': '{}' } });
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockRejectedValue(gitbeakerError(403));

      await expect(git.commit('msg')).rejects.toThrow(GitError);
    });

    it('[EARS-E4] should throw BranchAlreadyExistsError for existing branch', async () => {
      const { git, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Branches.create.mockRejectedValue(gitbeakerError(400));

      await expect(git.createBranch('exists')).rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-E4] should throw GitError with conflict message on commit 409', async () => {
      const { git, api } = createModule();
      await git.add(['f.json'], { contentMap: { 'f.json': '{}' } });
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockRejectedValue(gitbeakerError(409));

      await expect(git.commit('msg')).rejects.toThrow(/[Cc]onflict/);
    });

    it('[EARS-E5] should throw GitError for network failures', async () => {
      const { git, api } = createModule();
      mock(api).RepositoryFiles.show.mockRejectedValue(new TypeError('fetch failed'));

      await expect(git.getFileContent('sha', 'f.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'f.json')).rejects.toThrow(/network/i);
    });

    it('[EARS-E5] should translate network error to GitError during commit', async () => {
      const { git, api } = createModule();
      await git.add(['f.json'], { contentMap: { 'f.json': '{}' } });
      mock(api).RepositoryFiles.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Commits.create.mockRejectedValue(new TypeError('fetch failed'));

      await expect(git.commit('msg')).rejects.toThrow(GitError);
    });
  });
});
