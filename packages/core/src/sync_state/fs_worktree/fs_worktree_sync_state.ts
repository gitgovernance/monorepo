import type { ISyncStateModule } from '../sync_state';
import type {
  SyncStatePushOptions,
  SyncStatePushResult,
  SyncStatePullOptions,
  SyncStatePullResult,
  SyncStateResolveOptions,
  SyncStateResolveResult,
  IntegrityViolation,
  AuditStateOptions,
  AuditStateReport,
  ConflictDiff,
  ConflictFileDiff,
  StateDeltaFile,
} from '../sync_state.types';
import {
  SYNC_DIRECTORIES,
  SYNC_ROOT_FILES,
  SYNC_ALLOWED_EXTENSIONS,
  SYNC_EXCLUDED_PATTERNS,
  LOCAL_ONLY_FILES,
} from '../sync_state.types';
import type { FsWorktreeSyncStateConfig, FsWorktreeSyncStateDependencies, WorktreeHealthResult } from './fs_worktree_sync_state.types';
import { WORKTREE_DIR_NAME, DEFAULT_STATE_BRANCH } from './fs_worktree_sync_state.types';
import type { ExecOptions } from '../../git/types';
import { createLogger } from '../../logger/logger';
import {
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  RebaseAlreadyInProgressError,
  ActorIdentityMismatchError,
  WorktreeSetupError,
  StateBranchSetupError,
} from '../sync_state.errors';
import path from 'path';
import { promises as fsPromises, existsSync } from 'fs';

const logger = createLogger('[WorktreeSyncState] ');

// ═══════════════════════════════════════════════════════════
// Standalone helpers (same logic as FsSyncStateModule)
// ═══════════════════════════════════════════════════════════

/**
 * Check if a file should be synced to gitgov-state.
 * Returns true only for allowed *.json files in SYNC_DIRECTORIES or SYNC_ROOT_FILES.
 */
function shouldSyncFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);

  if (!SYNC_ALLOWED_EXTENSIONS.includes(ext as typeof SYNC_ALLOWED_EXTENSIONS[number])) {
    return false;
  }

  for (const pattern of SYNC_EXCLUDED_PATTERNS) {
    if (pattern.test(fileName)) {
      return false;
    }
  }

  if (LOCAL_ONLY_FILES.includes(fileName as typeof LOCAL_ONLY_FILES[number])) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  const gitgovIndex = parts.findIndex(p => p === '.gitgov');

  let relativeParts: string[];
  if (gitgovIndex !== -1) {
    relativeParts = parts.slice(gitgovIndex + 1);
  } else {
    const syncDirIndex = parts.findIndex(p =>
      SYNC_DIRECTORIES.includes(p as typeof SYNC_DIRECTORIES[number])
    );
    if (syncDirIndex !== -1) {
      relativeParts = parts.slice(syncDirIndex);
    } else if (SYNC_ROOT_FILES.includes(fileName as typeof SYNC_ROOT_FILES[number])) {
      return true;
    } else {
      return false;
    }
  }

  if (relativeParts.length === 1) {
    return SYNC_ROOT_FILES.includes(relativeParts[0] as typeof SYNC_ROOT_FILES[number]);
  } else if (relativeParts.length >= 2) {
    const dirName = relativeParts[0];
    return SYNC_DIRECTORIES.includes(dirName as typeof SYNC_DIRECTORIES[number]);
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// FsWorktreeSyncStateModule
// ═══════════════════════════════════════════════════════════

/**
 * Worktree-based implementation of ISyncStateModule.
 *
 * Uses a permanent git worktree at <repoRoot>/.gitgov-worktree/ to
 * sync state with the gitgov-state branch. Eliminates branch switching,
 * stash, and temp directories.
 *
 * @see fs_worktree_sync_state_module.md for EARS specifications
 */
export class FsWorktreeSyncStateModule implements ISyncStateModule {
  private readonly deps: FsWorktreeSyncStateDependencies;
  private readonly repoRoot: string;
  private readonly stateBranchName: string;
  private readonly worktreePath: string;
  private readonly gitgovPath: string;

  constructor(deps: FsWorktreeSyncStateDependencies, config: FsWorktreeSyncStateConfig) {
    if (!deps.git) throw new Error('GitModule is required for FsWorktreeSyncStateModule');
    if (!deps.config) throw new Error('ConfigManager is required for FsWorktreeSyncStateModule');
    if (!deps.identity) throw new Error('IdentityAdapter is required for FsWorktreeSyncStateModule');
    if (!deps.lint) throw new Error('LintModule is required for FsWorktreeSyncStateModule');
    if (!deps.indexer) throw new Error('IndexerAdapter is required for FsWorktreeSyncStateModule');

    if (!config.repoRoot) throw new Error('repoRoot is required');

    this.deps = deps;
    this.repoRoot = config.repoRoot;
    this.stateBranchName = config.stateBranchName ?? DEFAULT_STATE_BRANCH;
    this.worktreePath = config.worktreePath ?? path.join(this.repoRoot, WORKTREE_DIR_NAME);
    this.gitgovPath = path.join(this.worktreePath, '.gitgov');
  }

  // ═══════════════════════════════════════════════
  // Section A: Worktree Management (WTSYNC-A1..A6)
  // ═══════════════════════════════════════════════

  /** [WTSYNC-A4] Returns the worktree path */
  getWorktreePath(): string {
    return this.worktreePath;
  }

  /** [WTSYNC-A1..A6] Ensures worktree exists and is healthy */
  async ensureWorktree(): Promise<void> {
    const health = await this.checkWorktreeHealth();

    if (health.healthy) {
      logger.debug('Worktree is healthy');
      return; // [WTSYNC-A2]
    }

    if (health.exists && !health.healthy) {
      // [WTSYNC-A3] Corrupted — remove and recreate
      logger.warn(`Worktree corrupted: ${health.error}. Recreating...`);
      await this.removeWorktree();
    }

    // [WTSYNC-A5/A6] Ensure branch exists before creating worktree
    await this.ensureStateBranch();

    // [WTSYNC-A1] Create worktree
    try {
      logger.info(`Creating worktree at ${this.worktreePath}`);
      await this.execGit(['worktree', 'add', this.worktreePath, this.stateBranchName]);
    } catch (error) {
      throw new WorktreeSetupError(
        'Failed to create worktree',
        this.worktreePath,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /** Check worktree health */
  private async checkWorktreeHealth(): Promise<WorktreeHealthResult> {
    if (!existsSync(this.worktreePath)) {
      return { exists: false, healthy: false, path: this.worktreePath };
    }

    const gitFile = path.join(this.worktreePath, '.git');
    if (!existsSync(gitFile)) {
      return {
        exists: true,
        healthy: false,
        path: this.worktreePath,
        error: '.git file missing in worktree',
      };
    }

    try {
      const branch = (await this.execGit(['-C', this.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      if (branch !== this.stateBranchName) {
        return {
          exists: true,
          healthy: false,
          path: this.worktreePath,
          error: `Wrong branch: ${branch}, expected ${this.stateBranchName}`,
        };
      }
    } catch {
      return {
        exists: true,
        healthy: false,
        path: this.worktreePath,
        error: 'Cannot determine branch',
      };
    }

    return { exists: true, healthy: true, path: this.worktreePath };
  }

  /** Remove worktree cleanly */
  private async removeWorktree(): Promise<void> {
    try {
      await this.execGit(['worktree', 'remove', this.worktreePath, '--force']);
    } catch {
      // Fallback: manual cleanup
      await fsPromises.rm(this.worktreePath, { recursive: true, force: true });
      await this.execGit(['worktree', 'prune']);
    }
  }

  // ═══════════════════════════════════════════════
  // Section B: Push Operations (WTSYNC-B1..B14)
  // ═══════════════════════════════════════════════

  /** [WTSYNC-B1..B14] Push local state to remote */
  async pushState(options: SyncStatePushOptions): Promise<SyncStatePushResult> {
    const { actorId, dryRun = false, force = false } = options;
    const log = (msg: string) => logger.debug(`[pushState] ${msg}`);

    // Guard: refuse push if rebase is in progress (mirrors git behavior)
    if (await this.isRebaseInProgress()) {
      throw new RebaseAlreadyInProgressError();
    }

    // [WTSYNC-B1] Verify actor identity
    const currentActor = await this.deps.identity.getCurrentActor();
    if (currentActor.id !== actorId) {
      throw new ActorIdentityMismatchError(actorId, currentActor.id);
    }

    // Ensure worktree is ready
    await this.ensureWorktree();

    // [WTSYNC-B2] Lint validation on source records
    const lintReport = await this.deps.lint.lint();
    if (lintReport.summary.errors > 0) {
      return {
        success: false,
        filesSynced: 0,
        sourceBranch: options.sourceBranch ?? 'current',
        commitHash: null,
        commitMessage: null,
        conflictDetected: false,
        error: `Lint validation failed: ${lintReport.summary.errors} error(s)`,
      };
    }

    // [WTSYNC-B3] Calculate delta (changed files in worktree, filtered by syncable)
    const rawDelta = await this.calculateFileDelta();
    const delta = rawDelta.filter(f => shouldSyncFile(f.file));
    log(`Delta: ${delta.length} syncable files (${rawDelta.length} total)`);

    if (delta.length === 0) {
      return {
        success: true,
        filesSynced: 0,
        sourceBranch: options.sourceBranch ?? 'current',
        commitHash: null,
        commitMessage: null,
        conflictDetected: false,
      };
    }

    // [WTSYNC-B12] Dry run — return delta without committing
    if (dryRun) {
      return {
        success: true,
        filesSynced: delta.length,
        sourceBranch: options.sourceBranch ?? 'current',
        commitHash: null,
        commitMessage: '[dry-run] Would commit changes',
        conflictDetected: false,
      };
    }

    // [WTSYNC-B4/B9/B10/B11] Selectively stage only syncable files (including deletions)
    const stagedCount = await this.stageSyncableFiles(delta, log);

    // [WTSYNC-B5] Commit in worktree
    const commitMessage = `gitgov: sync state [actor:${actorId}]`;
    await this.execInWorktree(['commit', '-m', commitMessage]);
    const commitHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();
    log(`Committed: ${commitHash}`);

    // [WTSYNC-B6/B13] Reconcile with remote (unless force)
    let implicitPull: { hasChanges: boolean; filesUpdated: number; reindexed: boolean } | undefined;

    // Check if remote branch exists (first push = no remote branch yet)
    let remoteBranchExists = false;
    if (!force) {
      try {
        await this.execGit(['ls-remote', '--exit-code', 'origin', this.stateBranchName]);
        remoteBranchExists = true;
      } catch {
        // Remote branch doesn't exist — first push, skip reconciliation
      }
    }

    if (!force && remoteBranchExists) {
      try {
        const beforeHash = commitHash;
        await this.execInWorktree(['pull', '--rebase', 'origin', this.stateBranchName]);
        const afterHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();

        if (beforeHash !== afterHash) {
          // [WTSYNC-B8] Implicit pull happened
          let filesUpdated = 0;
          try {
            const diffOutput = await this.execInWorktree([
              'diff', '--name-only', beforeHash, afterHash, '--', '.gitgov/',
            ]);
            filesUpdated = diffOutput.trim().split('\n').filter(Boolean).length;
          } catch {
            // Diff failed — count as 0
          }

          implicitPull = {
            hasChanges: true,
            filesUpdated,
            reindexed: true,
          };
          await this.reindex();
          log(`Implicit pull: ${filesUpdated} files updated`);
        }
      } catch {
        // [WTSYNC-B7] Rebase conflict
        const affectedFiles = await this.getConflictedFiles();
        return {
          success: false,
          filesSynced: stagedCount,
          sourceBranch: options.sourceBranch ?? 'current',
          commitHash,
          commitMessage,
          conflictDetected: true,
          conflictInfo: {
            type: 'rebase_conflict',
            affectedFiles,
            message: 'Rebase conflict detected during push reconciliation',
            resolutionSteps: [
              `Edit conflicted files in ${this.worktreePath}/.gitgov/`,
              'Run `gitgov sync resolve --reason "..."` to finalize',
            ],
          },
          error: 'Rebase conflict during push',
        };
      }
    }

    // [WTSYNC-B14] Push to remote
    await this.execInWorktree(['push', 'origin', this.stateBranchName]);
    log('Pushed to remote');

    const finalHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();

    const result: SyncStatePushResult = {
      success: true,
      filesSynced: stagedCount,
      sourceBranch: options.sourceBranch ?? 'current',
      commitHash: finalHash,
      commitMessage,
      conflictDetected: false,
    };
    if (implicitPull) {
      result.implicitPull = implicitPull;
    }
    return result;
  }

  // ═══════════════════════════════════════════════
  // Section C: Pull Operations (WTSYNC-C1..C8)
  // ═══════════════════════════════════════════════

  /** [WTSYNC-C1..C8] Pull remote state */
  async pullState(options?: SyncStatePullOptions): Promise<SyncStatePullResult> {
    const { forceReindex = false, force = false } = options ?? {};
    const log = (msg: string) => logger.debug(`[pullState] ${msg}`);

    // Guard: refuse pull if rebase is in progress (mirrors git behavior)
    if (await this.isRebaseInProgress()) {
      throw new RebaseAlreadyInProgressError();
    }

    // [WTSYNC-C1] Ensure worktree
    await this.ensureWorktree();

    // [WTSYNC-C6] Auto-commit local changes before pull (like git add+commit before pull --rebase)
    // Only stage syncable files — LOCAL_ONLY and excluded files must NOT be committed
    if (!force) {
      const statusRaw = await this.execInWorktree(['status', '--porcelain', '-uall', '.gitgov/']);
      const statusLines = statusRaw.split('\n').filter(line => line.length >= 4);
      const syncableChanges = statusLines.filter(l => shouldSyncFile(l.slice(3)));
      if (syncableChanges.length > 0) {
        log(`Auto-committing ${syncableChanges.length} local changes before pull`);
        for (const line of syncableChanges) {
          const filePath = line.slice(3);
          await this.execInWorktree(['add', '-f', '--', filePath]);
        }
        await this.execInWorktree(['commit', '-m', 'state: Auto-commit local changes before pull']);
      }
    }

    // [WTSYNC-C7] Force: discard local changes but preserve LOCAL_ONLY and excluded files
    if (force) {
      try {
        await this.execInWorktree(['checkout', '.gitgov/']);
        // Clean untracked syncable files, preserving LOCAL_ONLY files and excluded patterns (.key, .backup, etc.)
        await this.execInWorktree([
          'clean', '-fd',
          ...LOCAL_ONLY_FILES.flatMap(f => ['-e', f]),
          '-e', '*.key', '-e', '*.backup', '-e', '*.backup-*', '-e', '*.tmp', '-e', '*.bak',
          '.gitgov/',
        ]);
        log('Force: discarded local changes');
      } catch {
        // No changes to discard
      }
    }

    // [WTSYNC-C2] Fetch from remote
    try {
      await this.execInWorktree(['fetch', 'origin', this.stateBranchName]);
    } catch {
      log('Fetch failed (possibly no remote configured)');
    }

    // [WTSYNC-C8] Check if there are remote changes
    const localHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();
    let remoteHash: string;
    try {
      remoteHash = (await this.execInWorktree(['rev-parse', `origin/${this.stateBranchName}`])).trim();
    } catch {
      // No remote tracking — nothing to pull
      if (forceReindex) {
        await this.reindex();
        return { success: true, hasChanges: false, filesUpdated: 0, reindexed: true, conflictDetected: false };
      }
      return { success: true, hasChanges: false, filesUpdated: 0, reindexed: false, conflictDetected: false };
    }

    if (localHash === remoteHash && !forceReindex) {
      log('No remote changes');
      return { success: true, hasChanges: false, filesUpdated: 0, reindexed: false, conflictDetected: false };
    }

    // [WTSYNC-C3] Pull --rebase
    if (localHash !== remoteHash) {
      try {
        await this.execInWorktree(['pull', '--rebase', 'origin', this.stateBranchName]);
      } catch {
        // [WTSYNC-C4] Conflict
        const affectedFiles = await this.getConflictedFiles();
        return {
          success: false,
          hasChanges: true,
          filesUpdated: 0,
          reindexed: false,
          conflictDetected: true,
          conflictInfo: {
            type: 'rebase_conflict',
            affectedFiles,
            message: 'Rebase conflict detected during pull',
            resolutionSteps: [
              `Edit conflicted files in ${this.worktreePath}/.gitgov/`,
              'Run `gitgov sync resolve --reason "..."` to finalize',
            ],
          },
          error: 'Rebase conflict during pull',
        };
      }
    }

    // Count updated files
    let filesUpdated = 0;
    try {
      const diffOutput = await this.execInWorktree([
        'diff', '--name-only', localHash, 'HEAD', '--', '.gitgov/',
      ]);
      filesUpdated = diffOutput.trim().split('\n').filter(Boolean).length;
    } catch {
      // Diff failed
    }

    // [WTSYNC-C5] Re-index
    await this.reindex();
    log(`Pulled: ${filesUpdated} files updated`);

    return {
      success: true,
      hasChanges: true,
      filesUpdated,
      reindexed: true,
      conflictDetected: false,
    };
  }

  // ═══════════════════════════════════════════════
  // Section D: Resolve Operations (WTSYNC-D1..D7)
  // ═══════════════════════════════════════════════

  /** [WTSYNC-D1..D7] Resolve rebase conflict */
  async resolveConflict(options: SyncStateResolveOptions): Promise<SyncStateResolveResult> {
    const { reason, actorId } = options;

    // [WTSYNC-D1] Verify rebase in progress
    if (!(await this.isRebaseInProgress())) {
      throw new NoRebaseInProgressError();
    }

    // Verify actor identity
    const currentActor = await this.deps.identity.getCurrentActor();
    if (currentActor.id !== actorId) {
      throw new ActorIdentityMismatchError(actorId, currentActor.id);
    }

    // [WTSYNC-D2/D3] Check conflict markers
    const conflictedFiles = await this.getConflictedFiles();
    const gitgovConflictFiles = conflictedFiles
      .filter(f => f.startsWith('.gitgov/'))
      .map(f => f.replace(/^\.gitgov\//, ''));

    const markers = await this.checkConflictMarkers(
      gitgovConflictFiles.length > 0 ? gitgovConflictFiles : conflictedFiles
    );
    if (markers.length > 0) {
      throw new ConflictMarkersPresentError(markers);
    }

    // [WTSYNC-D4] Re-sign resolved records
    await this.resignResolvedRecords(gitgovConflictFiles, actorId, reason);

    // [WTSYNC-D5] Continue rebase
    await this.execInWorktree(['add', '.gitgov/']);
    await this.execInWorktree(['rebase', '--continue'], { env: { GIT_EDITOR: 'true' } });
    const rebaseCommitHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();

    // [WTSYNC-D6] Create resolution commit
    const resolutionMessage = `gitgov: resolve conflict [actor:${actorId}] reason: ${reason}`;
    await this.execInWorktree(['commit', '--allow-empty', '-m', resolutionMessage]);
    const resolutionCommitHash = (await this.execInWorktree(['rev-parse', 'HEAD'])).trim();

    // [WTSYNC-D7] Push to remote
    await this.execInWorktree(['push', 'origin', this.stateBranchName]);

    // Re-index after resolve
    await this.reindex();

    return {
      success: true,
      rebaseCommitHash,
      resolutionCommitHash,
      conflictsResolved: conflictedFiles.length,
      resolvedBy: actorId,
      reason,
    };
  }

  // ═══════════════════════════════════════════════
  // Section E: Integrity and Audit (WTSYNC-E1..E8)
  // ═══════════════════════════════════════════════

  /** [WTSYNC-E8] Get configured state branch name */
  async getStateBranchName(): Promise<string> {
    return this.stateBranchName;
  }

  /** [WTSYNC-A5/A6] Ensure state branch exists */
  async ensureStateBranch(): Promise<void> {
    // Check if branch exists locally
    try {
      await this.execGit(['rev-parse', '--verify', this.stateBranchName]);
      return; // Exists locally
    } catch {
      // Not local
    }

    // [WTSYNC-A5] Check remote
    try {
      await this.execGit(['rev-parse', '--verify', `origin/${this.stateBranchName}`]);
      // Exists on remote, create local tracking
      await this.execGit(['branch', this.stateBranchName, `origin/${this.stateBranchName}`]);
      return;
    } catch {
      // Not on remote either
    }

    // [WTSYNC-A6] Create orphan branch via plumbing (no branch switching)
    try {
      const emptyTree = (await this.execGit(['hash-object', '-t', 'tree', '/dev/null'])).trim();
      const commitHash = (await this.execGit([
        'commit-tree', emptyTree, '-m', 'gitgov: initialize state branch',
      ])).trim();
      await this.execGit(['update-ref', `refs/heads/${this.stateBranchName}`, commitHash]);
    } catch (error) {
      throw new StateBranchSetupError(
        'Failed to create orphan state branch',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /** Returns pending syncable changes not yet pushed (filters by shouldSyncFile) */
  async getPendingChanges(): Promise<StateDeltaFile[]> {
    await this.ensureWorktree();
    const allChanges = await this.calculateFileDelta();
    return allChanges.filter(f => shouldSyncFile(f.file));
  }

  /** Calculate delta between source and worktree state branch */
  async calculateStateDelta(_sourceBranch: string): Promise<StateDeltaFile[]> {
    await this.ensureWorktree();
    try {
      const diff = await this.execInWorktree([
        'diff', '--name-status', `origin/${this.stateBranchName}`, 'HEAD', '--', '.gitgov/',
      ]);
      return this.parseDiffOutput(diff);
    } catch {
      return [];
    }
  }

  /** [WTSYNC-E6] Check if rebase is in progress in worktree */
  async isRebaseInProgress(): Promise<boolean> {
    try {
      const gitContent = await fsPromises.readFile(path.join(this.worktreePath, '.git'), 'utf8');
      const gitDir = gitContent.replace('gitdir: ', '').trim();
      const resolvedGitDir = path.resolve(this.worktreePath, gitDir);

      return (
        existsSync(path.join(resolvedGitDir, 'rebase-merge')) ||
        existsSync(path.join(resolvedGitDir, 'rebase-apply'))
      );
    } catch {
      return false;
    }
  }

  /** Check for conflict markers in files */
  async checkConflictMarkers(filePaths: string[]): Promise<string[]> {
    const filesWithMarkers: string[] = [];
    for (const filePath of filePaths) {
      const fullPath = path.join(this.gitgovPath, filePath);
      try {
        const content = await fsPromises.readFile(fullPath, 'utf8');
        if (content.includes('<<<<<<<') || content.includes('>>>>>>>')) {
          filesWithMarkers.push(filePath);
        }
      } catch {
        // File doesn't exist
      }
    }
    return filesWithMarkers;
  }

  /** [WTSYNC-E7] Get structured conflict diff */
  async getConflictDiff(filePaths?: string[]): Promise<ConflictDiff> {
    const files = filePaths ?? await this.getConflictedFiles();
    const diffFiles: ConflictFileDiff[] = [];

    for (const file of files) {
      const fullPath = path.join(this.worktreePath, file);
      try {
        const content = await fsPromises.readFile(fullPath, 'utf8');

        // Parse conflict markers to extract local/remote/base
        let localContent = '';
        let remoteContent = '';
        let baseContent: string | null = null;

        const lines = content.split('\n');
        let section: 'none' | 'local' | 'base' | 'remote' = 'none';

        for (const line of lines) {
          if (line.startsWith('<<<<<<<')) {
            section = 'local';
          } else if (line.startsWith('|||||||')) {
            section = 'base';
            baseContent = '';
          } else if (line.startsWith('=======')) {
            section = 'remote';
          } else if (line.startsWith('>>>>>>>')) {
            section = 'none';
          } else {
            switch (section) {
              case 'local': localContent += line + '\n'; break;
              case 'base': baseContent = (baseContent ?? '') + line + '\n'; break;
              case 'remote': remoteContent += line + '\n'; break;
            }
          }
        }

        diffFiles.push({
          filePath: file,
          localContent,
          remoteContent,
          baseContent,
        });
      } catch {
        // File not readable
      }
    }

    return {
      files: diffFiles,
      message: `${files.length} file(s) in conflict`,
      resolutionSteps: [
        'Edit files to resolve conflicts',
        'Run `gitgov sync resolve --reason "..."` to finalize',
      ],
    };
  }

  /** [WTSYNC-E1] Verify resolution integrity */
  async verifyResolutionIntegrity(): Promise<IntegrityViolation[]> {
    await this.ensureWorktree();

    const violations: IntegrityViolation[] = [];

    try {
      const logOutput = await this.execInWorktree([
        'log', '--format=%H|%s|%ai|%an', this.stateBranchName,
      ]);

      const commits = logOutput.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('|');
        return {
          hash: parts[0] ?? '',
          subject: parts[1] ?? '',
          date: parts[2] ?? '',
          author: parts[3] ?? '',
        };
      });

      // Find rebase commits without corresponding resolution
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i]!;
        if (commit.subject.includes('rebase') && !commit.subject.includes('resolve')) {
          // Check if next commit is a resolution
          const nextCommit = commits[i - 1]; // Newer commit (log is newest-first)
          if (!nextCommit || !nextCommit.subject.includes('resolve')) {
            violations.push({
              rebaseCommitHash: commit.hash,
              commitMessage: commit.subject,
              timestamp: commit.date,
              author: commit.author,
            });
          }
        }
      }
    } catch {
      // Log parsing failed — no violations detectable
    }

    return violations;
  }

  /** [WTSYNC-E1..E5] Audit state */
  async auditState(options?: AuditStateOptions): Promise<AuditStateReport> {
    const {
      scope = 'all',
      verifySignatures = true,
      verifyChecksums = true,
      verifyExpectedFiles = true,
      expectedFilesScope,
      filePaths,
    } = options ?? {};

    if (expectedFilesScope === 'all-commits') {
      logger.debug('expectedFilesScope "all-commits" treated as "head" in worktree module');
    }

    await this.ensureWorktree();

    // [WTSYNC-E1] Resolution integrity
    const integrityViolations = await this.verifyResolutionIntegrity();

    // [WTSYNC-E2/E3] Lint report (signatures, checksums)
    let lintReport;
    if (verifySignatures || verifyChecksums) {
      lintReport = await this.deps.lint.lint({
        validateChecksums: verifyChecksums,
        validateSignatures: verifySignatures,
        validateReferences: false,
        concurrent: true,
      });
    }

    // [WTSYNC-E4] Expected files verification
    if (verifyExpectedFiles) {
      if (filePaths && filePaths.length > 0) {
        // Scoped: only verify specified files exist
        for (const fp of filePaths) {
          if (!existsSync(path.join(this.gitgovPath, fp))) {
            integrityViolations.push({
              rebaseCommitHash: '',
              commitMessage: `Missing expected file: ${fp}`,
              timestamp: new Date().toISOString(),
              author: '',
            });
          }
        }
      } else {
        const expectedDirs = ['tasks', 'cycles', 'actors'];
        for (const dir of expectedDirs) {
          if (!existsSync(path.join(this.gitgovPath, dir))) {
            integrityViolations.push({
              rebaseCommitHash: '',
              commitMessage: `Missing expected directory: ${dir}`,
              timestamp: new Date().toISOString(),
              author: '',
            });
          }
        }

        if (!existsSync(path.join(this.gitgovPath, 'config.json'))) {
          integrityViolations.push({
            rebaseCommitHash: '',
            commitMessage: 'Missing expected file: config.json',
            timestamp: new Date().toISOString(),
            author: '',
          });
        }
      }
    }

    // Commit analysis
    let totalCommits = 0;
    let rebaseCommits = 0;
    let resolutionCommits = 0;

    try {
      const logOutput = await this.execInWorktree(['log', '--oneline', this.stateBranchName]);
      const lines = logOutput.trim().split('\n').filter(Boolean);
      totalCommits = lines.length;
      rebaseCommits = lines.filter(l => l.includes('rebase')).length;
      resolutionCommits = lines.filter(l => l.includes('resolve')).length;
    } catch {
      // Empty branch or no log
    }

    const passed = integrityViolations.length === 0 && (lintReport ? lintReport.summary.errors === 0 : true);

    const report: AuditStateReport = {
      passed,
      scope,
      totalCommits,
      rebaseCommits,
      resolutionCommits,
      integrityViolations,
      summary: passed
        ? `Audit passed: ${totalCommits} commits, no violations`
        : `Audit failed: ${integrityViolations.length} integrity violations`,
    };
    if (lintReport) {
      report.lintReport = lintReport;
    }
    return report;
  }

  // ═══════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════

  /** Execute git command in repo root (throws on non-zero exit) */
  private async execGit(args: string[], options?: ExecOptions): Promise<string> {
    const result = await this.deps.git.exec('git', args, options);
    if (result.exitCode !== 0) {
      throw new Error(`Git command failed (exit ${result.exitCode}): git ${args.join(' ')} => ${result.stderr}`);
    }
    return result.stdout;
  }

  /** Execute git command in worktree context (throws on non-zero exit) */
  private async execInWorktree(args: string[], options?: ExecOptions): Promise<string> {
    return this.execGit(['-C', this.worktreePath, ...args], options);
  }

  /** Calculate file delta (uncommitted changes in worktree) */
  private async calculateFileDelta(): Promise<StateDeltaFile[]> {
    try {
      // -uall: list individual files (not collapsed directories)
      // --ignored=traditional: detect files even if .gitgov/ is in .gitignore (stale worktrees)
      const status = await this.execInWorktree([
        'status', '--porcelain', '-uall', '--ignored=traditional', '.gitgov/',
      ]);
      return this.parseStatusOutput(status);
    } catch {
      return [];
    }
  }

  /** [WTSYNC-B4/B9/B10/B11] Stage only syncable files from delta (adds, mods, and deletions) */
  private async stageSyncableFiles(
    delta: StateDeltaFile[],
    log: (msg: string) => void,
  ): Promise<number> {
    let stagedCount = 0;

    for (const file of delta) {
      if (!shouldSyncFile(file.file)) {
        log(`Skipped (not syncable): ${file.file}`);
        continue;
      }

      if (file.status === 'D') {
        // Deleted files: use git rm to stage the deletion
        await this.execInWorktree(['rm', '--', file.file]);
      } else {
        // Added/Modified files: use git add -f (.gitgov/ may be in .gitignore by design)
        await this.execInWorktree(['add', '-f', '--', file.file]);
      }
      log(`Staged (${file.status}): ${file.file}`);
      stagedCount++;
    }

    return stagedCount;
  }

  /** Get list of conflicted files during rebase */
  private async getConflictedFiles(): Promise<string[]> {
    try {
      const status = await this.execInWorktree(['diff', '--name-only', '--diff-filter=U']);
      return status.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Re-sign records after conflict resolution */
  private async resignResolvedRecords(
    filePaths: string[],
    actorId: string,
    reason: string,
  ): Promise<void> {
    for (const filePath of filePaths) {
      const fullPath = path.join(this.gitgovPath, filePath);
      try {
        const content = await fsPromises.readFile(fullPath, 'utf8');
        const record = JSON.parse(content);

        // Re-sign with identity adapter (full 4-arg signature)
        const signedRecord = await this.deps.identity.signRecord(record, actorId, 'resolver', reason);

        await fsPromises.writeFile(fullPath, JSON.stringify(signedRecord, null, 2));
      } catch {
        // File not parseable or doesn't exist — skip
      }
    }
  }

  /** Re-index records from worktree */
  private async reindex(): Promise<void> {
    try {
      await this.deps.indexer.generateIndex();
    } catch {
      logger.warn('Re-index failed');
    }
  }

  /** Parse git diff --name-status output */
  private parseDiffOutput(diff: string): StateDeltaFile[] {
    return diff.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split('\t');
      const status = parts[0] as 'A' | 'M' | 'D';
      const file = parts[1] || parts[0]!.slice(2);
      return { status, file };
    });
  }

  /** Parse git status --porcelain output */
  private parseStatusOutput(status: string): StateDeltaFile[] {
    // NOTE: Do NOT .trim() before split — the leading space in XY codes is significant
    return status.split('\n').filter(line => line.length >= 4).map(line => {
      const xy = line.slice(0, 2);
      const file = line.slice(3);
      let statusChar: 'A' | 'M' | 'D';
      if (xy.includes('?') || xy.includes('!')) {
        statusChar = 'A'; // Untracked or ignored = new file to add
      } else if (xy.includes('D')) {
        statusChar = 'D';
      } else {
        statusChar = 'M';
      }
      return { status: statusChar, file };
    });
  }
}
