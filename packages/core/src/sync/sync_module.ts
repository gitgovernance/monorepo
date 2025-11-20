import type { GitModule } from "../git";
import type { ConfigManager } from "../config_manager";
import type { IIdentityAdapter } from "../adapters/identity_adapter";
import type { LintModule } from "../lint";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";
import { createLogger } from "../logger/logger";
import type { EmbeddedMetadataRecord, GitGovRecordPayload } from "../types";
import {
  SyncError,
  PushFromStateBranchError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  StateBranchSetupError,
  UncommittedChangesError,
} from "./errors";
import type {
  SyncModuleDependencies,
  SyncPushOptions,
  SyncPushResult,
  SyncPullOptions,
  SyncPullResult,
  SyncResolveOptions,
  SyncResolveResult,
  IntegrityViolation,
  AuditStateOptions,
  AuditStateReport,
  ConflictDiff,
  ConflictFileDiff,
  StateDeltaFile,
} from "./types";
import { readFileSync, existsSync, promises as fs } from "fs";
import { join } from "path";
import path from "path";

const logger = createLogger("[SyncModule] ");

/**
 * SyncModule - Manages state synchronization between local environment and gitgov-state branch
 *
 * Responsibilities:
 * - Create and maintain the gitgov-state branch (local and remote)
 * - Publish local changes (pushState)
 * - Pull remote changes (pullState)
 * - Resolve conflicts in a governed manner (resolveConflict)
 * - Audit state integrity (auditState)
 *
 * Philosophy:
 * - Pipeline Pattern: Sequential operations with validation at each phase
 * - Fail-Fast: Early verifications to avoid costly operations
 * - Strict Dependencies: All dependencies (git, config, identity, lint, indexer) are required for robust operations
 */
export class SyncModule {
  private git: GitModule;
  private config: ConfigManager;
  private identity: IIdentityAdapter;
  private lint: LintModule;
  private indexer: IIndexerAdapter;

  /**
   * Constructor with dependency injection
   */
  constructor(dependencies: SyncModuleDependencies) {
    // Validate required dependencies
    if (!dependencies.git) {
      throw new Error("GitModule is required for SyncModule");
    }
    if (!dependencies.config) {
      throw new Error("ConfigManager is required for SyncModule");
    }
    if (!dependencies.identity) {
      throw new Error("IdentityAdapter is required for SyncModule");
    }
    if (!dependencies.lint) {
      throw new Error("LintModule is required for SyncModule");
    }
    if (!dependencies.indexer) {
      throw new Error("IndexerAdapter is required for SyncModule");
    }

    this.git = dependencies.git;
    this.config = dependencies.config;
    this.identity = dependencies.identity;
    this.lint = dependencies.lint;
    this.indexer = dependencies.indexer;
  }


  /**
   * Gets the state branch name from configuration.
   * Default: "gitgov-state"
   *
   * [EARS-4]
   */
  async getStateBranchName(): Promise<string> {
    try {
      const config = await this.config.loadConfig();
      return config?.state?.branch ?? "gitgov-state";
    } catch {
      // If config loading fails, use default
      return "gitgov-state";
    }
  }

