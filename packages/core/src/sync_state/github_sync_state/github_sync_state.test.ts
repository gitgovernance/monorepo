/**
 * GithubSyncStateModule Unit Tests
 *
 * Tests GithubSyncStateModule implementation of ISyncStateModule using GitHub REST API via Octokit.
 * All EARS prefixes map to the github_sync_state_module blueprint.
 *
 * EARS Blocks:
 * - A: Branch Management (EARS-GS-A1 to A3)
 * - B: Push State via API (EARS-GS-B1 to B5)
 * - C: Pull State via API (EARS-GS-C1 to C4)
 * - D: Change Detection (EARS-GS-D1 to D3)
 * - E: Conflict Handling (EARS-GS-E1 to E2)
 * - F: Audit State via API (EARS-GS-F1 to F2)
 */

import { GithubSyncStateModule } from './github_sync_state';
import type { GithubSyncStateDependencies } from './github_sync_state.types';
import type { Octokit } from '@octokit/rest';
import type { ILintModule } from '../../lint';
import type { IRecordProjector } from '../../record_projection';
import type { ConfigManager } from '../../config_manager';
import type { IIdentityAdapter } from '../../adapters/identity_adapter';

// ==================== Test Helpers ====================

type MockOctokit = Octokit & {
  rest: {
    repos: {
      get: jest.MockedFunction<any>;
      getBranch: jest.MockedFunction<any>;
      compareCommits: jest.MockedFunction<any>;
      listCommits: jest.MockedFunction<any>;
    };
    git: {
      getRef: jest.MockedFunction<any>;
      getCommit: jest.MockedFunction<any>;
      getTree: jest.MockedFunction<any>;
      getBlob: jest.MockedFunction<any>;
      createRef: jest.MockedFunction<any>;
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
        get: jest.fn(),
        getBranch: jest.fn(),
        compareCommits: jest.fn(),
        listCommits: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        getCommit: jest.fn(),
        getTree: jest.fn(),
        getBlob: jest.fn(),
        createRef: jest.fn(),
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

function createModule(octokit: MockOctokit): GithubSyncStateModule {
  const mockConfig = {} as ConfigManager;
  const mockIdentity = {} as IIdentityAdapter;
  const mockLint: ILintModule = {
    lintRecord: jest.fn().mockReturnValue([]),
    lint: jest.fn().mockResolvedValue({
      summary: { filesChecked: 0, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
      results: [],
      metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' },
    }),
    fixRecord: jest.fn(),
  } as unknown as ILintModule;
  const mockIndexer: IRecordProjector = {
    computeProjection: jest.fn().mockResolvedValue({}),
    generateIndex: jest.fn().mockResolvedValue({}),
  } as unknown as IRecordProjector;

  const deps: GithubSyncStateDependencies = {
    octokit: octokit as unknown as Octokit,
    owner: 'test-org',
    repo: 'test-repo',
    config: mockConfig,
    identity: mockIdentity,
    lint: mockLint,
    indexer: mockIndexer,
  };

  return new GithubSyncStateModule(deps);
}

// ==================== Shared mock data ====================

const TREE_SHA = 'tree-sha-abc123';
const COMMIT_SHA = 'commit-sha-abc123';
const NEW_COMMIT_SHA = 'new-commit-sha-def456';
const NEW_TREE_SHA = 'new-tree-sha-ghi789';
const DEFAULT_BRANCH = 'main';

function mockTreeWithFiles(files: Array<{ path: string; sha: string }>) {
  return {
    data: {
      sha: TREE_SHA,
      tree: files.map((f) => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        sha: f.sha,
        size: 100,
      })),
      truncated: false,
    },
  };
}

// ==================== Tests ====================

describe('GithubSyncStateModule', () => {
  let octokit: MockOctokit;
  let module: GithubSyncStateModule;

  beforeEach(() => {
    octokit = createMockOctokit();
    module = createModule(octokit);
  });

  // ==================== Block A: Branch Management ====================

  describe('4.1. Branch Management (EARS-GS-A1 to A3)', () => {
    it('[EARS-GS-A1] should create gitgov-state branch when it does not exist', async () => {
      // getBranch returns 404
      octokit.rest.repos.getBranch.mockRejectedValueOnce(createOctokitError(404));
      // repos.get returns default branch info
      octokit.rest.repos.get.mockResolvedValueOnce({
        data: { default_branch: DEFAULT_BRANCH },
      });
      // getRef for default branch HEAD
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: COMMIT_SHA } },
      });
      // createRef succeeds
      octokit.rest.git.createRef.mockResolvedValueOnce({ data: {} });

      await module.ensureStateBranch();

      expect(octokit.rest.repos.getBranch).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        branch: 'gitgov-state',
      });
      expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        ref: 'refs/heads/gitgov-state',
        sha: COMMIT_SHA,
      });
    });

    it('[EARS-GS-A2] should be idempotent when branch already exists', async () => {
      octokit.rest.repos.getBranch.mockResolvedValueOnce({ data: {} });

      await module.ensureStateBranch();

      expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(1);
      expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
    });

    it('[EARS-GS-A3] should return configured branch name', async () => {
      const name = await module.getStateBranchName();
      expect(name).toBe('gitgov-state');
    });
  });

  // ==================== Block B: Push State ====================

  describe('4.2. Push State via API (EARS-GS-B1 to B5)', () => {
    function setupPushMocks(
      sourceFiles: Array<{ path: string; sha: string }>,
      targetFiles: Array<{ path: string; sha: string }>,
    ) {
      // Step 1: getRef for gitgov-state
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: COMMIT_SHA } },
      });
      // Step 2: getTree for source branch
      octokit.rest.git.getTree.mockResolvedValueOnce(mockTreeWithFiles(sourceFiles));
      // Step 3: getCommit for target
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      // Step 4: getTree for target
      octokit.rest.git.getTree.mockResolvedValueOnce(mockTreeWithFiles(targetFiles));
    }

    it('[EARS-GS-B1] should create commit with all syncable files via API', async () => {
      const sourceFiles = [
        { path: '.gitgov/tasks/task-1.json', sha: 'blob-sha-1' },
        { path: '.gitgov/actors/actor-1.json', sha: 'blob-sha-2' },
        { path: '.gitgov/index.json', sha: 'blob-sha-skip' }, // LOCAL_ONLY — should be filtered
      ];
      const targetFiles: Array<{ path: string; sha: string }> = []; // Empty target

      setupPushMocks(sourceFiles, targetFiles);

      // createTree + createCommit + updateRef
      octokit.rest.git.createTree.mockResolvedValueOnce({ data: { sha: NEW_TREE_SHA } });
      octokit.rest.git.createCommit.mockResolvedValueOnce({ data: { sha: NEW_COMMIT_SHA } });
      octokit.rest.git.updateRef.mockResolvedValueOnce({ data: {} });

      const result = await module.pushState({ actorId: 'actor-1', sourceBranch: 'main' });

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(2); // index.json filtered out
      expect(result.commitHash).toBe(NEW_COMMIT_SHA);
      expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-org',
          repo: 'test-repo',
          base_tree: TREE_SHA,
        }),
      );
      expect(octokit.rest.git.createCommit).toHaveBeenCalled();
      expect(octokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        ref: 'heads/gitgov-state',
        sha: NEW_COMMIT_SHA,
      });
    });

    it('[EARS-GS-B2] should detect conflict when remote ref has advanced', async () => {
      const sourceFiles = [{ path: '.gitgov/tasks/task-1.json', sha: 'blob-sha-1' }];
      const targetFiles: Array<{ path: string; sha: string }> = [];

      setupPushMocks(sourceFiles, targetFiles);

      octokit.rest.git.createTree.mockResolvedValueOnce({ data: { sha: NEW_TREE_SHA } });
      octokit.rest.git.createCommit.mockResolvedValueOnce({ data: { sha: NEW_COMMIT_SHA } });
      // updateRef fails with 422 (SHA mismatch)
      octokit.rest.git.updateRef.mockRejectedValueOnce(createOctokitError(422, 'Update is not a fast forward'));

      const result = await module.pushState({ actorId: 'actor-1' });

      expect(result.success).toBe(false);
      expect(result.conflictDetected).toBe(true);
      expect(result.conflictInfo).toBeDefined();
      expect(result.conflictInfo!.type).toBe('rebase_conflict');
    });

    it('[EARS-GS-B3] should calculate delta without creating commit on dry run', async () => {
      const sourceFiles = [
        { path: '.gitgov/tasks/task-1.json', sha: 'blob-sha-1' },
        { path: '.gitgov/tasks/task-2.json', sha: 'blob-sha-2' },
      ];
      const targetFiles = [
        { path: 'tasks/task-1.json', sha: 'blob-sha-old' }, // Modified
      ];

      setupPushMocks(sourceFiles, targetFiles);

      const result = await module.pushState({ actorId: 'actor-1', dryRun: true });

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(2); // 1 modified + 1 added
      expect(result.commitHash).toBeNull();
      expect(octokit.rest.git.createTree).not.toHaveBeenCalled();
      expect(octokit.rest.git.createCommit).not.toHaveBeenCalled();
      expect(octokit.rest.git.updateRef).not.toHaveBeenCalled();
    });

    it('[EARS-GS-B4] should return commit SHA and files synced on success', async () => {
      const sourceFiles = [{ path: '.gitgov/cycles/cycle-1.json', sha: 'blob-sha-1' }];
      const targetFiles: Array<{ path: string; sha: string }> = [];

      setupPushMocks(sourceFiles, targetFiles);
      octokit.rest.git.createTree.mockResolvedValueOnce({ data: { sha: NEW_TREE_SHA } });
      octokit.rest.git.createCommit.mockResolvedValueOnce({ data: { sha: NEW_COMMIT_SHA } });
      octokit.rest.git.updateRef.mockResolvedValueOnce({ data: {} });

      const result = await module.pushState({ actorId: 'actor-1', sourceBranch: 'feature-x' });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe(NEW_COMMIT_SHA);
      expect(result.filesSynced).toBe(1);
      expect(result.sourceBranch).toBe('feature-x');
    });

    it('[EARS-GS-B5] should skip commit when no changes detected', async () => {
      const files = [{ path: '.gitgov/tasks/task-1.json', sha: 'same-sha' }];
      // Source and target have same file with same SHA
      setupPushMocks(files, [{ path: 'tasks/task-1.json', sha: 'same-sha' }]);

      const result = await module.pushState({ actorId: 'actor-1' });

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).toBeNull();
      expect(octokit.rest.git.createTree).not.toHaveBeenCalled();
      expect(octokit.rest.git.createCommit).not.toHaveBeenCalled();
    });
  });

  // ==================== Block C: Pull State ====================

  describe('4.3. Pull State via API (EARS-GS-C1 to C4)', () => {
    it('[EARS-GS-C1] should fetch updated records when remote has new commits', async () => {
      const remoteSha = 'remote-sha-new';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: remoteSha } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(
        mockTreeWithFiles([
          { path: 'tasks/task-1.json', sha: 'blob-1' },
          { path: 'actors/actor-1.json', sha: 'blob-2' },
        ]),
      );

      const result = await module.pullState();

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.filesUpdated).toBe(2);
    });

    it('[EARS-GS-C2] should skip fetch when remote SHA matches last known', async () => {
      // First pull to set lastKnownSha
      const remoteSha = 'remote-sha-known';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: remoteSha } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(mockTreeWithFiles([
        { path: 'tasks/task-1.json', sha: 'blob-1' },
      ]));
      await module.pullState();

      // Second pull — same SHA
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: remoteSha } },
      });

      const result = await module.pullState();

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.filesUpdated).toBe(0);
      // getTree should NOT be called again
      expect(octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
    });

    it('[EARS-GS-C3] should trigger re-indexing after successful pull with changes', async () => {
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: 'remote-sha-c3' } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(
        mockTreeWithFiles([{ path: 'tasks/task-1.json', sha: 'blob-1' }]),
      );

      const result = await module.pullState();

      expect(result.reindexed).toBe(true);
    });

    it('[EARS-GS-C4] should handle missing gitgov-state branch gracefully', async () => {
      octokit.rest.git.getRef.mockRejectedValueOnce(createOctokitError(404));

      const result = await module.pullState();

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.filesUpdated).toBe(0);
    });
  });

  // ==================== Block D: Change Detection ====================

  describe('4.4. Change Detection (EARS-GS-D1 to D3)', () => {
    it('[EARS-GS-D1] should return file delta between last known SHA and current remote', async () => {
      // First pull to set lastKnownSha
      const initialSha = 'initial-sha';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: initialSha } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(mockTreeWithFiles([]));
      await module.pullState();

      // Now calculate delta with new SHA
      const newSha = 'new-sha-d1';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: newSha } },
      });
      octokit.rest.repos.compareCommits.mockResolvedValueOnce({
        data: {
          files: [
            { filename: 'tasks/task-1.json', status: 'added' },
            { filename: 'tasks/task-2.json', status: 'modified' },
            { filename: 'actors/actor-1.json', status: 'removed' },
          ],
        },
      });

      const delta = await module.calculateStateDelta('main');

      expect(delta).toHaveLength(3);
      expect(delta[0]).toEqual({ status: 'A', file: 'tasks/task-1.json' });
      expect(delta[1]).toEqual({ status: 'M', file: 'tasks/task-2.json' });
      expect(delta[2]).toEqual({ status: 'D', file: 'actors/actor-1.json' });
    });

    it('[EARS-GS-D2] should return empty delta when SHAs match', async () => {
      // Pull to set lastKnownSha
      const knownSha = 'known-sha-d2';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: knownSha } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(mockTreeWithFiles([]));
      await module.pullState();

      // calculateStateDelta returns same SHA
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: knownSha } },
      });

      const delta = await module.calculateStateDelta('main');

      expect(delta).toHaveLength(0);
      expect(octokit.rest.repos.compareCommits).not.toHaveBeenCalled();
    });

    it('[EARS-GS-D3] should return all files as added when last known SHA is missing', async () => {
      // No prior pull — lastKnownSha is null
      const currentSha = 'current-sha-d3';
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: currentSha } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(
        mockTreeWithFiles([
          { path: 'tasks/task-1.json', sha: 'blob-1' },
          { path: 'tasks/task-2.json', sha: 'blob-2' },
          { path: 'actors/actor-1.json', sha: 'blob-3' },
        ]),
      );

      const delta = await module.calculateStateDelta('main');

      expect(delta).toHaveLength(3);
      expect(delta.every((d) => d.status === 'A')).toBe(true);
      // compareCommits should NOT be called (full sync path)
      expect(octokit.rest.repos.compareCommits).not.toHaveBeenCalled();
    });
  });

  // ==================== Block E: Conflict Handling ====================

  describe('4.5. Conflict Handling (EARS-GS-E1 to E2)', () => {
    it('[EARS-GS-E1] should resolve conflict by pulling latest and retrying push', async () => {
      // Pull succeeds
      octokit.rest.git.getRef
        .mockResolvedValueOnce({ data: { object: { sha: 'pull-sha' } } }) // pullState getRef
        .mockResolvedValueOnce({ data: { object: { sha: 'push-sha' } } }); // pushState getRef

      octokit.rest.git.getCommit
        .mockResolvedValueOnce({ data: { tree: { sha: 'pull-tree-sha' } } }) // pullState getCommit
        .mockResolvedValueOnce({ data: { tree: { sha: 'push-tree-sha' } } }); // pushState getCommit (target)

      octokit.rest.git.getTree
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: 'tasks/task-1.json', sha: 'blob-1' }])) // pullState getTree
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: '.gitgov/tasks/task-1.json', sha: 'blob-new' }])) // pushState source tree
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: 'tasks/task-1.json', sha: 'blob-old' }])); // pushState target tree

      octokit.rest.git.createTree.mockResolvedValueOnce({ data: { sha: NEW_TREE_SHA } });
      octokit.rest.git.createCommit.mockResolvedValueOnce({ data: { sha: NEW_COMMIT_SHA } });
      octokit.rest.git.updateRef.mockResolvedValueOnce({ data: {} });

      const result = await module.resolveConflict({
        actorId: 'actor-1',
        reason: 'Resolved after pull',
      });

      expect(result.success).toBe(true);
      expect(result.resolvedBy).toBe('actor-1');
      expect(result.reason).toBe('Resolved after pull');
    });

    it('[EARS-GS-E2] should detect content conflict on same file modified by both sides', async () => {
      // Pull succeeds
      octokit.rest.git.getRef
        .mockResolvedValueOnce({ data: { object: { sha: 'pull-sha' } } }) // pullState
        .mockResolvedValueOnce({ data: { object: { sha: 'push-sha' } } }); // pushState

      octokit.rest.git.getCommit
        .mockResolvedValueOnce({ data: { tree: { sha: 'pull-tree-sha' } } }) // pullState
        .mockResolvedValueOnce({ data: { tree: { sha: 'push-tree-sha' } } }); // pushState

      octokit.rest.git.getTree
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: 'tasks/t.json', sha: 'b1' }])) // pullState
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: '.gitgov/tasks/t.json', sha: 'b-new' }])) // pushState source
        .mockResolvedValueOnce(mockTreeWithFiles([{ path: 'tasks/t.json', sha: 'b-old' }])); // pushState target

      octokit.rest.git.createTree.mockResolvedValueOnce({ data: { sha: NEW_TREE_SHA } });
      octokit.rest.git.createCommit.mockResolvedValueOnce({ data: { sha: NEW_COMMIT_SHA } });
      // updateRef fails again (conflict persists)
      octokit.rest.git.updateRef.mockRejectedValueOnce(createOctokitError(422));

      const result = await module.resolveConflict({
        actorId: 'actor-1',
        reason: 'Attempting resolution',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content conflict');
    });
  });

  // ==================== Block F: Audit ====================

  describe('4.6. Audit State via API (EARS-GS-F1 to F2)', () => {
    it('[EARS-GS-F1] should audit remote state branch via API and return report', async () => {
      // listCommits returns history
      octokit.rest.repos.listCommits.mockResolvedValueOnce({
        data: [
          { sha: 'c1', commit: { message: 'gitgov sync: 2 files' } },
          { sha: 'c2', commit: { message: 'gitgov sync: 1 files' } },
        ],
      });

      // getRef + getCommit + getTree for fetching records
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: 'audit-sha' } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(
        mockTreeWithFiles([{ path: 'tasks/task-1.json', sha: 'blob-1' }]),
      );
      // getBlob returns record content for lintRecord()
      const recordContent = { header: { id: 'task-1', type: 'task' }, payload: {} };
      octokit.rest.git.getBlob.mockResolvedValueOnce({
        data: { content: Buffer.from(JSON.stringify(recordContent)).toString('base64'), encoding: 'base64' },
      });

      const report = await module.auditState();

      expect(report.passed).toBe(true);
      expect(report.totalCommits).toBe(2);
      expect(report.rebaseCommits).toBe(0);
      expect(report.integrityViolations).toHaveLength(0);
      expect(report.summary).toContain('Audit passed');
      // Verify lintRecord was called per record, not lint()
      const deps = (module as any).deps;
      expect(deps.lint.lintRecord).toHaveBeenCalledWith(
        recordContent,
        expect.objectContaining({ recordId: 'task-1', entityType: 'task', filePath: 'tasks/task-1.json' }),
      );
    });

    it('[EARS-GS-F2] should detect and report integrity violations in remote records', async () => {
      // listCommits returns history
      octokit.rest.repos.listCommits.mockResolvedValueOnce({
        data: [{ sha: 'c1', commit: { message: 'gitgov sync' } }],
      });

      // getRef + getCommit + getTree
      octokit.rest.git.getRef.mockResolvedValueOnce({
        data: { object: { sha: 'audit-sha-f2' } },
      });
      octokit.rest.git.getCommit.mockResolvedValueOnce({
        data: { tree: { sha: TREE_SHA } },
      });
      octokit.rest.git.getTree.mockResolvedValueOnce(
        mockTreeWithFiles([{ path: 'tasks/bad-task.json', sha: 'blob-bad' }]),
      );
      const badRecord = { header: { id: 'bad-task', type: 'task' }, payload: {} };
      octokit.rest.git.getBlob.mockResolvedValueOnce({
        data: { content: Buffer.from(JSON.stringify(badRecord)).toString('base64'), encoding: 'base64' },
      });

      // lintRecord returns errors for this record
      const deps = (module as any).deps;
      deps.lint.lintRecord = jest.fn().mockReturnValue([
        { level: 'error', filePath: 'tasks/bad-task.json', validator: 'CHECKSUM_VERIFICATION', message: 'Invalid checksum', entity: { type: 'task', id: 'bad-task' }, fixable: false },
        { level: 'error', filePath: 'tasks/bad-task.json', validator: 'SIGNATURE_STRUCTURE', message: 'Missing signature', entity: { type: 'task', id: 'bad-task' }, fixable: false },
      ]);

      const report = await module.auditState();

      expect(report.passed).toBe(false);
      expect(report.lintReport).toBeDefined();
      expect(report.lintReport!.summary.errors).toBe(2);
      expect(report.summary).toContain('2 lint errors');
      expect(deps.lint.lintRecord).toHaveBeenCalledWith(
        badRecord,
        expect.objectContaining({ recordId: 'bad-task', entityType: 'task' }),
      );
    });
  });
});
