/**
 * GitModule - Low-level Git Operations
 * 
 * This module provides a business-agnostic abstraction layer for interacting
 * with the local Git repository. It exposes semantic methods instead of raw
 * Git commands, with comprehensive error handling and type safety.
 * 
 * @module git_module
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  GitModuleDependencies,
  ExecOptions,
  ExecResult,
  GetCommitHistoryOptions,
  CommitInfo,
  ChangedFile,
  CommitAuthor,
} from './types';
import {
  GitCommandError,
  BranchNotFoundError,
  BranchAlreadyExistsError,
  FileNotFoundError,
  MergeConflictError,
  RebaseConflictError,
  RebaseNotInProgressError,
} from './errors';
import { createLogger } from "../logger/logger";

const logger = createLogger("[GitModule] ");

/**
 * GitModule class providing low-level Git operations
 * 
 * All operations are async and use dependency injection for testability.
 * Errors are transformed into typed exceptions for better handling.
 */
export class GitModule {
  private repoRoot: string;
  private execCommand: (
    command: string,
    args: string[],
    options?: ExecOptions
  ) => Promise<ExecResult>;

  /**
   * Creates a new GitModule instance
   * 
   * @param dependencies - Required dependencies (execCommand) and optional config (repoRoot)
   * @throws Error if execCommand is not provided
   */
  constructor(dependencies: GitModuleDependencies) {
    if (!dependencies.execCommand) {
      throw new Error('execCommand is required for GitModule');
    }

    this.execCommand = dependencies.execCommand;
    this.repoRoot = dependencies.repoRoot || '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Ensures that repoRoot is set, auto-detecting it if necessary
   * 
   * @returns Path to repository root
   * @throws GitCommandError if not in a Git repository
   */
  private async ensureRepoRoot(): Promise<string> {
    if (!this.repoRoot) {
      const result = await this.execCommand('git', ['rev-parse', '--show-toplevel']);
      if (result.exitCode !== 0) {
        throw new GitCommandError('Not in a Git repository', result.stderr);
      }
      this.repoRoot = result.stdout.trim();
    }
    return this.repoRoot;
  }

  /**
   * Executes a Git command with standardized error handling
   * 
   * @param args - Git command arguments
   * @param options - Execution options
   * @returns Command result
   * @throws GitCommandError if command fails
   */
  private async execGit(args: string[], options?: ExecOptions): Promise<ExecResult> {
    const cwd = options?.cwd || await this.ensureRepoRoot();
    const result = await this.execCommand('git', args, { ...options, cwd });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initializes a new Git repository in the current directory
   * 
   * Creates the `.git/` directory structure and sets up initial configuration.
   * Useful for testing and for commands that require a fresh repository.
   * 
   * @throws GitCommandError if directory is already a Git repository
   * 
   * @example
   * await gitModule.init();
   * // Repository initialized with default branch (main or master)
   */
  async init(): Promise<void> {
    const cwd = this.repoRoot || process.cwd();

    // Check if already in a Git repository
    try {
      const checkResult = await this.execCommand('git', ['rev-parse', '--git-dir'], {
        cwd,
      });

      if (checkResult.exitCode === 0) {
        throw new GitCommandError(
          'Directory is already a Git repository',
          `Git directory exists at ${checkResult.stdout.trim()}`
        );
      }
    } catch (error) {
      // If not a repo, this is what we want - continue with init
      if (error instanceof GitCommandError && error.message === 'Directory is already a Git repository') {
        throw error;
      }
      // Other errors mean it's not a repo, which is good
    }

    // Initialize the repository
    const result = await this.execCommand('git', ['init'], {
      cwd,
    });

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to initialize Git repository', result.stderr);
    }

    // Update repoRoot if it wasn't set
    if (!this.repoRoot) {
      const rootResult = await this.execCommand('git', ['rev-parse', '--show-toplevel'], { cwd });
      if (rootResult.exitCode === 0) {
        this.repoRoot = rootResult.stdout.trim();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Returns the absolute path to the current Git repository root
   * 
   * @returns Repository root path
   * @throws GitCommandError if not in a Git repository
   * 
   * @example
   * const repoRoot = await gitModule.getRepoRoot();
   * // => "/home/user/my-project"
   */
  async getRepoRoot(): Promise<string> {
    return await this.ensureRepoRoot();
  }

  /**
   * Returns the name of the current branch (HEAD)
   * 
   * @returns Current branch name
   * @throws GitCommandError if in detached HEAD state or other error
   * 
   * @example
   * const branch = await gitModule.getCurrentBranch();
   * // => "main"
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);

    if (result.exitCode !== 0) {
      // Fallback: Try reading .git/HEAD directly (works for orphan branches)
      try {
        const repoRoot = await this.ensureRepoRoot();
        const headPath = path.join(repoRoot, '.git', 'HEAD');
        const headContent = fs.readFileSync(headPath, 'utf-8').trim();

        if (headContent.startsWith('ref: refs/heads/')) {
          return headContent.replace('ref: refs/heads/', '');
        }
      } catch (fallbackError) {
        // Fallback failed, throw original error
      }

      throw new GitCommandError('Failed to get current branch', result.stderr);
    }

    const branch = result.stdout.trim();

    if (branch === 'HEAD') {
      throw new GitCommandError('In detached HEAD state', '');
    }

    return branch;
  }

  /**
   * Get commit hash for a given reference (branch, tag, HEAD, etc.)
   * 
   * Used by test helpers and sync operations to get commit SHAs.
   * Returns the full 40-character SHA-1 hash of the commit.
   * 
   * @param ref Git reference (default: "HEAD"). Can be:
   *            - "HEAD" for current commit
   *            - Branch name (e.g., "main", "gitgov-state")
   *            - Tag name (e.g., "v1.0.0")
   *            - Commit hash (returns the same hash)
   *            - Relative refs (e.g., "HEAD~1", "main^")
   * @returns Commit SHA hash (full 40-character hash)
   * @throws GitCommandError if ref does not exist
   * 
   * @example
   * const headHash = await git.getCommitHash("HEAD");
   * // => "a1b2c3d4e5f6..."
   * 
   * const mainHash = await git.getCommitHash("main");
   * // => "f6e5d4c3b2a1..."
   * 
   * const parentHash = await git.getCommitHash("HEAD~1");
   * // => "9876543210ab..."
   */
  async getCommitHash(ref: string = "HEAD"): Promise<string> {
    const result = await this.execGit(["rev-parse", ref]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to get commit hash for ref "${ref}"`,
        result.stderr
      );
    }

    const hash = result.stdout.trim();
    logger.debug(`Got commit hash for ${ref}: ${hash.substring(0, 8)}...`);
    return hash;
  }

  /**
   * Set a Git configuration value.
   * Used for configuring repository settings like user.name, core.editor, etc.
   *
   * [EARS-51, EARS-52]
   *
   * @param key - Configuration key (e.g., "user.name", "core.editor")
   * @param value - Configuration value
   * @param scope - Configuration scope: "local" (default), "global", or "system"
   * @throws GitCommandError if configuration fails
   *
   * @example
   * ```typescript
   * // Set local config (repository-specific)
   * await git.setConfig('core.editor', 'vim');
   *
   * // Set global config (user-wide)
   * await git.setConfig('user.name', 'John Doe', 'global');
   *
   * // Set system config (machine-wide, requires permissions)
   * await git.setConfig('credential.helper', 'cache', 'system');
   * ```
   */
  async setConfig(
    key: string,
    value: string,
    scope: 'local' | 'global' | 'system' = 'local'
  ): Promise<void> {
    logger.debug(`Setting Git config: ${key} = ${value} (scope: ${scope})`);

    const args = ['config'];

    // Add scope flag
    if (scope === 'global') {
      args.push('--global');
    } else if (scope === 'system') {
      args.push('--system');
    } else {
      args.push('--local');
    }

    args.push(key, value);

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to set Git config ${key} to ${value}`,
        result.stderr
      );
    }

    logger.debug(`Git config ${key} set successfully`);
  }

  /**
   * Finds the most recent common ancestor between two branches
   * 
   * @param branchA - First branch name
   * @param branchB - Second branch name
   * @returns Commit hash of the merge base
   * @throws BranchNotFoundError if either branch does not exist
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const mergeBase = await gitModule.getMergeBase("main", "feature");
   * // => "a1b2c3d4e5f6..."
   */
  async getMergeBase(branchA: string, branchB: string): Promise<string> {
    // Verify both branches exist
    if (!(await this.branchExists(branchA))) {
      throw new BranchNotFoundError(branchA);
    }
    if (!(await this.branchExists(branchB))) {
      throw new BranchNotFoundError(branchB);
    }

    const result = await this.execGit(['merge-base', branchA, branchB]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to find merge base between ${branchA} and ${branchB}`,
        result.stderr
      );
    }

    return result.stdout.trim();
  }

  /**
   * Returns a list of files changed between two commits
   * 
   * @param fromCommit - Source commit or reference
   * @param toCommit - Target commit or reference
   * @param pathFilter - Optional path filter (e.g., ".gitgov/")
   * @returns Array of changed files with their status
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const changes = await gitModule.getChangedFiles("HEAD~1", "HEAD", ".gitgov/");
   * // => [{ status: "M", file: ".gitgov/tasks/123.json" }]
   */
  async getChangedFiles(
    fromCommit: string,
    toCommit: string,
    pathFilter: string
  ): Promise<ChangedFile[]> {
    const args = [
      'diff',
      '--name-status',
      `${fromCommit}..${toCommit}`,
      '--',
      pathFilter,
    ];

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to get changed files', result.stderr);
    }

    // Parse output: "M\tfile.txt\nA\tfile2.txt"
    return result.stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split('\t');
        if (parts.length < 2) {
          throw new GitCommandError('Invalid git diff output format', line);
        }
        return {
          status: parts[0]! as 'A' | 'M' | 'D',
          file: parts[1]!,
        };
      });
  }

  /**
   * Get list of staged files (in staging area / index)
   * 
   * Used during conflict resolution to identify which files the user resolved and staged.
   * 
   * @returns Array of file paths that are currently staged
   * @throws GitCommandError if operation fails
   * 
   * @example
   * // After user resolves conflict and does: git add .gitgov/tasks/123.json
   * const staged = await gitModule.getStagedFiles();
   * // => [".gitgov/tasks/123.json"]
   */
  async getStagedFiles(): Promise<string[]> {
    console.log("[getStagedFiles DEBUG] Getting staged files...");
    const args = ['diff', '--cached', '--name-only'];

    const result = await this.execGit(args);
    console.log("[getStagedFiles DEBUG] exitCode:", result.exitCode);
    console.log("[getStagedFiles DEBUG] stdout:", result.stdout);
    console.log("[getStagedFiles DEBUG] stderr:", result.stderr);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to get staged files', result.stderr);
    }

    // Parse output: "file1.txt\nfile2.txt\n"
    const files = result.stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    console.log("[getStagedFiles DEBUG] Parsed files:", files);
    return files;
  }

  /**
   * Retrieves the content of a file at a specific point in history
   * 
   * @param commitHash - Commit hash
   * @param filePath - File path relative to repository root
   * @returns File content as string
   * @throws FileNotFoundError if file doesn't exist in that commit
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const content = await gitModule.getFileContent("abc123", ".gitgov/config.json");
   * // => '{"version": "1.0.0"}'
   */
  async getFileContent(commitHash: string, filePath: string): Promise<string> {
    const result = await this.execGit(['show', `${commitHash}:${filePath}`]);

    if (result.exitCode !== 0) {
      // Check if error is due to file not existing
      if (result.stderr.includes('does not exist') || result.stderr.includes('exists on disk, but not in')) {
        throw new FileNotFoundError(filePath, commitHash);
      }
      throw new GitCommandError(`Failed to get file content for ${filePath}`, result.stderr);
    }

    return result.stdout;
  }

  /**
   * Retrieves the commit history for a branch
   * 
   * @param branch - Branch name
   * @param options - Filtering and formatting options
   * @returns Array of commits ordered from newest to oldest
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const history = await gitModule.getCommitHistory("main", { maxCount: 10 });
   * // => [{ hash: "abc123", message: "Initial commit", author: "User <email>", date: "2025-01-01T00:00:00Z" }]
   */
  async getCommitHistory(
    branch: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    const args = ['log', branch, '--format=%H|%s|%an <%ae>|%aI'];

    if (options?.maxCount) {
      args.push(`--max-count=${options.maxCount}`);
    }

    if (options?.pathFilter) {
      args.push('--', options.pathFilter);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to get commit history for ${branch}`, result.stderr);
    }

    if (!result.stdout.trim()) {
      return [];
    }

    // Parse output: "hash|message|author|date"
    return result.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('|');
        if (parts.length < 4) {
          throw new GitCommandError('Invalid git log output format', line);
        }
        return {
          hash: parts[0]!,
          message: parts[1]!,
          author: parts[2]!,
          date: parts[3]!,
        };
      });
  }