  /**
   * Ensures that the gitgov-state branch exists both locally and remotely.
   * If it doesn't exist, creates it as an orphan branch.
   *
   * Use cases (4 edge cases):
   * 1. Doesn't exist locally or remotely → Create orphan branch + initial commit + push
   * 2. Exists remotely, not locally → Fetch + create local + set tracking
   * 3. Exists locally, not remotely → Push + set tracking
   * 4. Exists both → Verify tracking
   *
   * [EARS-1, EARS-2, EARS-3]
   */
  async ensureStateBranch(): Promise<void> {
    const stateBranch = await this.getStateBranchName();
    const remoteName = "origin";

    try {
      // Check local and remote existence
      const existsLocal = await this.git.branchExists(stateBranch);

      // Fetch to update remote references
      try {
        await this.git.fetch(remoteName);
      } catch {
        // If fetch fails (e.g., no remote configured), continue with local logic
      }

      // Check remote branch existence using GitModule
      const remoteBranches = await this.git.listRemoteBranches(remoteName);
      const existsRemote = remoteBranches.includes(stateBranch);

      // CASE 1: Doesn't exist locally or remotely → Create orphan branch + initial commit + push
      if (!existsLocal && !existsRemote) {
        await this.createOrphanStateBranch(stateBranch, remoteName);
        return;
      }

      // CASE 2: Exists remotely, not locally → Create local tracking remote
      if (!existsLocal && existsRemote) {
        const currentBranch = await this.git.getCurrentBranch();

        // Create local branch tracking remote
        // Use git checkout -b instead of checkoutOrphanBranch to create a tracking branch
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const repoRoot = await this.git.getRepoRoot();

        try {
          // Create local branch tracking the remote branch
          await execAsync(`git checkout -b ${stateBranch} ${remoteName}/${stateBranch}`, { cwd: repoRoot });

          // Branch is now created and tracking remote, return to original branch
          if (currentBranch !== stateBranch) {
            await this.git.checkoutBranch(currentBranch);
          }
        } catch (checkoutError) {
          // If checkout fails, try to return to original branch
          try {
            await this.git.checkoutBranch(currentBranch);
          } catch {
            // Ignore rollback error
          }
          throw checkoutError;
        }

        return;
      }

      // CASE 3: Exists locally, not remotely → Push + set tracking
      if (existsLocal && !existsRemote) {
        // Checkout to the branch to be able to push
        const currentBranch = await this.git.getCurrentBranch();
        if (currentBranch !== stateBranch) {
          await this.git.checkoutBranch(stateBranch);
        }

        try {
          await this.git.pushWithUpstream(remoteName, stateBranch);
        } catch {
          // If push fails (e.g., no remote configured), continue without error
          // Local branch remains available for local use
        }

        // Return to the original branch if it was different
        if (currentBranch !== stateBranch) {
          await this.git.checkoutBranch(currentBranch);
        }
        return;
      }

      // CASE 4: Exists both → Verify tracking
      if (existsLocal && existsRemote) {
        const upstreamBranch = await this.git.getBranchRemote(stateBranch);
        if (!upstreamBranch || upstreamBranch !== `${remoteName}/${stateBranch}`) {
          await this.git.setUpstream(stateBranch, remoteName, stateBranch);
        }
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new StateBranchSetupError(
        `Failed to ensure state branch ${stateBranch}: ${errorMessage}`,
        error as Error
      );
    }
  }

  /**
   * Creates the gitgov-state orphan branch with an empty initial commit.
   * Used by ensureStateBranch when the branch doesn't exist locally or remotely.
   *
   * [EARS-1]
   */
  private async createOrphanStateBranch(
    stateBranch: string,
    remoteName: string
  ): Promise<void> {
    const currentBranch = await this.git.getCurrentBranch();
    const repoRoot = await this.git.getRepoRoot();

    try {
      // 1. Create orphan branch
      await this.git.checkoutOrphanBranch(stateBranch);

      // 2. Clean staging area and create initial commit
      // After `git checkout --orphan`, all files from previous branch are staged
      // We need to clear them and create an empty initial commit
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      try {
        // Remove all staged files
        await execAsync("git rm -rf . 2>/dev/null || true", { cwd: repoRoot });

        // Create initial commit directly with exec (more reliable than GitModule methods for orphan branch)
        await execAsync('git commit --allow-empty -m "Initialize state branch"', { cwd: repoRoot });
      } catch (commitError) {
        const error = commitError as { stderr?: string; message?: string };
        throw new Error(`Failed to create initial commit on orphan branch: ${error.stderr || error.message}`);
      }

      // 5. Push with upstream (if remote is configured)
      // Try to push - if it fails due to no remote, that's OK
      try {
        await this.git.pushWithUpstream(remoteName, stateBranch);
      } catch (pushError) {
        const pushErrorMsg = pushError instanceof Error ? pushError.message : String(pushError);
        // Only ignore error if remote doesn't exist
        // All other errors should be investigated/thrown
        const isNoRemoteError =
          pushErrorMsg.includes("does not appear to be") ||
          pushErrorMsg.includes("Could not read from remote");

        if (!isNoRemoteError) {
          // For other errors, propagate them (something went wrong)
          throw new Error(`Failed to push state branch to remote: ${pushErrorMsg}`);
        }
        // If no remote configured, continue - local branch is functional
      }

      // 6. Return to original branch
      await this.git.checkoutBranch(currentBranch);
    } catch (error) {
      // Rollback: try to return to original branch
      try {
        await this.git.checkoutBranch(currentBranch);
      } catch {
        // Ignore rollback error
      }
      throw error;
    }
  }

  /**
   * Calculates the file delta in .gitgov/ between the current branch and gitgov-state.
   *
   * [EARS-5]
   */
  async calculateStateDelta(sourceBranch: string): Promise<StateDeltaFile[]> {
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncError("Failed to get state branch name");
    }

    try {
      // Get changes between stateBranch and sourceBranch, filtering only .gitgov/
      const changedFiles = await this.git.getChangedFiles(
        stateBranch,
        sourceBranch,
        ".gitgov/"
      );

      return changedFiles.map((file) => ({
        status: file.status,
        file: file.file,
      }));
    } catch (error) {
      throw new SyncError(
        `Failed to calculate state delta: ${(error as Error).message}`
      );
    }
  }

  /**
   * Checks if a rebase is in progress.
   *
   * [EARS-22]
   */
  async isRebaseInProgress(): Promise<boolean> {
    return await this.git.isRebaseInProgress();
  }

  /**
   * Checks for absence of conflict markers in specified files.
   * Returns list of files that still have markers.
   *
   * [EARS-23]
   */
  async checkConflictMarkers(filePaths: string[]): Promise<string[]> {
    const repoRoot = await this.git.getRepoRoot();
    const filesWithMarkers: string[] = [];

    for (const filePath of filePaths) {
      try {
        const fullPath = join(repoRoot, filePath);
        if (!existsSync(fullPath)) {
          continue;
        }

        const content = readFileSync(fullPath, "utf-8");
        const hasMarkers =
          content.includes("<<<<<<<") ||
          content.includes("=======") ||
          content.includes(">>>>>>>");

        if (hasMarkers) {
          filesWithMarkers.push(filePath);
        }
      } catch {
        // If read fails, assume no markers
        continue;
      }
    }

    return filesWithMarkers;
  }

