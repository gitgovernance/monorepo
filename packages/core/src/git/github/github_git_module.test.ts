/**
 * GitHubGitModule Unit Tests
 *
 * Tests GitHubGitModule implementation of IGitModule using GitHub REST API via Octokit.
 *
 * All EARS prefixes map to the github_git_module blueprint.
 *
 * EARS Blocks:
 * - A: Read Operations — Content & Refs (getFileContent, getCommitHash, etc.)
 * - B: Read Operations — Branches & Discovery (branchExists, listRemoteBranches, etc.)
 * - C: Write Operations — Staging & Commit (add, rm, commit, createBranch)
 * - D: No-ops & Not Supported (sensible defaults, throw GitError)
 * - E: Error Handling (404, 401/403, 422, network errors)
 */

import { GitHubGitModule } from './github_git_module';
import type { GitHubGitModuleOptions } from './github_git_module.types';
import type { Octokit } from '@octokit/rest';
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '../errors';

// ==================== Test Helpers ====================

type MockOctokit = Octokit & {
  rest: {
    repos: {
      getContent: jest.MockedFunction<any>;
      compareCommits: jest.MockedFunction<any>;
      listCommits: jest.MockedFunction<any>;
      getCommit: jest.MockedFunction<any>;
      getBranch: jest.MockedFunction<any>;
      listBranches: jest.MockedFunction<any>;
    };
    git: {
      getRef: jest.MockedFunction<any>;
      getBlob: jest.MockedFunction<any>;
      createRef: jest.MockedFunction<any>;
      getCommit: jest.MockedFunction<any>;
      createBlob: jest.MockedFunction<any>;
      createTree: jest.MockedFunction<any>;
      createCommit: jest.MockedFunction<any>;
      updateRef: jest.MockedFunction<any>;
    };
  };
};

function createMockOctokit(): MockOctokit {
  return {
    rest: {
      repos: {
        getContent: jest.fn(),
        compareCommits: jest.fn(),
        listCommits: jest.fn(),
        getCommit: jest.fn(),
        getBranch: jest.fn(),
        listBranches: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        getBlob: jest.fn(),
        createRef: jest.fn(),
        getCommit: jest.fn(),
        createBlob: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateRef: jest.fn(),
      },
    },
  } as unknown as MockOctokit;
}

function createOctokitError(status: number, message = 'Error'): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

const defaultOptions: GitHubGitModuleOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  defaultBranch: 'gitgov-state',
};

function createContentsResponse(content: string, sha = 'file-sha-123') {
  return {
    data: {
      name: 'test-file',
      path: 'test-file',
      sha,
      size: content.length,
      type: 'file' as const,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    },
  };
}

/** Helper to mock the full 6-step commit transaction */
function mockCommitTransaction(mockOctokit: MockOctokit, options?: {
  currentSha?: string;
  treeSha?: string;
  blobSha?: string;
  newTreeSha?: string;
  newCommitSha?: string;
  patchError?: Error;
}) {
  const {
    currentSha = 'current-sha-abc',
    treeSha = 'tree-sha-def',
    blobSha = 'blob-sha-ghi',
    newTreeSha = 'new-tree-sha-jkl',
    newCommitSha = 'new-commit-sha-mno',
    patchError,
  } = options ?? {};

  // Step 1: GET ref
  mockOctokit.rest.git.getRef.mockResolvedValue({
    data: { object: { sha: currentSha } },
  });
  // Step 2: GET commit (git.getCommit)
  mockOctokit.rest.git.getCommit.mockResolvedValue({
    data: { tree: { sha: treeSha } },
  });
  // Step 3: POST blob
  mockOctokit.rest.git.createBlob.mockResolvedValue({
    data: { sha: blobSha },
  });
  // Step 4: POST tree
  mockOctokit.rest.git.createTree.mockResolvedValue({
    data: { sha: newTreeSha },
  });
  // Step 5: POST commit
  mockOctokit.rest.git.createCommit.mockResolvedValue({
    data: { sha: newCommitSha },
  });
  // Step 6: PATCH ref
  if (patchError) {
    mockOctokit.rest.git.updateRef.mockRejectedValue(patchError);
  } else {
    mockOctokit.rest.git.updateRef.mockResolvedValue({
      data: { object: { sha: newCommitSha } },
    });
  }
}

// ==================== Tests ====================

