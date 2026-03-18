/**
 * Tests for GitLabSyncStateModule
 *
 * Blueprint: gitlab_sync_state_module.md
 * EARS: GS-A1-A4, GS-B1-B5, GS-C1-C4, GS-D1-D3, GS-E1-E2, GS-F1-F2
 */

import { GitLabSyncStateModule } from './gitlab_sync_state';
import type { GitLabSyncStateDependencies } from './gitlab_sync_state.types';

function createMockApi() {
  return {
    Branches: { show: jest.fn(), all: jest.fn(), create: jest.fn() },
    Repositories: { allRepositoryTrees: jest.fn(), compare: jest.fn() },
    RepositoryFiles: { show: jest.fn() },
    Commits: { create: jest.fn() },
  } as unknown as GitLabSyncStateDependencies['api'];
}

function mock(api: GitLabSyncStateDependencies['api']) {
  return api as unknown as {
    Branches: { show: jest.Mock; all: jest.Mock; create: jest.Mock };
    Repositories: { allRepositoryTrees: jest.Mock; compare: jest.Mock };
    RepositoryFiles: { show: jest.Mock };
    Commits: { create: jest.Mock };
  };
}

function gitbeakerError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>)['cause'] = { response: { status } };
  return err;
}

function createModule() {
  const api = createMockApi();
  const indexer = { computeProjection: jest.fn().mockResolvedValue({}) };
  const lint = { lintRecord: jest.fn().mockResolvedValue({ errors: [] }) };
  const mod = new GitLabSyncStateModule({ projectId: 123, api, indexer, lint });
  return { mod, api, indexer, lint };
}