  /**
   * Retrieves commit history in a specific range
   * 
   * @param fromHash - Starting commit hash (exclusive)
   * @param toHash - Ending commit hash (inclusive)
   * @param options - Filtering and formatting options
   * @returns Array of commits in the specified range
   * @throws GitCommandError if either commit doesn't exist
   * 
   * @example
   * const commits = await gitModule.getCommitHistoryRange("abc123", "def456");
   * // => [{ hash: "def456", ... }, { hash: "cba321", ... }]
   */
  async getCommitHistoryRange(
    fromHash: string,
    toHash: string,
    options?: GetCommitHistoryOptions
  ): Promise<CommitInfo[]> {
    const args = ['log', `${fromHash}..${toHash}`, '--format=%H|%s|%an <%ae>|%aI'];

    if (options?.maxCount) {
      args.push(`--max-count=${options.maxCount}`);
    }

    if (options?.pathFilter) {
      args.push('--', options.pathFilter);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to get commit history range ${fromHash}..${toHash}`,
        result.stderr
      );
    }

    if (!result.stdout.trim()) {
      return [];
    }

    // Parse output: "hash|message|author|date"
    return result.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('|');
        if (parts.length < 4) {
          throw new GitCommandError('Invalid git log output format', line);
        }
        return {
          hash: parts[0]!,
          message: parts[1]!,
          author: parts[2]!,
          date: parts[3]!,
        };
      });
  }

  /**
   * Retrieves the full commit message for a specific commit
   * 
   * @param commitHash - Commit hash
   * @returns Full commit message as string
   * @throws GitCommandError if commit doesn't exist
   * 
   * @example
   * const message = await gitModule.getCommitMessage("abc123");
   * // => "feat: add new feature\n\nDetailed description..."
   */
  async getCommitMessage(commitHash: string): Promise<string> {
    const result = await this.execGit(['show', commitHash, '--format=%B', '--no-patch']);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to get commit message for ${commitHash}`, result.stderr);
    }

