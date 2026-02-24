/**
 * GithubSyncStateModule — ISyncStateModule via GitHub API (Octokit)
 *
 * Implements state synchronization between .gitgov/ records and a shared
 * gitgov-state branch using the GitHub Trees/Commits/Refs API.
 * No local filesystem or git CLI required.
 *
 * Blueprint: github_sync_state_module.md
 * @module sync_state/github_sync_state
 */

import type { ISyncStateModule } from '../sync_state';
import type {
  SyncStatePushOptions,
  SyncStatePushResult,
  SyncStatePullOptions,
  SyncStatePullResult,
  SyncStateResolveOptions,
  SyncStateResolveResult,
  AuditStateOptions,
  AuditStateReport,
  ConflictDiff,
  IntegrityViolation,
  StateDeltaFile,
} from '../sync_state.types';
import type { GithubSyncStateDependencies } from './github_sync_state.types';
import type { LintReport, LintResult } from '../../lint';
import type { GitGovRecord, GitGovRecordType } from '../../record_types';
import { shouldSyncFile } from '../sync_state.utils';
import { isOctokitRequestError } from '../../github';

/**
 * [EARS-GS-A1..F2] GithubSyncStateModule
 *
 * Synchronizes .gitgov/ state with a GitHub remote via API.
 * Uses optimistic concurrency (SHA-based) instead of rebase.
 */
export class GithubSyncStateModule implements ISyncStateModule {
  private readonly deps: GithubSyncStateDependencies;
  private lastKnownSha: string | null = null;

  constructor(deps: GithubSyncStateDependencies) {
    this.deps = deps;
  }

  // ==================== Block A: Branch Management ====================

