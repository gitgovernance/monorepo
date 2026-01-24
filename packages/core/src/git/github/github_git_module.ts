/**
 * GitHubGitModule - GitHub REST API implementation of IGitModule
 *
 * This module provides Git operations via GitHub's REST API for SaaS environments
 * where direct filesystem access is not available.
 *
 * IMPORTANT: Git is ALWAYS the source of truth. The DB in SaaS is a mirror/cache.
 * This module writes to GitHub, and DB sync happens separately.
 *
 * Status: PLACEHOLDER - Not yet implemented
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

/**
 * Configuration for GitHubGitModule
 */
export type GitHubGitModuleConfig = {
  /** GitHub repository owner (user or org) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** GitHub access token with repo permissions */
  token: string;
  /** Default branch name (default: 'main') */
  defaultBranch?: string;
  /** GitHub API base URL (default: 'https://api.github.com') */
  apiBaseUrl?: string;
};

/**
 * GitHubGitModule - GitHub REST API implementation
 *
 * For SaaS: Allows GitGovernance to operate on user repos via API
 * without needing local filesystem access.
 *
 * Architecture:
 * ```
 * SaaS Server                 GitHub API                User's Repo
 * ┌─────────────┐            ┌──────────┐            ┌────────────┐
 * │ GitHubGit   │ ──REST──►  │ GitHub   │ ──────────►│ gitgov-    │
 * │ Module      │            │ API      │            │ state      │
 * └─────────────┘            └──────────┘            │ branch     │
 *       │                                            └────────────┘
 *       │ (read cache)                                     │
 *       ▼                                                  │
 * ┌─────────────┐                                          │
 * │ DB Mirror   │ ◄───── periodic sync ───────────────────┘
 * │ (cache)     │
 * └─────────────┘
 * ```
 */
export class GitHubGitModule implements IGitModule {
  private config: Required<GitHubGitModuleConfig>;

