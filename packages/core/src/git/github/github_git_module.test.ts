/**
 * GitHubGitModule Unit Tests
 *
 * Tests GitHubGitModule implementation of IGitModule using GitHub REST API.
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
import type { GitHubFetchFn } from '../../github';
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '../errors';

// ==================== Test Helpers ====================

const defaultOptions: GitHubGitModuleOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  token: 'ghp_test_token_123',
  defaultBranch: 'main',
  apiBaseUrl: 'https://api.github.com',
};

function createMockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

function createContentsResponse(content: string, sha = 'file-sha-123') {
  return {
    name: 'test-file',
    path: 'test-file',
    sha,
    size: content.length,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  };
}

/** Helper to mock the full 6-step commit transaction */
function mockCommitTransaction(mockFetch: jest.Mock, options?: {
  currentSha?: string;
  treeSha?: string;
  blobSha?: string;
  newTreeSha?: string;
  newCommitSha?: string;
  patchStatus?: number;
}) {
  const {
    currentSha = 'current-sha-abc',
    treeSha = 'tree-sha-def',
    blobSha = 'blob-sha-ghi',
    newTreeSha = 'new-tree-sha-jkl',
    newCommitSha = 'new-commit-sha-mno',
    patchStatus = 200,
  } = options ?? {};

  // Step 1: GET ref
  mockFetch.mockResolvedValueOnce(createMockResponse(200, {
    object: { sha: currentSha },
  }));
  // Step 2: GET commit
  mockFetch.mockResolvedValueOnce(createMockResponse(200, {
    tree: { sha: treeSha },
  }));
  // Step 3: POST blob
  mockFetch.mockResolvedValueOnce(createMockResponse(201, {
    sha: blobSha,
  }));
  // Step 4: POST tree
  mockFetch.mockResolvedValueOnce(createMockResponse(201, {
    sha: newTreeSha,
  }));
  // Step 5: POST commit
  mockFetch.mockResolvedValueOnce(createMockResponse(201, {
    sha: newCommitSha,
  }));
  // Step 6: PATCH ref
  mockFetch.mockResolvedValueOnce(createMockResponse(patchStatus, {
    object: { sha: newCommitSha },
  }));
}

// ==================== Tests ====================

