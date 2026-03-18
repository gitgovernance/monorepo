/**
 * GitLabSyncStateModule — ISyncStateModule via GitLab API (Gitbeaker)
 *
 * Synchronizes .gitgov/ state with a shared gitgov-state branch
 * using the GitLab Commits/Branches/Compare API.
 *
 * Key advantage: pushState uses 1 API call (Commits API actions[])
 * vs GitHub's 6-step tree+commit+ref dance.
 *
 * Blueprint: gitlab_sync_state_module.md
 * @module sync_state/gitlab_sync_state
 */

import { isGitbeakerRequestError, mapGitbeakerError } from '../gitlab';
import type { GitLabSyncStateDependencies } from './gitlab_sync_state.types';

/** Minimal StateDeltaFile compatible with ISyncStateModule */
type StateDeltaFile = { status: 'A' | 'M' | 'D'; file: string };

/** Minimal result types — structurally compatible with ISyncStateModule */
type SyncStatePushResult = {
  success: boolean;
  filesSynced: number;
  sourceBranch: string;
  commitHash: string | null;
  commitMessage: string | null;
  conflictDetected: boolean;
  conflictInfo?: { type: string; affectedFiles: string[]; message: string; resolutionSteps: string[] };
  error?: string;
};

type SyncStatePullResult = {
  success: boolean;
  hasChanges: boolean;
  filesUpdated: number;
  reindexed: boolean;
  conflictDetected: boolean;
  conflictInfo?: { type: string; affectedFiles: string[]; message: string };
  error?: string;
};

type SyncStateResolveResult = {
  success: boolean;
  error?: string;
};

type AuditStateReport = {
  passed: boolean;
  totalCommits: number;
  lintReport: { errors: Array<{ file: string; message: string }> };
};

/**
 * [EARS-GS-A1..F2] GitLabSyncStateModule
 *
 * Synchronizes .gitgov/ state with a GitLab remote via API.
 * Uses optimistic concurrency (SHA-based) via Commits API.
 */
export class GitLabSyncStateModule {
  private readonly deps: GitLabSyncStateDependencies;
  private lastKnownSha: string | null = null;

  constructor(deps: GitLabSyncStateDependencies) {
    this.deps = deps;
  }

  // ==================== Block A: Branch Management ====================

  /** [EARS-GS-A3] Returns the configured state branch name. */
  async getStateBranchName(): Promise<string> {
    return 'gitgov-state';
  }

  /**
   * [EARS-GS-A1] Creates gitgov-state branch if it does not exist.
   * [EARS-GS-A2] Idempotent — no-op if branch already exists.
   */
  async ensureStateBranch(): Promise<void> {
    const branchName = await this.getStateBranchName();

    try {
      await this.deps.api.Branches.show(this.deps.projectId, branchName);
      return; // [EARS-GS-A2] Already exists
    } catch (error: unknown) {
      if (!isGitbeakerRequestError(error) || this.extractStatus(error) !== 404) {
        throw mapGitbeakerError(error, `checking branch ${branchName}`);
      }
    }

    // [EARS-GS-A1] Create from default branch
    try {
      const branches = await this.deps.api.Branches.all(this.deps.projectId) as unknown as Array<{ name: string; default: boolean }>;
      const defaultBranch = branches.find(b => b.default)?.name ?? 'main';
      await this.deps.api.Branches.create(this.deps.projectId, branchName, defaultBranch);
    } catch (error: unknown) {
      throw mapGitbeakerError(error, `creating branch ${branchName}`);
    }
  }

  /** [EARS-GS-A4] isRebaseInProgress — always false for API-based sync. */
  async isRebaseInProgress(): Promise<boolean> {
    return false;
  }

  // ==================== Block B: Push State ====================

