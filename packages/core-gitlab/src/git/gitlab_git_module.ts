/**
 * GitLabGitModule - GitLab REST API implementation of IGitModule
 *
 * Implements IGitModule for SaaS environments where direct filesystem
 * and git CLI are not available. Uses GitLab REST API via Gitbeaker.
 *
 * Key advantage over GitHubGitModule: commit() is 1 API call via
 * Commits API actions[] (vs 6 calls in GitHub).
 *
 * Method categories:
 * - Category A (Implement): Real API calls
 * - Category B (No-op): Return sensible defaults
 * - Category C (Not Supported): Throw GitError
 *
 * @module git/gitlab_git_module
 */

import type { GitbeakerClient } from '../gitlab';
import { isGitbeakerRequestError } from '../gitlab';
import type { GitLabGitModuleOptions } from './gitlab_git_module.types';

// Import types from @gitgov/core via path mapping
import type { IGitModule } from '@gitgov/core/git';
import type {
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from '@gitgov/core/git/types';
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '@gitgov/core/git/errors';

export class GitLabGitModule implements IGitModule {
  private readonly projectId: number | string;
  private readonly defaultBranch: string;
  private readonly api: GitbeakerClient;

  /** Staging buffer: path → content (null = delete) */
  private stagingBuffer: Map<string, string | null> = new Map();

  /** Tracks which staged files are new (from contentMap) vs existing (from getFileContent) */
  private stagedFileIsNew: Set<string> = new Set();

  /** Active branch for operations (switchable via checkoutBranch) */
  private activeRef: string;

  // [EARS-I2] Default branch is gitgov-state
  constructor(options: GitLabGitModuleOptions) {
    this.projectId = options.projectId;
    this.api = options.api;
    this.defaultBranch = options.defaultBranch ?? 'gitgov-state';
    this.activeRef = this.defaultBranch;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /** Category C: Not supported via GitLab API */
  private notSupported(method: string): never {
    throw new GitError(`${method} is not supported via GitLab API`);
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

  private translateError(error: unknown, context: string): never {
    if (error instanceof GitError) throw error;
    if (isGitbeakerRequestError(error)) {
      const status = this.extractStatus(error);
      if (status === 401 || status === 403) {
        throw new GitError(`authentication/permission error (${status}): ${context}`);
      }
      if (status !== undefined && status >= 500) {
        throw new GitError(`GitLab server error (${status}): ${context}`);
      }
      throw new GitError(`GitLab API error (${status}): ${context}`);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new GitError(`network error: ${msg}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: READ OPERATIONS (EARS-A1 to A6)
  // ═══════════════════════════════════════════════════════════════

  /**
   * [EARS-A1] Read file content via Files API + base64 decode
   * [EARS-A2] Fallback to Blobs API for files >1MB
   */
  async getFileContent(commitHash: string, filePath: string): Promise<string> {
    try {
      const file = await this.api.RepositoryFiles.show(this.projectId, filePath, commitHash);
      const content = String(file.content ?? '');

      if (content) {
        return Buffer.from(content, 'base64').toString('utf-8');
      }

      // [EARS-A2] Fallback to Blobs API for >1MB
      const blobId = String(file.blob_id ?? '');
      if (blobId) {
        const blob = await this.api.Repositories.showBlob(this.projectId, blobId);
        return Buffer.from(String(blob.content), 'base64').toString('utf-8');
      }

      throw new GitError(`File has no content: ${filePath}`);
    } catch (error: unknown) {
      if (error instanceof GitError) throw error;
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) throw new FileNotFoundError(filePath, commitHash);
      }
      this.translateError(error, `getFileContent ${filePath}`);
    }
  }

  /**
   * [EARS-A3] Get commit SHA from branch via Branches API
   * [EARS-B4] Return SHA directly if already a 40-char hex
   */
  async getCommitHash(ref: string = this.activeRef): Promise<string> {
    if (/^[0-9a-f]{40}$/i.test(ref)) {
      return ref;
    }

    try {
      const branch = await this.api.Branches.show(this.projectId, ref);
      return String(branch.commit.id);
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) throw new BranchNotFoundError(ref);
      }
      this.translateError(error, `getCommitHash ${ref}`);
    }
  }

  /**
   * [EARS-A4] List changed files via Compare API
   */
  async getChangedFiles(fromCommit: string, toCommit: string, pathFilter: string): Promise<ChangedFile[]> {
    try {
      const data = await this.api.Repositories.compare(this.projectId, fromCommit, toCommit);
      const diffs = (data.diffs ?? []) as Array<{ new_path: string; old_path: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean }>;

      const files: ChangedFile[] = diffs
        .map(d => ({
          status: (d.new_file ? 'A' : d.deleted_file ? 'D' : 'M') as 'A' | 'M' | 'D',
          file: d.new_path,
        }))
        .filter(f => !pathFilter || f.file.startsWith(pathFilter));

      return files;
    } catch (error: unknown) {
      this.translateError(error, `getChangedFiles ${fromCommit}...${toCommit}`);
    }
  }

  /**
   * [EARS-A5] Get commit history via Commits API
   */
  async getCommitHistory(branch: string, options?: GetCommitHistoryOptions): Promise<CommitInfo[]> {
    try {
      const commits = await this.api.Commits.all(this.projectId, {
        refName: branch,
        ...(options?.maxCount !== undefined && { perPage: options.maxCount }),
        ...(options?.pathFilter !== undefined && { path: options.pathFilter }),
      } as Parameters<typeof this.api.Commits.all>[1]);

      const rawCommits = commits as unknown as Array<Record<string, unknown>>;
      return rawCommits.map(c => ({
        hash: String(c['id'] ?? ''),
        message: String(c['message'] ?? ''),
        author: `${String(c['author_name'] ?? 'unknown')} <${String(c['author_email'] ?? 'unknown')}>`,
        date: String(c['authored_date'] ?? ''),
      }));
    } catch (error: unknown) {
      this.translateError(error, `getCommitHistory ${branch}`);
    }
  }

  /**
   * [EARS-B3] Get commit history between two commits via Compare API
   */
  async getCommitHistoryRange(fromHash: string, toHash: string, options?: GetCommitHistoryOptions): Promise<CommitInfo[]> {
    try {
      const data = await this.api.Repositories.compare(this.projectId, fromHash, toHash);
      const rawCommits = (data.commits ?? []) as unknown as Array<Record<string, unknown>>;

      let commits: CommitInfo[] = rawCommits.map(c => ({
        hash: String(c['id'] ?? ''),
        message: String(c['message'] ?? ''),
        author: `${String(c['author_name'] ?? 'unknown')} <${String(c['author_email'] ?? 'unknown')}>`,
        date: String(c['authored_date'] ?? ''),
      }));

      // [EARS-B3] Filter by pathFilter if specified — use diffs to identify affected paths
      if (options?.pathFilter) {
        const diffs = (data.diffs ?? []) as unknown as Array<Record<string, unknown>>;
        const affectedPaths = new Set(diffs.map(d => String(d['new_path'] ?? '')));
        const hasMatchingPath = Array.from(affectedPaths).some(f => f.startsWith(options.pathFilter!));
        if (!hasMatchingPath) {
          commits = [];
        }
      }

      if (options?.maxCount) {
        commits = commits.slice(0, options.maxCount);
      }

      return commits;
    } catch (error: unknown) {
      this.translateError(error, `getCommitHistoryRange ${fromHash}...${toHash}`);
    }
  }

  /**
   * [EARS-A6] Get commit message via Commits API
   */
  async getCommitMessage(commitHash: string): Promise<string> {
    try {
      const commit = await this.api.Commits.show(this.projectId, commitHash);
      return String(commit.message);
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) throw new GitError(`Commit not found: ${commitHash}`);
      }
      this.translateError(error, `getCommitMessage ${commitHash}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: BRANCH OPERATIONS (EARS-B1, B2)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-B1] Check if branch exists via Branches API */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.api.Branches.show(this.projectId, branchName);
      return true;
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 404) return false;
      }
      this.translateError(error, `branchExists ${branchName}`);
    }
  }

  /** [EARS-B2] List branches (remoteName ignored — project is the implicit remote) */
  async listRemoteBranches(_remoteName: string): Promise<string[]> {
    try {
      const branches = await this.api.Branches.all(this.projectId);
      return (branches as Array<{ name: string }>).map(b => b.name);
    } catch (error: unknown) {
      this.translateError(error, 'listRemoteBranches');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: WRITE OPERATIONS (EARS-C1 to C7)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-C1] Read file content and store in staging buffer */
  async add(filePaths: string[], options?: { force?: boolean; contentMap?: Record<string, string> }): Promise<void> {
    for (const filePath of filePaths) {
      if (options?.contentMap?.[filePath] !== undefined) {
        // Content provided directly — file is new (create action)
        this.stagingBuffer.set(filePath, options.contentMap[filePath]!);
        this.stagedFileIsNew.add(filePath);
      } else {
        // Read from remote — file exists (update action)
        const content = await this.getFileContent(this.activeRef, filePath);
        this.stagingBuffer.set(filePath, content);
        this.stagedFileIsNew.delete(filePath);
      }
    }
  }

  /** [EARS-C2] Mark files as deleted in staging buffer */
  async rm(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      this.stagingBuffer.set(filePath, null);
    }
  }

  /** [EARS-C7] Return staged file paths from buffer */
  async getStagedFiles(): Promise<string[]> {
    return Array.from(this.stagingBuffer.keys());
  }

  /**
   * [EARS-C6] Create branch via Branches API
   */
  async createBranch(branchName: string, startPoint?: string): Promise<void> {
    const sha = startPoint
      ? await this.getCommitHash(startPoint)
      : await this.getCommitHash(this.activeRef);

    try {
      await this.api.Branches.create(this.projectId, branchName, sha);
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        // GitLab returns 400 for existing branch (not 422 like GitHub)
        if (status === 400) throw new BranchAlreadyExistsError(branchName);
      }
      this.translateError(error, `createBranch ${branchName}`);
    }
  }

  /**
   * [EARS-C3] Commit staged changes via Commits API — 1 API call with actions[]
   * [EARS-C4] Clears staging buffer after successful commit
   * [EARS-C5] Throws if staging buffer is empty
   */
  async commit(message: string, author?: CommitAuthor): Promise<string> {
    return this.commitInternal(message, author, false);
  }

  private async commitInternal(message: string, author?: CommitAuthor, allowEmpty = false): Promise<string> {
    // [EARS-C5] Empty buffer check
    if (!allowEmpty && this.stagingBuffer.size === 0) {
      throw new GitError('Nothing to commit: staging buffer is empty');
    }

    // Build actions from staging buffer
    // [EARS-C3] Build actions from staging buffer — NO extra API calls.
    // Action type determined by add() at staging time (contentMap → create, getFileContent → update).
    const actions: Array<Record<string, unknown>> = [];

    for (const [path, content] of this.stagingBuffer) {
      if (content === null) {
        actions.push({ action: 'delete', file_path: path });
      } else {
        actions.push({
          action: this.stagedFileIsNew.has(path) ? 'create' : 'update',
          file_path: path,
          content,
        });
      }
    }

    try {
      const commitParams: Record<string, unknown> = {
        ...(author && { author_name: author.name, author_email: author.email }),
      };

      const result = await this.api.Commits.create(
        this.projectId,
        this.activeRef,
        message,
        actions as unknown as Parameters<typeof this.api.Commits.create>[3],
        commitParams,
      );

      // [EARS-C4] Clear staging buffer
      this.stagingBuffer.clear();
      this.stagedFileIsNew.clear();

      return String(result.id);
    } catch (error: unknown) {
      if (isGitbeakerRequestError(error)) {
        const status = this.extractStatus(error);
        if (status === 409) {
          throw new GitError('Conflict: branch was modified by another process');
        }
      }
      this.translateError(error, 'commit');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY B: NO-OPS (EARS-D1 to D5)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-D5] exec not supported in API mode */
  async exec(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
    return { exitCode: 1, stdout: '', stderr: 'exec() not supported in GitLab API mode' };
  }

  async init(): Promise<void> { /* no-op */ }

  /** [EARS-D1] Return virtual path representing the project */
  async getRepoRoot(): Promise<string> {
    return `gitlab://${this.projectId}`;
  }

  /** [EARS-D1] Return active ref */
  async getCurrentBranch(): Promise<string> {
    return this.activeRef;
  }

  async setConfig(_key: string, _value: string, _scope?: 'local' | 'global' | 'system'): Promise<void> { /* no-op */ }

  /** [EARS-D1] Return true if staging buffer has entries */
  async hasUncommittedChanges(_pathFilter?: string): Promise<boolean> {
    return this.stagingBuffer.size > 0;
  }

  async isRebaseInProgress(): Promise<boolean> { return false; }
  async isRemoteConfigured(_remoteName: string): Promise<boolean> { return true; }
  async getBranchRemote(_branchName: string): Promise<string | null> { return 'origin'; }
  async getConflictedFiles(): Promise<string[]> { return []; }

  /** [EARS-D2] Update activeRef for subsequent operations */
  async checkoutBranch(branchName: string): Promise<void> {
    this.activeRef = branchName;
  }

  async stash(_message?: string): Promise<string | null> { return null; }
  async stashPop(): Promise<boolean> { return false; }
  async stashDrop(_stashHash?: string): Promise<void> { /* no-op */ }
  async fetch(_remote: string): Promise<void> { /* no-op */ }
  async pull(_remote: string, _branchName: string): Promise<void> { /* no-op */ }
  async pullRebase(_remote: string, _branchName: string): Promise<void> { /* no-op */ }

  /** [EARS-D4] No-op: commits via API are already remote */
  async push(_remote: string, _branchName: string): Promise<void> { /* no-op */ }
  async pushWithUpstream(_remote: string, _branchName: string): Promise<void> { /* no-op */ }
  async setUpstream(_branchName: string, _remote: string, _remoteBranch: string): Promise<void> { /* no-op */ }
  async rebaseAbort(): Promise<void> { /* no-op */ }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: commitAllowEmpty (EARS-D1 — Cat. A, tested with no-ops)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-D1] Delegates to commitInternal, allowing empty staging buffer. Cat. A — makes real API calls. */
  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    return this.commitInternal(message, author, true);
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY C: NOT SUPPORTED (EARS-D3)
  // ═══════════════════════════════════════════════════════════════

  async rebase(_targetBranch: string): Promise<void> { this.notSupported('rebase'); }
  async rebaseContinue(): Promise<string> { this.notSupported('rebaseContinue'); }
  async resetHard(_target: string): Promise<void> { this.notSupported('resetHard'); }
  async checkoutOrphanBranch(_branchName: string): Promise<void> { this.notSupported('checkoutOrphanBranch'); }
  async checkoutFilesFromBranch(_sourceBranch: string, _filePaths: string[]): Promise<void> { this.notSupported('checkoutFilesFromBranch'); }
  async getMergeBase(_branchA: string, _branchB: string): Promise<string> { this.notSupported('getMergeBase'); }
}
