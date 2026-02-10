/**
 * GitHubGitModule - GitHub REST API implementation of IGitModule
 *
 * Implements IGitModule for SaaS environments where direct filesystem
 * and git CLI are not available. Uses GitHub REST API for all operations.
 *
 * Method categories:
 * - Category A (Implement): Real API calls — getFileContent, getCommitHash, etc.
 * - Category B (No-op): Return sensible defaults — push, fetch, stash, etc.
 * - Category C (Not Supported): Throw GitError — rebase, resetHard, etc.
 *
 * Status: PLACEHOLDER - Category A methods throw notImplemented()
 *
 * All EARS prefixes map to github_git_module.md
 *
 * @module git/github
 */

import type { IGitModule } from '..';
import type {
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from '../types';
import type { GitHubFetchFn } from '../../github/github.types';
import type { GitHubGitModuleOptions } from './github_git_module.types';
import { GitError } from '../errors';

export class GitHubGitModule implements IGitModule {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly defaultBranch: string;
  private readonly apiBaseUrl: string;
  private readonly fetchFn: GitHubFetchFn;

  /** Staging buffer: path → content (null = delete) */
  private stagingBuffer: Map<string, string | null> = new Map();

  /** Active ref for operations (can be changed via checkoutBranch) */
  private activeRef: string;

  constructor(options: GitHubGitModuleOptions, fetchFn?: GitHubFetchFn) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.defaultBranch = options.defaultBranch ?? 'main';
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.fetchFn = fetchFn ?? globalThis.fetch;
    this.activeRef = this.defaultBranch;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /** Build authenticated URL for GitHub API endpoints */
  protected buildUrl(path: string): string {
    return `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/${path}`;
  }

  /** Make authenticated request to GitHub API */
  protected async apiFetch(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchFn(this.buildUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        ...init?.headers,
      },
    });
  }

  /** Category A: Not yet implemented — future API calls */
  private notImplemented(method: string): never {
    throw new GitError(
      `GitHubGitModule.${method}() is not yet implemented.`
    );
  }

  /** Category C: Not supported via GitHub API */
  private notSupported(method: string): never {
    throw new GitError(
      `${method} is not supported via GitHub API`
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: IMPLEMENT (notImplemented placeholders)
  // ═══════════════════════════════════════════════════════════════

  async getFileContent(_commitHash: string, _filePath: string): Promise<string> {
    this.notImplemented('getFileContent');
  }

  async getCommitHash(_ref: string = 'HEAD'): Promise<string> {
    this.notImplemented('getCommitHash');
  }

  async getChangedFiles(
    _fromCommit: string,
    _toCommit: string,
    _pathFilter: string
  ): Promise<ChangedFile[]> {
    this.notImplemented('getChangedFiles');
  }

  async getCommitHistory(
    _branch: string,
    _options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    this.notImplemented('getCommitHistory');
  }

  async getCommitHistoryRange(
    _fromHash: string,
    _toHash: string,
    _options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    this.notImplemented('getCommitHistoryRange');
  }

  async getCommitMessage(_commitHash: string): Promise<string> {
    this.notImplemented('getCommitMessage');
  }

  async branchExists(_branchName: string): Promise<boolean> {
    this.notImplemented('branchExists');
  }

  async listRemoteBranches(_remoteName: string): Promise<string[]> {
    this.notImplemented('listRemoteBranches');
  }

  async createBranch(_branchName: string, _startPoint?: string): Promise<void> {
    this.notImplemented('createBranch');
  }

  async commit(_message: string, _author?: CommitAuthor): Promise<string> {
    this.notImplemented('commit');
  }

  // ═══════════════════════════════════════════════════════════════
  // STAGING BUFFER (EARS-C1, C2, C7)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-C1] Read file content and store in staging buffer */
  async add(filePaths: string[], options?: { force?: boolean; contentMap?: Record<string, string> }): Promise<void> {
    for (const filePath of filePaths) {
      const content = options?.contentMap?.[filePath]
        ?? await this.getFileContent(this.activeRef, filePath);
      this.stagingBuffer.set(filePath, content);
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

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY B: NO-OPS (sensible defaults)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-D5] exec not supported in API mode */
  async exec(
    _command: string,
    _args: string[],
    _options?: ExecOptions
  ): Promise<ExecResult> {
    return { exitCode: 1, stdout: '', stderr: 'exec() not supported in GitHub API mode' };
  }

  /** No-op: repos are created via GitHub API, not initialized locally */
  async init(): Promise<void> {
    // No-op
  }

  /** [EARS-D1] Return virtual path representing the repo */
  async getRepoRoot(): Promise<string> {
    return `github://${this.owner}/${this.repo}`;
  }

  /** [EARS-D1] Return active ref (starts as defaultBranch) */
  async getCurrentBranch(): Promise<string> {
    return this.activeRef;
  }

  /** No-op: git config doesn't apply to GitHub API */
  async setConfig(
    _key: string,
    _value: string,
    _scope?: 'local' | 'global' | 'system'
  ): Promise<void> {
    // No-op
  }

  /** [EARS-D1] Return true if staging buffer has entries */
  async hasUncommittedChanges(_pathFilter?: string): Promise<boolean> {
    return this.stagingBuffer.size > 0;
  }

  /** No-op: GitHub API doesn't have rebase-in-progress concept */
  async isRebaseInProgress(): Promise<boolean> {
    return false;
  }

  /** [EARS-D1] GitHub repos always have 'origin' conceptually */
  async isRemoteConfigured(_remoteName: string): Promise<boolean> {
    return true;
  }

  /** No-op: always 'origin' */
  async getBranchRemote(_branchName: string): Promise<string | null> {
    return 'origin';
  }

  /** No-op: GitHub API handles merges atomically */
  async getConflictedFiles(): Promise<string[]> {
    return [];
  }

  /** [EARS-D2] Update activeRef for subsequent operations */
  async checkoutBranch(branchName: string): Promise<void> {
    this.activeRef = branchName;
  }

  /** No-op: GitHub API doesn't have stash concept */
  async stash(_message?: string): Promise<string | null> {
    return null;
  }

  /** No-op */
  async stashPop(): Promise<boolean> {
    return false;
  }

  /** No-op */
  async stashDrop(_stashHash?: string): Promise<void> {
    // No-op
  }

  /** No-op: API always fresh */
  async fetch(_remote: string): Promise<void> {
    // No-op
  }

  /** No-op: API mode */
  async pull(_remote: string, _branchName: string): Promise<void> {
    // No-op
  }

  /** No-op: API mode */
  async pullRebase(_remote: string, _branchName: string): Promise<void> {
    // No-op
  }

  /** [EARS-D4] No-op: commits via API are already remote */
  async push(_remote: string, _branchName: string): Promise<void> {
    // No-op
  }

  /** [EARS-D4] No-op: commits via API are already remote */
  async pushWithUpstream(_remote: string, _branchName: string): Promise<void> {
    // No-op
  }

  /** No-op: API mode */
  async setUpstream(
    _branchName: string,
    _remote: string,
    _remoteBranch: string
  ): Promise<void> {
    // No-op
  }

  /** No-op */
  async rebaseAbort(): Promise<void> {
    // No-op
  }

  /** Delegates to commit (also notImplemented until Cat A is built) */
  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    return this.commit(message, author);
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY C: NOT SUPPORTED (throw GitError)
  // ═══════════════════════════════════════════════════════════════

  /** [EARS-D3] Not supported via GitHub API */
  async rebase(_targetBranch: string): Promise<void> {
    this.notSupported('rebase');
  }

  /** [EARS-D3] Not supported via GitHub API */
  async rebaseContinue(): Promise<string> {
    this.notSupported('rebaseContinue');
  }

  /** [EARS-D3] Not supported via GitHub API */
  async resetHard(_target: string): Promise<void> {
    this.notSupported('resetHard');
  }

  /** [EARS-D3] Not supported via GitHub API */
  async checkoutOrphanBranch(_branchName: string): Promise<void> {
    this.notSupported('checkoutOrphanBranch');
  }

  /** [EARS-D3] Not supported via GitHub API */
  async checkoutFilesFromBranch(
    _sourceBranch: string,
    _filePaths: string[]
  ): Promise<void> {
    this.notSupported('checkoutFilesFromBranch');
  }

  /** [EARS-D3] Not supported via GitHub API */
  async getMergeBase(_branchA: string, _branchB: string): Promise<string> {
    this.notSupported('getMergeBase');
  }
}