  /**
   * Gets the diff of conflicted files for manual analysis.
   * Useful so the actor can analyze conflicted changes before resolving.
   *
   * [EARS-31]
   */
  async getConflictDiff(filePaths?: string[]): Promise<ConflictDiff> {
    try {
      // Get conflicted files
      let conflictedFiles: string[];
      if (filePaths && filePaths.length > 0) {
        conflictedFiles = filePaths;
      } else {
        conflictedFiles = await this.git.getConflictedFiles();
      }

      if (conflictedFiles.length === 0) {
        return {
          files: [],
          message: "No conflicted files found",
          resolutionSteps: [],
        };
      }

      const repoRoot = await this.git.getRepoRoot();
      const files: ConflictFileDiff[] = [];

      for (const filePath of conflictedFiles) {
        const fullPath = join(repoRoot, filePath);

        try {
          // Read current content (with conflict markers)
          const localContent = existsSync(fullPath)
            ? readFileSync(fullPath, "utf-8")
            : "";

          // For simplicity, remote and base content are left empty
          // In a complete implementation, git show :1:path and :3:path would be used
          const remoteContent = "";
          const baseContent: string | null = null;

          // Detect lines with markers
          const conflictMarkers: Array<{ line: number; marker: string }> = [];
          const lines = localContent.split("\n");
          lines.forEach((line, index) => {
            if (line.startsWith("<<<<<<<")) {
              conflictMarkers.push({ line: index + 1, marker: "<<<<<<" });
            } else if (line.startsWith("=======")) {
              conflictMarkers.push({ line: index + 1, marker: "=======" });
            } else if (line.startsWith(">>>>>>>")) {
              conflictMarkers.push({ line: index + 1, marker: ">>>>>>>" });
            }
          });

          const fileDiff: ConflictFileDiff = {
            filePath,
            localContent,
            remoteContent,
            baseContent,
          };

          if (conflictMarkers.length > 0) {
            fileDiff.conflictMarkers = conflictMarkers;
          }

          files.push(fileDiff);
        } catch {
          // If reading a file fails, continue with the rest
          continue;
        }
      }

      return {
        files,
        message: `${files.length} file(s) in conflict`,
        resolutionSteps: [
          "1. Review the conflict diff for each file",
          "2. Manually edit conflicted files to resolve conflicts",
          "3. Remove all conflict markers (<<<<<<<, =======, >>>>>>>)",
          "4. Run 'gitgov sync resolve' to complete the resolution",
        ],
      };
    } catch (error) {
      throw new SyncError(
        `Failed to get conflict diff: ${(error as Error).message}`
      );
    }
  }

  /**
   * Verifies integrity of previous resolutions in gitgov-state history.
   * Returns list of violations if any exist.
   *
   * [EARS-24, EARS-25, EARS-26]
   */
  async verifyResolutionIntegrity(): Promise<IntegrityViolation[]> {
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncError("Failed to get state branch name");
    }
    const violations: IntegrityViolation[] = [];

    try {
      // Check if state branch exists
      const branchExists = await this.git.branchExists(stateBranch);
      if (!branchExists) {
        // Branch doesn't exist yet - no violations
        return violations;
      }

      // Get commit history from gitgov-state
      let commits;
      try {
        commits = await this.git.getCommitHistory(stateBranch, {
          maxCount: 1000, // Analyze last 1000 commits
        });
      } catch (error) {
        // If branch has no commits or getCommitHistory fails, return no violations
        return violations;
      }

      // Analyze history to detect rebase commits without resolution
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        if (!commit) continue;

        const message = commit.message.toLowerCase();

        // Detect rebase commits (common patterns)
        const isRebaseCommit =
          message.includes("rebase") ||
          message.includes("pick") ||
          message.includes("conflict");

        if (isRebaseCommit) {
          // Check if the next commit is a resolution
          const nextCommit = commits[i + 1];
          const isResolutionNext =
            nextCommit && nextCommit.message.toLowerCase().startsWith("resolution:");

          if (!isResolutionNext) {
            violations.push({
              rebaseCommitHash: commit.hash,
              commitMessage: commit.message,
              timestamp: commit.date,
              author: commit.author,
            });
          }
        }
      }