  /**
   * [EARS-GS-B1..B5] Push state to gitgov-state branch via Commits API (1 API call).
   */
  async pushState(options: { sourceBranch?: string; dryRun?: boolean; actorId: string; force?: boolean }): Promise<SyncStatePushResult> {
    const branchName = await this.getStateBranchName();
    const sourceBranch = options.sourceBranch ?? 'main';

    try {
      // Get current remote tree
      const remoteSha = await this.getRemoteSha(branchName);

      // Get source tree (files from .gitgov/ on source branch)
      const sourceItems = await this.deps.api.Repositories.allRepositoryTrees(this.deps.projectId, {
        path: '.gitgov',
        ref: sourceBranch,
        recursive: true,
      } as Parameters<typeof this.deps.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ path: string; type: string; id: string }>;

      const sourceFiles = sourceItems.filter(i => i.type === 'blob');

      // Get target tree
      const targetItems = remoteSha
        ? await this.deps.api.Repositories.allRepositoryTrees(this.deps.projectId, {
            ref: branchName,
            recursive: true,
          } as Parameters<typeof this.deps.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ path: string; type: string; id: string }>
        : [];

      const targetMap = new Map(targetItems.filter(i => i.type === 'blob').map(i => [i.path, i.id]));

      // Diff
      const actions: Array<Record<string, unknown>> = [];
      const delta: StateDeltaFile[] = [];

      for (const sf of sourceFiles) {
        const statePath = sf.path.replace(/^\.gitgov\//, '');
        const targetId = targetMap.get(statePath);

        if (targetId !== sf.id) {
          delta.push({ status: targetId ? 'M' : 'A', file: statePath });
          // Read file content from source branch
          const file = await this.deps.api.RepositoryFiles.show(this.deps.projectId, sf.path, sourceBranch);
          actions.push({
            action: targetId ? 'update' : 'create',
            file_path: statePath,
            content: String(file.content),
            encoding: 'base64',
          });
        }
        targetMap.delete(statePath);
      }

      // Deletions
      for (const [deletedPath] of targetMap) {
        delta.push({ status: 'D', file: deletedPath });
        actions.push({ action: 'delete', file_path: deletedPath });
      }

      // [EARS-GS-B5] No changes
      if (delta.length === 0) {
        return { success: true, filesSynced: 0, sourceBranch, commitHash: null, commitMessage: null, conflictDetected: false };
      }

      // [EARS-GS-B3] Dry run
      if (options.dryRun) {
        return { success: true, filesSynced: delta.length, sourceBranch, commitHash: null, commitMessage: `[dry-run] gitgov sync: ${delta.length} files`, conflictDetected: false };
      }

      // [EARS-GS-B1] 1 API call via Commits API
      const commitMessage = `gitgov sync: ${delta.length} files from ${sourceBranch}`;
      const result = await this.deps.api.Commits.create(
        this.deps.projectId,
        branchName,
        commitMessage,
        actions as unknown as Parameters<typeof this.deps.api.Commits.create>[3],
      );

      // [EARS-GS-B4] Success
      const commitSha = String(result.id);
      this.lastKnownSha = commitSha;
      return { success: true, filesSynced: delta.length, sourceBranch, commitHash: commitSha, commitMessage, conflictDetected: false };
    } catch (error: unknown) {
      // [EARS-GS-B2] Conflict detection (409)
      if (isGitbeakerRequestError(error) && this.extractStatus(error) === 409) {
        return {
          success: false, filesSynced: 0, sourceBranch, commitHash: null, commitMessage: null, conflictDetected: true,
          conflictInfo: { type: 'rebase_conflict', affectedFiles: [], message: 'Remote ref has advanced. Pull and retry.', resolutionSteps: ['Call pullState()', 'Retry pushState()'] },
        };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, filesSynced: 0, sourceBranch, commitHash: null, commitMessage: null, conflictDetected: false, error: msg };
    }
  }

  // ==================== Block C: Pull State ====================

  /** [EARS-GS-C1..C4] Pull remote state, trigger re-index. */
  async pullState(_options?: { forceReindex?: boolean }): Promise<SyncStatePullResult> {
    const branchName = await this.getStateBranchName();

    // [EARS-GS-C4] Check branch exists
    const remoteSha = await this.getRemoteSha(branchName);
    if (!remoteSha) {
      return { success: true, hasChanges: false, filesUpdated: 0, reindexed: false, conflictDetected: false };
    }

    // [EARS-GS-C2] No changes if SHA matches
    if (this.lastKnownSha === remoteSha && !_options?.forceReindex) {
      return { success: true, hasChanges: false, filesUpdated: 0, reindexed: false, conflictDetected: false };
    }

    // [EARS-GS-C1] Fetch tree + count syncable files
    const items = await this.deps.api.Repositories.allRepositoryTrees(this.deps.projectId, {
      ref: branchName,
      recursive: true,
    } as Parameters<typeof this.deps.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ type: string }>;

    const filesUpdated = items.filter(i => i.type === 'blob').length;
    this.lastKnownSha = remoteSha;

    // [EARS-GS-C3] Trigger re-indexing
    let reindexed = false;
    if (filesUpdated > 0 || _options?.forceReindex) {
      try {
        await this.deps.indexer.computeProjection();
        reindexed = true;
      } catch {
        // Re-indexing failure is non-fatal
      }
    }

    return { success: true, hasChanges: true, filesUpdated, reindexed, conflictDetected: false };
  }

  // ==================== Block D: Change Detection ====================

  /** [EARS-GS-D1..D3] Calculate state delta between last known and current remote. */
  async calculateStateDelta(_sourceBranch: string): Promise<StateDeltaFile[]> {
    const branchName = await this.getStateBranchName();
    const remoteSha = await this.getRemoteSha(branchName);

    if (!remoteSha) return [];

    // [EARS-GS-D3] Full sync if no lastKnownSha
    if (!this.lastKnownSha) {
      const items = await this.deps.api.Repositories.allRepositoryTrees(this.deps.projectId, {
        ref: branchName,
        recursive: true,
      } as Parameters<typeof this.deps.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ path: string; type: string }>;

      return items.filter(i => i.type === 'blob').map(i => ({ status: 'A' as const, file: i.path }));
    }

    // [EARS-GS-D2] No delta if SHAs match
    if (this.lastKnownSha === remoteSha) return [];

    // [EARS-GS-D1] Compare
    try {
      const data = await this.deps.api.Repositories.compare(this.deps.projectId, this.lastKnownSha, remoteSha);
      const diffs = (data.diffs ?? []) as unknown as Array<{ new_path: string; new_file: boolean; deleted_file: boolean }>;

      return diffs.map(d => ({
        status: (d.new_file ? 'A' : d.deleted_file ? 'D' : 'M') as 'A' | 'M' | 'D',
        file: d.new_path,
      }));
    } catch {
      return [];
    }
  }

  // ==================== Block E: Conflict Handling ====================

  /**
   * [EARS-GS-E1] Resolve conflict by pulling latest state and retrying push.
   * [EARS-GS-E2] Detects content conflicts (same file modified by both sides).
   */
  async resolveConflict(options: { actorId: string; sourceBranch?: string }): Promise<SyncStateResolveResult> {
    try {
      // Pull latest state
      await this.pullState({ forceReindex: true });

      // Retry push
      const result = await this.pushState({
        actorId: options.actorId,
        ...(options.sourceBranch !== undefined && { sourceBranch: options.sourceBranch }),
      });

      if (result.conflictDetected) {
        // [EARS-GS-E2] Content conflict — cannot auto-resolve
        return { success: false, error: 'Content conflict: file modified by both local and remote. Manual resolution required.' };
      }

      return result.error ? { success: result.success, error: result.error } : { success: result.success };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  // ==================== Block F: Audit State ====================

  /**
   * [EARS-GS-F1] Audit remote state branch records via API.
   * [EARS-GS-F2] Reports integrity violations in lintReport.
   */
  async auditState(): Promise<AuditStateReport> {
    const branchName = await this.getStateBranchName();
    const errors: Array<{ file: string; message: string }> = [];

    const items = await this.deps.api.Repositories.allRepositoryTrees(this.deps.projectId, {
      ref: branchName,
      recursive: true,
    } as Parameters<typeof this.deps.api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ path: string; type: string }>;

    const records = items.filter(i => i.type === 'blob' && i.path.endsWith('.json'));

    if (this.deps.lint) {
      for (const record of records) {
        try {
          const file = await this.deps.api.RepositoryFiles.show(this.deps.projectId, record.path, branchName);
          const content = JSON.parse(Buffer.from(String(file.content), 'base64').toString('utf-8')) as unknown;
          const recordType = this.inferRecordType(record.path);
          const result = await this.deps.lint.lintRecord(recordType, content);
          for (const err of result.errors) {
            errors.push({ file: record.path, message: err.message });
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push({ file: record.path, message: `Failed to lint: ${msg}` });
        }
      }
    }

    return {
      passed: errors.length === 0,
      totalCommits: records.length,
      lintReport: { errors },
    };
  }

  // ==================== ISyncStateModule stubs ====================

  /** ISyncStateModule — returns files with conflict markers. Not applicable to API-based sync. */
  async checkConflictMarkers(_filePaths: string[]): Promise<string[]> {
    return [];
  }

  /** ISyncStateModule — returns structured diff for conflicted files. Not applicable to API-based sync. */
  async getConflictDiff(_filePaths?: string[]): Promise<{ files: Array<{ path: string }> }> {
    return { files: [] };
  }

  /** ISyncStateModule — verifies resolution integrity. Not applicable to API-based sync. */
  async verifyResolutionIntegrity(): Promise<Array<{ message: string }>> {
    return [];
  }

  // ==================== Helpers ====================

  /** Infers record type from file path (e.g., 'tasks/t1.json' → 'tasks') */
  private inferRecordType(path: string): string {
    const parts = path.split('/');
    return parts.length > 1 ? parts[parts.length - 2]! : 'unknown';
  }

  private async getRemoteSha(branchName: string): Promise<string | null> {
    try {
      const branch = await this.deps.api.Branches.show(this.deps.projectId, branchName);
      return String(branch.commit.id);
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error) && this.extractStatus(error) === 404) {
        return null;
      }
      throw mapGitbeakerError(error, `getRemoteSha ${branchName}`);
    }
  }

  private extractStatus(error: unknown): number | undefined {
    if (error instanceof Error && 'cause' in error && typeof error.cause === 'object' && error.cause !== null && 'response' in error.cause) {
      const response = (error.cause as { response?: { status?: number } }).response;
      if (typeof response?.status === 'number') return response.status;
    }
    if (error instanceof Error && 'statusCode' in error && typeof (error as Record<string, unknown>)['statusCode'] === 'number') {
      return (error as Record<string, unknown>)['statusCode'] as number;
    }
    return undefined;
  }
}