  constructor(config: GitHubGitModuleConfig) {
    this.config = {
      owner: config.owner,
      repo: config.repo,
      token: config.token,
      defaultBranch: config.defaultBranch || 'main',
      apiBaseUrl: config.apiBaseUrl || 'https://api.github.com',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private notImplemented(method: string): never {
    throw new Error(
      `GitHubGitModule.${method}() is not yet implemented. ` +
      `This is a placeholder for future SaaS implementation.`
    );
  }

  // Future: GitHub API helper
  // private async githubApi<T>(
  //   endpoint: string,
  //   options?: RequestInit
  // ): Promise<T> {
  //   const url = `${this.config.apiBaseUrl}/repos/${this.config.owner}/${this.config.repo}${endpoint}`;
  //   const response = await fetch(url, {
  //     ...options,
  //     headers: {
  //       'Authorization': `Bearer ${this.config.token}`,
  //       'Accept': 'application/vnd.github.v3+json',
  //       ...options?.headers,
  //     },
  //   });
  //   if (!response.ok) {
  //     throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  //   }
  //   return response.json();
  // }

  // ═══════════════════════════════════════════════════════════════════════
  // IGitModule IMPLEMENTATION (Placeholders)
  // ═══════════════════════════════════════════════════════════════════════

  async exec(
    _command: string,
    _args: string[],
    _options?: ExecOptions
  ): Promise<ExecResult> {
    // GitHub API doesn't support arbitrary command execution
    return { exitCode: 1, stdout: '', stderr: 'exec() not supported in GitHub API mode' };
  }

  async init(): Promise<void> {
    // Repos are created via GitHub API, not initialized locally
    this.notImplemented('init');
  }

  async getRepoRoot(): Promise<string> {
    // Return virtual path representing the repo
    return `github://${this.config.owner}/${this.config.repo}`;
  }

  async getCurrentBranch(): Promise<string> {
    // Future: GET /repos/{owner}/{repo} -> default_branch
    return this.config.defaultBranch;
  }

  async getCommitHash(_ref: string = 'HEAD'): Promise<string> {
    // Future: GET /repos/{owner}/{repo}/commits/{ref}
    this.notImplemented('getCommitHash');
  }

  async setConfig(
    _key: string,
    _value: string,
    _scope?: 'local' | 'global' | 'system'
  ): Promise<void> {
    // Git config doesn't apply to GitHub API
    // No-op or store in metadata
  }

  async getMergeBase(_branchA: string, _branchB: string): Promise<string> {
    // Future: GET /repos/{owner}/{repo}/compare/{base}...{head}
    this.notImplemented('getMergeBase');
  }

  async getChangedFiles(
    _fromCommit: string,
    _toCommit: string,
    _pathFilter: string
  ): Promise<ChangedFile[]> {
    // Future: GET /repos/{owner}/{repo}/compare/{base}...{head}
    this.notImplemented('getChangedFiles');
  }

  async getStagedFiles(): Promise<string[]> {
    // GitHub API is commit-based, no staging area concept
    return [];
  }

  async getFileContent(_commitHash: string, _filePath: string): Promise<string> {
    // Future: GET /repos/{owner}/{repo}/contents/{path}?ref={commitHash}
    this.notImplemented('getFileContent');
  }

  async getCommitHistory(
    _branch: string,
    _options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    // Future: GET /repos/{owner}/{repo}/commits?sha={branch}
    this.notImplemented('getCommitHistory');
  }

  async getCommitHistoryRange(
    _fromHash: string,
    _toHash: string,
    _options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    // Future: GET /repos/{owner}/{repo}/compare/{base}...{head}
    this.notImplemented('getCommitHistoryRange');
  }

  async getCommitMessage(_commitHash: string): Promise<string> {
    // Future: GET /repos/{owner}/{repo}/commits/{commitHash}
    this.notImplemented('getCommitMessage');
  }

  async hasUncommittedChanges(_pathFilter?: string): Promise<boolean> {
    // GitHub API is commit-based, no uncommitted changes concept
    return false;
  }

  async isRebaseInProgress(): Promise<boolean> {
    // GitHub API doesn't have rebase-in-progress concept
    return false;
  }

  async branchExists(_branchName: string): Promise<boolean> {
    // Future: GET /repos/{owner}/{repo}/branches/{branch}
    this.notImplemented('branchExists');
  }

  async listRemoteBranches(_remoteName: string): Promise<string[]> {
    // Future: GET /repos/{owner}/{repo}/branches
    this.notImplemented('listRemoteBranches');
  }

  async isRemoteConfigured(_remoteName: string): Promise<boolean> {
    // GitHub repos always have 'origin' conceptually
    return true;
  }

  async getBranchRemote(_branchName: string): Promise<string | null> {
    return 'origin';
  }

  async getConflictedFiles(): Promise<string[]> {
    // GitHub API handles merges atomically
    return [];
  }

  async checkoutBranch(_branchName: string): Promise<void> {
    // No-op in API mode, we work with specific refs
  }

  async stash(_message?: string): Promise<string | null> {
    // GitHub API doesn't have stash concept
    return null;
  }

  async stashPop(): Promise<boolean> {
    return false;
  }

  async stashDrop(_stashHash?: string): Promise<void> {
    // No-op
  }

  async checkoutOrphanBranch(_branchName: string): Promise<void> {
    // Future: Create branch with empty tree
    this.notImplemented('checkoutOrphanBranch');
  }

  async fetch(_remote: string): Promise<void> {
    // No-op in API mode, always fresh
  }

  async pull(_remote: string, _branchName: string): Promise<void> {
    // No-op in API mode
  }

  async pullRebase(_remote: string, _branchName: string): Promise<void> {
    // No-op in API mode
  }

  async resetHard(_target: string): Promise<void> {
    // Future: Update branch ref via API
    this.notImplemented('resetHard');
  }

  async checkoutFilesFromBranch(
    _sourceBranch: string,
    _filePaths: string[]
  ): Promise<void> {
    this.notImplemented('checkoutFilesFromBranch');
  }

  async add(_filePaths: string[], _options?: { force?: boolean }): Promise<void> {
    // GitHub API uses direct commits, no staging
  }

  async rm(_filePaths: string[]): Promise<void> {
    // Will be handled in commit
  }

  async commit(_message: string, _author?: CommitAuthor): Promise<string> {
    // Future:
    // 1. GET /repos/{owner}/{repo}/git/refs/heads/{branch} -> current SHA
    // 2. GET /repos/{owner}/{repo}/git/commits/{sha} -> tree SHA
    // 3. POST /repos/{owner}/{repo}/git/trees -> new tree
    // 4. POST /repos/{owner}/{repo}/git/commits -> new commit
    // 5. PATCH /repos/{owner}/{repo}/git/refs/heads/{branch} -> update ref
    this.notImplemented('commit');
  }

  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    return this.commit(message, author);
  }

  async push(_remote: string, _branchName: string): Promise<void> {
    // Commits via API are already "pushed"
  }

  async pushWithUpstream(_remote: string, _branchName: string): Promise<void> {
    // No-op in API mode
  }

  async setUpstream(
    _branchName: string,
    _remote: string,
    _remoteBranch: string
  ): Promise<void> {
    // No-op in API mode
  }

  async rebaseContinue(): Promise<string> {
    // GitHub API doesn't support interactive rebase
    this.notImplemented('rebaseContinue');
  }

  async rebaseAbort(): Promise<void> {
    // No-op
  }

  async createBranch(_branchName: string, _startPoint?: string): Promise<void> {
    // Future: POST /repos/{owner}/{repo}/git/refs
    this.notImplemented('createBranch');
  }

  async rebase(_targetBranch: string): Promise<void> {
    // GitHub API doesn't support rebase, use merge
    this.notImplemented('rebase');
  }
}