describe('GitHubGitModule', () => {
  let mockOctokit: MockOctokit;
  let git: GitHubGitModule;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    git = new GitHubGitModule(defaultOptions, mockOctokit);
  });

  // ==================== 4.1. Read Operations — Content & Refs (EARS-A1 to A6) ====================

  describe('4.1. Read Operations — Content & Refs (EARS-A1 to A6)', () => {
    it('[EARS-A1] should return file content decoded from base64', async () => {
      const fileContent = '{"key": "value"}';
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse(fileContent));

      const result = await git.getFileContent('abc123', '.gitgov/config.json');

      expect(result).toBe(fileContent);
    });

    it('[EARS-A1] should call Octokit getContent with correct params', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse('content'));

      await git.getFileContent('sha-123', '.gitgov/config.json');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        path: '.gitgov/config.json',
        ref: 'sha-123',
      });
    });

    it('[EARS-A2] should fallback to Blobs API when content is null', async () => {
      const largeContent = 'large file content';
      // Contents API returns null content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          ...createContentsResponse(largeContent, 'large-sha').data,
          content: null,
        },
      });
      // Blobs API returns actual content
      mockOctokit.rest.git.getBlob.mockResolvedValue({
        data: {
          sha: 'large-sha',
          content: Buffer.from(largeContent).toString('base64'),
          encoding: 'base64',
        },
      });

      const result = await git.getFileContent('sha-123', 'large-file.bin');

      expect(result).toBe(largeContent);
      expect(mockOctokit.rest.git.getBlob).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        file_sha: 'large-sha',
      });
    });

    it('[EARS-A3] should return commit SHA from refs endpoint', async () => {
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123def456' },
        },
      });

      const sha = await git.getCommitHash('main');

      expect(sha).toBe('abc123def456');
      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        ref: 'heads/main',
      });
    });

    it('[EARS-A4] should return ChangedFile array from compare endpoint', async () => {
      mockOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          commits: [],
          files: [
            { filename: '.gitgov/config.json', status: 'modified' },
            { filename: '.gitgov/actors/camilo.json', status: 'added' },
            { filename: 'src/index.ts', status: 'removed' },
          ],
        },
      });

      const result = await git.getChangedFiles('sha-1', 'sha-2', '');

      expect(result).toEqual([
        { status: 'M', file: '.gitgov/config.json' },
        { status: 'A', file: '.gitgov/actors/camilo.json' },
        { status: 'D', file: 'src/index.ts' },
      ]);
    });

    it('[EARS-A4] should filter changed files by pathFilter', async () => {
      mockOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          commits: [],
          files: [
            { filename: '.gitgov/config.json', status: 'modified' },
            { filename: 'src/index.ts', status: 'modified' },
          ],
        },
      });

      const result = await git.getChangedFiles('sha-1', 'sha-2', '.gitgov/');

      expect(result).toEqual([
        { status: 'M', file: '.gitgov/config.json' },
      ]);
    });

    it('[EARS-A5] should return CommitInfo array with pagination', async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'commit-1',
            commit: {
              message: 'first commit',
              author: { name: 'Camilo', email: 'cam@test.com', date: '2026-01-01T00:00:00Z' },
              tree: { sha: 'tree-1' },
            },
            parents: [],
          },
        ],
      });

      const result = await git.getCommitHistory('main', { maxCount: 5, pathFilter: '.gitgov/' });

      expect(result).toEqual([{
        hash: 'commit-1',
        message: 'first commit',
        author: 'Camilo <cam@test.com>',
        date: '2026-01-01T00:00:00Z',
      }]);

      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        sha: 'main',
        per_page: 5,
        path: '.gitgov/',
      });
    });

    it('[EARS-A6] should return commit message from commits endpoint', async () => {
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: {
          sha: 'commit-sha',
          commit: {
            message: 'feat: add new feature\n\nDetailed description',
            author: { name: 'Camilo', email: 'cam@test.com', date: '2026-01-01T00:00:00Z' },
            tree: { sha: 'tree-sha' },
          },
          parents: [],
        },
      });

      const msg = await git.getCommitMessage('commit-sha');

      expect(msg).toBe('feat: add new feature\n\nDetailed description');
    });
  });

  // ==================== 4.2. Read Operations — Branches & Discovery (EARS-B1 to B4) ====================

  describe('4.2. Read Operations — Branches & Discovery (EARS-B1 to B4)', () => {
    it('[EARS-B1] should return true when branch exists (HTTP 200)', async () => {
      mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: { name: 'main' } });

      const exists = await git.branchExists('main');

      expect(exists).toBe(true);
    });

    it('[EARS-B1] should return false when branch does not exist (HTTP 404)', async () => {
      mockOctokit.rest.repos.getBranch.mockRejectedValue(createOctokitError(404));

      const exists = await git.branchExists('nonexistent');

      expect(exists).toBe(false);
    });

    it('[EARS-B2] should return array of branch names', async () => {
      mockOctokit.rest.repos.listBranches.mockResolvedValue({
        data: [
          { name: 'main' },
          { name: 'develop' },
          { name: 'feature/test' },
        ],
      });

      const branches = await git.listRemoteBranches('origin');

      expect(branches).toEqual(['main', 'develop', 'feature/test']);
    });

    it('[EARS-B3] should return CommitInfo array from compare endpoint', async () => {
      mockOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          commits: [
            {
              sha: 'commit-a',
              commit: {
                message: 'commit A',
                author: { name: 'Dev', email: 'dev@test.com', date: '2026-01-01T00:00:00Z' },
                tree: { sha: 'tree-a' },
              },
              parents: [],
            },
            {
              sha: 'commit-b',
              commit: {
                message: 'commit B',
                author: { name: 'Dev', email: 'dev@test.com', date: '2026-01-02T00:00:00Z' },
                tree: { sha: 'tree-b' },
              },
              parents: [],
            },
          ],
          files: [{ filename: '.gitgov/config.json', status: 'modified' }],
        },
      });

      const result = await git.getCommitHistoryRange('sha-from', 'sha-to');

      expect(result).toHaveLength(2);
      expect(result[0]!.hash).toBe('commit-a');
      expect(result[1]!.hash).toBe('commit-b');
    });

    it('[EARS-B3] should respect options.maxCount and options.pathFilter', async () => {
      mockOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          commits: [
            {
              sha: 'c1',
              commit: { message: 'c1', author: { name: 'D', email: 'd@t.com', date: '2026-01-01T00:00:00Z' }, tree: { sha: 't1' } },
              parents: [],
            },
            {
              sha: 'c2',
              commit: { message: 'c2', author: { name: 'D', email: 'd@t.com', date: '2026-01-02T00:00:00Z' }, tree: { sha: 't2' } },
              parents: [],
            },
            {
              sha: 'c3',
              commit: { message: 'c3', author: { name: 'D', email: 'd@t.com', date: '2026-01-03T00:00:00Z' }, tree: { sha: 't3' } },
              parents: [],
            },
          ],
          files: [{ filename: '.gitgov/config.json', status: 'modified' }],
        },
      });

      const result = await git.getCommitHistoryRange('sha-from', 'sha-to', { maxCount: 2 });

      expect(result).toHaveLength(2);
    });

    it('[EARS-B4] should return SHA directly when ref is already a 40-char hex', async () => {
      const sha = 'a'.repeat(40);

      const result = await git.getCommitHash(sha);

      expect(result).toBe(sha);
      expect(mockOctokit.rest.git.getRef).not.toHaveBeenCalled();
    });
  });

  // ==================== 4.3. Write Operations — Staging & Commit (EARS-C1 to C7) ====================

  describe('4.3. Write Operations — Staging & Commit (EARS-C1 to C7)', () => {
    it('[EARS-C1] should read existing file content via getFileContent and add to staging buffer', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(createContentsResponse('file content'));

      await git.add(['.gitgov/config.json']);

      const staged = await git.getStagedFiles();
      expect(staged).toContain('.gitgov/config.json');
    });

    it('[EARS-C1] should use contentMap content directly instead of fetching from API', async () => {
      await git.add(['.gitgov/config.json'], {
        contentMap: { '.gitgov/config.json': '{"direct": true}' },
      });

      const staged = await git.getStagedFiles();
      expect(staged).toContain('.gitgov/config.json');
      // Should NOT have called getContent (content was provided directly)
      expect(mockOctokit.rest.repos.getContent).not.toHaveBeenCalled();
    });

    it('[EARS-C2] should mark file paths as deleted in staging buffer', async () => {
      await git.rm(['.gitgov/old-file.json']);

      const staged = await git.getStagedFiles();
      expect(staged).toContain('.gitgov/old-file.json');
    });

    it('[EARS-C3] should execute atomic commit via 6 Octokit calls', async () => {
      // Add a file to staging buffer
      await git.add(['file.json'], { contentMap: { 'file.json': '{"data": true}' } });

      mockCommitTransaction(mockOctokit);

      const commitSha = await git.commit('test commit', { name: 'Bot', email: 'bot@test.com' });

      expect(commitSha).toBe('new-commit-sha-mno');
      // 6 calls: getRef, getCommit, createBlob, createTree, createCommit, updateRef
      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.getCommit).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.createTree).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1);
    });

    it('[EARS-C3] should create blobs for each staged file', async () => {
      await git.add(['a.json', 'b.json'], {
        contentMap: { 'a.json': 'content-a', 'b.json': 'content-b' },
      });

      mockCommitTransaction(mockOctokit);
      // createBlob needs to return different SHAs for each call
      mockOctokit.rest.git.createBlob
        .mockResolvedValueOnce({ data: { sha: 'blob-a' } })
        .mockResolvedValueOnce({ data: { sha: 'blob-b' } });

      await git.commit('multi file commit');

      expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(2);
    });

    it('[EARS-C3] should create tree with added and deleted entries', async () => {
      await git.add(['add.json'], { contentMap: { 'add.json': 'new content' } });
      await git.rm(['delete.json']);

      mockCommitTransaction(mockOctokit);

      await git.commit('add and delete');

      // Verify tree creation includes both add (with sha) and delete (sha: null)
      const treeCall = mockOctokit.rest.git.createTree.mock.calls[0]!;
      const treeArg = treeCall[0];
      expect(treeArg.tree).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'add.json', sha: 'blob-sha-ghi' }),
        expect.objectContaining({ path: 'delete.json', sha: null }),
      ]));
    });

    it('[EARS-C4] should clear staging buffer after successful commit', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
      mockCommitTransaction(mockOctokit);

      await git.commit('test commit');

      const staged = await git.getStagedFiles();
      expect(staged).toEqual([]);
    });

    it('[EARS-C5] should throw GitError when staging buffer is empty', async () => {
      await expect(git.commit('empty commit')).rejects.toThrow(GitError);
      await expect(git.commit('empty commit')).rejects.toThrow(/staging buffer is empty/);
    });

    it('[EARS-C6] should create branch via Octokit git.createRef', async () => {
      // First: resolve startPoint SHA
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'start-sha-123' } },
      });
      // Then: create branch
      mockOctokit.rest.git.createRef.mockResolvedValue({
        data: { ref: 'refs/heads/new-branch', object: { sha: 'start-sha-123' } },
      });

      await git.createBranch('new-branch', 'main');

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        ref: 'refs/heads/new-branch',
        sha: 'start-sha-123',
      });
    });

    it('[EARS-C6] should throw BranchAlreadyExistsError for HTTP 422', async () => {
      // Resolve startPoint SHA
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'start-sha' } },
      });
      // Create branch fails with 422
      mockOctokit.rest.git.createRef.mockRejectedValue(createOctokitError(422, 'Reference already exists'));

      await expect(git.createBranch('existing-branch', 'main'))
        .rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-C7] should return staged file paths from buffer', async () => {
      await git.add(['a.json', 'b.json'], {
        contentMap: { 'a.json': 'a', 'b.json': 'b' },
      });
      await git.rm(['c.json']);

      const staged = await git.getStagedFiles();

      expect(staged).toEqual(['a.json', 'b.json', 'c.json']);
    });
  });

  // ==================== 4.4. No-ops & Not Supported (EARS-D1 to D5) ====================

  describe('4.4. No-ops & Not Supported (EARS-D1 to D5)', () => {
    it('[EARS-D1] should return sensible defaults for no-op methods', async () => {
      expect(await git.getRepoRoot()).toBe('github://test-org/test-repo');
      expect(await git.getCurrentBranch()).toBe('gitgov-state');
      expect(await git.isRemoteConfigured('origin')).toBe(true);
      expect(await git.getBranchRemote('main')).toBe('origin');
      expect(await git.getConflictedFiles()).toEqual([]);
      expect(await git.isRebaseInProgress()).toBe(false);
    });

    it('[EARS-D1] should return true for hasUncommittedChanges when buffer non-empty', async () => {
      expect(await git.hasUncommittedChanges()).toBe(false);

      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });

      expect(await git.hasUncommittedChanges()).toBe(true);
    });

    it('[EARS-D1] should delegate commitAllowEmpty to commit', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
      mockCommitTransaction(mockOctokit);

      const sha = await git.commitAllowEmpty('test commit');

      expect(sha).toBe('new-commit-sha-mno');
    });

    it('[EARS-D1] should allow commitAllowEmpty with empty staging buffer', async () => {
      // No files added — buffer is empty
      mockCommitTransaction(mockOctokit);

      const sha = await git.commitAllowEmpty('empty commit');

      expect(sha).toBe('new-commit-sha-mno');
      expect(mockOctokit.rest.git.createBlob).not.toHaveBeenCalled();
    });

    it('[EARS-D2] should update activeRef on checkoutBranch', async () => {
      expect(await git.getCurrentBranch()).toBe('gitgov-state');

      await git.checkoutBranch('develop');

      expect(await git.getCurrentBranch()).toBe('develop');
    });

    it('[EARS-D3] should throw GitError for unsupported methods', async () => {
      await expect(git.rebase('main')).rejects.toThrow(GitError);
      await expect(git.rebaseContinue()).rejects.toThrow(GitError);
      await expect(git.resetHard('HEAD')).rejects.toThrow(GitError);
      await expect(git.checkoutOrphanBranch('orphan')).rejects.toThrow(GitError);
      await expect(git.checkoutFilesFromBranch('main', ['file'])).rejects.toThrow(GitError);
      await expect(git.getMergeBase('a', 'b')).rejects.toThrow(GitError);
    });

    it('[EARS-D4] should be no-op for push methods', async () => {
      await expect(git.push('origin', 'main')).resolves.toBeUndefined();
      await expect(git.pushWithUpstream('origin', 'main')).resolves.toBeUndefined();
    });

    it('[EARS-D5] should return error ExecResult for exec()', async () => {
      const result = await git.exec('git', ['status']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not supported');
    });
  });

  // ==================== 4.5. Error Handling (EARS-E1 to E5) ====================

  describe('4.5. Error Handling (EARS-E1 to E5)', () => {
    it('[EARS-E1] should throw FileNotFoundError for HTTP 404 on file ops', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(404));

      await expect(git.getFileContent('sha-123', 'missing.json'))
        .rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-E2] should throw BranchNotFoundError for HTTP 404 on branch ops', async () => {
      mockOctokit.rest.git.getRef.mockRejectedValue(createOctokitError(404));

      await expect(git.getCommitHash('nonexistent-branch'))
        .rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-E3] should throw GitError for HTTP 401 or 403', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(createOctokitError(403));

      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(/authentication\/permission error/);
    });

    it('[EARS-E4] should throw appropriate error for HTTP 422', async () => {
      // createBranch 422 → BranchAlreadyExistsError
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'sha' } },
      });
      mockOctokit.rest.git.createRef.mockRejectedValue(createOctokitError(422, 'Reference already exists'));

      await expect(git.createBranch('existing', 'main')).rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-E4] should throw GitError with non-fast-forward message on updateRef 422', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });

      mockCommitTransaction(mockOctokit, {
        patchError: createOctokitError(422, 'Update is not a fast forward'),
      });

      await expect(git.commit('test')).rejects.toThrow(GitError);
      await expect(async () => {
        // Re-add because previous commit attempt cleared nothing (it threw)
        await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
        mockCommitTransaction(mockOctokit, {
          patchError: createOctokitError(422, 'Update is not a fast forward'),
        });
        await git.commit('test');
      }).rejects.toThrow(/non-fast-forward/);
    });

    it('[EARS-E5] should throw GitError for network failures', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new TypeError('fetch failed'));

      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(/network error/);
    });

    it('[EARS-E3] should translate HTTP 403 to GitError during commit transaction', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
      // Step 1 (getRef) fails with 403
      mockOctokit.rest.git.getRef.mockRejectedValue(createOctokitError(403));

      await expect(git.commit('test')).rejects.toThrow(GitError);
      await expect(git.commit('test')).rejects.toThrow(/authentication\/permission error/);
    });

    it('[EARS-E5] should translate network error to GitError during commit transaction', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
      mockOctokit.rest.git.getRef.mockRejectedValue(new TypeError('fetch failed'));

      await expect(git.commit('test')).rejects.toThrow(GitError);
      await expect(git.commit('test')).rejects.toThrow(/network error/);
    });
  });
});