    return result.stdout.trim();
  }

  /**
   * Checks if there are uncommitted changes in the working directory
   * 
   * @param pathFilter - Optional path filter (e.g., ".gitgov/")
   * @returns true if there are uncommitted changes, false otherwise
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const hasChanges = await gitModule.hasUncommittedChanges(".gitgov/");
   * // => true
   */
  async hasUncommittedChanges(pathFilter?: string): Promise<boolean> {
    const args = ['status', '--porcelain'];

    if (pathFilter) {
      args.push('--', pathFilter);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to check for uncommitted changes', result.stderr);
    }

    return result.stdout.trim().length > 0;
  }

  /**
   * Checks if a rebase operation is currently in progress
   * 
   * @returns true if rebase is in progress, false otherwise
   * 
   * @example
   * const inRebase = await gitModule.isRebaseInProgress();
   * // => false
   */
  async isRebaseInProgress(): Promise<boolean> {
    const repoRoot = await this.ensureRepoRoot();
    const rebaseMergePath = path.join(repoRoot, '.git', 'rebase-merge');
    const rebaseApplyPath = path.join(repoRoot, '.git', 'rebase-apply');

    return fs.existsSync(rebaseMergePath) || fs.existsSync(rebaseApplyPath);
  }

  /**
   * Checks if a branch exists locally
   * 
   * @param branchName - Branch name to check
   * @returns true if branch exists, false otherwise
   * 
   * @example
   * const exists = await gitModule.branchExists("feature-branch");
   * // => true
   */
  async branchExists(branchName: string): Promise<boolean> {
    const result = await this.execGit(['branch', '--list', branchName]);

    if (result.exitCode !== 0) {
      return false;
    }

    return result.stdout.trim().length > 0;
  }

  /**
   * Lists all remote branches for a given remote
   * 
   * @param remoteName - Name of the remote (e.g., "origin")
   * @returns Array of remote branch names without the remote prefix
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const branches = await gitModule.listRemoteBranches("origin");
   * // => ["main", "develop", "gitgov-state"]
   * 
   * @note This method only returns the branch names, not the full "origin/branch" format
   */
  async listRemoteBranches(remoteName: string): Promise<string[]> {
    const result = await this.execGit(['branch', '-r', '--list', `${remoteName}/*`]);

    if (result.exitCode !== 0) {
      // If command fails, return empty array (e.g., remote doesn't exist)
      return [];
    }

    const output = result.stdout.trim();
    if (!output) {
      return [];
    }

    // Parse output: "  origin/main\n  origin/develop"
    // Strip "origin/" prefix and whitespace
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove "remoteName/" prefix
        const prefix = `${remoteName}/`;
        if (line.startsWith(prefix)) {
          return line.substring(prefix.length);
        }
        return line;
      })
      .filter(branch => branch.length > 0);
  }

  /**
   * Retrieves the tracking remote for a branch
   * 
   * @param branchName - Branch name
   * @returns Remote name or null if not configured
   * @throws BranchNotFoundError if branch doesn't exist
   * 
   * @example
   * const remote = await gitModule.getBranchRemote("main");
   * // => "origin"
   */
  async getBranchRemote(branchName: string): Promise<string | null> {
    if (!(await this.branchExists(branchName))) {
      throw new BranchNotFoundError(branchName);
    }

    const result = await this.execGit(['config', `branch.${branchName}.remote`]);

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdout.trim() || null;
  }

  /**
   * Retrieves the list of conflicted files during a rebase or merge
   * 
   * @returns Array of file paths in conflict
   * @throws GitCommandError if no rebase/merge in progress
   * 
   * @example
   * const conflicts = await gitModule.getConflictedFiles();
   * // => [".gitgov/tasks/123.json", ".gitgov/tasks/456.json"]
   */
  async getConflictedFiles(): Promise<string[]> {
    const result = await this.execGit(['diff', '--name-only', '--diff-filter=U']);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to get conflicted files', result.stderr);
    }

    if (!result.stdout.trim()) {
      return [];
    }

    return result.stdout.trim().split('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Switches to the specified branch
   * 
   * @param branchName - Branch name to checkout
   * @throws BranchNotFoundError if branch doesn't exist
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.checkoutBranch("feature-branch");
   */
  async checkoutBranch(branchName: string): Promise<void> {
    if (!(await this.branchExists(branchName))) {
      throw new BranchNotFoundError(branchName);
    }

    const result = await this.execGit(['checkout', branchName]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to checkout branch ${branchName}`, result.stderr);
    }
  }

  /**
   * Creates an orphan branch (no history) and switches to it
   * 
   * @param branchName - Orphan branch name to create
   * @throws GitCommandError if branch already exists or operation fails
   * 
   * @example
   * await gitModule.checkoutOrphanBranch("gitgov-state");
   */
  async checkoutOrphanBranch(branchName: string): Promise<void> {
    const result = await this.execGit(['checkout', '--orphan', branchName]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to create orphan branch ${branchName}`, result.stderr);
    }
  }

  /**
   * Fetches the latest changes from a remote repository
   * 
   * @param remote - Remote name (e.g., "origin")
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.fetch("origin");
   */
  async fetch(remote: string): Promise<void> {
    const result = await this.execGit(['fetch', remote]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to fetch from ${remote}`, result.stderr);
    }
  }

  /**
   * Pulls and merges a remote branch
   * 
   * @param remote - Remote name
   * @param branchName - Branch name
   * @throws MergeConflictError if merge conflicts occur
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.pull("origin", "main");
   */
  async pull(remote: string, branchName: string): Promise<void> {
    const result = await this.execGit(['pull', '--no-rebase', remote, branchName]);

    if (result.exitCode !== 0) {
      // Check if conflict occurred (check both stdout and stderr)
      const output = result.stdout + result.stderr;
      if (output.includes('CONFLICT') || output.includes('Automatic merge failed') || output.includes('fix conflicts')) {
        const conflictedFiles = await this.getConflictedFiles();
        throw new MergeConflictError(conflictedFiles);
      }
      throw new GitCommandError(`Failed to pull from ${remote}/${branchName}`, result.stderr);
    }
  }

  /**
   * Pulls and rebases a remote branch
   * 
   * @param remote - Remote name
   * @param branchName - Branch name
   * @throws RebaseConflictError if rebase conflicts occur
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.pullRebase("origin", "main");
   */
  async pullRebase(remote: string, branchName: string): Promise<void> {
    const result = await this.execGit(['pull', '--rebase', remote, branchName]);

    if (result.exitCode !== 0) {
      // Check if conflict occurred (check both stdout and stderr)
      const output = result.stdout + result.stderr;
      if (output.includes('CONFLICT') || output.includes('could not apply') || output.includes('fix conflicts') || output.includes('Resolve all conflicts')) {
        const conflictedFiles = await this.getConflictedFiles();
        throw new RebaseConflictError(conflictedFiles);
      }
      throw new GitCommandError(`Failed to pull --rebase from ${remote}/${branchName}`, result.stderr);
    }
  }

  /**
   * Resets the current branch to a specific commit, discarding all local changes
   * 
   * @param target - Commit hash or branch name
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.resetHard("HEAD~1");
   */
  async resetHard(target: string): Promise<void> {
    const result = await this.execGit(['reset', '--hard', target]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to reset --hard to ${target}`, result.stderr);
    }
  }

  /**
   * Checks out specific files from another branch into the current staging area
   * 
   * @param sourceBranch - Source branch name
   * @param filePaths - Array of file paths to checkout
   * @throws BranchNotFoundError if source branch doesn't exist
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.checkoutFilesFromBranch("main", [".gitgov/tasks/123.json"]);
   */
  async checkoutFilesFromBranch(sourceBranch: string, filePaths: string[]): Promise<void> {
    if (!(await this.branchExists(sourceBranch))) {
      throw new BranchNotFoundError(sourceBranch);
    }

    const result = await this.execGit(['checkout', sourceBranch, '--', ...filePaths]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to checkout files from ${sourceBranch}`,
        result.stderr
      );
    }
  }

  /**
   * Adds files to the staging area
   * 
   * @param filePaths - Array of file paths to add
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.add([".gitgov/tasks/123.json"]);
   */
  async add(filePaths: string[]): Promise<void> {
    const result = await this.execGit(['add', ...filePaths]);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to add files', result.stderr);
    }
  }

  /**
   * Removes files from both working directory and staging area
   * 
   * @param filePaths - Array of file paths to remove
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.rm([".gitgov/tasks/123.json"]);
   */
  async rm(filePaths: string[]): Promise<void> {
    const result = await this.execGit(['rm', ...filePaths]);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to remove files', result.stderr);
    }
  }

  /**
   * Creates a new commit with staged files
   * 
   * @param message - Commit message
   * @param author - Optional commit author
   * @returns Commit hash of the created commit
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const hash = await gitModule.commit("feat: add new task");
   * // => "abc123def456..."
   */
  async commit(message: string, author?: CommitAuthor): Promise<string> {
    // Use multiple -m arguments for multi-line messages
    // Git concatenates them with newlines
    const lines = message.split('\n');
    const args = ['commit'];

    // Add each line as a separate -m argument
    for (const line of lines) {
      args.push('-m', line);
    }

    if (author) {
      args.push('--author', `${author.name} <${author.email}>`);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to create commit', result.stderr);
    }

    // Get the commit hash
    const hashResult = await this.execGit(['rev-parse', 'HEAD']);
    return hashResult.stdout.trim();
  }

  /**
   * Creates an empty commit (no changes required)
   * 
   * @param message - Commit message
   * @param author - Optional commit author
   * @returns Commit hash of the created commit
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const hash = await gitModule.commitAllowEmpty("chore: initialize state branch");
   * // => "abc123def456..."
   */
  async commitAllowEmpty(message: string, author?: CommitAuthor): Promise<string> {
    const args = ['commit', '--allow-empty', '-m', message];

    if (author) {
      args.push('--author', `${author.name} <${author.email}>`);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to create empty commit', result.stderr);
    }

    // Get the commit hash
    const hashResult = await this.execGit(['rev-parse', 'HEAD']);
    return hashResult.stdout.trim();
  }

  /**
   * Pushes a local branch to a remote repository
   * 
   * @param remote - Remote name
   * @param branchName - Branch name
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.push("origin", "main");
   */
  async push(remote: string, branchName: string): Promise<void> {
    const result = await this.execGit(['push', remote, branchName]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to push ${branchName} to ${remote}`, result.stderr);
    }
  }

  /**
   * Pushes a local branch to a remote repository and sets up tracking
   * 
   * @param remote - Remote name
   * @param branchName - Branch name
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.pushWithUpstream("origin", "feature-branch");
   */
  async pushWithUpstream(remote: string, branchName: string): Promise<void> {
    const result = await this.execGit(['push', '-u', remote, branchName]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to push ${branchName} to ${remote} with upstream`,
        result.stderr
      );
    }
  }

  /**
   * Configures tracking for a local branch with a remote branch
   * 
   * @param branchName - Local branch name
   * @param remote - Remote name
   * @param remoteBranch - Remote branch name
   * @throws BranchNotFoundError if local branch doesn't exist
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.setUpstream("feature-branch", "origin", "feature-branch");
   */
  async setUpstream(
    branchName: string,
    remote: string,
    remoteBranch: string
  ): Promise<void> {
    if (!(await this.branchExists(branchName))) {
      throw new BranchNotFoundError(branchName);
    }

    const result = await this.execGit([
      'branch',
      '--set-upstream-to',
      `${remote}/${remoteBranch}`,
      branchName,
    ]);

    if (result.exitCode !== 0) {
      throw new GitCommandError(`Failed to set upstream for ${branchName}`, result.stderr);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REBASE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Continues a rebase after resolving conflicts
   * 
   * @returns Commit hash of the rebased commit
   * @throws RebaseNotInProgressError if no rebase is in progress
   * @throws GitCommandError if operation fails
   * 
   * @example
   * const hash = await gitModule.rebaseContinue();
   * // => "abc123def456..."
   */
  async rebaseContinue(): Promise<string> {
    console.log("[rebaseContinue] START");
    if (!(await this.isRebaseInProgress())) {
      throw new RebaseNotInProgressError();
    }
    console.log("[rebaseContinue] Rebase confirmed in progress");

    logger.debug('Continuing rebase...');
    console.log("[rebaseContinue] About to execute: git rebase --continue");
    const result = await this.execGit(['rebase', '--continue']);
    console.log("[rebaseContinue] Git command returned with exitCode:", result.exitCode);
    console.log("[rebaseContinue] stdout:", result.stdout);
    console.log("[rebaseContinue] stderr:", result.stderr);

    if (result.exitCode !== 0) {
      logger.error(`Rebase continue failed: ${result.stderr}`);
      throw new GitCommandError('Failed to continue rebase', result.stderr);
    }

    // Get the current commit hash
    const hashResult = await this.execGit(['rev-parse', 'HEAD']);
    const commitHash = hashResult.stdout.trim();
    logger.info(`Rebase continued successfully, commit: ${commitHash.substring(0, 8)}...`);
    console.log("[rebaseContinue] SUCCESS - commitHash:", commitHash);
    return commitHash;
  }

  /**
   * Aborts an ongoing rebase
   * 
   * @throws RebaseNotInProgressError if no rebase is in progress
   * @throws GitCommandError if operation fails
   * 
   * @example
   * await gitModule.rebaseAbort();
   */
  async rebaseAbort(): Promise<void> {
    if (!(await this.isRebaseInProgress())) {
      throw new RebaseNotInProgressError();
    }

    const result = await this.execGit(['rebase', '--abort']);

    if (result.exitCode !== 0) {
      throw new GitCommandError('Failed to abort rebase', result.stderr);
    }
  }

  /**
   * Creates a new branch and switches to it (git checkout -b)
   * 
   * @param branchName - Name of the branch to create
   * @param startPoint - Optional starting point (commit hash or branch name)
   * @throws GitCommandError if branch already exists or operation fails
   * @throws BranchAlreadyExistsError if the branch already exists locally
   */
  async createBranch(branchName: string, startPoint?: string): Promise<void> {
    // Check if branch already exists
    const exists = await this.branchExists(branchName);
    if (exists) {
      throw new BranchAlreadyExistsError(branchName);
    }

    const args = ['checkout', '-b', branchName];
    if (startPoint) {
      args.push(startPoint);
    }

    const result = await this.execGit(args);

    if (result.exitCode !== 0) {
      throw new GitCommandError(
        `Failed to create branch ${branchName}`,
        result.stderr
      );
    }

    logger.debug(`Created and checked out branch: ${branchName}`);
  }

  /**
   * Rebases current branch onto target branch (git rebase)
   * 
   * @param targetBranch - Branch to rebase onto
   * @throws GitCommandError if rebase fails
   * @throws RebaseConflictError if conflicts are detected during rebase
   */
  async rebase(targetBranch: string): Promise<void> {
    const result = await this.execGit(['rebase', targetBranch]);

    if (result.exitCode !== 0) {
      // Check if it's a conflict
      if (result.stderr.includes('CONFLICT') || result.stderr.includes('conflict')) {
        // Get conflicted files if possible
        try {
          const conflictedFiles = await this.getConflictedFiles();
          throw new RebaseConflictError(conflictedFiles);
        } catch {
          // If we can't get files, throw with empty array
          throw new RebaseConflictError([]);
        }
      }

      throw new GitCommandError(
        `Failed to rebase onto ${targetBranch}`,
        result.stderr
      );
    }

    logger.debug(`Rebased onto: ${targetBranch}`);
  }
}