      return violations;
    } catch (error) {
      // If verification fails for any reason, return empty violations
      // This prevents audit from blocking operations due to verification errors
      return violations;
    }
  }

  /**
   * Complete audit of gitgov-state status.
   * Verifies integrity of resolutions, signatures in Records, checksums and expected files.
   *
   * [EARS-27, EARS-28, EARS-29, EARS-30]
   */
  async auditState(
    options: AuditStateOptions = {}
  ): Promise<AuditStateReport> {
    const scope = options.scope ?? "all";
    const verifySignatures = options.verifySignatures ?? true;
    const verifyChecksums = options.verifyChecksums ?? true;

    const report: AuditStateReport = {
      passed: true,
      scope,
      totalCommits: 0,
      rebaseCommits: 0,
      resolutionCommits: 0,
      integrityViolations: [],
      summary: "",
    };

    try {
      // 1. Verify resolution integrity
      const integrityViolations = await this.verifyResolutionIntegrity();
      report.integrityViolations = integrityViolations;

      if (integrityViolations.length > 0) {
        report.passed = false;
      }

      // 2. Count rebase and resolution commits
      const stateBranch = await this.getStateBranchName();
      const branchExists = await this.git.branchExists(stateBranch);

      if (branchExists) {
        try {
          const commits = await this.git.getCommitHistory(stateBranch, {
            maxCount: 1000,
          });

          report.totalCommits = commits.length;
          report.rebaseCommits = commits.filter((c) =>
            c.message.toLowerCase().includes("rebase")
          ).length;
          report.resolutionCommits = commits.filter((c) =>
            c.message.toLowerCase().startsWith("resolution:")
          ).length;
        } catch {
          // If getCommitHistory fails, use defaults (0)
          report.totalCommits = 0;
          report.rebaseCommits = 0;
          report.resolutionCommits = 0;
        }
      }

      // 3. Verify signatures and checksums using LintModule
      if (verifySignatures || verifyChecksums) {
        const lintReport = await this.lint.lint({
          validateChecksums: verifyChecksums,
          validateSignatures: verifySignatures,
          validateReferences: false,
          concurrent: true,
        });

        // Store complete LintReport for consumers to access detailed validation results
        report.lintReport = lintReport;

        // Update audit passed status based on lint errors
        if (lintReport.summary.errors > 0) {
          report.passed = false;
        }
      }

      // Note: Signature/checksum/file validation is delegated to LintModule

      // Generate summary
      const lintErrorCount = report.lintReport?.summary.errors || 0;
      const violationCount = report.integrityViolations.length + lintErrorCount;

      report.summary = report.passed
        ? `Audit passed. No violations found (scope: ${scope}).`
        : `Audit failed. Found ${violationCount} violation(s): ${report.integrityViolations.length} integrity + ${lintErrorCount} structural (scope: ${scope}).`;

      return report;
    } catch (error) {
      throw new SyncError(
        `Failed to audit state: ${(error as Error).message}`
      );
    }
  }

  /**
   * Publishes local state changes to gitgov-state.
   * Implements 3 phases: verification, reconciliation, publication.
   *
   * [EARS-6 through EARS-12]
   */
  async pushState(options: SyncPushOptions): Promise<SyncPushResult> {
    const { actorId, dryRun = false } = options;
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncError("Failed to get state branch name");
    }
    let sourceBranch = options.sourceBranch;

    // Debug logging helper
    const log = (msg: string) => logger.debug(`[pushState] ${msg}`);

    // Initialize result
    const result: SyncPushResult = {
      success: false,
      filesSynced: 0,
      sourceBranch: "",
      commitHash: null,
      commitMessage: null,
      conflictDetected: false,
    };

    // [EARS-43] Declare stash tracking variables in outer scope for error handling
    let stashHash: string | null = null;
    let savedBranch: string = sourceBranch || "";

    try {
      log('=== STARTING pushState ===');

      // PRE-CHECK: Get current branch if not specified
      if (!sourceBranch) {
        sourceBranch = await this.git.getCurrentBranch();
        log(`Got current branch: ${sourceBranch}`);
      }
      result.sourceBranch = sourceBranch;

      // PRE-CHECK: Verify we're not on gitgov-state (EARS-8)
      // This check must be FIRST, before audit
      if (sourceBranch === stateBranch) {
        log(`ERROR: Attempting to push from state branch ${stateBranch}`);
        throw new PushFromStateBranchError(stateBranch);
      }
      log(`Pre-check passed: pushing from ${sourceBranch} to ${stateBranch}`);

      // PHASE 0: Integrity Verification and Audit (EARS-6, EARS-7)
      log('Phase 0: Starting audit...');
      const auditReport = await this.auditState({ scope: "current" });
      log(`Audit result: ${auditReport.passed ? 'PASSED' : 'FAILED'}`);

      if (!auditReport.passed) {
        log(`Audit violations: ${auditReport.summary}`);
        result.conflictDetected = true;
        result.conflictInfo = {
          type: "integrity_violation",
          affectedFiles: [],
          message: auditReport.summary,
          resolutionSteps: [
            "Review audit violations",
            "Fix integrity issues before pushing",
          ],
        };
        result.error = "Integrity violations detected. Cannot push.";
        return result;
      }

      // Ensure state branch exists
      log('Ensuring state branch exists...');
      await this.ensureStateBranch();
      log('State branch confirmed');

      // PHASE 1: Automatic Reconciliation (EARS-9, EARS-10)
      log('=== Phase 1: Reconciliation ===');
      savedBranch = sourceBranch;
      log(`Saved branch: ${savedBranch}`);

      // [EARS-43] Check if current branch has untracked .gitgov/ files BEFORE stashing
      const isCurrentBranch = sourceBranch === (await this.git.getCurrentBranch());
      let hasUntrackedGitgovFiles = false;
      let tempDir: string | null = null;

      if (isCurrentBranch) {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const repoRoot = await this.git.getRepoRoot();

        try {
          const { stdout } = await execAsync('git status --porcelain .gitgov/', { cwd: repoRoot });
          hasUntrackedGitgovFiles = stdout.trim().length > 0;
          log(`[EARS-43] .gitgov/ has untracked/modified files: ${hasUntrackedGitgovFiles}`);
        } catch {
          hasUntrackedGitgovFiles = false;
        }

        // If untracked files exist, copy them to temp directory BEFORE stashing
        if (hasUntrackedGitgovFiles) {
          log('[EARS-43] Copying untracked .gitgov/ files to temp directory...');
          const os = await import("os");
          const path = await import("path");
          const fs = await import("fs/promises");

          tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitgov-sync-'));
          log(`[EARS-43] Created temp directory: ${tempDir}`);

          // Import whitelist
          const { SYNC_WHITELIST } = await import("./types");

          // Copy each whitelisted path to temp
          for (const item of SYNC_WHITELIST) {
            const sourcePath = path.join(repoRoot, '.gitgov', item);
            const destPath = path.join(tempDir, item);

            try {
              const stat = await fs.stat(sourcePath);

              if (stat.isDirectory()) {
                await fs.cp(sourcePath, destPath, { recursive: true });
                log(`[EARS-43] Copied directory to temp: ${item}`);
              } else if (stat.isFile()) {
                await fs.mkdir(path.dirname(destPath), { recursive: true });
                await fs.copyFile(sourcePath, destPath);
                log(`[EARS-43] Copied file to temp: ${item}`);
              }
            } catch (error) {
              log(`[EARS-43] Path ${item} does not exist, skipping`);
            }
          }
          log('[EARS-43] Temp copy complete');
        }
      }

      // [EARS-43] Stash uncommitted changes before checkout to allow sync from dirty working tree
      // This is safe because:
      // 1. Stash preserves all local changes including .gitgov/
      // 2. We restore the stash when returning to original branch
      // 3. Enables seamless workflow: dev can work + sync without committing
      log('[EARS-43] Checking for uncommitted changes before checkout...');
      const hasUncommittedBeforeCheckout = await this.git.hasUncommittedChanges();

      if (hasUncommittedBeforeCheckout) {
        log('[EARS-43] Uncommitted changes detected, stashing before checkout...');
        stashHash = await this.git.stash('gitgov-sync-temp-stash');
        log(`[EARS-43] Changes stashed: ${stashHash || 'none'}`);
      }

      // Helper function to restore stash when returning early
      const restoreStashAndReturn = async (returnResult: SyncPushResult): Promise<SyncPushResult> => {
        await this.git.checkoutBranch(savedBranch);
        if (stashHash) {
          try {
            await this.git.stashPop();
            log('[EARS-43] Stashed changes restored');
          } catch (stashError) {
            log(`[EARS-43] Failed to restore stash: ${stashError}`);
            returnResult.error = returnResult.error
              ? `${returnResult.error}. Failed to restore stashed changes.`
              : 'Failed to restore stashed changes. Run \'git stash pop\' manually.';
          }
        }
        return returnResult;
      };

      // Checkout to gitgov-state
      log(`Checking out to ${stateBranch}...`);
      await this.git.checkoutBranch(stateBranch);
      log(`Now on branch: ${await this.git.getCurrentBranch()}`);

      // Note: We don't check for uncommitted changes here because:
      // 1. Untracked files from working tree (like .gitgov/) are expected and harmless
      // 2. If there are actual staged changes, git commit will detect them
      // 3. This allows seamless workflow without false positives from untracked files

      // Attempt pull --rebase to reconcile with remote
      log('Attempting pull --rebase...');
      try {
        await this.git.pullRebase("origin", stateBranch);
        log('Pull rebase successful');
      } catch (error) {
        // Check if error is because we're already up to date or remote doesn't exist
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Pull rebase failed: ${errorMsg}`);

        const isAlreadyUpToDate = errorMsg.includes("up to date") || errorMsg.includes("up-to-date");
        const isNoRemote = errorMsg.includes("does not appear to be") || errorMsg.includes("Could not read from remote");

        if (isAlreadyUpToDate || isNoRemote) {
          log('Pull failed but continuing (already up-to-date or no remote)');
          // Not an error - we're up to date or no remote configured
          // Continue with local push
        } else {
          // Detect if it's a conflict
          const conflictedFiles = await this.git.getConflictedFiles();
          if (conflictedFiles.length > 0) {
            // Abort rebase and restore clean state
            await this.git.rebaseAbort();

            result.conflictDetected = true;
            result.conflictInfo = {
              type: "rebase_conflict",
              affectedFiles: conflictedFiles,
              message: "Conflict detected during automatic reconciliation",
              resolutionSteps: [
                "Pull remote changes first: gitgov sync pull",
                "Resolve any conflicts",
                "Then push your changes",
              ],
            };
            result.error = "Conflict detected during reconciliation";
            return await restoreStashAndReturn(result);
          }

          // If not conflict or "already up to date", propagate error
          throw error;
        }
      }

      // PHASE 2: Publication (EARS-11, EARS-12, EARS-41, EARS-42)
      log('=== Phase 2: Publication ===');

      // [EARS-41] Detect first push: check if .gitgov/ exists in gitgov-state
      log('Checking if .gitgov/ exists in gitgov-state...');
      let isFirstPush = false;
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const repoRoot = await this.git.getRepoRoot();

        // Check if .gitgov/ directory exists in gitgov-state branch
        const { stdout } = await execAsync(
          `git ls-tree -d ${stateBranch} .gitgov`,
          { cwd: repoRoot }
        );

        isFirstPush = !stdout.trim(); // If empty, .gitgov/ doesn't exist
        log(`First push detected: ${isFirstPush}`);
      } catch (error) {
        // If command fails, assume first push
        log('Error checking .gitgov/ existence, assuming first push');
        isFirstPush = true;
      }

      // Calculate change delta (skip for first push, will copy everything from whitelist)
      let delta: StateDeltaFile[] = [];
      if (!isFirstPush) {
        log('Calculating state delta...');
        delta = await this.calculateStateDelta(sourceBranch);
        log(`Delta: ${delta.length} file(s) changed`);

        // If no changes, return without commit (EARS-11)
        if (delta.length === 0) {
          log('No changes detected, returning without commit');
          result.success = true;
          result.filesSynced = 0;
          return await restoreStashAndReturn(result);
        }
      } else {
        log('First push: will copy all whitelisted files');
      }

      // [EARS-42] & [EARS-43] Copy files from source branch using whitelist
      log(`Checking out whitelisted .gitgov/ files from ${sourceBranch}...`);

      // Import whitelist
      const { SYNC_WHITELIST } = await import("./types");

      // Build paths for whitelist items
      const allWhitelistedPaths = SYNC_WHITELIST;
      log(`Whitelist paths: ${allWhitelistedPaths.join(', ')}`);

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const repoRoot = await this.git.getRepoRoot();
      const fs = await import("fs/promises");
      const path = await import("path");

      // Note: untracked file detection was moved earlier, before stashing

      // If we have temp directory with untracked files, copy from there
      // Otherwise, use git checkout from source branch
      if (tempDir) {
        log('[EARS-43] Copying whitelisted files from temp directory...');

        // Copy each whitelisted path from temp to gitgov-state
        for (const item of allWhitelistedPaths) {
          const sourcePath = path.join(tempDir, item);
          const destPath = path.join(repoRoot, '.gitgov', item);

          try {
            const stat = await fs.stat(sourcePath);

            if (stat.isDirectory()) {
              // Copy directory recursively
              await fs.cp(sourcePath, destPath, { recursive: true, force: true });
              log(`[EARS-43] Copied directory from temp: ${item}`);
            } else if (stat.isFile()) {
              // Copy file
              await fs.mkdir(path.dirname(destPath), { recursive: true });
              await fs.copyFile(sourcePath, destPath);
              log(`[EARS-43] Copied file from temp: ${item}`);
            }
          } catch (error) {
            // Path doesn't exist, skip it
            log(`[EARS-43] Path ${item} does not exist in temp, skipping`);
          }
        }
        log('[EARS-43] Temp directory copy complete');
      } else {
        // Use git checkout for tracked files
        log('Copying whitelisted files from git...');

        const existingPaths: string[] = [];
        for (const item of allWhitelistedPaths) {
          const fullPath = `.gitgov/${item}`;
          try {
            const { stdout } = await execAsync(
              `git ls-tree -r ${sourceBranch} ${fullPath}`,
              { cwd: repoRoot }
            );
            if (stdout.trim()) {
              existingPaths.push(fullPath);
            }
          } catch {
            log(`Path ${item} does not exist in ${sourceBranch}, skipping`);
          }
        }

        log(`Existing whitelisted paths: ${existingPaths.length} of ${allWhitelistedPaths.length}`);

        if (existingPaths.length === 0) {
          log('No whitelisted files to sync, aborting');
          result.success = true;
          result.filesSynced = 0;
          return await restoreStashAndReturn(result);
        }

        // Copy only existing whitelisted files
        await this.git.checkoutFilesFromBranch(sourceBranch, existingPaths);
        log('Whitelisted files checked out successfully');
      }

      // Create structured commit message
      const timestamp = new Date().toISOString();

      // For first push, we need to recalculate delta now that files are staged
      if (isFirstPush) {
        // Stage the copied files first
        await this.git.add([".gitgov"]);

        // Get list of staged files for commit message
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const repoRoot = await this.git.getRepoRoot();

        try {
          const { stdout } = await execAsync(
            'git diff --cached --name-status',
            { cwd: repoRoot }
          );

          const lines = stdout.trim().split('\n').filter(l => l);
          delta = lines
            .map(line => {
              const [status, file] = line.split('\t');
              if (!file) return null; // Skip invalid lines
              return {
                status: status as 'A' | 'M' | 'D',
                file
              };
            })
            .filter((item): item is StateDeltaFile => item !== null);
          log(`First push delta calculated: ${delta.length} file(s)`);
        } catch (error) {
          log('Error calculating first push delta, using empty delta');
          delta = [];
        }
      }

      const commitMessage =
        `sync: ${isFirstPush ? 'Initial state' : 'Publish state'} from ${sourceBranch}\n\n` +
        `Actor: ${actorId}\n` +
        `Timestamp: ${timestamp}\n` +
        `Files: ${delta.length} file(s) ${isFirstPush ? 'synced (initial)' : 'changed'}\n\n` +
        delta.map((d) => `${d.status} ${d.file}`).join("\n");

      result.commitMessage = commitMessage;

      if (!dryRun) {
        // Stage changes (skip if already staged during first push delta calculation)
        if (!isFirstPush) {
          log('Staging changes...');
          await this.git.add([".gitgov"]);
          log('Changes staged');
        }

        // Verify there are staged changes
        const hasStaged = await this.git.hasUncommittedChanges();
        log(`Has staged changes: ${hasStaged}`);

        if (!hasStaged) {
          log('No staged changes detected, returning without commit');
          // No changes to commit - return early
          result.success = true;
          result.filesSynced = 0;
          return await restoreStashAndReturn(result);
        }

        // Create commit
        log('Creating commit...');
        try {
          const commitHash = await this.git.commit(commitMessage);
          log(`Commit created: ${commitHash}`);
          result.commitHash = commitHash;
        } catch (commitError) {
          // If commit fails, provide more context including stderr if available
          const errorMsg = commitError instanceof Error ? commitError.message : String(commitError);
          const stderr = (commitError as any).stderr || 'No stderr available';
          log(`ERROR: Commit failed: ${errorMsg}`);
          log(`ERROR: Git stderr: ${stderr}`);
          throw new Error(`Failed to create commit: ${errorMsg} | stderr: ${stderr}`);
        }

        // Push
        log('Pushing to remote...');
        try {
          await this.git.push("origin", stateBranch);
          log('Push successful');
        } catch (pushError) {
          // If push fails, check if it's a "no remote" error
          const pushErrorMsg = pushError instanceof Error ? pushError.message : String(pushError);
          log(`Push failed: ${pushErrorMsg}`);

          const isNoRemote = pushErrorMsg.includes("does not appear to be") || pushErrorMsg.includes("Could not read from remote");

          if (!isNoRemote) {
            log('ERROR: Push failed with non-remote error');
            // If it's not a "no remote" error, propagate it
            throw pushError;
          }
          log('Push failed due to no remote, continuing (local commit succeeded)');
          // Otherwise, continue - commit succeeded locally even if push failed
        }
      }

      // Return to original branch
      log(`Returning to ${savedBranch}...`);
      await this.git.checkoutBranch(savedBranch);
      log(`Back on ${await this.git.getCurrentBranch()}`);

      // [EARS-43] Restore stashed changes
      if (stashHash) {
        log('[EARS-43] Restoring stashed changes...');
        try {
          await this.git.stashPop();
          log('[EARS-43] Stashed changes restored successfully');
        } catch (stashError) {
          log(`[EARS-43] Warning: Failed to restore stashed changes: ${stashError}`);
          // Don't fail the push if stash pop fails, but warn the user
          result.error = `Push succeeded but failed to restore stashed changes. Run 'git stash pop' manually. Error: ${stashError}`;
        }
      }

      // [EARS-43] Cleanup temp directory
      if (tempDir) {
        log('[EARS-43] Cleaning up temp directory...');
        try {
          const fs = await import("fs/promises");
          await fs.rm(tempDir, { recursive: true, force: true });
          log('[EARS-43] Temp directory cleaned up');
        } catch (cleanupError) {
          log(`[EARS-43] Warning: Failed to cleanup temp directory: ${cleanupError}`);
        }
      }

      result.success = true;
      result.filesSynced = delta.length;
      log(`=== pushState COMPLETED SUCCESSFULLY: ${delta.length} files synced ===`);
      return result;
    } catch (error) {
      log(`=== pushState FAILED: ${(error as Error).message} ===`);

      // [EARS-43] Try to restore stashed changes even on error
      if (stashHash) {
        log('[EARS-43] Attempting to restore stashed changes after error...');
        try {
          // Try to return to original branch first
          const currentBranch = await this.git.getCurrentBranch();
          if (currentBranch !== savedBranch) {
            await this.git.checkoutBranch(savedBranch);
          }
          await this.git.stashPop();
          log('[EARS-43] Stashed changes restored after error');
        } catch (stashError) {
          log(`[EARS-43] Failed to restore stashed changes after error: ${stashError}`);
          // Add to error message
          const originalError = (error as Error).message;
          (error as Error).message = `${originalError}. Additionally, failed to restore stashed changes. Run 'git stash pop' manually.`;
        }
      }

      // Re-throw critical errors that should fail fast
      if (
        error instanceof PushFromStateBranchError ||
        error instanceof UncommittedChangesError
      ) {
        throw error;
      }

      // For other errors, return result with error message
      result.error = (error as Error).message;
      return result;
    }
  }

  /**
   * Pulls remote changes from gitgov-state to the local environment.
   * Includes automatic re-indexing if there are new changes.
   *
   * [EARS-13 through EARS-16]
   */
  async pullState(
    options: SyncPullOptions = {}
  ): Promise<SyncPullResult> {
    const { forceReindex = false } = options;
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncError("Failed to get state branch name");
    }

    const result: SyncPullResult = {
      success: false,
      hasChanges: false,
      filesUpdated: 0,
      reindexed: false,
      conflictDetected: false,
    };

    try {
      // 1. Pre-checks
      await this.ensureStateBranch();

      const savedBranch = await this.git.getCurrentBranch();

      // Checkout to gitgov-state
      await this.git.checkoutBranch(stateBranch);

      // Verify no uncommitted changes
      const hasUncommitted = await this.git.hasUncommittedChanges();
      if (hasUncommitted) {
        await this.git.checkoutBranch(savedBranch);
        throw new UncommittedChangesError(stateBranch);
      }

      // 2. Save current commit to compare later
      const commitBefore = await this.git.getCommitHistory(stateBranch, {
        maxCount: 1,
      });
      const hashBefore = commitBefore[0]?.hash;

      // 3. Fetch + Pull --rebase (EARS-13, EARS-14)
      await this.git.fetch("origin");

      try {
        await this.git.pullRebase("origin", stateBranch);
      } catch (error) {
        // Detect conflict
        const conflictedFiles = await this.git.getConflictedFiles();
        if (conflictedFiles.length > 0) {
          // Pause rebase (DO NOT abort) and return conflict
          await this.git.checkoutBranch(savedBranch);

          result.conflictDetected = true;
          result.conflictInfo = {
            type: "rebase_conflict",
            affectedFiles: conflictedFiles,
            message: "Conflict detected during pull",
            resolutionSteps: [
              "Review conflicted files",
              "Manually resolve conflicts",
              "Run 'gitgov sync resolve' to complete",
            ],
          };
          result.error = "Conflict detected during pull";
          return result;
        }

        // If not a conflict, propagate error
        throw error;
      }

      // 4. Check if there are new changes (EARS-15)
      const commitAfter = await this.git.getCommitHistory(stateBranch, {
        maxCount: 1,
      });
      const hashAfter = commitAfter[0]?.hash;

      const hasNewChanges = hashBefore !== hashAfter;
      result.hasChanges = hasNewChanges;

      // 5. Re-index if there are new changes or force requested (EARS-15, EARS-16)
      if (hasNewChanges || forceReindex) {
        result.reindexed = true;

        // Calculate number of changed files
        if (hasNewChanges && hashBefore && hashAfter) {
          const changedFiles = await this.git.getChangedFiles(
            hashBefore,
            hashAfter,
            ".gitgov/"
          );
          result.filesUpdated = changedFiles.length;
        }

        // Invoke indexer to regenerate cache (EARS-15, EARS-16)
        logger.info("Invoking IndexerAdapter.generateIndex() after pull...");
        try {
          await this.indexer.generateIndex();
          logger.info("Index regenerated successfully");
        } catch (error) {
          logger.warn(`Failed to regenerate index: ${(error as Error).message}`);
          // Non-critical: index regeneration failure doesn't fail the pull
        }
      }

      // 6. Copy .gitgov/ to filesystem in work branch (EARS-43 complement)
      // When .gitgov/ is ignored in work branch, we need to manually copy files
      // from gitgov-state to the filesystem so they're available for CLI commands
      const repoRoot = await this.git.getRepoRoot();
      const gitgovPath = path.join(repoRoot, ".gitgov");
      
      // Check if .gitgov/ exists in gitgov-state
      const gitgovExists = await fs.access(gitgovPath).then(() => true).catch(() => false);
      
      if (gitgovExists && hasNewChanges) {
        logger.debug("[pullState] Copying .gitgov/ to filesystem for work branch access");
        // Files will be copied when we return to savedBranch
        // Git will preserve .gitgov/ in the filesystem even though it's ignored
      }

      // 7. Return to original branch
      await this.git.checkoutBranch(savedBranch);
      
      // After returning to work branch, ensure .gitgov/ is accessible
      // If .gitgov/ is ignored, manually copy from gitgov-state
      if (gitgovExists) {
        try {
          // Check if .gitgov/ exists in current branch filesystem
          const gitgovExistsInWorkBranch = await fs.access(gitgovPath).then(() => true).catch(() => false);
          
          if (!gitgovExistsInWorkBranch || hasNewChanges) {
            logger.debug("[pullState] Restoring .gitgov/ to filesystem from gitgov-state");
            
            // Use git checkout to copy .gitgov/ from gitgov-state to filesystem
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);
            
            await execAsync(`git checkout ${stateBranch} -- .gitgov/`, { cwd: repoRoot });
            
            // Unstage the files (keep them untracked if .gitgov/ is ignored)
            await execAsync('git reset HEAD .gitgov/', { cwd: repoRoot });
            
            logger.debug("[pullState] .gitgov/ restored to filesystem successfully");
          }
        } catch (error) {
          logger.warn(`[pullState] Failed to restore .gitgov/ to filesystem: ${(error as Error).message}`);
          // Non-critical: user can manually restore with 'git checkout gitgov-state -- .gitgov/'
        }
      }

      result.success = true;
      return result;
    } catch (error) {
      // Re-throw critical errors that should fail fast
      if (error instanceof UncommittedChangesError) {
        throw error;
      }

      // For other errors, return result with error message
      result.error = (error as Error).message;
      return result;
    }
  }

  /**
   * Resolves state conflicts in a governed manner.
   * Updates resolved Records (recalculates checksum and adds resolver signature),
   * creates rebase and resolution commits signed according to protocol.
   *
   * [EARS-17 through EARS-23]
   */
  async resolveConflict(
    options: SyncResolveOptions
  ): Promise<SyncResolveResult> {
    const { reason, actorId } = options;

    // 1. Verify rebase is in progress (EARS-17)
    const rebaseInProgress = await this.isRebaseInProgress();
    if (!rebaseInProgress) {
      throw new NoRebaseInProgressError();
    }

    // 2. Get STAGED files (user already resolved and added them)
    console.log("[resolveConflict] Getting staged files...");
    const allStagedFiles = await this.git.getStagedFiles();
    console.log("[resolveConflict] All staged files:", allStagedFiles);

    // Filter to only .gitgov/*.json files (Records)
    const resolvedRecords = allStagedFiles.filter(f =>
      f.startsWith('.gitgov/') && f.endsWith('.json')
    );
    console.log("[resolveConflict] Resolved Records (staged .gitgov/*.json):", resolvedRecords);

    // 3. Verify conflict markers (EARS-18)
    console.log("[resolveConflict] Checking for conflict markers...");
    const filesWithMarkers = await this.checkConflictMarkers(resolvedRecords);
    console.log("[resolveConflict] Files with markers:", filesWithMarkers);
    if (filesWithMarkers.length > 0) {
      throw new ConflictMarkersPresentError(filesWithMarkers);
    }

    // 4. Update resolved Records (EARS-19)
    console.log("[resolveConflict] Updating resolved Records...");
    if (resolvedRecords.length > 0) {
      // Get current actor for signing
      const currentActor = await this.identity.getCurrentActor();
      console.log("[resolveConflict] Current actor:", currentActor);

      // Process each resolved Record
      console.log("[resolveConflict] Processing", resolvedRecords.length, "resolved Records");
      for (const filePath of resolvedRecords) {
        console.log("[resolveConflict] Processing Record:", filePath);

        try {
          const repoRoot = await this.git.getRepoRoot();
          const fullPath = join(repoRoot, filePath);

          // Read the resolved Record
          const content = readFileSync(fullPath, 'utf-8');
          const record = JSON.parse(content) as EmbeddedMetadataRecord<GitGovRecordPayload>;

          // Skip if not a valid EmbeddedMetadataRecord structure
          if (!record.header || !record.payload) {
            continue;
          }

          // Re-sign the record (this recalculates checksum AND adds new signature)
          const signedRecord = await this.identity.signRecord(
            record,
            currentActor.id,
            'resolver'
          );

          // Write back the updated Record
          const { writeFileSync } = await import('fs');
          writeFileSync(fullPath, JSON.stringify(signedRecord, null, 2) + '\n', 'utf-8');

          logger.info(`Updated Record: ${filePath} (new checksum + resolver signature)`);
          console.log("[resolveConflict] Successfully updated Record:", filePath);
        } catch (error) {
          // Log but don't fail - some files might not be Records
          logger.debug(`Skipping file ${filePath}: ${(error as Error).message}`);
          console.log("[resolveConflict] Error updating Record:", filePath, error);
        }
      }

      console.log("[resolveConflict] All Records updated, re-staging...");
    }

    // 5. Re-stage resolved files (now includes updated Records with new checksums/signatures)
    console.log("[resolveConflict] Re-staging .gitgov/ with updated metadata...");
    await this.git.add([".gitgov"]);

    // 6. Continue rebase (creates technical commit) (EARS-20)
    console.log("[resolveConflict] Step 6: Calling git.rebaseContinue() (THIS MAY HANG)...");
    await this.git.rebaseContinue();
    console.log("[resolveConflict] rebaseContinue completed successfully");

    // Get rebase commit hash
    const currentBranch = await this.git.getCurrentBranch();
    const rebaseCommit = await this.git.getCommitHistory(currentBranch, {
      maxCount: 1,
    });
    const rebaseCommitHash = rebaseCommit[0]?.hash ?? "";

    // 7. Create signed resolution commit (EARS-21)
    const timestamp = new Date().toISOString();
    const resolutionMessage =
      `resolution: Conflict resolved by ${actorId}\n\n` +
      `Actor: ${actorId}\n` +
      `Timestamp: ${timestamp}\n` +
      `Reason: ${reason}\n` +
      `Files: ${resolvedRecords.length} file(s) resolved\n\n` +
      `Signed-off-by: ${actorId}`;

    // Create resolution commit (may be empty if no additional changes)
    const resolutionCommitHash = await this.git.commitAllowEmpty(
      resolutionMessage
    );

    // 8. Re-index after conflict resolution (EARS-20)
    logger.info("Invoking IndexerAdapter.generateIndex() after conflict resolution...");
    try {
      await this.indexer.generateIndex();
      logger.info("Index regenerated successfully after conflict resolution");
    } catch (error) {
      logger.warn(`Failed to regenerate index after resolution: ${(error as Error).message}`);
      // Non-critical: index regeneration failure doesn't fail the resolution
    }

    return {
      success: true,
      rebaseCommitHash,
      resolutionCommitHash,
      conflictsResolved: resolvedRecords.length,
      resolvedBy: actorId,
      reason,
    };
  }
}
