/**
 * GitHubGitModule - GitHub REST API implementation of IGitModule
 *
 * Implements IGitModule for SaaS environments where direct filesystem
 * and git CLI are not available. Uses GitHub REST API via Octokit for all operations.
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

import type { Octokit } from '@octokit/rest';
import type { IGitModule } from '..';
import type {
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from '../types';
import { isOctokitRequestError } from '../../github';
import type { GitHubGitModuleOptions } from './github_git_module.types';
import { GitError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError } from '../errors';

export class GitHubGitModule implements IGitModule {
  private readonly owner: string;
  private readonly repo: string;
  private readonly defaultBranch: string;
  private readonly octokit: Octokit;

  /** Staging buffer: path → content (null = delete) */
  private stagingBuffer: Map<string, string | null> = new Map();

  /** Active ref for operations (can be changed via checkoutBranch) */
  private activeRef: string;

  constructor(options: GitHubGitModuleOptions, octokit: Octokit) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.defaultBranch = options.defaultBranch ?? 'gitgov-state';
    this.octokit = octokit;
    this.activeRef = this.defaultBranch;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

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
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: commitHash,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new GitError(`Not a file: ${filePath}`);
      }

      // [EARS-A1] Decode base64 content
      if (data.content !== null && data.content !== undefined) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      // [EARS-A2] Content is null (file >1MB), fallback to Blobs API
      const { data: blobData } = await this.octokit.rest.git.getBlob({
        owner: this.owner,
        repo: this.repo,
        file_sha: data.sha,
      });

      return Buffer.from(blobData.content, 'base64').toString('utf-8');
    } catch (error: unknown) {
      if (error instanceof GitError) throw error;
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new FileNotFoundError(filePath, commitHash);
        }
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getFileContent ${filePath}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getFileContent ${filePath}`);
        }
        throw new GitError(`GitHub API error (${error.status}): getFileContent ${filePath}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
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

    try {
      const { data } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${ref}`,
      });
      return data.object.sha;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new BranchNotFoundError(ref);
        }
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getCommitHash ${ref}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getCommitHash ${ref}`);
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-A4] List changed files via Compare API
   */
  async getChangedFiles(
    fromCommit: string,
    toCommit: string,
    pathFilter: string
  ): Promise<ChangedFile[]> {
    try {
      const { data } = await this.octokit.rest.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: fromCommit,
        head: toCommit,
      });

      const statusMap: Record<string, 'A' | 'M' | 'D'> = {
        added: 'A',
        modified: 'M',
        removed: 'D',
        renamed: 'M',
      };

      const files: ChangedFile[] = (data.files ?? [])
        .map(f => ({
          status: statusMap[f.status] ?? ('M' as const),
          file: f.filename,
        }))
        .filter(f => !pathFilter || f.file.startsWith(pathFilter));

      return files;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getChangedFiles ${fromCommit}...${toCommit}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getChangedFiles`);
        }
        throw new GitError(`Failed to compare ${fromCommit}...${toCommit}: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-A5] Get commit history via Commits API
   */
  async getCommitHistory(
    branch: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha: branch,
        ...(options?.maxCount !== undefined && { per_page: options.maxCount }),
        ...(options?.pathFilter !== undefined && { path: options.pathFilter }),
      });

      return data.map(c => ({
        hash: c.sha,
        message: c.commit.message,
        author: `${c.commit.author?.name ?? 'unknown'} <${c.commit.author?.email ?? 'unknown'}>`,
        date: c.commit.author?.date ?? '',
      }));
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getCommitHistory ${branch}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getCommitHistory`);
        }
        throw new GitError(`Failed to get commit history: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-B3] Get commit history between two commits via Compare API
   */
  async getCommitHistoryRange(
    fromHash: string,
    toHash: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    try {
      const { data } = await this.octokit.rest.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: fromHash,
        head: toHash,
      });

      let commits: CommitInfo[] = data.commits.map(c => ({
        hash: c.sha,
        message: c.commit.message,
        author: `${c.commit.author?.name ?? 'unknown'} <${c.commit.author?.email ?? 'unknown'}>`,
        date: c.commit.author?.date ?? '',
      }));

      if (options?.pathFilter) {
        const changedPaths = new Set((data.files ?? []).map(f => f.filename));
        commits = commits.filter(() =>
          Array.from(changedPaths).some(f => f.startsWith(options.pathFilter!))
        );
      }

      if (options?.maxCount) {
        commits = commits.slice(0, options.maxCount);
      }

      return commits;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getCommitHistoryRange ${fromHash}...${toHash}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getCommitHistoryRange`);
        }
        throw new GitError(`Failed to get commit range: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-A6] Get commit message via Commits API
   */
  async getCommitMessage(commitHash: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: commitHash,
      });
      return data.commit.message;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 404) {
          throw new GitError(`Commit not found: ${commitHash}`);
        }
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): getCommitMessage ${commitHash}`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): getCommitMessage`);
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY A: BRANCH OPERATIONS (EARS-B1 to B2)
  // ═══════════════════════════════════════════════════════════════

  /**
   * [EARS-B1] Check if branch exists via Branches API
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName,
      });
      return true;
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 404) return false;
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): branchExists ${branchName}`);
        }
        throw new GitError(`Failed to check branch: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-B2] List remote branches via Branches API
   * remoteName is ignored — repo itself is the implicit remote
   */
  async listRemoteBranches(_remoteName: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.repos.listBranches({
        owner: this.owner,
        repo: this.repo,
      });
      return data.map(b => b.name);
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): listRemoteBranches`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): listRemoteBranches`);
        }
        throw new GitError(`Failed to list branches: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
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

    try {
      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha,
      });
    } catch (error: unknown) {
      if (isOctokitRequestError(error)) {
        if (error.status === 422) {
          throw new BranchAlreadyExistsError(branchName);
        }
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): createBranch ${branchName}`);
        }
        throw new GitError(`Failed to create branch ${branchName}: HTTP ${error.status}`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * Internal commit implementation shared by commit() and commitAllowEmpty().
   *
   * [EARS-C3] 6-step atomic transaction
   * [EARS-C4] Clears staging buffer after successful commit
   * [EARS-C5] Throws if staging buffer is empty (unless allowEmpty)
   */
  private async commitInternal(message: string, author?: CommitAuthor, allowEmpty = false): Promise<string> {
    // [EARS-C5] Empty buffer check (skipped for commitAllowEmpty)
    if (!allowEmpty && this.stagingBuffer.size === 0) {
      throw new GitError('Nothing to commit: staging buffer is empty');
    }

    try {
    // Step 1: GET current ref SHA
    const { data: refData } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeRef}`,
    });
    const currentSha = refData.object.sha;

    // Step 2: GET commit to obtain tree SHA
    const { data: commitData } = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: currentSha,
    });
    const treeSha = commitData.tree.sha;

    // Step 3: POST blobs for each staged file (adds/updates only, not deletes)
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
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
        const { data: blobData } = await this.octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64',
        });

        treeEntries.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        });
      }
    }

    // Step 4: POST new tree
    const { data: treeData } = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: treeSha,
      tree: treeEntries,
    });
    const newTreeSha = treeData.sha;

    // Step 5: POST new commit
    const commitParams: {
      owner: string;
      repo: string;
      message: string;
      tree: string;
      parents: string[];
      author?: { name: string; email: string; date: string };
    } = {
      owner: this.owner,
      repo: this.repo,
      message,
      tree: newTreeSha,
      parents: [currentSha],
    };

    if (author) {
      commitParams.author = {
        name: author.name,
        email: author.email,
        date: new Date().toISOString(),
      };
    }

    const { data: newCommitData } = await this.octokit.rest.git.createCommit(commitParams);
    const newCommitSha = newCommitData.sha;

    // Step 6: PATCH ref to point to new commit
    try {
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.activeRef}`,
        sha: newCommitSha,
      });
    } catch (error: unknown) {
      if (isOctokitRequestError(error) && error.status === 422) {
        throw new GitError('non-fast-forward update rejected');
      }
      throw error;
    }

    // [EARS-C4] Clear staging buffer after successful commit
    this.stagingBuffer.clear();

    return newCommitSha;
    } catch (error: unknown) {
      if (error instanceof GitError) throw error;
      if (isOctokitRequestError(error)) {
        if (error.status === 401 || error.status === 403) {
          throw new GitError(`authentication/permission error (${error.status}): commit`);
        }
        if (error.status >= 500) {
          throw new GitError(`GitHub server error (${error.status}): commit`);
        }
        throw new GitError(`GitHub API error (${error.status}): commit`);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new GitError(`network error: ${msg}`);
    }
  }

  /**
   * [EARS-C3] Commit staged changes via 6-step atomic transaction
   * [EARS-C5] Throws if staging buffer is empty
   */
  async commit(message: string, author?: CommitAuthor): Promise<string> {
    return this.commitInternal(message, author, false);
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

  /** [EARS-D1] Delegates to commitInternal, allowing empty staging buffer */
  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    return this.commitInternal(message, author, true);
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
