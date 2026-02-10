/**
 * MemoryGitModule - In-memory Git implementation for tests
 *
 * This module provides a mock implementation of IGitModule for unit testing.
 * All state is kept in memory with no filesystem operations.
 *
 * Test Helpers:
 * - setBranch(name): Set current branch
 * - setCommits(commits[]): Set commit history
 * - setFiles(files): Set file contents
 * - clear(): Reset all state
 *
 * @module git/memory
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
import {
  BranchNotFoundError,
  BranchAlreadyExistsError,
  FileNotFoundError,
  RebaseNotInProgressError,
} from '../errors';

interface MemoryCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: Map<string, string>;
  branch: string;
}

interface MemoryGitState {
  repoRoot: string;
  currentBranch: string;
  branches: Set<string>;
  commits: MemoryCommit[];
  stagedFiles: string[];
  files: Map<string, string>;
  isRebaseInProgress: boolean;
  conflictedFiles: string[];
  remotes: Map<string, string[]>; // remote -> branches
  stashes: Array<{ hash: string; message: string; files: Map<string, string> }>;
  config: Map<string, string>;
}

/**
 * MemoryGitModule - In-memory Git mock for unit tests
 */
export class MemoryGitModule implements IGitModule {
  private state: MemoryGitState;

  constructor(repoRoot: string = '/test/repo') {
    this.state = {
      repoRoot,
      currentBranch: 'main',
      branches: new Set(['main']),
      commits: [],
      stagedFiles: [],
      files: new Map(),
      isRebaseInProgress: false,
      conflictedFiles: [],
      remotes: new Map([['origin', ['main']]]),
      stashes: [],
      config: new Map(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  setBranch(name: string): void {
    this.state.currentBranch = name;
    this.state.branches.add(name);
  }

  setBranches(names: string[]): void {
    this.state.branches = new Set(names);
    if (!this.state.branches.has(this.state.currentBranch)) {
      this.state.currentBranch = names[0] || 'main';
    }
  }

  setCommits(commits: CommitInfo[]): void {
    this.state.commits = commits.map((c) => ({
      ...c,
      files: new Map(),
      branch: this.state.currentBranch,
    }));
  }

  setFiles(files: Record<string, string>): void {
    this.state.files = new Map(Object.entries(files));
  }

  setFileContent(commitHash: string, filePath: string, content: string): void {
    const commit = this.state.commits.find((c) => c.hash === commitHash);
    if (commit) {
      commit.files.set(filePath, content);
    }
    this.state.files.set(filePath, content);
  }

  setStagedFiles(files: string[]): void {
    this.state.stagedFiles = files;
  }

  setRebaseInProgress(inProgress: boolean, conflictedFiles: string[] = []): void {
    this.state.isRebaseInProgress = inProgress;
    this.state.conflictedFiles = conflictedFiles;
  }

  setRemoteBranches(remote: string, branches: string[]): void {
    this.state.remotes.set(remote, branches);
  }

  clear(): void {
    this.state = {
      repoRoot: this.state.repoRoot,
      currentBranch: 'main',
      branches: new Set(['main']),
      commits: [],
      stagedFiles: [],
      files: new Map(),
      isRebaseInProgress: false,
      conflictedFiles: [],
      remotes: new Map([['origin', ['main']]]),
      stashes: [],
      config: new Map(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IGitModule IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════════

  async exec(
    _command: string,
    _args: string[],
    _options?: ExecOptions
  ): Promise<ExecResult> {
    // Memory module doesn't support arbitrary commands
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  async init(): Promise<void> {
    this.state.branches.add('main');
    this.state.currentBranch = 'main';
  }

  async getRepoRoot(): Promise<string> {
    return this.state.repoRoot;
  }

  async getCurrentBranch(): Promise<string> {
    return this.state.currentBranch;
  }

  async getCommitHash(ref: string = 'HEAD'): Promise<string> {
    if (ref === 'HEAD') {
      const lastCommit = this.state.commits[this.state.commits.length - 1];
      return lastCommit?.hash || 'abc123def456';
    }
    const commit = this.state.commits.find((c) => c.hash.startsWith(ref));
    return commit?.hash || ref;
  }

  async setConfig(
    key: string,
    value: string,
    _scope?: 'local' | 'global' | 'system'
  ): Promise<void> {
    this.state.config.set(key, value);
  }

  async getMergeBase(branchA: string, branchB: string): Promise<string> {
    if (!this.state.branches.has(branchA)) {
      throw new BranchNotFoundError(branchA);
    }
    if (!this.state.branches.has(branchB)) {
      throw new BranchNotFoundError(branchB);
    }
    return this.state.commits[0]?.hash || 'merge-base-hash';
  }

  async getChangedFiles(
    _fromCommit: string,
    _toCommit: string,
    _pathFilter: string
  ): Promise<ChangedFile[]> {
    return [];
  }

  async getStagedFiles(): Promise<string[]> {
    return this.state.stagedFiles;
  }

  async getFileContent(commitHash: string, filePath: string): Promise<string> {
    const commit = this.state.commits.find((c) => c.hash === commitHash);
    if (commit?.files.has(filePath)) {
      return commit.files.get(filePath)!;
    }
    if (this.state.files.has(filePath)) {
      return this.state.files.get(filePath)!;
    }
    throw new FileNotFoundError(filePath, commitHash);
  }

  async getCommitHistory(
    _branch: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    let commits = [...this.state.commits];
    if (options?.maxCount) {
      commits = commits.slice(0, options.maxCount);
    }
    return commits.map((c) => ({
      hash: c.hash,
      message: c.message,
      author: c.author,
      date: c.date,
    }));
  }

  async getCommitHistoryRange(
    fromHash: string,
    toHash: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    const fromIndex = this.state.commits.findIndex((c) => c.hash === fromHash);
    const toIndex = this.state.commits.findIndex((c) => c.hash === toHash);

    let commits =
      fromIndex >= 0 && toIndex >= 0
        ? this.state.commits.slice(fromIndex + 1, toIndex + 1)
        : [];

    if (options?.maxCount) {
      commits = commits.slice(0, options.maxCount);
    }

    return commits.map((c) => ({
      hash: c.hash,
      message: c.message,
      author: c.author,
      date: c.date,
    }));
  }

  async getCommitMessage(commitHash: string): Promise<string> {
    const commit = this.state.commits.find((c) => c.hash === commitHash);
    return commit?.message || '';
  }

  async hasUncommittedChanges(_pathFilter?: string): Promise<boolean> {
    return this.state.stagedFiles.length > 0;
  }

  async isRebaseInProgress(): Promise<boolean> {
    return this.state.isRebaseInProgress;
  }

  async branchExists(branchName: string): Promise<boolean> {
    return this.state.branches.has(branchName);
  }

  async listRemoteBranches(remoteName: string): Promise<string[]> {
    return this.state.remotes.get(remoteName) || [];
  }

  async isRemoteConfigured(remoteName: string): Promise<boolean> {
    return this.state.remotes.has(remoteName);
  }

  async getBranchRemote(branchName: string): Promise<string | null> {
    if (!this.state.branches.has(branchName)) {
      throw new BranchNotFoundError(branchName);
    }
    // Check if any remote has this branch
    for (const [remote, branches] of this.state.remotes) {
      if (branches.includes(branchName)) {
        return remote;
      }
    }
    return null;
  }

  async getConflictedFiles(): Promise<string[]> {
    return this.state.conflictedFiles;
  }

  async checkoutBranch(branchName: string): Promise<void> {
    if (!this.state.branches.has(branchName)) {
      throw new BranchNotFoundError(branchName);
    }
    this.state.currentBranch = branchName;
  }

  async stash(message?: string): Promise<string | null> {
    if (this.state.stagedFiles.length === 0) {
      return null;
    }
    const hash = `stash-${Date.now()}`;
    this.state.stashes.push({
      hash,
      message: message || 'WIP',
      files: new Map(this.state.files),
    });
    this.state.stagedFiles = [];
    return hash;
  }

  async stashPop(): Promise<boolean> {
    const stash = this.state.stashes.pop();
    if (!stash) {
      return false;
    }
    for (const [path, content] of stash.files) {
      this.state.files.set(path, content);
    }
    return true;
  }

  async stashDrop(_stashHash?: string): Promise<void> {
    this.state.stashes.pop();
  }

  async checkoutOrphanBranch(branchName: string): Promise<void> {
    this.state.branches.add(branchName);
    this.state.currentBranch = branchName;
  }

  async fetch(_remote: string): Promise<void> {
    // No-op in memory
  }

  async pull(_remote: string, _branchName: string): Promise<void> {
    // No-op in memory
  }

  async pullRebase(_remote: string, _branchName: string): Promise<void> {
    // No-op in memory
  }

  async resetHard(_target: string): Promise<void> {
    this.state.stagedFiles = [];
  }

  async checkoutFilesFromBranch(
    sourceBranch: string,
    _filePaths: string[]
  ): Promise<void> {
    if (!this.state.branches.has(sourceBranch)) {
      throw new BranchNotFoundError(sourceBranch);
    }
  }

  async add(filePaths: string[], options?: { force?: boolean; contentMap?: Record<string, string> }): Promise<void> {
    for (const path of filePaths) {
      if (options?.contentMap?.[path] !== undefined) {
        this.state.files.set(path, options.contentMap[path]);
      }
      if (!this.state.stagedFiles.includes(path)) {
        this.state.stagedFiles.push(path);
      }
    }
  }

  async rm(filePaths: string[]): Promise<void> {
    for (const path of filePaths) {
      this.state.files.delete(path);
      this.state.stagedFiles = this.state.stagedFiles.filter((f) => f !== path);
    }
  }

  async commit(message: string, author?: CommitAuthor): Promise<string> {
    const hash = `commit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.state.commits.push({
      hash,
      message,
      author: author ? `${author.name} <${author.email}>` : 'Test User <test@example.com>',
      date: new Date().toISOString(),
      files: new Map(this.state.files),
      branch: this.state.currentBranch,
    });
    this.state.stagedFiles = [];
    return hash;
  }

  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    return this.commit(message, author);
  }

  async push(_remote: string, branchName: string): Promise<void> {
    // Add branch to remote
    const branches = this.state.remotes.get('origin') || [];
    if (!branches.includes(branchName)) {
      branches.push(branchName);
      this.state.remotes.set('origin', branches);
    }
  }

  async pushWithUpstream(_remote: string, branchName: string): Promise<void> {
    return this.push('origin', branchName);
  }

  async setUpstream(
    branchName: string,
    _remote: string,
    _remoteBranch: string
  ): Promise<void> {
    if (!this.state.branches.has(branchName)) {
      throw new BranchNotFoundError(branchName);
    }
  }

  async rebaseContinue(): Promise<string> {
    if (!this.state.isRebaseInProgress) {
      throw new RebaseNotInProgressError();
    }
    this.state.isRebaseInProgress = false;
    this.state.conflictedFiles = [];
    return this.state.commits[this.state.commits.length - 1]?.hash || 'rebase-hash';
  }

  async rebaseAbort(): Promise<void> {
    if (!this.state.isRebaseInProgress) {
      throw new RebaseNotInProgressError();
    }
    this.state.isRebaseInProgress = false;
    this.state.conflictedFiles = [];
  }

  async createBranch(branchName: string, _startPoint?: string): Promise<void> {
    if (this.state.branches.has(branchName)) {
      throw new BranchAlreadyExistsError(branchName);
    }
    this.state.branches.add(branchName);
    this.state.currentBranch = branchName;
  }

  async rebase(_targetBranch: string): Promise<void> {
    // No-op in memory, unless conflicts are set
    if (this.state.conflictedFiles.length > 0) {
      this.state.isRebaseInProgress = true;
    }
  }
}