describe('GitLabSyncStateModule', () => {
  describe('4.1. Branch Management (EARS-GS-A1 to A4)', () => {
    it('[EARS-GS-A1] should create gitgov-state branch when it does not exist', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockRejectedValue(gitbeakerError(404));
      mock(api).Branches.all.mockResolvedValue([{ name: 'main', default: true }]);
      mock(api).Branches.create.mockResolvedValue({});

      await mod.ensureStateBranch();
      expect(mock(api).Branches.create).toHaveBeenCalledWith(123, 'gitgov-state', 'main');
    });

    it('[EARS-GS-A2] should be idempotent when branch already exists', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ name: 'gitgov-state' });

      await mod.ensureStateBranch();
      expect(mock(api).Branches.create).not.toHaveBeenCalled();
    });

    it('[EARS-GS-A3] should return configured branch name', async () => {
      const { mod } = createModule();
      expect(await mod.getStateBranchName()).toBe('gitgov-state');
    });

    it('[EARS-GS-A4] should return false for isRebaseInProgress', async () => {
      const { mod } = createModule();
      expect(await mod.isRebaseInProgress()).toBe(false);
    });
  });

  describe('4.2. Push State (EARS-GS-B1 to B5)', () => {
    it('[EARS-GS-B1] should create atomic commit with all syncable files via Commits API', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'remote-sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ path: '.gitgov/tasks/t1.json', type: 'blob', id: 'src-id' }])
        .mockResolvedValueOnce([]);
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: 'e30=', blob_id: 'b1' });
      mock(api).Commits.create.mockResolvedValue({ id: 'new-commit' });

      const result = await mod.pushState({ sourceBranch: 'main', actorId: 'human:test' });
      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('new-commit');
      expect(mock(api).Commits.create).toHaveBeenCalledTimes(1);
    });

    it('[EARS-GS-B2] should detect conflict when remote ref has advanced (HTTP 409)', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ path: '.gitgov/t.json', type: 'blob', id: 'new' }])
        .mockResolvedValueOnce([]);
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: 'e30=', blob_id: 'b' });
      mock(api).Commits.create.mockRejectedValue(gitbeakerError(409));

      const result = await mod.pushState({ actorId: 'human:test' });
      expect(result.success).toBe(false);
      expect(result.conflictDetected).toBe(true);
    });

    it('[EARS-GS-B3] should calculate delta without creating commit on dry run', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ path: '.gitgov/t.json', type: 'blob', id: 'new' }])
        .mockResolvedValueOnce([]);
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: 'e30=', blob_id: 'b' });

      const result = await mod.pushState({ dryRun: true, actorId: 'human:test' });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(1);
      expect(result.commitHash).toBeNull();
      expect(mock(api).Commits.create).not.toHaveBeenCalled();
    });

    it('[EARS-GS-B4] should return commit SHA and files synced on success', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ path: '.gitgov/a.json', type: 'blob', id: 'a' }, { path: '.gitgov/b.json', type: 'blob', id: 'b' }])
        .mockResolvedValueOnce([]);
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: 'e30=', blob_id: 'x' });
      mock(api).Commits.create.mockResolvedValue({ id: 'commit-sha' });

      const result = await mod.pushState({ actorId: 'human:test' });
      expect(result.filesSynced).toBe(2);
      expect(result.commitHash).toBe('commit-sha');
    });

    it('[EARS-GS-B5] should skip commit when no changes detected', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      // Same files on both sides
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ path: '.gitgov/t.json', type: 'blob', id: 'same-id' }])
        .mockResolvedValueOnce([{ path: 't.json', type: 'blob', id: 'same-id' }]);

      const result = await mod.pushState({ actorId: 'human:test' });
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).toBeNull();
    });
  });

  describe('4.3. Pull State (EARS-GS-C1 to C4)', () => {
    it('[EARS-GS-C1] should detect changes and trigger re-indexing', async () => {
      const { mod, api, indexer } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'new-sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { type: 'blob', path: 't1.json' },
        { type: 'blob', path: 't2.json' },
      ]);

      const result = await mod.pullState();
      expect(result.hasChanges).toBe(true);
      expect(result.filesUpdated).toBe(2);
      expect(result.reindexed).toBe(true);
      expect(indexer.computeProjection).toHaveBeenCalledTimes(1);
    });

    it('[EARS-GS-C2] should skip fetch when remote SHA matches last known', async () => {
      const { mod, api, indexer } = createModule();
      // First pull to set lastKnownSha
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha-1' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([{ type: 'blob' }]);
      await mod.pullState();

      // Second pull — same SHA
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha-1' } });
      indexer.computeProjection.mockClear();

      const result = await mod.pullState();
      expect(result.hasChanges).toBe(false);
      expect(indexer.computeProjection).not.toHaveBeenCalled();
    });

    it('[EARS-GS-C3] should trigger re-indexing after pull with changes', async () => {
      const { mod, api, indexer } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([{ type: 'blob' }]);

      const result = await mod.pullState();
      expect(result.reindexed).toBe(true);
      expect(indexer.computeProjection).toHaveBeenCalled();
    });

    it('[EARS-GS-C4] should handle missing gitgov-state branch gracefully', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockRejectedValue(gitbeakerError(404));

      const result = await mod.pullState();
      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('4.4. Change Detection (EARS-GS-D1 to D3)', () => {
    it('[EARS-GS-D1] should return file delta between last known and current remote', async () => {
      const { mod, api } = createModule();
      // Set lastKnownSha via pullState
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'old-sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([{ type: 'blob' }]);
      await mod.pullState();

      // Now remote has advanced
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'new-sha' } });
      mock(api).Repositories.compare.mockResolvedValue({
        diffs: [
          { new_path: 'tasks/t1.json', new_file: true, deleted_file: false },
          { new_path: 'tasks/t2.json', new_file: false, deleted_file: false },
        ],
      });

      const delta = await mod.calculateStateDelta('main');
      expect(delta).toHaveLength(2);
      expect(delta[0]).toEqual({ status: 'A', file: 'tasks/t1.json' });
      expect(delta[1]).toEqual({ status: 'M', file: 'tasks/t2.json' });
    });

    it('[EARS-GS-D2] should return empty delta when SHAs match', async () => {
      const { mod, api } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'same-sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([{ type: 'blob' }]);
      await mod.pullState();

      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'same-sha' } });
      const delta = await mod.calculateStateDelta('main');
      expect(delta).toEqual([]);
    });

    it('[EARS-GS-D3] should return all files as added when last known SHA is missing', async () => {
      const { mod, api } = createModule();
      // No prior pullState → lastKnownSha is null
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: 'config.json', type: 'blob' },
        { path: 'tasks/t1.json', type: 'blob' },
        { path: 'subdir', type: 'tree' },
      ]);

      const delta = await mod.calculateStateDelta('main');
      expect(delta).toHaveLength(2); // Only blobs
      expect(delta.every(d => d.status === 'A')).toBe(true);
    });
  });

  describe('4.5. Conflict Handling (EARS-GS-E1 to E2)', () => {
    it('[EARS-GS-E1] should resolve conflict by pulling latest and retrying push', async () => {
      const { mod, api } = createModule();
      // pullState mock
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ type: 'blob' }]) // pullState tree
        .mockResolvedValueOnce([]) // pushState source
        .mockResolvedValueOnce([]); // pushState target

      const result = await mod.resolveConflict({ actorId: 'human:test' });
      expect(result.success).toBe(true);
    });

    it('[EARS-GS-E2] should detect content conflict on same file modified by both sides', async () => {
      const { mod, api } = createModule();
      // pullState succeeds
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees
        .mockResolvedValueOnce([{ type: 'blob' }]) // pullState
        .mockResolvedValueOnce([{ path: '.gitgov/t.json', type: 'blob', id: 'new' }]) // push source
        .mockResolvedValueOnce([]); // push target
      mock(api).RepositoryFiles.show.mockResolvedValue({ content: 'e30=', blob_id: 'b' });
      // Push fails with 409 again (content conflict)
      mock(api).Commits.create.mockRejectedValue(gitbeakerError(409));

      const result = await mod.resolveConflict({ actorId: 'human:test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Content conflict');
    });
  });

  describe('4.6. Audit State (EARS-GS-F1 to F2)', () => {
    it('[EARS-GS-F1] should audit remote state branch via API and return report', async () => {
      const { mod, api, lint } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: 'tasks/t1.json', type: 'blob' },
        { path: 'actors/a1.json', type: 'blob' },
      ]);
      mock(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from('{"valid":true}').toString('base64'),
      });
      lint.lintRecord.mockResolvedValue({ errors: [] });

      const report = await mod.auditState();
      expect(report.passed).toBe(true);
      expect(report.totalCommits).toBe(2);
      expect(lint.lintRecord).toHaveBeenCalledTimes(2);
    });

    it('[EARS-GS-F2] should detect and report integrity violations', async () => {
      const { mod, api, lint } = createModule();
      mock(api).Branches.show.mockResolvedValue({ commit: { id: 'sha' } });
      mock(api).Repositories.allRepositoryTrees.mockResolvedValue([
        { path: 'tasks/t1.json', type: 'blob' },
      ]);
      mock(api).RepositoryFiles.show.mockResolvedValue({
        content: Buffer.from('{"broken":true}').toString('base64'),
      });
      lint.lintRecord.mockResolvedValue({
        errors: [{ message: 'Missing required field: header.id' }],
      });

      const report = await mod.auditState();
      expect(report.passed).toBe(false);
      expect(report.lintReport.errors).toHaveLength(1);
      expect(report.lintReport.errors[0]!.message).toContain('Missing required field');
    });
  });
});