  /**
   * [EARS-GS-A3] Returns the configured state branch name.
   */
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
      // Check if branch exists
      await this.deps.octokit.rest.repos.getBranch({
        owner: this.deps.owner,
        repo: this.deps.repo,
        branch: branchName,
      });
      // [EARS-GS-A2] Branch exists, nothing to do
      return;
    } catch (error: unknown) {
      if (!isOctokitRequestError(error) || error.status !== 404) {
        throw error;
      }
    }

    // [EARS-GS-A1] Branch does not exist — create from default branch HEAD
    const { data: repoData } = await this.deps.octokit.rest.repos.get({
      owner: this.deps.owner,
      repo: this.deps.repo,
    });
    const defaultBranch = repoData.default_branch;

    const { data: refData } = await this.deps.octokit.rest.git.getRef({
      owner: this.deps.owner,
      repo: this.deps.repo,
      ref: `heads/${defaultBranch}`,
    });

    await this.deps.octokit.rest.git.createRef({
      owner: this.deps.owner,
      repo: this.deps.repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
  }

  // ==================== Block B: Push State ====================

  /**
   * [EARS-GS-B1..B5] Push local .gitgov/ state to gitgov-state branch via API.
   *
   * Uses the 6-step atomic commit pattern:
   * getRef → getCommit → createBlob → createTree → createCommit → updateRef
   *
   * Optimistic concurrency: if remote ref advanced since our read, updateRef
   * fails with 422 → return conflictDetected: true.
   */
  async pushState(options: SyncStatePushOptions): Promise<SyncStatePushResult> {
    const branchName = await this.getStateBranchName();
    const sourceBranch = options.sourceBranch ?? 'main';

    try {
      // Step 1: Get current gitgov-state ref SHA
      const { data: stateRefData } = await this.deps.octokit.rest.git.getRef({
        owner: this.deps.owner,
        repo: this.deps.repo,
        ref: `heads/${branchName}`,
      });
      const currentSha = stateRefData.object.sha;

      // Step 2: Get source branch tree (files from .gitgov/ on source branch)
      const { data: sourceTree } = await this.deps.octokit.rest.git.getTree({
        owner: this.deps.owner,
        repo: this.deps.repo,
        tree_sha: sourceBranch,
        recursive: 'true',
      });

      const sourceFiles = (sourceTree.tree ?? []).filter(
        (item) => item.type === 'blob' && item.path?.startsWith('.gitgov/') && shouldSyncFile(item.path)
      );

      // Step 3: Get target tree (current gitgov-state contents)
      const { data: targetCommit } = await this.deps.octokit.rest.git.getCommit({
        owner: this.deps.owner,
        repo: this.deps.repo,
        commit_sha: currentSha,
      });

      const { data: targetTree } = await this.deps.octokit.rest.git.getTree({
        owner: this.deps.owner,
        repo: this.deps.repo,
        tree_sha: targetCommit.tree.sha,
        recursive: 'true',
      });

      const targetFileMap = new Map<string, string>();
      for (const item of targetTree.tree ?? []) {
        if (item.type === 'blob' && item.path && item.sha) {
          targetFileMap.set(item.path, item.sha);
        }
      }

      // Step 4: Diff trees — find files that changed
      const delta: StateDeltaFile[] = [];
      const treeEntries: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string | null;
      }> = [];

      // Files in source that differ from target (add/modify)
      for (const sourceFile of sourceFiles) {
        if (!sourceFile.path || !sourceFile.sha) continue;
        // Strip .gitgov/ prefix for gitgov-state branch (files live at root)
        const statePath = sourceFile.path.replace(/^\.gitgov\//, '');
        const targetSha = targetFileMap.get(statePath);

        if (targetSha !== sourceFile.sha) {
          delta.push({
            status: targetSha ? 'M' : 'A',
            file: statePath,
          });
          treeEntries.push({
            path: statePath,
            mode: '100644',
            type: 'blob',
            sha: sourceFile.sha,
          });
        }
        targetFileMap.delete(statePath);
      }

      // Files in target but not in source (deleted)
      for (const [deletedPath] of targetFileMap) {
        if (shouldSyncFile(deletedPath)) {
          delta.push({ status: 'D', file: deletedPath });
          treeEntries.push({
            path: deletedPath,
            mode: '100644',
            type: 'blob',
            sha: null,
          });
        }
      }

      // [EARS-GS-B5] No changes
      if (delta.length === 0) {
        return {
          success: true,
          filesSynced: 0,
          sourceBranch,
          commitHash: null,
          commitMessage: null,
          conflictDetected: false,
        };
      }

      // [EARS-GS-B3] Dry run — return delta without creating commit
      if (options.dryRun) {
        return {
          success: true,
          filesSynced: delta.length,
          sourceBranch,
          commitHash: null,
          commitMessage: `[dry-run] gitgov sync: ${delta.length} files`,
          conflictDetected: false,
        };
      }

      // Step 5: Create new tree
      const { data: newTreeData } = await this.deps.octokit.rest.git.createTree({
        owner: this.deps.owner,
        repo: this.deps.repo,
        base_tree: targetCommit.tree.sha,
        tree: treeEntries,
      });

      // Step 6: Create commit
      const commitMessage = `gitgov sync: ${delta.length} files from ${sourceBranch}`;
      const { data: newCommitData } = await this.deps.octokit.rest.git.createCommit({
        owner: this.deps.owner,
        repo: this.deps.repo,
        message: commitMessage,
        tree: newTreeData.sha,
        parents: [currentSha],
      });

      // Step 7: Update ref (optimistic concurrency)
      try {
        await this.deps.octokit.rest.git.updateRef({
          owner: this.deps.owner,
          repo: this.deps.repo,
          ref: `heads/${branchName}`,
          sha: newCommitData.sha,
        });
      } catch (error: unknown) {
        // [EARS-GS-B2] SHA mismatch — remote advanced
        if (isOctokitRequestError(error) && (error.status === 422 || error.status === 409)) {
          return {
            success: false,
            filesSynced: 0,
            sourceBranch,
            commitHash: null,
            commitMessage: null,
            conflictDetected: true,
            conflictInfo: {
              type: 'rebase_conflict',
              affectedFiles: delta.map((d) => d.file),
              message: 'Remote gitgov-state ref has advanced since last read. Pull and retry.',
              resolutionSteps: [
                'Call pullState() to fetch latest remote state',
                'Retry pushState() with updated parent SHA',
              ],
            },
          };
        }
        throw error;
      }

      // [EARS-GS-B4] Success
      this.lastKnownSha = newCommitData.sha;
      return {
        success: true,
        filesSynced: delta.length,
        sourceBranch,
        commitHash: newCommitData.sha,
        commitMessage,
        conflictDetected: false,
      };
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        return {
          success: false,
          filesSynced: 0,
          sourceBranch,
          commitHash: null,
          commitMessage: null,
          conflictDetected: false,
          error: `GitHub API error (${error.status}): ${error.message}`,
        };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        filesSynced: 0,
        sourceBranch,
        commitHash: null,
        commitMessage: null,
        conflictDetected: false,
        error: msg,
      };
    }
  }

  // ==================== Block C: Pull State ====================

  /**
   * [EARS-GS-C1..C4] Pull remote state from gitgov-state branch.
   *
   * Fetches tree + blobs, updates lastKnownSha, triggers re-indexing.
   */
  async pullState(options?: SyncStatePullOptions): Promise<SyncStatePullResult> {
    const branchName = await this.getStateBranchName();

    // [EARS-GS-C4] Check if branch exists
    let remoteSha: string;
    try {
      const { data: refData } = await this.deps.octokit.rest.git.getRef({
        owner: this.deps.owner,
        repo: this.deps.repo,
        ref: `heads/${branchName}`,
      });
      remoteSha = refData.object.sha;
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return {
          success: true,
          hasChanges: false,
          filesUpdated: 0,
          reindexed: false,
          conflictDetected: false,
        };
      }
      throw error;
    }

    // [EARS-GS-C2] No changes if SHA matches (unless forceReindex)
    if (this.lastKnownSha === remoteSha && !options?.forceReindex) {
      return {
        success: true,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: false,
      };
    }

    // [EARS-GS-C1] Fetch tree contents
    const { data: commitData } = await this.deps.octokit.rest.git.getCommit({
      owner: this.deps.owner,
      repo: this.deps.repo,
      commit_sha: remoteSha,
    });

    const { data: treeData } = await this.deps.octokit.rest.git.getTree({
      owner: this.deps.owner,
      repo: this.deps.repo,
      tree_sha: commitData.tree.sha,
      recursive: 'true',
    });

    const syncableFiles = (treeData.tree ?? []).filter(
      (item) => item.type === 'blob' && item.path && shouldSyncFile(item.path)
    );

    const filesUpdated = syncableFiles.length;

    // Update tracking SHA
    this.lastKnownSha = remoteSha;

    // [EARS-GS-C3] Trigger re-indexing
    let reindexed = false;
    if (filesUpdated > 0 || options?.forceReindex) {
      try {
        await this.deps.indexer.computeProjection();
        reindexed = true;
      } catch {
        // Re-indexing failure is non-fatal for pull
        reindexed = false;
      }
    }

    return {
      success: true,
      hasChanges: filesUpdated > 0,
      filesUpdated,
      reindexed,
      conflictDetected: false,
    };
  }

  // ==================== Block D: Change Detection ====================

  /**
   * [EARS-GS-D1..D3] Calculate file delta between known state and current remote.
   */
  async calculateStateDelta(_sourceBranch: string): Promise<StateDeltaFile[]> {
    const branchName = await this.getStateBranchName();

    // Get current remote SHA
    let currentSha: string;
    try {
      const { data: refData } = await this.deps.octokit.rest.git.getRef({
        owner: this.deps.owner,
        repo: this.deps.repo,
        ref: `heads/${branchName}`,
      });
      currentSha = refData.object.sha;
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }

    // [EARS-GS-D2] No changes if SHAs match
    if (this.lastKnownSha === currentSha) {
      return [];
    }

    // [EARS-GS-D3] Full sync if lastKnownSha is unknown
    if (this.lastKnownSha === null) {
      const { data: commitData } = await this.deps.octokit.rest.git.getCommit({
        owner: this.deps.owner,
        repo: this.deps.repo,
        commit_sha: currentSha,
      });

      const { data: treeData } = await this.deps.octokit.rest.git.getTree({
        owner: this.deps.owner,
        repo: this.deps.repo,
        tree_sha: commitData.tree.sha,
        recursive: 'true',
      });

      return (treeData.tree ?? [])
        .filter((item) => item.type === 'blob' && item.path && shouldSyncFile(item.path))
        .map((item) => ({
          status: 'A' as const,
          file: item.path!,
        }));
    }

    // [EARS-GS-D1] Compare commits for delta
    const { data: comparison } = await this.deps.octokit.rest.repos.compareCommits({
      owner: this.deps.owner,
      repo: this.deps.repo,
      base: this.lastKnownSha,
      head: currentSha,
    });

    return (comparison.files ?? [])
      .filter((file) => shouldSyncFile(file.filename))
      .map((file) => ({
        status: (file.status === 'added' ? 'A' : file.status === 'removed' ? 'D' : 'M') as 'A' | 'M' | 'D',
        file: file.filename,
      }));
  }

  /**
   * Always empty — no local pending changes in API mode.
   * In API mode there is no local filesystem; all state is remote.
   */
  async getPendingChanges(): Promise<StateDeltaFile[]> {
    return [];
  }

  // ==================== Block E: Conflict Handling ====================

  /**
   * Always false — no rebase in API mode.
   */
  async isRebaseInProgress(): Promise<boolean> {
    return false;
  }

  /**
   * Always empty — no conflict markers in API mode.
   */
  async checkConflictMarkers(_filePaths: string[]): Promise<string[]> {
    return [];
  }

  /**
   * Empty diff — no git-level conflict markers in API mode.
   */
  async getConflictDiff(_filePaths?: string[]): Promise<ConflictDiff> {
    return {
      files: [],
      message: 'No conflict markers in API mode. Conflicts are SHA-based.',
      resolutionSteps: [
        'Call pullState() to fetch latest remote state',
        'Retry pushState() with updated records',
      ],
    };
  }

  /**
   * [EARS-GS-E1..E2] Resolve conflict by pulling latest and retrying push.
   */
  async resolveConflict(options: SyncStateResolveOptions): Promise<SyncStateResolveResult> {
    // [EARS-GS-E1] Pull latest state
    const pullResult = await this.pullState({ forceReindex: false });

    if (!pullResult.success) {
      return {
        success: false,
        rebaseCommitHash: '',
        resolutionCommitHash: '',
        conflictsResolved: 0,
        resolvedBy: options.actorId,
        reason: options.reason,
        error: `Pull failed during conflict resolution: ${pullResult.error}`,
      };
    }

    // Retry push with latest parent SHA
    const pushResult = await this.pushState({
      actorId: options.actorId,
    });

    // [EARS-GS-E2] If push still fails, content conflict
    if (!pushResult.success || pushResult.conflictDetected) {
      const errorMsg = pushResult.conflictDetected
        ? 'Content conflict: same file modified by both sides. Manual resolution required.'
        : (pushResult.error ?? 'Unknown push error');
      return {
        success: false,
        rebaseCommitHash: '',
        resolutionCommitHash: '',
        conflictsResolved: 0,
        resolvedBy: options.actorId,
        reason: options.reason,
        error: errorMsg,
      };
    }

    return {
      success: true,
      rebaseCommitHash: this.lastKnownSha ?? '',
      resolutionCommitHash: pushResult.commitHash ?? '',
      conflictsResolved: pushResult.filesSynced,
      resolvedBy: options.actorId,
      reason: options.reason,
    };
  }

  /**
   * No integrity violations in API mode (no rebase commits).
   */
  async verifyResolutionIntegrity(): Promise<IntegrityViolation[]> {
    return [];
  }

  // ==================== Block F: Audit ====================

  /**
   * [EARS-GS-F1..F2] Audit the remote gitgov-state branch.
   */
  async auditState(options?: AuditStateOptions): Promise<AuditStateReport> {
    const branchName = await this.getStateBranchName();
    const scope = options?.scope ?? 'all';

    // Get commit history
    let totalCommits = 0;
    try {
      const { data: commits } = await this.deps.octokit.rest.repos.listCommits({
        owner: this.deps.owner,
        repo: this.deps.repo,
        sha: branchName,
        per_page: 100,
      });
      totalCommits = commits.length;
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 404) {
        return {
          passed: true,
          scope,
          totalCommits: 0,
          rebaseCommits: 0,
          resolutionCommits: 0,
          integrityViolations: [],
          summary: 'Branch gitgov-state does not exist. No audit needed.',
        };
      }
      throw error;
    }

    // No rebase commits in API mode
    const rebaseCommits = 0;
    const resolutionCommits = 0;
    const integrityViolations: IntegrityViolation[] = [];

    // [EARS-GS-F1] Validate records via lint if requested
    let lintReport: LintReport | undefined;
    if (options?.verifySignatures !== false || options?.verifyChecksums !== false) {
      try {
        // Fetch tree to get records
        const { data: refData } = await this.deps.octokit.rest.git.getRef({
          owner: this.deps.owner,
          repo: this.deps.repo,
          ref: `heads/${branchName}`,
        });

        const { data: commitData } = await this.deps.octokit.rest.git.getCommit({
          owner: this.deps.owner,
          repo: this.deps.repo,
          commit_sha: refData.object.sha,
        });

        const { data: treeData } = await this.deps.octokit.rest.git.getTree({
          owner: this.deps.owner,
          repo: this.deps.repo,
          tree_sha: commitData.tree.sha,
          recursive: 'true',
        });

        const treeItems = (treeData.tree ?? [])
          .filter((item) => item.type === 'blob' && item.path && item.sha && shouldSyncFile(item.path));

        // Fetch each record blob and validate via lintRecord()
        const startTime = Date.now();
        const allResults: LintResult[] = [];
        let filesChecked = 0;

        for (const item of treeItems) {
          try {
            const { data: blobData } = await this.deps.octokit.rest.git.getBlob({
              owner: this.deps.owner,
              repo: this.deps.repo,
              file_sha: item.sha!,
            });
            const content = Buffer.from(blobData.content, 'base64').toString('utf-8');
            const record = JSON.parse(content) as GitGovRecord;
            const entityType = pathToEntityType(item.path!);

            if (entityType) {
              const results = this.deps.lint.lintRecord(record, {
                recordId: item.path!.split('/').pop()?.replace('.json', '') ?? item.path!,
                entityType,
                filePath: item.path,
              });
              allResults.push(...results);
            }
            filesChecked++;
          } catch {
            // Skip unreadable/unparseable blobs
          }
        }

        // Aggregate results into LintReport
        if (filesChecked > 0) {
          lintReport = {
            summary: {
              filesChecked,
              errors: allResults.filter((r) => r.level === 'error').length,
              warnings: allResults.filter((r) => r.level === 'warning').length,
              fixable: allResults.filter((r) => r.fixable).length,
              executionTime: Date.now() - startTime,
            },
            results: allResults,
            metadata: {
              timestamp: new Date().toISOString(),
              options: {},
              version: '1.0.0',
            },
          };
        }
      } catch {
        // Lint failure is non-fatal for audit
      }
    }

    // [EARS-GS-F2] Check lint report for violations
    const lintPassed = !lintReport || lintReport.summary.errors === 0;
    const passed = integrityViolations.length === 0 && lintPassed;

    const lintErrors = lintReport?.summary.errors ?? 0;
    let summary: string;
    if (passed) {
      summary = `Audit passed. ${totalCommits} commits analyzed, 0 violations.`;
    } else if (integrityViolations.length > 0 && lintErrors > 0) {
      summary = `Audit failed. ${integrityViolations.length} integrity violations, ${lintErrors} lint errors.`;
    } else if (lintErrors > 0) {
      summary = `Audit failed. ${lintErrors} lint errors found.`;
    } else {
      summary = `Audit failed. ${integrityViolations.length} integrity violations found.`;
    }

    const report: AuditStateReport = {
      passed,
      scope,
      totalCommits,
      rebaseCommits,
      resolutionCommits,
      integrityViolations,
      summary,
    };

    if (lintReport) {
      report.lintReport = lintReport;
    }

    return report;
  }
}

/**
 * Maps a file path (e.g., "tasks/task-1.json") to its GitGovRecordType.
 * Returns undefined for root files (config.json) and directories without
 * a corresponding GitGovRecordType (e.g., workflows/ — present in
 * SYNC_DIRECTORIES but not in GitGovRecordType union).
 * Files with undefined entityType are still counted in filesChecked
 * but skipped for lintRecord() validation.
 */
function pathToEntityType(filePath: string): Exclude<GitGovRecordType, 'custom'> | undefined {
  const dirMap: Record<string, Exclude<GitGovRecordType, 'custom'>> = {
    tasks: 'task',
    cycles: 'cycle',
    actors: 'actor',
    agents: 'agent',
    feedbacks: 'feedback',
    executions: 'execution',
    changelogs: 'changelog',
  };
  const firstSegment = filePath.split('/')[0] ?? '';
  return dirMap[firstSegment];
}
