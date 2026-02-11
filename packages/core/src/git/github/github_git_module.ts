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
import type { GitHubFetchFn, GitHubContentsResponse } from '../../github';
import type {
  GitHubGitModuleOptions,
  GitHubCommitResponse,
  GitHubCompareResponse,
} from './github_git_module.types';
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '../errors';

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

  /** Make authenticated request to GitHub API with error handling */
  protected async apiFetch(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(this.buildUrl(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${message}`);
    }
  }

  /** Check for auth/permission errors */
  private checkAuthError(response: Response, context: string): void {
    if (response.status === 401 || response.status === 403) {
      throw new GitError(
        `authentication/permission error (${response.status}): ${context}`
      );
    }
  }

  /** Category C: Not supported via GitHub API */
  private notSupported(method: string): never {
    throw new GitError(
      `${method} is not supported via GitHub API`
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: READ OPERATIONS (EARS-A1 to A6)
  // ═══════════════════════════════════════════════════════════════

  /**
   * [EARS-A1] Read file content via Contents API + base64 decode
   * [EARS-A2] Fallback to Blobs API for files >1MB
   */
  async getFileContent(commitHash: string, filePath: string): Promise<string> {
    const response = await this.apiFetch(
      `contents/${filePath}?ref=${commitHash}`
    );

    this.checkAuthError(response, `getFileContent ${filePath}`);

    if (response.status === 404) {
      throw new FileNotFoundError(filePath, commitHash);
    }

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getFileContent ${filePath}`);
    }

    const data = await response.json() as GitHubContentsResponse;

    // [EARS-A1] Decode base64 content
    if (data.content !== null && data.content !== undefined) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    // [EARS-A2] Content is null (file >1MB), fallback to Blobs API
    const blobResponse = await this.apiFetch(`git/blobs/${data.sha}`);

    if (!blobResponse.ok) {
      throw new GitError(`Failed to read blob for ${filePath}: HTTP ${blobResponse.status}`);
    }

    const blobData = await blobResponse.json() as { content: string; encoding: string };
    return Buffer.from(blobData.content, 'base64').toString('utf-8');
  }

  /**
   * [EARS-A3] Get commit SHA from branch via Refs API
   * [EARS-B4] Return SHA directly if already a 40-char hex
   */
  async getCommitHash(ref: string = 'HEAD'): Promise<string> {
    // [EARS-B4] If ref is already a 40-char hex SHA, return directly
    if (/^[0-9a-f]{40}$/i.test(ref)) {
      return ref;
    }

    const response = await this.apiFetch(`git/refs/heads/${ref}`);

    this.checkAuthError(response, `getCommitHash ${ref}`);

    if (response.status === 404) {
      throw new BranchNotFoundError(ref);
    }

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getCommitHash ${ref}`);
    }

    const data = await response.json() as { object: { sha: string } };
    return data.object.sha;
  }

  /**
   * [EARS-A4] List changed files via Compare API
   */
  async getChangedFiles(
    fromCommit: string,
    toCommit: string,
    pathFilter: string
  ): Promise<ChangedFile[]> {
    const response = await this.apiFetch(
      `compare/${fromCommit}...${toCommit}`
    );

    this.checkAuthError(response, `getChangedFiles ${fromCommit}...${toCommit}`);

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getChangedFiles`);
    }

    if (!response.ok) {
      throw new GitError(`Failed to compare ${fromCommit}...${toCommit}: HTTP ${response.status}`);
    }

    const data = await response.json() as GitHubCompareResponse;

    const statusMap: Record<string, 'A' | 'M' | 'D'> = {
      added: 'A',
      modified: 'M',
      removed: 'D',
      renamed: 'M',
    };

    const files: ChangedFile[] = data.files
      .map(f => ({
        status: statusMap[f.status] ?? 'M' as const,
        file: f.filename,
      }))
      .filter(f => !pathFilter || f.file.startsWith(pathFilter));

    return files;
  }

  /**
   * [EARS-A5] Get commit history via Commits API
   */
  async getCommitHistory(
    branch: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    const params = new URLSearchParams({ sha: branch });
    if (options?.maxCount) {
      params.set('per_page', String(options.maxCount));
    }
    if (options?.pathFilter) {
      params.set('path', options.pathFilter);
    }

    const response = await this.apiFetch(`commits?${params.toString()}`);

    this.checkAuthError(response, `getCommitHistory ${branch}`);

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getCommitHistory`);
    }

    if (!response.ok) {
      throw new GitError(`Failed to get commit history: HTTP ${response.status}`);
    }

    const data = await response.json() as GitHubCommitResponse[];

    return data.map(c => ({
      hash: c.sha,
      message: c.commit.message,
      author: `${c.commit.author.name} <${c.commit.author.email}>`,
      date: c.commit.author.date,
    }));
  }

  /**
   * [EARS-B3] Get commit history between two commits via Compare API
   */
  async getCommitHistoryRange(
    fromHash: string,
    toHash: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    const response = await this.apiFetch(`compare/${fromHash}...${toHash}`);

    this.checkAuthError(response, `getCommitHistoryRange ${fromHash}...${toHash}`);

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getCommitHistoryRange`);
    }

    if (!response.ok) {
      throw new GitError(`Failed to get commit range: HTTP ${response.status}`);
    }

    const data = await response.json() as GitHubCompareResponse;

    let commits: CommitInfo[] = data.commits.map(c => ({
      hash: c.sha,
      message: c.commit.message,
      author: `${c.commit.author.name} <${c.commit.author.email}>`,
      date: c.commit.author.date,
    }));

    if (options?.pathFilter) {
      const changedPaths = new Set(data.files.map(f => f.filename));
      commits = commits.filter(c =>
        c.files?.some(f => f.startsWith(options.pathFilter!)) ??
        // If no file info, include commit if any changed file matches
        Array.from(changedPaths).some(f => f.startsWith(options.pathFilter!))
      );
    }

    if (options?.maxCount) {
      commits = commits.slice(0, options.maxCount);
    }

    return commits;
  }

  /**
   * [EARS-A6] Get commit message via Commits API
   */
  async getCommitMessage(commitHash: string): Promise<string> {
    const response = await this.apiFetch(`commits/${commitHash}`);

    this.checkAuthError(response, `getCommitMessage ${commitHash}`);

    if (response.status === 404) {
      throw new GitError(`Commit not found: ${commitHash}`);
    }

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): getCommitMessage`);
    }

    const data = await response.json() as GitHubCommitResponse;
    return data.commit.message;
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: BRANCH OPERATIONS (EARS-B1 to B2)
  // ═══════════════════════════════════════════════════════════════

  /**
   * [EARS-B1] Check if branch exists via Branches API
   */
  async branchExists(branchName: string): Promise<boolean> {
    const response = await this.apiFetch(`branches/${branchName}`);

    this.checkAuthError(response, `branchExists ${branchName}`);

    if (response.status === 200) {
      return true;
    }

    if (response.status === 404) {
      return false;
    }

    throw new GitError(`Failed to check branch: HTTP ${response.status}`);
  }

  /**
   * [EARS-B2] List remote branches via Branches API
   * remoteName is ignored — repo itself is the implicit remote
   */
  async listRemoteBranches(_remoteName: string): Promise<string[]> {
    const response = await this.apiFetch('branches');

    this.checkAuthError(response, 'listRemoteBranches');

    if (response.status >= 500) {
      throw new GitError(`GitHub server error (${response.status}): listRemoteBranches`);
    }

    if (!response.ok) {
      throw new GitError(`Failed to list branches: HTTP ${response.status}`);
    }

    const data = await response.json() as Array<{ name: string }>;
    return data.map(b => b.name);
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: WRITE OPERATIONS (EARS-C1 to C7)
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

  /**
   * [EARS-C6] Create branch via Refs API POST
   */
  async createBranch(branchName: string, startPoint?: string): Promise<void> {
    // Resolve startPoint to SHA
    const sha = startPoint
      ? await this.getCommitHash(startPoint)
      : await this.getCommitHash(this.activeRef);

    const response = await this.apiFetch('git/refs', {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha,
      }),
    });

    this.checkAuthError(response, `createBranch ${branchName}`);

    if (response.status === 422) {
      throw new BranchAlreadyExistsError(branchName);
    }

    if (!response.ok) {
      throw new GitError(`Failed to create branch ${branchName}: HTTP ${response.status}`);
    }
  }

  /**
   * [EARS-C3] Commit staged changes via 5-step atomic transaction
   * [EARS-C4] Clears staging buffer after successful commit
   * [EARS-C5] Throws if staging buffer is empty
   *
   * Steps:
   * 1. GET ref SHA (current commit)
   * 2. GET commit tree SHA
   * 3. POST blobs for each staged file
   * 4. POST new tree
   * 5. POST new commit
   * 6. PATCH ref (update branch)
   */
  async commit(message: string, author?: CommitAuthor): Promise<string> {
    // [EARS-C5] Empty buffer check
    if (this.stagingBuffer.size === 0) {
      throw new GitError('Nothing to commit: staging buffer is empty');
    }

    // Step 1: GET current ref SHA
    const refResponse = await this.apiFetch(`git/refs/heads/${this.activeRef}`);
    if (!refResponse.ok) {
      throw new GitError(`Failed to get ref for ${this.activeRef}: HTTP ${refResponse.status}`);
    }
    const refData = await refResponse.json() as { object: { sha: string } };
    const currentSha = refData.object.sha;

    // Step 2: GET commit to obtain tree SHA
    const commitResponse = await this.apiFetch(`git/commits/${currentSha}`);
    if (!commitResponse.ok) {
      throw new GitError(`Failed to get commit ${currentSha}: HTTP ${commitResponse.status}`);
    }
    const commitData = await commitResponse.json() as { tree: { sha: string } };
    const treeSha = commitData.tree.sha;

    // Step 3: POST blobs for each staged file (adds/updates only, not deletes)
    const treeEntries: Array<{
      path: string;
      mode: string;
      type: string;
      sha: string | null;
    }> = [];

    for (const [path, content] of this.stagingBuffer) {
      if (content === null) {
        // Delete entry
        treeEntries.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: null,
        });
      } else {
        // Create blob
        const blobResponse = await this.apiFetch('git/blobs', {
          method: 'POST',
          body: JSON.stringify({
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
          }),
        });

        if (!blobResponse.ok) {
          throw new GitError(`Failed to create blob for ${path}: HTTP ${blobResponse.status}`);
        }

        const blobData = await blobResponse.json() as { sha: string };
        treeEntries.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        });
      }
    }

    // Step 4: POST new tree
    const treeResponse = await this.apiFetch('git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: treeSha,
        tree: treeEntries,
      }),
    });

    if (!treeResponse.ok) {
      throw new GitError(`Failed to create tree: HTTP ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json() as { sha: string };
    const newTreeSha = treeData.sha;

    // Step 5: POST new commit
    const newCommitBody: Record<string, unknown> = {
      message,
      tree: newTreeSha,
      parents: [currentSha],
    };

    if (author) {
      newCommitBody['author'] = {
        name: author.name,
        email: author.email,
        date: new Date().toISOString(),
      };
    }

    const newCommitResponse = await this.apiFetch('git/commits', {
      method: 'POST',
      body: JSON.stringify(newCommitBody),
    });

    if (!newCommitResponse.ok) {
      throw new GitError(`Failed to create commit: HTTP ${newCommitResponse.status}`);
    }

    const newCommitData = await newCommitResponse.json() as { sha: string };
    const newCommitSha = newCommitData.sha;

    // Step 6: PATCH ref to point to new commit
    const patchResponse = await this.apiFetch(`git/refs/heads/${this.activeRef}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha }),
    });

    if (patchResponse.status === 422) {
      throw new GitError('non-fast-forward update rejected');
    }

    if (!patchResponse.ok) {
      throw new GitError(`Failed to update ref: HTTP ${patchResponse.status}`);
    }

    // [EARS-C4] Clear staging buffer after successful commit
    this.stagingBuffer.clear();

    return newCommitSha;
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

  /** [EARS-D1] Delegates to commit */
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