describe('GitHubGitModule', () => {
  let mockFetch: jest.Mock<ReturnType<GitHubFetchFn>, Parameters<GitHubFetchFn>>;
  let git: GitHubGitModule;

  beforeEach(() => {
    mockFetch = jest.fn();
    git = new GitHubGitModule(defaultOptions, mockFetch);
  });

  // ==================== 4.1. Read Operations — Content & Refs (EARS-A1 to A6) ====================

  describe('4.1. Read Operations — Content & Refs (EARS-A1 to A6)', () => {
    it('[EARS-A1] should return file content decoded from base64', async () => {
      const fileContent = '{"key": "value"}';
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse(fileContent)));

      const result = await git.getFileContent('abc123', '.gitgov/config.json');

      expect(result).toBe(fileContent);
    });

    it('[EARS-A1] should fetch correct URL with owner/repo/path/ref', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse('content')));

      await git.getFileContent('sha-123', '.gitgov/config.json');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/test-org/test-repo/contents/.gitgov/config.json?ref=sha-123');
    });

    it('[EARS-A2] should fallback to Blobs API when content is null', async () => {
      const largeContent = 'large file content';
      // Contents API returns null content
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {
        ...createContentsResponse(largeContent, 'large-sha'),
        content: null,
      }));
      // Blobs API returns actual content
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {
        sha: 'large-sha',
        content: Buffer.from(largeContent).toString('base64'),
        encoding: 'base64',
      }));

      const result = await git.getFileContent('sha-123', 'large-file.bin');

      expect(result).toBe(largeContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [blobUrl] = mockFetch.mock.calls[1]!;
      expect(blobUrl).toContain('/git/blobs/large-sha');
    });

    it('[EARS-A3] should return commit SHA from refs endpoint', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
        ref: 'refs/heads/main',
        object: { type: 'commit', sha: 'abc123def456' },
      }));

      const sha = await git.getCommitHash('main');

      expect(sha).toBe('abc123def456');
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/git/refs/heads/main');
    });

    it('[EARS-A4] should return ChangedFile array from compare endpoint', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
        commits: [],
        files: [
          { filename: '.gitgov/config.json', status: 'modified' },
          { filename: '.gitgov/actors/camilo.json', status: 'added' },
          { filename: 'src/index.ts', status: 'removed' },
        ],
      }));

      const result = await git.getChangedFiles('sha-1', 'sha-2', '');

      expect(result).toEqual([
        { status: 'M', file: '.gitgov/config.json' },
        { status: 'A', file: '.gitgov/actors/camilo.json' },
        { status: 'D', file: 'src/index.ts' },
      ]);
    });

    it('[EARS-A4] should filter changed files by pathFilter', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
        commits: [],
        files: [
          { filename: '.gitgov/config.json', status: 'modified' },
          { filename: 'src/index.ts', status: 'modified' },
        ],
      }));

      const result = await git.getChangedFiles('sha-1', 'sha-2', '.gitgov/');

      expect(result).toEqual([
        { status: 'M', file: '.gitgov/config.json' },
      ]);
    });

    it('[EARS-A5] should return CommitInfo array with pagination', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, [
        {
          sha: 'commit-1',
          commit: {
            message: 'first commit',
            author: { name: 'Camilo', email: 'cam@test.com', date: '2026-01-01T00:00:00Z' },
            tree: { sha: 'tree-1' },
          },
          parents: [],
        },
      ]));

      const result = await git.getCommitHistory('main', { maxCount: 5, pathFilter: '.gitgov/' });

      expect(result).toEqual([{
        hash: 'commit-1',
        message: 'first commit',
        author: 'Camilo <cam@test.com>',
        date: '2026-01-01T00:00:00Z',
      }]);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('per_page=5');
      expect(url).toContain('path=.gitgov%2F');
    });

    it('[EARS-A6] should return commit message from commits endpoint', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
        sha: 'commit-sha',
        commit: {
          message: 'feat: add new feature\n\nDetailed description',
          author: { name: 'Camilo', email: 'cam@test.com', date: '2026-01-01T00:00:00Z' },
          tree: { sha: 'tree-sha' },
        },
        parents: [],
      }));

      const msg = await git.getCommitMessage('commit-sha');

      expect(msg).toBe('feat: add new feature\n\nDetailed description');
    });
  });

  // ==================== 4.2. Read Operations — Branches & Discovery (EARS-B1 to B4) ====================

  describe('4.2. Read Operations — Branches & Discovery (EARS-B1 to B4)', () => {
    it('[EARS-B1] should return true when branch exists (HTTP 200)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { name: 'main' }));

      const exists = await git.branchExists('main');

      expect(exists).toBe(true);
    });

    it('[EARS-B1] should return false when branch does not exist (HTTP 404)', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      const exists = await git.branchExists('nonexistent');

      expect(exists).toBe(false);
    });

    it('[EARS-B2] should return array of branch names', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, [
        { name: 'main' },
        { name: 'develop' },
        { name: 'feature/test' },
      ]));

      const branches = await git.listRemoteBranches('origin');

      expect(branches).toEqual(['main', 'develop', 'feature/test']);
    });

    it('[EARS-B3] should return CommitInfo array from compare endpoint', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
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
      }));

      const result = await git.getCommitHistoryRange('sha-from', 'sha-to');

      expect(result).toHaveLength(2);
      expect(result[0]!.hash).toBe('commit-a');
      expect(result[1]!.hash).toBe('commit-b');
    });

    it('[EARS-B3] should respect options.maxCount and options.pathFilter', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, {
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
      }));

      const result = await git.getCommitHistoryRange('sha-from', 'sha-to', { maxCount: 2 });

      expect(result).toHaveLength(2);
    });

    it('[EARS-B4] should return SHA directly when ref is already a 40-char hex', async () => {
      const sha = 'a'.repeat(40);

      const result = await git.getCommitHash(sha);

      expect(result).toBe(sha);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ==================== 4.3. Write Operations — Staging & Commit (EARS-C1 to C7) ====================

  describe('4.3. Write Operations — Staging & Commit (EARS-C1 to C7)', () => {
    it('[EARS-C1] should read existing file content via getFileContent and add to staging buffer', async () => {
      // Mock getFileContent response
      mockFetch.mockResolvedValue(createMockResponse(200, createContentsResponse('file content')));

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
      // Should NOT have called fetch (content was provided directly)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('[EARS-C2] should mark file paths as deleted in staging buffer', async () => {
      await git.rm(['.gitgov/old-file.json']);

      const staged = await git.getStagedFiles();
      expect(staged).toContain('.gitgov/old-file.json');
    });

    it('[EARS-C3] should execute atomic commit via 5 API calls', async () => {
      // Add a file to staging buffer
      await git.add(['file.json'], { contentMap: { 'file.json': '{"data": true}' } });

      mockCommitTransaction(mockFetch);

      const commitSha = await git.commit('test commit', { name: 'Bot', email: 'bot@test.com' });

      expect(commitSha).toBe('new-commit-sha-mno');
      // 6 calls: ref, commit, blob, tree, commit, patch ref
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it('[EARS-C3] should create blobs for each staged file', async () => {
      await git.add(['a.json', 'b.json'], {
        contentMap: { 'a.json': 'content-a', 'b.json': 'content-b' },
      });

      // Step 1: GET ref
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { object: { sha: 'current-sha' } }));
      // Step 2: GET commit
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { tree: { sha: 'tree-sha' } }));
      // Step 3a: POST blob for a.json
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'blob-a' }));
      // Step 3b: POST blob for b.json
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'blob-b' }));
      // Step 4: POST tree
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'new-tree' }));
      // Step 5: POST commit
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'new-commit' }));
      // Step 6: PATCH ref
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { object: { sha: 'new-commit' } }));

      await git.commit('multi file commit');

      // 7 calls total: ref + commit + 2 blobs + tree + commit + ref
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('[EARS-C3] should create tree with added and deleted entries', async () => {
      await git.add(['add.json'], { contentMap: { 'add.json': 'new content' } });
      await git.rm(['delete.json']);

      // Step 1: GET ref
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { object: { sha: 'current-sha' } }));
      // Step 2: GET commit
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { tree: { sha: 'tree-sha' } }));
      // Step 3: POST blob for add.json (skip delete.json — no blob needed)
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'blob-add' }));
      // Step 4: POST tree
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'new-tree' }));
      // Step 5: POST commit
      mockFetch.mockResolvedValueOnce(createMockResponse(201, { sha: 'new-commit' }));
      // Step 6: PATCH ref
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { object: { sha: 'new-commit' } }));

      await git.commit('add and delete');

      // Verify tree creation includes both add (with sha) and delete (sha: null)
      const treeCall = mockFetch.mock.calls[3]!;
      const treeBody = JSON.parse(treeCall[1]?.body as string);
      expect(treeBody.tree).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'add.json', sha: 'blob-add' }),
        expect.objectContaining({ path: 'delete.json', sha: null }),
      ]));
    });

    it('[EARS-C4] should clear staging buffer after successful commit', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
      mockCommitTransaction(mockFetch);

      await git.commit('test commit');

      const staged = await git.getStagedFiles();
      expect(staged).toEqual([]);
    });

    it('[EARS-C5] should throw GitError when staging buffer is empty', async () => {
      await expect(git.commit('empty commit')).rejects.toThrow(GitError);
      await expect(git.commit('empty commit')).rejects.toThrow(/staging buffer is empty/);
    });

    it('[EARS-C6] should create branch via POST to git/refs', async () => {
      // First: resolve startPoint SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {
        object: { sha: 'start-sha-123' },
      }));
      // Then: create branch
      mockFetch.mockResolvedValueOnce(createMockResponse(201, {
        ref: 'refs/heads/new-branch',
        object: { sha: 'start-sha-123' },
      }));

      await git.createBranch('new-branch', 'main');

      const createCall = mockFetch.mock.calls[1]!;
      const [url, init] = createCall;
      expect(url).toContain('/git/refs');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.ref).toBe('refs/heads/new-branch');
      expect(body.sha).toBe('start-sha-123');
    });

    it('[EARS-C6] should throw BranchAlreadyExistsError for HTTP 422', async () => {
      // Resolve startPoint SHA
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {
        object: { sha: 'start-sha' },
      }));
      // Create branch fails with 422
      mockFetch.mockResolvedValueOnce(createMockResponse(422, {
        message: 'Reference already exists',
      }));

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
      expect(await git.getCurrentBranch()).toBe('main');
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
      mockCommitTransaction(mockFetch);

      const sha = await git.commitAllowEmpty('test commit');

      expect(sha).toBe('new-commit-sha-mno');
    });

    it('[EARS-D2] should update activeRef on checkoutBranch', async () => {
      expect(await git.getCurrentBranch()).toBe('main');

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
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      await expect(git.getFileContent('sha-123', 'missing.json'))
        .rejects.toThrow(FileNotFoundError);
    });

    it('[EARS-E2] should throw BranchNotFoundError for HTTP 404 on branch ops', async () => {
      mockFetch.mockResolvedValue(createMockResponse(404, { message: 'Not Found' }));

      await expect(git.getCommitHash('nonexistent-branch'))
        .rejects.toThrow(BranchNotFoundError);
    });

    it('[EARS-E3] should throw GitError for HTTP 401 or 403', async () => {
      mockFetch.mockResolvedValue(createMockResponse(403, { message: 'Forbidden' }));

      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(/authentication\/permission error/);
    });

    it('[EARS-E4] should throw appropriate error for HTTP 422', async () => {
      // createBranch 422 → BranchAlreadyExistsError
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { object: { sha: 'sha' } }));
      mockFetch.mockResolvedValueOnce(createMockResponse(422, { message: 'Reference already exists' }));

      await expect(git.createBranch('existing', 'main')).rejects.toThrow(BranchAlreadyExistsError);
    });

    it('[EARS-E4] should throw GitError with non-fast-forward message on PATCH ref 422', async () => {
      await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });

      mockCommitTransaction(mockFetch, { patchStatus: 422 });

      await expect(git.commit('test')).rejects.toThrow(GitError);
      await expect(async () => {
        // Re-add because previous commit attempt cleared nothing (it threw)
        await git.add(['file.json'], { contentMap: { 'file.json': 'content' } });
        mockCommitTransaction(mockFetch, { patchStatus: 422 });
        await git.commit('test');
      }).rejects.toThrow(/non-fast-forward/);
    });

    it('[EARS-E5] should throw GitError for network failures', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(GitError);
      await expect(git.getFileContent('sha', 'file.json')).rejects.toThrow(/network error/);
    });
  });
});
