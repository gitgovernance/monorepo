import type { IGitModule } from '../../git';
import type { ConfigManager } from "../../config_manager";
import type { IIdentityAdapter } from "../../adapters/identity_adapter";
import type { ILintModule } from "../../lint";
import type { IRecordProjector } from "../../record_projection";
import { createLogger } from "../../logger/logger";
import type { EmbeddedMetadataRecord, GitGovRecordPayload } from "../../record_types";
import {
  SyncStateError,
  PushFromStateBranchError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  StateBranchSetupError,
  UncommittedChangesError,
  ActorIdentityMismatchError,
} from "../sync_state.errors";
import type { ISyncStateModule } from "../sync_state";
import type {
  SyncStateModuleDependencies,
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
} from "../sync_state.types";
import { readFileSync, existsSync, promises as fs, writeFileSync } from "fs";
import { join } from "path";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { SYNC_DIRECTORIES, SYNC_ROOT_FILES, SYNC_ALLOWED_EXTENSIONS, SYNC_EXCLUDED_PATTERNS, LOCAL_ONLY_FILES } from "../sync_state.types";

// Create reusable helper
const execAsync = promisify(exec);

const logger = createLogger("[SyncStateModule] ");

/**
 * Helper: Check if a file should be synced to gitgov-state
 * Returns true only for allowed *.json files in SYNC_DIRECTORIES or SYNC_ROOT_FILES
 *
 * Accepts paths in multiple formats:
 * - .gitgov/tasks/foo.json (git ls-files output)
 * - /absolute/path/.gitgov/tasks/foo.json
 * - /tmp/tempdir/tasks/foo.json (tempDir copy without .gitgov)
 * - tasks/foo.json (relative to .gitgov)
 */
function shouldSyncFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);

  // Check if extension is allowed
  if (!SYNC_ALLOWED_EXTENSIONS.includes(ext as typeof SYNC_ALLOWED_EXTENSIONS[number])) {
    return false;
  }

  // Check if file matches any excluded pattern (.key, .backup, etc.)
  for (const pattern of SYNC_EXCLUDED_PATTERNS) {
    if (pattern.test(fileName)) {
      return false;
    }
  }

  // Check if it's a local-only file (.session.json, index.json, gitgov)
  if (LOCAL_ONLY_FILES.includes(fileName as typeof LOCAL_ONLY_FILES[number])) {
    return false;
  }

  // CRITICAL: Verify file is in an allowed sync directory or is a root sync file
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  // Find .gitgov in path and get the part after it
  const gitgovIndex = parts.findIndex(p => p === '.gitgov');

  let relativeParts: string[];
  if (gitgovIndex !== -1) {
    // Path contains .gitgov: .gitgov/tasks/foo.json or /path/.gitgov/tasks/foo.json
    relativeParts = parts.slice(gitgovIndex + 1);
  } else {
    // Path is relative to .gitgov or from tempDir: tasks/foo.json or /tmp/tempdir/tasks/foo.json
    // Check if any part matches a sync directory
    const syncDirIndex = parts.findIndex(p =>
      SYNC_DIRECTORIES.includes(p as typeof SYNC_DIRECTORIES[number])
    );
    if (syncDirIndex !== -1) {
      relativeParts = parts.slice(syncDirIndex);
    } else if (SYNC_ROOT_FILES.includes(fileName as typeof SYNC_ROOT_FILES[number])) {
      // It's a root sync file like config.json
      return true;
    } else {
      return false;
    }
  }

  if (relativeParts.length === 1) {
    // Root file: config.json
    return SYNC_ROOT_FILES.includes(relativeParts[0] as typeof SYNC_ROOT_FILES[number]);
  } else if (relativeParts.length >= 2) {
    // Directory file: tasks/foo.json
    const dirName = relativeParts[0];
    return SYNC_DIRECTORIES.includes(dirName as typeof SYNC_DIRECTORIES[number]);
  }

  return false;
}

/**
 * Helper: Recursively get all files in a directory
 */
async function getAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

/**
 * Helper: Copy only syncable files from source directory to destination
 * Filters to only copy *.json files, excluding keys, backups, etc.
 *
 * @param sourceDir - Source directory (tempDir with user's local files)
 * @param destDir - Destination directory (.gitgov in gitgov-state)
 * @param log - Logging function
 * @param excludeFiles - [EARS-B23] Files to exclude from copying (remote-only changes to preserve)
 */
async function copySyncableFiles(
  sourceDir: string,
  destDir: string,
  log: (msg: string) => void,
  excludeFiles: Set<string> = new Set()
): Promise<number> {
  let copiedCount = 0;

  // Copy sync directories (only *.json files)
  for (const dirName of SYNC_DIRECTORIES) {
    const sourcePath = path.join(sourceDir, dirName);
    const destPath = path.join(destDir, dirName);

    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) continue;

      // Get all files recursively
      const allFiles = await getAllFiles(sourcePath);

      for (const relativePath of allFiles) {
        const fullSourcePath = path.join(sourcePath, relativePath);
        const fullDestPath = path.join(destPath, relativePath);
        // [EARS-B23] Check if this file should be excluded (remote-only change)
        const gitgovRelativePath = `.gitgov/${dirName}/${relativePath}`;

        if (excludeFiles.has(gitgovRelativePath)) {
          log(`[EARS-B23] Skipped (remote-only change preserved): ${gitgovRelativePath}`);
          continue;
        }

        if (shouldSyncFile(fullSourcePath)) {
          await fs.mkdir(path.dirname(fullDestPath), { recursive: true });
          await fs.copyFile(fullSourcePath, fullDestPath);
          log(`Copied: ${dirName}/${relativePath}`);
          copiedCount++;
        } else {
          log(`Skipped (not syncable): ${dirName}/${relativePath}`);
        }
      }
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException).code;
      if (errCode !== 'ENOENT') {
        log(`Error processing ${dirName}: ${error}`);
      }
    }
  }

  // Copy root-level sync files
  for (const fileName of SYNC_ROOT_FILES) {
    const sourcePath = path.join(sourceDir, fileName);
    const destPath = path.join(destDir, fileName);
    // [EARS-B23] Check if this file should be excluded
    const gitgovRelativePath = `.gitgov/${fileName}`;

    if (excludeFiles.has(gitgovRelativePath)) {
      log(`[EARS-B23] Skipped (remote-only change preserved): ${gitgovRelativePath}`);
      continue;
    }

    try {
      await fs.copyFile(sourcePath, destPath);
      log(`Copied root file: ${fileName}`);
      copiedCount++;
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException).code;
      if (errCode !== 'ENOENT') {
        log(`Error copying ${fileName}: ${error}`);
      }
    }
  }

  return copiedCount;
}

/**
 * FsSyncStateModule - Manages state synchronization between local environment and gitgov-state branch
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
export class FsSyncStateModule implements ISyncStateModule {
  private git: IGitModule;
  private config: ConfigManager;
  private identity: IIdentityAdapter;
  private lint: ILintModule;
  private indexer: IRecordProjector;

  /**
   * Constructor with dependency injection
   */
  constructor(dependencies: SyncStateModuleDependencies) {
    // Validate required dependencies
    if (!dependencies.git) {
      throw new Error('IGitModule is required for SyncStateModule');
    }
    if (!dependencies.config) {
      throw new Error("ConfigManager is required for SyncStateModule");
    }
    if (!dependencies.identity) {
      throw new Error("IdentityAdapter is required for SyncStateModule");
    }
    if (!dependencies.lint) {
      throw new Error("LintModule is required for SyncStateModule");
    }
    if (!dependencies.indexer) {
      throw new Error("RecordProjector is required for SyncStateModule");
    }

    this.git = dependencies.git;
    this.config = dependencies.config;
    this.identity = dependencies.identity;
    this.lint = dependencies.lint;
    this.indexer = dependencies.indexer;
  }

  /**
   * Static method to bootstrap .gitgov/ from gitgov-state branch.
   * Used when cloning a repo that has gitgov-state but .gitgov/ is not in the work branch.
   *
   * This method only requires GitModule and can be called before full SyncStateModule initialization.
   *
   * @param gitModule - GitModule instance for git operations
   * @param stateBranch - Name of the state branch (default: "gitgov-state")
   * @returns Promise<{ success: boolean; error?: string }>
   */
  static async bootstrapFromStateBranch(
    gitModule: IGitModule,
    stateBranch: string = "gitgov-state"
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const repoRoot = await gitModule.getRepoRoot();

      // 1. Check if gitgov-state branch exists (local or remote)
      const hasLocalBranch = await gitModule.branchExists(stateBranch);

      let hasRemoteBranch = false;
      try {
        const remoteBranches = await gitModule.listRemoteBranches("origin");
        hasRemoteBranch = remoteBranches.includes(stateBranch);
      } catch {
        // Remote might not be configured, continue with local check
      }

      if (!hasLocalBranch && !hasRemoteBranch) {
        return {
          success: false,
          error: `State branch '${stateBranch}' does not exist locally or remotely`,
        };
      }

      // 2. If only remote exists, fetch it
      if (!hasLocalBranch && hasRemoteBranch) {
        try {
          const currentBranch = await gitModule.getCurrentBranch();
          await gitModule.fetch("origin");
          await execAsync(`git checkout -b ${stateBranch} origin/${stateBranch}`, { cwd: repoRoot });
          // Return to previous branch
          if (currentBranch && currentBranch !== stateBranch) {
            await gitModule.checkoutBranch(currentBranch);
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to fetch state branch: ${(error as Error).message}`,
          };
        }
      }

      // 3. Check if .gitgov/ exists in gitgov-state
      try {
        const { stdout } = await execAsync(`git ls-tree -r ${stateBranch} --name-only .gitgov/`, { cwd: repoRoot });
        if (!stdout.trim()) {
          return {
            success: false,
            error: `No .gitgov/ directory found in '${stateBranch}' branch`,
          };
        }
      } catch {
        return {
          success: false,
          error: `Failed to check .gitgov/ in '${stateBranch}' branch`,
        };
      }

      // 4. Copy .gitgov/ from gitgov-state to filesystem
      try {
        await execAsync(`git checkout ${stateBranch} -- .gitgov/`, { cwd: repoRoot });
        // Unstage the files (keep them untracked if .gitgov/ is ignored)
        await execAsync("git reset HEAD .gitgov/", { cwd: repoRoot });
        logger.info(`[bootstrapFromStateBranch] Successfully restored .gitgov/ from ${stateBranch}`);
      } catch (error) {
        return {
          success: false,
          error: `Failed to copy .gitgov/ from state branch: ${(error as Error).message}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Bootstrap failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Gets the state branch name from configuration.
   * Default: "gitgov-state"
   *
   * [EARS-A4]
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
   * [EARS-A1, EARS-A2, EARS-A3]
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
   * [EARS-A1]
   */
  private async createOrphanStateBranch(
    stateBranch: string,
    remoteName: string
  ): Promise<void> {
    const currentBranch = await this.git.getCurrentBranch();
    const repoRoot = await this.git.getRepoRoot();

    // Check if current branch has any commits (required to return after creating orphan)
    const currentBranchHasCommits = await this.git.branchExists(currentBranch);
    if (!currentBranchHasCommits) {
      throw new Error(
        `Cannot initialize GitGovernance: branch '${currentBranch}' has no commits. ` +
        `Please create an initial commit first (e.g., 'git commit --allow-empty -m "Initial commit"').`
      );
    }

    try {
      // 1. Create orphan branch
      await this.git.checkoutOrphanBranch(stateBranch);

      // 2. Clean staging area and create initial commit
      // After `git checkout --orphan`, all files from previous branch are staged
      // We need to clear them and create an empty initial commit

      try {
        // Remove all staged files
        await execAsync("git rm -rf . 2>/dev/null || true", { cwd: repoRoot });

        // [EARS-C10] Create .gitignore for LOCAL_ONLY_FILES and SYNC_EXCLUDED_PATTERNS
        // This prevents these files from appearing as untracked in gitgov-state
        const gitignoreContent = `# GitGovernance State Branch .gitignore
# This file is auto-generated during gitgov init
# These files are machine-specific and should NOT be synced

# Local-only files (regenerated/machine-specific)
index.json
.session.json
gitgov

# Private keys (never synced for security)
*.key

# Backup and temporary files
*.backup
*.backup-*
*.tmp
*.bak
`;
        const gitignorePath = path.join(repoRoot, '.gitignore');
        await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');
        await execAsync('git add .gitignore', { cwd: repoRoot });

        // Create initial commit directly with exec (more reliable than GitModule methods for orphan branch)
        await execAsync('git commit -m "Initialize state branch with .gitignore"', { cwd: repoRoot });
      } catch (commitError) {
        const error = commitError as { stderr?: string; message?: string };
        throw new Error(`Failed to create initial commit on orphan branch: ${error.stderr || error.message}`);
      }

      // 5. Push with upstream (if remote is configured)
      // First check if the remote is actually configured
      const hasRemote = await this.git.isRemoteConfigured(remoteName);

      if (hasRemote) {
        try {
          await this.git.pushWithUpstream(remoteName, stateBranch);
        } catch (pushError) {
          const pushErrorMsg = pushError instanceof Error ? pushError.message : String(pushError);
          // Only ignore error if it's a remote connectivity issue
          // All other errors should be investigated/thrown
          const isRemoteError =
            pushErrorMsg.includes("does not appear to be") ||
            pushErrorMsg.includes("Could not read from remote") ||
            pushErrorMsg.includes("repository not found");

          if (!isRemoteError) {
            // For other errors, propagate them (something went wrong)
            throw new Error(`Failed to push state branch to remote: ${pushErrorMsg}`);
          }
          // If remote connectivity issue, continue - local branch is functional
          logger.info(`Remote '${remoteName}' not reachable, gitgov-state branch created locally only`);
        }
      } else {
        // No remote configured, continue - local branch is functional
        logger.info(`No remote '${remoteName}' configured, gitgov-state branch created locally only`);
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

  /** Returns pending local changes not yet synced (delegates to calculateStateDelta) */
  async getPendingChanges(): Promise<StateDeltaFile[]> {
    try {
      return await this.calculateStateDelta('HEAD');
    } catch {
      return [];
    }
  }

  /**
   * Calculates the file delta in .gitgov/ between the current branch and gitgov-state.
   *
   * [EARS-A5]
   */
  async calculateStateDelta(sourceBranch: string): Promise<StateDeltaFile[]> {
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncStateError("Failed to get state branch name");
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
      throw new SyncStateError(
        `Failed to calculate state delta: ${(error as Error).message}`
      );
    }
  }

  /**
   * [EARS-B23] Detect file-level conflicts and identify remote-only changes.
   *
   * A conflict exists when:
   * 1. A file was modified by the remote during implicit pull
   * 2. AND the LOCAL USER also modified that same file (content in tempDir differs from what was in git before pull)
   *
   * This catches conflicts that git rebase can't detect because we copy files AFTER the pull.
   *
   * @param tempDir - Directory containing local .gitgov/ files (preserved before checkout)
   * @param repoRoot - Repository root path
  /**
   * Checks if a rebase is in progress.
   *
   * [EARS-D6]
   */
  async isRebaseInProgress(): Promise<boolean> {
    return await this.git.isRebaseInProgress();
  }

  /**
   * Checks for absence of conflict markers in specified files.
   * Returns list of files that still have markers.
   *
   * [EARS-D7]
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
   * [EARS-E8]
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
      throw new SyncStateError(
        `Failed to get conflict diff: ${(error as Error).message}`
      );
    }
  }

  /**
   * Verifies integrity of previous resolutions in gitgov-state history.
   * Returns list of violations if any exist.
   *
   * [EARS-E1, EARS-E2, EARS-E3]
   */
  async verifyResolutionIntegrity(): Promise<IntegrityViolation[]> {
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncStateError("Failed to get state branch name");
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
      // A "rebase commit" is one created by git during rebase (contains conflict markers that were resolved)
      // A "resolution commit" is one created by gitgov sync resolve (starts with "resolution:")
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        if (!commit) continue;

        const message = commit.message.toLowerCase();

        // Skip resolution commits - these are NOT rebase commits, they ARE the resolution
        if (message.startsWith("resolution:")) {
          continue;
        }

        // Skip sync commits - these are normal sync operations
        if (message.startsWith("sync:")) {
          continue;
        }

        // Detect explicit rebase-related commits (not our own commits)
        // Only flag commits that explicitly mention rebase operations
        const isExplicitRebaseCommit =
          message.includes("rebase") ||
          message.includes("pick ");

        if (isExplicitRebaseCommit) {
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
   * [EARS-E4, EARS-E5, EARS-E6, EARS-E7]
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
      throw new SyncStateError(
        `Failed to audit state: ${(error as Error).message}`
      );
    }
  }

  /**
   * Publishes local state changes to gitgov-state.
   * Implements 3 phases: verification, reconciliation, publication.
   *
   * [EARS-B1 through EARS-B7]
   */
  async pushState(options: SyncStatePushOptions): Promise<SyncStatePushResult> {
    const { actorId, dryRun = false } = options;
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncStateError("Failed to get state branch name");
    }
    let sourceBranch = options.sourceBranch;

    // Debug logging helper
    const log = (msg: string) => logger.debug(`[pushState] ${msg}`);

    // Initialize result
    const result: SyncStatePushResult = {
      success: false,
      filesSynced: 0,
      sourceBranch: "",
      commitHash: null,
      commitMessage: null,
      conflictDetected: false,
    };

    // [EARS-B10] Declare stash tracking variables in outer scope for error handling
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

      // PRE-CHECK: Verify we're not on gitgov-state (EARS-B3)
      // This check must be FIRST, before audit
      if (sourceBranch === stateBranch) {
        log(`ERROR: Attempting to push from state branch ${stateBranch}`);
        throw new PushFromStateBranchError(stateBranch);
      }
      log(`Pre-check passed: pushing from ${sourceBranch} to ${stateBranch}`);

      // PRE-CHECK: Verify actorId matches authenticated identity
      // Prevents impersonation — you can only push as the actor whose key you hold
      const currentActor = await this.identity.getCurrentActor();
      if (currentActor.id !== actorId) {
        log(`ERROR: Actor identity mismatch: requested '${actorId}' but authenticated as '${currentActor.id}'`);
        throw new ActorIdentityMismatchError(actorId, currentActor.id);
      }
      log(`Pre-check passed: actorId '${actorId}' matches authenticated identity`);

      // [EARS-B11] PRE-CHECK 1: Verify remote is configured for push (FIRST!)
      // This must be checked first because without remote, sync makes no sense
      const remoteName = "origin";
      const hasRemote = await this.git.isRemoteConfigured(remoteName);
      if (!hasRemote) {
        log(`ERROR: No remote '${remoteName}' configured`);
        throw new SyncStateError(
          `No remote repository configured. ` +
          `State sync requires a remote for multi-machine collaboration.\n` +
          `Add a remote with: git remote add origin <url>\n` +
          `Then push your changes: git push -u origin ${sourceBranch}`
        );
      }
      log(`Pre-check passed: remote '${remoteName}' configured`);

      // [EARS-B11] PRE-CHECK 2: Verify current branch has commits
      // This is required for creating gitgov-state orphan branch and returning to original branch
      const hasCommits = await this.git.branchExists(sourceBranch);
      if (!hasCommits) {
        log(`ERROR: Branch '${sourceBranch}' has no commits`);
        throw new SyncStateError(
          `Cannot sync: branch '${sourceBranch}' has no commits. ` +
          `Please create an initial commit first (e.g., 'git commit --allow-empty -m "Initial commit"').`
        );
      }
      log(`Pre-check passed: branch '${sourceBranch}' has commits`);

      // PHASE 0: Integrity Verification and Audit (EARS-B1, EARS-B2)
      log('Phase 0: Starting audit...');
      const auditReport = await this.auditState({ scope: "current" });
      log(`Audit result: ${auditReport.passed ? 'PASSED' : 'FAILED'}`);

      if (!auditReport.passed) {
        log(`Audit violations: ${auditReport.summary}`);

        // Extract affected files from lint errors and integrity violations
        const affectedFiles: string[] = [];
        const detailedErrors: string[] = [];

        // Add files from lintReport errors
        if (auditReport.lintReport?.results) {
          for (const r of auditReport.lintReport.results) {
            if (r.level === 'error') {
              if (!affectedFiles.includes(r.filePath)) {
                affectedFiles.push(r.filePath);
              }
              detailedErrors.push(`  • ${r.filePath}: [${r.validator}] ${r.message}`);
            }
          }
        }

        // Add info from integrity violations (commit-level)
        for (const v of auditReport.integrityViolations) {
          detailedErrors.push(`  • Commit ${v.rebaseCommitHash.slice(0, 8)}: ${v.commitMessage} (by ${v.author})`);
        }

        // Build detailed message
        const detailSection = detailedErrors.length > 0
          ? `\n\nDetails:\n${detailedErrors.join('\n')}`
          : '';

        result.conflictDetected = true;
        result.conflictInfo = {
          type: "integrity_violation",
          affectedFiles,
          message: auditReport.summary + detailSection,
          resolutionSteps: [
            "Run 'gitgov lint --fix' to auto-fix signature/checksum issues",
            "If issues persist, manually review the affected files",
            "Then retry: gitgov sync push",
          ],
        };
        result.error = "Integrity violations detected. Cannot push.";
        return result;
      }

      // Ensure state branch exists
      log('Ensuring state branch exists...');
      await this.ensureStateBranch();
      log('State branch confirmed');

      // PHASE 1: Automatic Reconciliation (EARS-B4, EARS-B5)
      log('=== Phase 1: Reconciliation ===');
      savedBranch = sourceBranch;
      log(`Saved branch: ${savedBranch}`);

      // [EARS-B10] Check if current branch has untracked .gitgov/ files BEFORE stashing
      const isCurrentBranch = sourceBranch === (await this.git.getCurrentBranch());
      let hasUntrackedGitgovFiles = false;
      let tempDir: string | null = null;

      if (isCurrentBranch) {
        const repoRoot = await this.git.getRepoRoot();
        const gitgovPath = path.join(repoRoot, '.gitgov');

        // Check if .gitgov/ EXISTS ON FILESYSTEM (not git status)
        // This is critical because .gitgov/ may be in .gitignore and git status won't show it
        hasUntrackedGitgovFiles = existsSync(gitgovPath);
        log(`[EARS-B10] .gitgov/ exists on filesystem: ${hasUntrackedGitgovFiles}`);

        // If untracked files exist, copy ENTIRE .gitgov/ to temp directory BEFORE stashing
        // This preserves ALL local files (not just SYNC_WHITELIST) for restoration after branch switch
        if (hasUntrackedGitgovFiles) {
          log('[EARS-B10] Copying ENTIRE .gitgov/ to temp directory for preservation...');

          tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitgov-sync-'));
          log(`[EARS-B10] Created temp directory: ${tempDir}`);

          // Copy entire .gitgov/ directory to preserve ALL files (including local-only files)
          await fs.cp(gitgovPath, tempDir, { recursive: true });
          log('[EARS-B10] Entire .gitgov/ copied to temp');
        }
      }

      // [EARS-B10] Stash uncommitted changes before checkout to allow sync from dirty working tree
      // This is safe because:
      // 1. Stash preserves all local changes including .gitgov/
      // 2. We restore the stash when returning to original branch
      // 3. Enables seamless workflow: dev can work + sync without committing
      log('[EARS-B10] Checking for uncommitted changes before checkout...');
      const hasUncommittedBeforeCheckout = await this.git.hasUncommittedChanges();

      if (hasUncommittedBeforeCheckout) {
        log('[EARS-B10] Uncommitted changes detected, stashing before checkout...');
        stashHash = await this.git.stash('gitgov-sync-temp-stash');
        log(`[EARS-B10] Changes stashed: ${stashHash || 'none'}`);
      }

      // Helper function to restore stash AND tempDir when returning early
      const restoreStashAndReturn = async (returnResult: SyncStatePushResult): Promise<SyncStatePushResult> => {
        await this.git.checkoutBranch(savedBranch);

        // [EARS-B14] CRITICAL: Always restore tempDir FIRST to preserve local files (keys, etc.)
        if (tempDir) {
          try {
            const repoRoot = await this.git.getRepoRoot();
            const gitgovDir = path.join(repoRoot, '.gitgov');

            // [EARS-B21] If implicit pull occurred, preserve new files from gitgov-state
            if (returnResult.implicitPull?.hasChanges) {
              log('[EARS-B21] Implicit pull detected in early return - preserving new files from gitgov-state...');
              // First checkout synced files from gitgov-state
              try {
                await this.git.checkoutFilesFromBranch(stateBranch, ['.gitgov/']);
                // [EARS-B24] Unstage files - git checkout adds them to staging area
                await execAsync('git reset HEAD .gitgov/ 2>/dev/null || true', { cwd: repoRoot });
                log('[EARS-B21] Synced files copied from gitgov-state (unstaged)');
              } catch (checkoutError) {
                log(`[EARS-B21] Warning: Failed to checkout from gitgov-state: ${checkoutError}`);
              }
              // Then restore LOCAL_ONLY_FILES and EXCLUDED files from tempDir
              // [EARS-B22] This includes .key files which are excluded from sync but must be preserved
              for (const fileName of LOCAL_ONLY_FILES) {
                const tempFilePath = path.join(tempDir, fileName);
                const destFilePath = path.join(gitgovDir, fileName);
                try {
                  await fs.access(tempFilePath);
                  await fs.cp(tempFilePath, destFilePath, { force: true });
                  log(`[EARS-B21] Restored LOCAL_ONLY_FILE: ${fileName}`);
                } catch {
                  // File doesn't exist in temp, that's ok
                }
              }

              // [EARS-B22] Restore files matching SYNC_EXCLUDED_PATTERNS (e.g., .key files)
              const restoreExcludedFilesEarly = async (dir: string, destDir: string) => {
                try {
                  const entries = await fs.readdir(dir, { withFileTypes: true });
                  for (const entry of entries) {
                    const srcPath = path.join(dir, entry.name);
                    const dstPath = path.join(destDir, entry.name);
                    if (entry.isDirectory()) {
                      await restoreExcludedFilesEarly(srcPath, dstPath);
                    } else {
                      const isExcluded = SYNC_EXCLUDED_PATTERNS.some(pattern => pattern.test(entry.name));
                      if (isExcluded) {
                        await fs.mkdir(path.dirname(dstPath), { recursive: true });
                        await fs.copyFile(srcPath, dstPath);
                        log(`[EARS-B22] Restored excluded file (early return): ${entry.name}`);
                      }
                    }
                  }
                } catch {
                  // Directory doesn't exist
                }
              };
              await restoreExcludedFilesEarly(tempDir, gitgovDir);
            } else {
              // No implicit pull - restore everything from temp (original behavior)
              log('[EARS-B14] Restoring .gitgov/ from temp directory (early return)...');
              await fs.cp(tempDir, gitgovDir, { recursive: true, force: true });
              log('[EARS-B14] .gitgov/ restored from temp (early return)');
            }

            // Cleanup temp
            await fs.rm(tempDir, { recursive: true, force: true });
            log('[EARS-B14] Temp directory cleaned up (early return)');
          } catch (tempRestoreError) {
            log(`[EARS-B14] WARNING: Failed to restore tempDir: ${tempRestoreError}`);
            returnResult.error = returnResult.error
              ? `${returnResult.error}. Failed to restore .gitgov/ from temp.`
              : `Failed to restore .gitgov/ from temp. Check /tmp for gitgov-sync-* directory.`;
          }
        }

        if (stashHash) {
          try {
            await this.git.stashPop();
            log('[EARS-B10] Stashed changes restored');
          } catch (stashError) {
            log(`[EARS-B10] Failed to restore stash: ${stashError}`);
            returnResult.error = returnResult.error
              ? `${returnResult.error}. Failed to restore stashed changes.`
              : 'Failed to restore stashed changes. Run \'git stash pop\' manually.';
          }
        }

        // [EARS-B21] Regenerate index if implicit pull brought changes (even on early return)
        if (returnResult.implicitPull?.hasChanges) {
          log('[EARS-B21] Regenerating index after implicit pull (early return)...');
          try {
            await this.indexer.generateIndex();
            returnResult.implicitPull.reindexed = true;
            log('[EARS-B21] Index regenerated successfully');
          } catch (indexError) {
            log(`[EARS-B21] Warning: Failed to regenerate index: ${indexError}`);
            returnResult.implicitPull.reindexed = false;
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

      // [EARS-B19] Capture files in gitgov-state BEFORE any changes to distinguish user deletions vs new remote files
      let filesBeforeChanges: Set<string> = new Set();
      try {
        const repoRoot = await this.git.getRepoRoot();
        const { stdout: filesOutput } = await execAsync(
          `git ls-files ".gitgov" 2>/dev/null || true`,
          { cwd: repoRoot }
        );
        filesBeforeChanges = new Set(filesOutput.trim().split('\n').filter(f => f && shouldSyncFile(f)));
        log(`[EARS-B19] Files in gitgov-state before changes: ${filesBeforeChanges.size}`);
      } catch {
        // Ignore - might be first commit
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // GIT-NATIVE SYNC FLOW
      // Order: Copy files → Commit locally → Pull --rebase → Push
      // This allows Git to detect conflicts naturally (modify/modify, delete/modify)
      // ═══════════════════════════════════════════════════════════════════════════

      // PHASE 2: Stage Local Changes (EARS-B6, EARS-B7, EARS-B8, EARS-B9)
      log('=== Phase 2: Publication ===');

      // [EARS-B8] Detect first push: check if .gitgov/ exists in gitgov-state
      log('Checking if .gitgov/ exists in gitgov-state...');
      let isFirstPush = false;
      try {
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

        // If no changes, return without commit (EARS-B6)
        if (delta.length === 0) {
          log('No changes detected, returning without commit');
          result.success = true;
          result.filesSynced = 0;
          return await restoreStashAndReturn(result);
        }
      } else {
        log('First push: will copy all whitelisted files');
      }

      // [EARS-B9] & [EARS-B10] Copy ONLY syncable files (*.json, no keys, no backups)
      log(`Copying syncable .gitgov/ files from ${sourceBranch}...`);
      log(`Sync directories: ${SYNC_DIRECTORIES.join(', ')}`);
      log(`Sync root files: ${SYNC_ROOT_FILES.join(', ')}`);

      const repoRoot = await this.git.getRepoRoot();

      // Note: untracked file detection was moved earlier, before stashing

      // If we have temp directory with untracked files, copy from there
      // Otherwise, use git checkout from source branch
      if (tempDir) {
        log('[EARS-B10] Copying ONLY syncable files from temp directory...');

        // Create .gitgov/ directory if it doesn't exist (first push to orphan branch)
        const gitgovDir = path.join(repoRoot, '.gitgov');
        await fs.mkdir(gitgovDir, { recursive: true });
        log(`[EARS-B10] Ensured .gitgov/ directory exists: ${gitgovDir}`);

        // Copy only syncable files (*.json, no keys, no backups)
        // Git-native flow: we copy ALL local files, then commit, then pull --rebase
        // Git will detect conflicts during rebase if same file was modified remotely
        const copiedCount = await copySyncableFiles(tempDir, gitgovDir, log);
        log(`[EARS-B10] Syncable files copy complete: ${copiedCount} files copied`);
      } else {
        // Use git checkout for tracked files
        log('Copying syncable files from git...');

        // Build list of paths that exist in source branch AND are syncable
        const existingPaths: string[] = [];

        // Check sync directories
        for (const dirName of SYNC_DIRECTORIES) {
          const fullPath = `.gitgov/${dirName}`;
          try {
            const { stdout } = await execAsync(
              `git ls-tree -r ${sourceBranch} -- ${fullPath}`,
              { cwd: repoRoot }
            );
            // Filter to only include syncable files (*.json, no keys, no backups)
            const lines = stdout.trim().split('\n').filter(l => l);
            for (const line of lines) {
              const parts = line.split('\t');
              const filePath = parts[1];
              if (filePath && shouldSyncFile(filePath)) {
                existingPaths.push(filePath);
              } else if (filePath) {
                log(`Skipped (not syncable): ${filePath}`);
              }
            }
          } catch {
            log(`Directory ${dirName} does not exist in ${sourceBranch}, skipping`);
          }
        }

        // Check root sync files
        for (const fileName of SYNC_ROOT_FILES) {
          const fullPath = `.gitgov/${fileName}`;
          try {
            const { stdout } = await execAsync(
              `git ls-tree ${sourceBranch} -- ${fullPath}`,
              { cwd: repoRoot }
            );
            if (stdout.trim()) {
              existingPaths.push(fullPath);
            }
          } catch {
            log(`File ${fileName} does not exist in ${sourceBranch}, skipping`);
          }
        }

        log(`Syncable paths found: ${existingPaths.length}`);

        if (existingPaths.length === 0) {
          log('No syncable files to sync, aborting');
          result.success = true;
          result.filesSynced = 0;
          return await restoreStashAndReturn(result);
        }

        // Copy only syncable files
        await this.git.checkoutFilesFromBranch(sourceBranch, existingPaths);
        log('Syncable files checked out successfully');
      }

      // Create structured commit message
      const timestamp = new Date().toISOString();

      // For first push, we need to recalculate delta now that files are staged
      if (isFirstPush) {
        // Stage the copied files first
        // Use force: true because .gitgov/ may be in .gitignore (by design)
        await this.git.add([".gitgov"], { force: true });

        // Get list of staged files for commit message
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
        // IMPORTANT: Stage ALL files FIRST, then cleanup non-syncable files
        // This ensures EARS-B14 can detect and remove untracked files from worktree
        // that shouldn't be synced (like .session.json, gitgov binary)
        if (!isFirstPush) {
          log('Staging all .gitgov/ files before cleanup...');
          // Use force: true because .gitgov/ may be in .gitignore (by design)
          await this.git.add([".gitgov"], { force: true });
          log('All files staged, proceeding to cleanup');
        }

        // [EARS-B14] Remove ALL non-syncable files from gitgov-state
        // This ensures only files that pass shouldSyncFile() remain in shared state
        // MUST run AFTER git add so we can detect and remove untracked files
        log('[EARS-B14] Scanning for non-syncable files in gitgov-state...');

        // Get ALL files currently in staging area for .gitgov/
        try {
          const { stdout: trackedFiles } = await execAsync(
            `git ls-files ".gitgov" 2>/dev/null || true`,
            { cwd: repoRoot }
          );
          const allTrackedFiles = trackedFiles.trim().split('\n').filter(f => f);
          log(`[EARS-B14] Found ${allTrackedFiles.length} staged/tracked files in .gitgov/`);

          // Remove any file that should NOT be synced (using the same shouldSyncFile() logic)
          for (const trackedFile of allTrackedFiles) {
            if (!shouldSyncFile(trackedFile)) {
              try {
                await execAsync(`git rm -f "${trackedFile}"`, { cwd: repoRoot });
                log(`[EARS-B14] Removed non-syncable file: ${trackedFile}`);
              } catch {
                // File might not exist or not be tracked anymore
              }
            }
          }
        } catch {
          // No tracked files, that's fine (first push)
        }

        log('[EARS-B14] Non-syncable files cleanup complete');

        // [EARS-B19] Sync deleted files: remove files from gitgov-state that no longer exist in source
        // This handles the case where a user deletes a record locally and pushes
        // In Git-native flow, deleted files will be detected during rebase if there's a conflict
        log('[EARS-B19] Checking for deleted files to sync...');

        try {
          // Get all syncable files in source (tempDir = user's local state)
          const sourceFiles = new Set<string>();

          // Recursively find all files in source
          const findSourceFiles = async (dir: string, prefix: string = '.gitgov') => {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = `${prefix}/${entry.name}`;
                if (entry.isDirectory()) {
                  await findSourceFiles(fullPath, relativePath);
                } else if (shouldSyncFile(relativePath)) {
                  sourceFiles.add(relativePath);
                }
              }
            } catch {
              // Directory doesn't exist, that's ok
            }
          };

          // Use tempDir if available (untracked files case), otherwise working tree
          const sourceDir = tempDir || path.join(repoRoot, '.gitgov');
          await findSourceFiles(sourceDir);
          log(`[EARS-B19] Found ${sourceFiles.size} syncable files in source (user's local state)`);
          log(`[EARS-B19] Files that existed before changes: ${filesBeforeChanges.size}`);

          // Delete files that:
          // 1. Existed in gitgov-state BEFORE our changes (filesBeforeChanges)
          // 2. Are NOT in user's local state (sourceFiles/tempDir)
          // This ensures we only delete files the user intentionally removed
          let deletedCount = 0;
          for (const fileBeforeChange of filesBeforeChanges) {
            if (!sourceFiles.has(fileBeforeChange)) {
              try {
                await execAsync(`git rm -f "${fileBeforeChange}"`, { cwd: repoRoot });
                log(`[EARS-B19] Deleted (user removed): ${fileBeforeChange}`);
                deletedCount++;
              } catch {
                // File might already be removed or not tracked
              }
            }
          }
          log(`[EARS-B19] Deleted ${deletedCount} files that user removed locally`);
        } catch (err) {
          log(`[EARS-B19] Warning: Failed to sync deleted files: ${err}`);
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
        log('Creating local commit...');
        try {
          const commitHash = await this.git.commit(commitMessage);
          log(`Local commit created: ${commitHash}`);
          result.commitHash = commitHash;
        } catch (commitError) {
          // Check if this is a "nothing to commit" error (common on second push with identical files)
          const errorMsg = commitError instanceof Error ? commitError.message : String(commitError);
          const stdout = (commitError as any).stdout || '';
          const stderr = (commitError as any).stderr || '';

          log(`Commit attempt output - stdout: ${stdout}, stderr: ${stderr}`);

          // Git returns exit code 1 with "nothing to commit" in stdout when there are no changes
          const isNothingToCommit =
            stdout.includes('nothing to commit') ||
            stderr.includes('nothing to commit') ||
            stdout.includes('nothing added to commit') ||
            stderr.includes('nothing added to commit');

          if (isNothingToCommit) {
            log('Nothing to commit - files are identical to gitgov-state HEAD');
            result.success = true;
            result.filesSynced = 0;
            return await restoreStashAndReturn(result);
          }

          // Otherwise, it's a real error
          log(`ERROR: Commit failed: ${errorMsg}`);
          log(`ERROR: Git stderr: ${stderr}`);
          throw new Error(`Failed to create commit: ${errorMsg} | stderr: ${stderr}`);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GIT-NATIVE CONFLICT DETECTION: Pull --rebase AFTER local commit
        // This is the key change: Git can now detect conflicts naturally because
        // we have a local commit to rebase onto the remote changes
        // ═══════════════════════════════════════════════════════════════════════════
        log('=== Phase 3: Reconcile with Remote (Git-Native) ===');

        // Capture hash before pull to detect if remote had changes
        let hashBeforePull: string | null = null;
        try {
          const { stdout: beforeHash } = await execAsync(`git rev-parse HEAD`, { cwd: repoRoot });
          hashBeforePull = beforeHash.trim();
          log(`Hash before pull: ${hashBeforePull}`);
        } catch {
          // Ignore
        }

        // Attempt pull --rebase to reconcile with remote
        log('Attempting git pull --rebase origin gitgov-state...');
        try {
          await this.git.pullRebase("origin", stateBranch);
          log('Pull rebase successful - no conflicts');

          // [EARS-B16] Check if remote had changes (implicit pull)
          if (hashBeforePull) {
            try {
              const { stdout: afterHash } = await execAsync(`git rev-parse HEAD`, { cwd: repoRoot });
              const hashAfterPull = afterHash.trim();

              if (hashAfterPull !== hashBeforePull) {
                // Our commit was rebased on top of remote changes
                const pulledChangedFiles = await this.git.getChangedFiles(hashBeforePull, hashAfterPull, ".gitgov/");
                result.implicitPull = {
                  hasChanges: true,
                  filesUpdated: pulledChangedFiles.length,
                  reindexed: false // Will be set to true after actual reindex
                };
                log(`[EARS-B16] Implicit pull: ${pulledChangedFiles.length} files from remote were rebased`);
              }
            } catch (e) {
              log(`[EARS-B16] Could not capture implicit pull details: ${e}`);
            }
          }
        } catch (pullError) {
          const errorMsg = pullError instanceof Error ? pullError.message : String(pullError);
          log(`Pull rebase result: ${errorMsg}`);

          const isAlreadyUpToDate = errorMsg.includes("up to date") || errorMsg.includes("up-to-date");
          const isNoRemote = errorMsg.includes("does not appear to be") || errorMsg.includes("Could not read from remote");
          const isNoUpstream = errorMsg.includes("no tracking information") || errorMsg.includes("There is no tracking information");

          if (isAlreadyUpToDate || isNoRemote || isNoUpstream) {
            log('Pull not needed or no remote - continuing to push');
            // Continue - we'll just push our local commit
          } else {
            // Check if it's a conflict - THIS IS THE GIT-NATIVE CONFLICT DETECTION
            const isRebaseInProgress = await this.isRebaseInProgress();
            const conflictedFiles = await this.git.getConflictedFiles();

            if (isRebaseInProgress || conflictedFiles.length > 0) {
              log(`[GIT-NATIVE] Conflict detected! Files: ${conflictedFiles.join(', ')}`);

              // DO NOT abort - leave rebase in progress for user to resolve with git tools
              result.conflictDetected = true;
              // Build dynamic resolution steps based on number of conflicted files
              const fileWord = conflictedFiles.length === 1 ? "file" : "files";
              const stageCommand = conflictedFiles.length === 1
                ? `git add ${conflictedFiles[0]}`
                : "git add .gitgov/";

              result.conflictInfo = {
                type: "rebase_conflict",
                affectedFiles: conflictedFiles,
                message: "Conflict detected during sync - Git has paused the rebase for manual resolution",
                resolutionSteps: [
                  `1. Edit the conflicted ${fileWord} to resolve conflicts (remove <<<<<<, ======, >>>>>> markers)`,
                  `2. Stage resolved ${fileWord}: ${stageCommand}`,
                  "3. Complete sync: gitgov sync resolve --reason 'your reason'",
                  "(This will continue the rebase, re-sign the record, and return you to your original branch)"
                ]
              };
              result.error = `Conflict detected: ${conflictedFiles.length} file(s) need manual resolution. Use 'git status' to see details.`;

              // DO NOT restore to original branch - user must resolve in gitgov-state
              // But restore stash to original branch if there was one
              if (stashHash) {
                try {
                  await this.git.checkoutBranch(sourceBranch);
                  await execAsync('git stash pop', { cwd: repoRoot });
                  await this.git.checkoutBranch(stateBranch);
                  log('Restored stash to original branch during conflict');
                } catch (stashErr) {
                  log(`Warning: Could not restore stash: ${stashErr}`);
                }
              }

              // CRITICAL: Restore LOCAL_ONLY_FILES and EXCLUDED files (.key) to gitgov-state
              // These are needed for signing during conflict resolution
              if (tempDir) {
                log('Restoring local files (.key, .session.json, etc.) for conflict resolution...');
                const gitgovInState = path.join(repoRoot, '.gitgov');

                // Restore LOCAL_ONLY_FILES
                for (const fileName of LOCAL_ONLY_FILES) {
                  const srcPath = path.join(tempDir, fileName);
                  const destPath = path.join(gitgovInState, fileName);
                  try {
                    await fs.access(srcPath);
                    await fs.cp(srcPath, destPath, { force: true });
                    log(`Restored LOCAL_ONLY_FILE for conflict resolution: ${fileName}`);
                  } catch {
                    // File doesn't exist in temp, ok
                  }
                }

                // Restore EXCLUDED files (like .key) recursively
                const restoreExcluded = async (srcDir: string, destDir: string) => {
                  try {
                    const entries = await fs.readdir(srcDir, { withFileTypes: true });
                    for (const entry of entries) {
                      const srcPath = path.join(srcDir, entry.name);
                      const dstPath = path.join(destDir, entry.name);
                      if (entry.isDirectory()) {
                        await restoreExcluded(srcPath, dstPath);
                      } else {
                        const isExcluded = SYNC_EXCLUDED_PATTERNS.some(pattern => pattern.test(entry.name));
                        if (isExcluded) {
                          await fs.mkdir(path.dirname(dstPath), { recursive: true });
                          await fs.copyFile(srcPath, dstPath);
                          log(`Restored EXCLUDED file for conflict resolution: ${entry.name}`);
                        }
                      }
                    }
                  } catch {
                    // Directory doesn't exist
                  }
                };
                await restoreExcluded(tempDir, gitgovInState);
                log('Local files restored for conflict resolution');
              }

              return result;
            }

            // Not a conflict, propagate the error
            throw pullError;
          }
        }

        // Push
        log('=== Phase 4: Push to Remote ===');
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

      // [EARS-B10] Restore stashed changes
      if (stashHash) {
        log('[EARS-B10] Restoring stashed changes...');
        try {
          await this.git.stashPop();
          log('[EARS-B10] Stashed changes restored successfully');
        } catch (stashError) {
          log(`[EARS-B10] Warning: Failed to restore stashed changes: ${stashError}`);
          // Don't fail the push if stash pop fails, but warn the user
          result.error = `Push succeeded but failed to restore stashed changes. Run 'git stash pop' manually. Error: ${stashError}`;
        }
      }

      // [EARS-B10] Restore files from temp directory back to working tree
      // [EARS-B18] If implicit pull occurred, we must keep the NEW synced files from gitgov-state,
      // only restoring LOCAL_ONLY_FILES from tempDir
      if (tempDir) {
        const repoRoot = await this.git.getRepoRoot();
        const gitgovDir = path.join(repoRoot, '.gitgov');

        if (result.implicitPull?.hasChanges) {
          // [EARS-B18] Implicit pull occurred - we need to preserve the new files from remote
          log('[EARS-B18] Implicit pull detected - copying synced files from gitgov-state first...');

          // First, checkout the synced directories/files from gitgov-state to work branch
          // This brings the newly pulled files to the work tree
          try {
            await this.git.checkoutFilesFromBranch(stateBranch, ['.gitgov/']);
            // [EARS-B24] Unstage files - git checkout adds them to staging area
            await execAsync('git reset HEAD .gitgov/ 2>/dev/null || true', { cwd: repoRoot });
            log('[EARS-B18] Synced files copied from gitgov-state to work branch (unstaged)');
          } catch (checkoutError) {
            log(`[EARS-B18] Warning: Failed to checkout from gitgov-state: ${checkoutError}`);
            // Fall back to restoring everything from temp
            await fs.cp(tempDir, gitgovDir, { recursive: true, force: true });
            log('[EARS-B18] Fallback: Entire .gitgov/ restored from temp');
          }

          // Then, restore LOCAL_ONLY_FILES and EXCLUDED files from tempDir (they're not in gitgov-state)
          // [EARS-B22] This includes .key files which are excluded from sync but must be preserved
          log('[EARS-B18] Restoring local-only files from temp directory...');

          // Restore LOCAL_ONLY_FILES (root level: .session.json, index.json, gitgov)
          for (const fileName of LOCAL_ONLY_FILES) {
            const tempFilePath = path.join(tempDir, fileName);
            const destFilePath = path.join(gitgovDir, fileName);
            try {
              await fs.access(tempFilePath);
              await fs.cp(tempFilePath, destFilePath, { force: true });
              log(`[EARS-B18] Restored LOCAL_ONLY_FILE: ${fileName}`);
            } catch {
              // File doesn't exist in temp, that's ok
            }
          }

          // [EARS-B22] Restore files matching SYNC_EXCLUDED_PATTERNS (e.g., .key files in actors/)
          // These are local-only files that exist in subdirectories
          const restoreExcludedFiles = async (dir: string, destDir: string) => {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(dir, entry.name);
                const dstPath = path.join(destDir, entry.name);

                if (entry.isDirectory()) {
                  await restoreExcludedFiles(srcPath, dstPath);
                } else {
                  // Check if this file matches any excluded pattern
                  const isExcluded = SYNC_EXCLUDED_PATTERNS.some(pattern => pattern.test(entry.name));
                  if (isExcluded) {
                    await fs.mkdir(path.dirname(dstPath), { recursive: true });
                    await fs.copyFile(srcPath, dstPath);
                    log(`[EARS-B22] Restored excluded file: ${entry.name}`);
                  }
                }
              }
            } catch {
              // Directory doesn't exist, that's ok
            }
          };

          await restoreExcludedFiles(tempDir, gitgovDir);
          log('[EARS-B22] Local-only and excluded files restored from temp');
        } else {
          // No implicit pull - restore everything from temp (original behavior)
          log('[EARS-B10] Restoring ENTIRE .gitgov/ from temp directory to working tree...');
          await fs.cp(tempDir, gitgovDir, { recursive: true, force: true });
          log('[EARS-B10] Entire .gitgov/ restored from temp');
        }

        // Cleanup temp directory
        log('[EARS-B10] Cleaning up temp directory...');
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          log('[EARS-B10] Temp directory cleaned up');
        } catch (cleanupError) {
          log(`[EARS-B10] Warning: Failed to cleanup temp directory: ${cleanupError}`);
        }
      }

      // [EARS-B17] If implicit pull occurred, regenerate index NOW (after returning to work branch)
      // Previously, reindexed: true was just a flag but indexer was never called - BUG!
      if (result.implicitPull?.hasChanges) {
        log('[EARS-B16] Regenerating index after implicit pull...');
        try {
          await this.indexer.generateIndex();
          result.implicitPull.reindexed = true;
          log('[EARS-B16] Index regenerated successfully after implicit pull');
        } catch (indexError) {
          log(`[EARS-B16] Warning: Failed to regenerate index after implicit pull: ${indexError}`);
          result.implicitPull.reindexed = false;
        }
      }

      result.success = true;
      result.filesSynced = delta.length;
      log(`=== pushState COMPLETED SUCCESSFULLY: ${delta.length} files synced ===`);
      return result;
    } catch (error) {
      log(`=== pushState FAILED: ${(error as Error).message} ===`);

      // [EARS-B10] Try to restore original branch even on error (ALWAYS, not just with stash)
      try {
        const currentBranch = await this.git.getCurrentBranch();
        if (currentBranch !== savedBranch && savedBranch) {
          log(`[EARS-B10] Restoring original branch: ${savedBranch}...`);
          await this.git.checkoutBranch(savedBranch);
          log(`[EARS-B10] Restored to ${savedBranch}`);
        }
      } catch (branchError) {
        log(`[EARS-B10] Failed to restore original branch: ${branchError}`);
      }

      // [EARS-B10] Try to restore stashed changes if any
      if (stashHash) {
        log('[EARS-B10] Attempting to restore stashed changes after error...');
        try {
          await this.git.stashPop();
          log('[EARS-B10] Stashed changes restored after error');
        } catch (stashError) {
          log(`[EARS-B10] Failed to restore stashed changes after error: ${stashError}`);
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
   * [EARS-C1 through EARS-C4]
   * [EARS-C5] Requires remote to be configured (pull without remote makes no sense)
   */
  async pullState(
    options: SyncStatePullOptions = {}
  ): Promise<SyncStatePullResult> {
    const { forceReindex = false, force = false } = options;
    const stateBranch = await this.getStateBranchName();
    if (!stateBranch) {
      throw new SyncStateError("Failed to get state branch name");
    }

    // Debug logging helper
    const log = (msg: string) => logger.debug(`[pullState] ${msg}`);

    // Initialize result
    const result: SyncStatePullResult = {
      success: false,
      hasChanges: false,
      filesUpdated: 0,
      reindexed: false,
      conflictDetected: false,
    };

    try {
      log('=== STARTING pullState ===');

      // ═══════════════════════════════════════════════════════════
      // PHASE 0: Pre-flight Checks (EARS-C5)
      // ═══════════════════════════════════════════════════════════
      log('Phase 0: Pre-flight checks...');

      // [EARS-C5] PRE-CHECK: Verify remote is configured (pull without remote is meaningless)
      const remoteName = "origin";
      const hasRemote = await this.git.isRemoteConfigured(remoteName);

      if (!hasRemote) {
        throw new SyncStateError(
          `No remote '${remoteName}' configured. Pull requires a remote repository. ` +
          `Add a remote with: git remote add origin <url>`
        );
      }

      // [EARS-C5] PRE-CHECK: Verify gitgov-state exists remotely
      // Fetch first to get latest remote refs
      await this.git.fetch(remoteName);
      const remoteBranches = await this.git.listRemoteBranches(remoteName);
      const existsRemote = remoteBranches.includes(stateBranch);

      if (!existsRemote) {
        // Check if local branch exists (maybe not pushed yet)
        const existsLocal = await this.git.branchExists(stateBranch);

        if (!existsLocal) {
          // Check if .gitgov/ exists - if so, user already ran init and just needs to push
          const repoRoot = await this.git.getRepoRoot();
          const gitgovPath = path.join(repoRoot, ".gitgov");
          const gitgovExists = existsSync(gitgovPath);

          if (gitgovExists) {
            // User has .gitgov/ but hasn't pushed yet - suggest sync push
            throw new SyncStateError(
              `State branch '${stateBranch}' does not exist remotely yet. ` +
              `Run 'gitgov sync push' to publish your local state to the remote.`
            );
          } else {
            // User hasn't initialized at all
            throw new SyncStateError(
              `State branch '${stateBranch}' does not exist locally or remotely. ` +
              `Run 'gitgov init' first to initialize GitGovernance, then 'gitgov sync push' to publish.`
            );
          }
        }

        // Local exists but remote doesn't - nothing to pull
        result.success = true;
        result.hasChanges = false;
        result.filesUpdated = 0;
        logger.info(`[pullState] State branch exists locally but not remotely. Nothing to pull.`);
        return result;
      }

      log('Pre-flight checks complete');

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: Branch Setup and Verification
      // ═══════════════════════════════════════════════════════════
      log('Phase 1: Setting up branches...');

      // Get repoRoot early for use throughout this function
      const pullRepoRoot = await this.git.getRepoRoot();

      // 1. Pre-checks - ensure local branch tracks remote
      await this.ensureStateBranch();

      const savedBranch = await this.git.getCurrentBranch();

      // [EARS-C8] Save LOCAL_ONLY_FILES before checkout
      // When .gitgov/ is untracked on work branch but tracked on gitgov-state,
      // git checkout will fail or overwrite files. We save local-only files first.
      const savedLocalFiles: Map<string, string> = new Map();
      try {
        for (const fileName of LOCAL_ONLY_FILES) {
          const filePath = path.join(pullRepoRoot, ".gitgov", fileName);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            savedLocalFiles.set(fileName, content);
            log(`[EARS-C8] Saved local-only file: ${fileName}`);
          } catch {
            // File doesn't exist, that's fine
          }
        }
      } catch (error) {
        log(`[EARS-C8] Warning: Could not save local files: ${(error as Error).message}`);
      }

      // [EARS-C10] Save ALL syncable files BEFORE checkout for conflict detection
      // We need to compare local changes vs remote changes BEFORE checkout overwrites them
      const savedSyncableFiles: Map<string, string> = new Map();
      try {
        const gitgovPath = path.join(pullRepoRoot, ".gitgov");
        const gitgovExists = await fs.access(gitgovPath).then(() => true).catch(() => false);

        if (gitgovExists) {
          // Recursively read all syncable files
          const readSyncableFilesRecursive = async (dir: string, baseDir: string) => {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(baseDir, fullPath);
                const gitgovRelativePath = `.gitgov/${relativePath}`;

                if (entry.isDirectory()) {
                  await readSyncableFilesRecursive(fullPath, baseDir);
                } else if (shouldSyncFile(gitgovRelativePath)) {
                  try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    savedSyncableFiles.set(gitgovRelativePath, content);
                  } catch {
                    // Ignore read errors
                  }
                }
              }
            } catch {
              // Ignore directory read errors
            }
          };

          await readSyncableFilesRecursive(gitgovPath, gitgovPath);
          log(`[EARS-C10] Saved ${savedSyncableFiles.size} syncable files before checkout for conflict detection`);
        }
      } catch (error) {
        log(`[EARS-C10] Warning: Could not save syncable files: ${(error as Error).message}`);
      }

      // Checkout to gitgov-state
      // Use force to handle case where .gitgov/ is untracked on work branch
      // but tracked on gitgov-state (would otherwise fail with "would be overwritten")
      try {
        await this.git.checkoutBranch(stateBranch);
      } catch (checkoutError) {
        // If normal checkout fails, try with force
        log(`[EARS-C8] Normal checkout failed, trying with force: ${(checkoutError as Error).message}`);
        try {
          await execAsync(`git checkout -f ${stateBranch}`, { cwd: pullRepoRoot });
          log(`[EARS-C8] Force checkout successful`);
        } catch (forceError) {
          // Still failed - rethrow original error
          throw checkoutError;
        }
      }

      // Verify no staged or modified changes (ignore untracked files)
      // Untracked files from work branch are expected and harmless in gitgov-state
      try {
        // Check only for staged (A, M, D) or modified (M) files, NOT untracked (??)
        const { stdout } = await execAsync('git status --porcelain', { cwd: pullRepoRoot });
        const lines = stdout.trim().split('\n').filter(l => l);
        const hasStagedOrModified = lines.some(line => {
          const status = line.substring(0, 2);
          // Ignore untracked files (??), only check for staged/modified
          return status !== '??' && status.trim().length > 0;
        });

        if (hasStagedOrModified) {
          await this.git.checkoutBranch(savedBranch);
          throw new UncommittedChangesError(stateBranch);
        }
      } catch (error) {
        if (error instanceof UncommittedChangesError) {
          throw error;
        }
        // If git status fails, continue (branch might be clean)
      }

      log('Branch setup complete');

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: Pull Remote Changes (EARS-C1, EARS-C2)
      // ═══════════════════════════════════════════════════════════
      log('Phase 2: Pulling remote changes...');

      // 2. Save current commit to compare later
      const commitBefore = await this.git.getCommitHistory(stateBranch, {
        maxCount: 1,
      });
      const hashBefore = commitBefore[0]?.hash;

      // 3. Fetch to get remote refs
      await this.git.fetch("origin");

      // ═══════════════════════════════════════════════════════════
      // [EARS-C10] CONFLICT DETECTION: Detect if local changes would be overwritten
      // Compare: savedSyncableFiles (captured BEFORE checkout) vs gitgov-state vs origin/gitgov-state
      // If same file modified locally AND remotely → abort like git pull does
      // ═══════════════════════════════════════════════════════════
      log('[EARS-C10] Checking for local changes that would be overwritten...');

      // Step 1: Get files that changed in remote (origin/gitgov-state vs local gitgov-state)
      let remoteChangedFiles: string[] = [];
      try {
        const { stdout: remoteChanges } = await execAsync(
          `git diff --name-only ${stateBranch} origin/${stateBranch} -- .gitgov/ 2>/dev/null || true`,
          { cwd: pullRepoRoot }
        );
        remoteChangedFiles = remoteChanges.trim().split('\n').filter(f => f && shouldSyncFile(f));
        log(`[EARS-C10] Remote changed files: ${remoteChangedFiles.length} - ${remoteChangedFiles.join(', ')}`);
      } catch {
        log('[EARS-C10] Could not determine remote changes, continuing...');
      }

      // Step 2: Check if local files (saved BEFORE checkout) differ from gitgov-state HEAD
      // This detects: user edited file locally that was also edited remotely
      let localModifiedFiles: string[] = [];
      if (remoteChangedFiles.length > 0 && savedSyncableFiles.size > 0) {
        try {
          for (const remoteFile of remoteChangedFiles) {
            // Check if we have a saved version of this file (from before checkout)
            const savedContent = savedSyncableFiles.get(remoteFile);

            if (savedContent !== undefined) {
              // Get content from gitgov-state HEAD (what was synced last time)
              try {
                const { stdout: gitStateContent } = await execAsync(
                  `git show HEAD:${remoteFile} 2>/dev/null`,
                  { cwd: pullRepoRoot }
                );

                // Compare saved local content vs last synced content
                // If different, user modified this file locally since last sync
                if (savedContent !== gitStateContent) {
                  localModifiedFiles.push(remoteFile);
                  log(`[EARS-C10] Local file was modified since last sync: ${remoteFile}`);
                }
              } catch {
                // File doesn't exist in gitgov-state HEAD (new file locally)
                // This is also a local modification
                localModifiedFiles.push(remoteFile);
                log(`[EARS-C10] Local file is new (not in gitgov-state): ${remoteFile}`);
              }
            }
          }
          log(`[EARS-C10] Local modified files that overlap with remote: ${localModifiedFiles.length}`);
        } catch (error) {
          log(`[EARS-C10] Warning: Could not check local modifications: ${(error as Error).message}`);
        }
      }

      // Step 3: If there's overlap (same file modified locally AND remotely)
      if (localModifiedFiles.length > 0) {
        // [EARS-C11] If force flag is set, continue and overwrite local changes
        if (force) {
          log(`[EARS-C11] Force flag set - will overwrite ${localModifiedFiles.length} local file(s)`);
          logger.warn(`[pullState] Force pull: overwriting local changes to ${localModifiedFiles.length} file(s)`);
          result.forcedOverwrites = localModifiedFiles;
        } else {
          // [EARS-C10] Abort and restore local changes
          log(`[EARS-C10] CONFLICT: Local changes would be overwritten by pull`);

          // Return to original branch before aborting
          await this.git.checkoutBranch(savedBranch);

          // Restore ALL saved syncable files (user's local changes that would be overwritten)
          for (const [filePath, content] of savedSyncableFiles) {
            const fullPath = path.join(pullRepoRoot, filePath);
            try {
              await fs.mkdir(path.dirname(fullPath), { recursive: true });
              await fs.writeFile(fullPath, content, "utf-8");
              log(`[EARS-C10] Restored syncable file: ${filePath}`);
            } catch {
              // Ignore restore errors
            }
          }

          // Also restore LOCAL_ONLY_FILES
          for (const [fileName, content] of savedLocalFiles) {
            const filePath = path.join(pullRepoRoot, ".gitgov", fileName);
            try {
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, content, "utf-8");
              log(`[EARS-C10] Restored local-only file: ${fileName}`);
            } catch {
              // Ignore restore errors
            }
          }

          result.success = false;
          result.conflictDetected = true;
          result.conflictInfo = {
            type: "local_changes_conflict",
            affectedFiles: localModifiedFiles,
            message: `Your local changes to the following files would be overwritten by pull.\nYou have modified these files locally, and they were also modified remotely.\nTo avoid losing your changes, push first or use --force to overwrite.`,
            resolutionSteps: [
              "1. Run 'gitgov sync push' to push your local changes first",
              "   → This will trigger a rebase and let you resolve conflicts properly",
              "2. Or run 'gitgov sync pull --force' to discard your local changes",
            ],
          };
          result.error = "Aborting pull: local changes would be overwritten by remote changes";

          logger.warn(`[pullState] Aborting: local changes to ${localModifiedFiles.length} file(s) would be overwritten by pull`);
          return result;
        }
      }

      log('[EARS-C10] No conflicting local changes (or force enabled), proceeding with pull...');

      // 4. Pull --rebase (EARS-C1, EARS-C2)
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

      log('Pull rebase successful');

      // ═══════════════════════════════════════════════════════════
      // PHASE 3: Re-indexing and File Updates (EARS-C3, EARS-C4)
      // ═══════════════════════════════════════════════════════════
      log('Phase 3: Checking for changes and re-indexing...');

      // 4. Check if there are new changes (EARS-C3)
      const commitAfter = await this.git.getCommitHistory(stateBranch, {
        maxCount: 1,
      });
      const hashAfter = commitAfter[0]?.hash;

      const hasNewChanges = hashBefore !== hashAfter;
      result.hasChanges = hasNewChanges;

      // 5. Calculate if reindex is needed (EARS-C3, EARS-C4, EARS-C9)
      // NOTE: Actual reindex happens AFTER file restoration in Phase 4
      // [EARS-C9] Also reindex if index.json doesn't exist (bootstrap scenario)
      const indexPath = path.join(pullRepoRoot, '.gitgov', 'index.json');
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      const shouldReindex = hasNewChanges || forceReindex || !indexExists;
      if (shouldReindex) {
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
      }

      // 6. Copy .gitgov/ to filesystem in work branch (EARS-B10 complement)
      // When .gitgov/ is ignored in work branch, we need to manually copy files
      // from gitgov-state to the filesystem so they're available for CLI commands
      const gitgovPath = path.join(pullRepoRoot, ".gitgov");

      // Check if .gitgov/ exists in gitgov-state
      const gitgovExists = await fs.access(gitgovPath).then(() => true).catch(() => false);

      if (gitgovExists && hasNewChanges) {
        logger.debug("[pullState] Copying .gitgov/ to filesystem for work branch access");
        // Files will be copied when we return to savedBranch
        // Git will preserve .gitgov/ in the filesystem even though it's ignored
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 4: Restore Working Branch and Cleanup
      // ═══════════════════════════════════════════════════════════
      log('Phase 4: Restoring working branch...');

      // 7. Return to original branch
      await this.git.checkoutBranch(savedBranch);

      // After returning to work branch, ALWAYS restore .gitgov/ from gitgov-state
      // This is necessary because switching branches may have modified/deleted files
      // even if there are no "new changes" from the remote.
      // IMPORTANT: Only checkout SYNC_DIRECTORIES and SYNC_ROOT_FILES, preserving LOCAL_ONLY_FILES
      if (gitgovExists) {
        try {
          logger.debug("[pullState] Restoring .gitgov/ to filesystem from gitgov-state (preserving local-only files)");

          // Build list of paths to checkout (SYNC_DIRECTORIES + SYNC_ROOT_FILES)
          // This preserves LOCAL_ONLY_FILES like .session.json, index.json, gitgov binary
          const pathsToCheckout: string[] = [];

          // Add sync directories
          for (const dirName of SYNC_DIRECTORIES) {
            pathsToCheckout.push(`.gitgov/${dirName}`);
          }

          // Add root-level sync files
          for (const fileName of SYNC_ROOT_FILES) {
            pathsToCheckout.push(`.gitgov/${fileName}`);
          }

          // Checkout only syncable paths, one at a time (some may not exist)
          for (const checkoutPath of pathsToCheckout) {
            try {
              await execAsync(`git checkout ${stateBranch} -- "${checkoutPath}"`, { cwd: pullRepoRoot });
              logger.debug(`[pullState] Checked out: ${checkoutPath}`);
            } catch {
              // Path might not exist in gitgov-state, that's fine
              logger.debug(`[pullState] Skipped (not in gitgov-state): ${checkoutPath}`);
            }
          }

          // Unstage the files (keep them untracked if .gitgov/ is ignored)
          try {
            await execAsync('git reset HEAD .gitgov/', { cwd: pullRepoRoot });
          } catch {
            // Nothing staged, that's fine
          }

          // [EARS-C8] Restore saved LOCAL_ONLY_FILES (they may have been lost during checkout)
          for (const [fileName, content] of savedLocalFiles) {
            try {
              const filePath = path.join(pullRepoRoot, ".gitgov", fileName);
              await fs.writeFile(filePath, content, "utf-8");
              logger.debug(`[EARS-C8] Restored local-only file: ${fileName}`);
            } catch (writeError) {
              logger.warn(`[EARS-C8] Failed to restore ${fileName}: ${(writeError as Error).message}`);
            }
          }

          logger.debug("[pullState] .gitgov/ restored to filesystem successfully (local-only files preserved)");
        } catch (error) {
          logger.warn(`[pullState] Failed to restore .gitgov/ to filesystem: ${(error as Error).message}`);
          // Non-critical: user can manually restore with 'git checkout gitgov-state -- .gitgov/'
        }
      }

      // [EARS-C3, EARS-C4, EARS-C9] Invoke indexer AFTER file restoration is complete
      // This ensures the index reflects the latest pulled files, not the old saved index.json
      if (shouldReindex) {
        logger.info("Invoking RecordProjector.generateIndex() after pull...");
        try {
          await this.indexer.generateIndex();
          logger.info("Index regenerated successfully");
        } catch (error) {
          logger.warn(`Failed to regenerate index: ${(error as Error).message}`);
          // Non-critical: index regeneration failure doesn't fail the pull
        }
      }

      result.success = true;
      log(`=== pullState COMPLETED: ${hasNewChanges ? 'new changes pulled' : 'no changes'}, reindexed: ${result.reindexed} ===`);
      return result;
    } catch (error) {
      log(`=== pullState FAILED: ${(error as Error).message} ===`);
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
   * Resolves state conflicts in a governed manner (Git-Native).
   *
   * Git-Native Flow:
   * 1. User resolves conflicts using standard Git tools (edit files, remove markers)
   * 2. User stages resolved files: git add .gitgov/
   * 3. User runs: gitgov sync resolve --reason "reason"
   *
   * This method:
   * - Verifies that a rebase is in progress
   * - Checks that no conflict markers remain in staged files
   * - Updates resolved Records with new checksums and signatures
   * - Continues the git rebase (git rebase --continue)
   * - Creates a signed resolution commit
   * - Regenerates the index
   *
   * [EARS-D1 through EARS-D7]
   */
  async resolveConflict(
    options: SyncStateResolveOptions
  ): Promise<SyncStateResolveResult> {
    const { reason, actorId } = options;

    // Debug logging helper
    const log = (msg: string) => logger.debug(`[resolveConflict] ${msg}`);
    log('=== STARTING resolveConflict (Git-Native) ===');

    // ═══════════════════════════════════════════════════════════
    // PHASE 0: Pre-flight Checks (EARS-D1, EARS-D2)
    // Git-Native: Only rebase conflicts exist now
    // ═══════════════════════════════════════════════════════════
    log('Phase 0: Verifying rebase in progress...');

    // 1. Check if rebase is in progress (EARS-D1)
    const rebaseInProgress = await this.isRebaseInProgress();

    if (!rebaseInProgress) {
      throw new NoRebaseInProgressError();
    }

    // PRE-CHECK: Verify actorId matches authenticated identity
    // Prevents impersonation — you can only resolve as the actor whose key you hold
    const authenticatedActor = await this.identity.getCurrentActor();
    if (authenticatedActor.id !== actorId) {
      log(`ERROR: Actor identity mismatch: requested '${actorId}' but authenticated as '${authenticatedActor.id}'`);
      throw new ActorIdentityMismatchError(actorId, authenticatedActor.id);
    }
    log(`Pre-check passed: actorId '${actorId}' matches authenticated identity`);

    log('Conflict mode: rebase_conflict (Git-Native)');

    // 2. Get STAGED files (user already resolved and added them)
    console.log("[resolveConflict] Getting staged files...");
    const allStagedFiles = await this.git.getStagedFiles();
    console.log("[resolveConflict] All staged files:", allStagedFiles);

    // Filter to only .gitgov/*.json files (Records)
    let resolvedRecords = allStagedFiles.filter(f =>
      f.startsWith('.gitgov/') && f.endsWith('.json')
    );
    console.log("[resolveConflict] Resolved Records (staged .gitgov/*.json):", resolvedRecords);

    // 3. Verify conflict markers (EARS-D2)
    console.log("[resolveConflict] Checking for conflict markers...");
    const filesWithMarkers = await this.checkConflictMarkers(resolvedRecords);
    console.log("[resolveConflict] Files with markers:", filesWithMarkers);
    if (filesWithMarkers.length > 0) {
      throw new ConflictMarkersPresentError(filesWithMarkers);
    }

    let rebaseCommitHash = "";

    // 4. Continue git rebase FIRST (EARS-D4) - Git-Native flow
    // This completes the rebase with user's resolved files
    console.log("[resolveConflict] Step 4: Calling git.rebaseContinue()...");
    await this.git.rebaseContinue();
    console.log("[resolveConflict] rebaseContinue completed successfully");

    // Get rebase commit hash
    const currentBranch = await this.git.getCurrentBranch();
    const rebaseCommit = await this.git.getCommitHistory(currentBranch, {
      maxCount: 1,
    });
    rebaseCommitHash = rebaseCommit[0]?.hash ?? "";

    // 4b. Get resolved files from the rebase commit (since getStagedFiles doesn't work during rebase)
    // The files that were modified in the rebase commit are the ones that had conflicts
    if (resolvedRecords.length === 0 && rebaseCommitHash) {
      console.log("[resolveConflict] No staged files detected, getting files from rebase commit...");
      const repoRoot = await this.git.getRepoRoot();
      try {
        // Get files changed in the rebase commit
        const { stdout } = await execAsync(
          `git diff-tree --no-commit-id --name-only -r ${rebaseCommitHash}`,
          { cwd: repoRoot }
        );
        const commitFiles = stdout.trim().split('\n').filter(f => f);
        // Filter to .gitgov/*.json files
        resolvedRecords = commitFiles.filter(f =>
          f.startsWith('.gitgov/') && f.endsWith('.json')
        );
        console.log("[resolveConflict] Files from rebase commit:", resolvedRecords);
      } catch (e) {
        console.log("[resolveConflict] Could not get files from rebase commit:", e);
      }
    }

    // 5. NOW update resolved Records with new checksums and signatures (EARS-D3)
    // This happens AFTER rebase so we can create a separate signed resolution commit
    console.log("[resolveConflict] Updating resolved Records with signatures...");
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
          // Pass the reason as notes for the signature
          const signedRecord = await this.identity.signRecord(
            record,
            currentActor.id,
            'resolver',
            `Conflict resolved: ${reason}`
          );

          // Write back the updated Record
          writeFileSync(fullPath, JSON.stringify(signedRecord, null, 2) + '\n', 'utf-8');

          logger.info(`Updated Record: ${filePath} (new checksum + resolver signature)`);
          console.log("[resolveConflict] Successfully updated Record:", filePath);
        } catch (error) {
          // Log but don't fail - some files might not be Records
          logger.debug(`Skipping file ${filePath}: ${(error as Error).message}`);
          console.log("[resolveConflict] Error updating Record:", filePath, error);
        }
      }

      console.log("[resolveConflict] All Records updated, staging...");
    }

    // 6. Stage updated files with new checksums/signatures
    console.log("[resolveConflict] Staging .gitgov/ with updated metadata...");
    // Use force: true because .gitgov/ may be in .gitignore (by design)
    await this.git.add([".gitgov"], { force: true });

    // 7. Create signed resolution commit (EARS-D5)
    const timestamp = new Date().toISOString();
    const resolutionMessage =
      `resolution: conflict resolved by ${actorId}\n\n` +
      `Actor: ${actorId}\n` +
      `Timestamp: ${timestamp}\n` +
      `Reason: ${reason}\n` +
      `Files: ${resolvedRecords.length} file(s) resolved\n\n` +
      `Signed-off-by: ${actorId}`;

    // Create resolution commit (may have signature updates or be empty if no records to sign)
    let resolutionCommitHash = "";
    try {
      resolutionCommitHash = await this.git.commit(resolutionMessage);
    } catch (commitError) {
      // If nothing to commit (no records needed re-signing), that's OK
      const stdout = (commitError as any).stdout || '';
      const stderr = (commitError as any).stderr || '';

      const isNothingToCommit =
        stdout.includes('nothing to commit') ||
        stderr.includes('nothing to commit') ||
        stdout.includes('nothing added to commit') ||
        stderr.includes('nothing added to commit');

      if (isNothingToCommit) {
        log('No additional changes to commit (no records needed re-signing)');
        // Use the rebase commit hash as the resolution hash
        resolutionCommitHash = rebaseCommitHash;
      } else {
        throw commitError;
      }
    }

    // 8. Push to remote (best effort - don't fail if no remote)
    log('Pushing resolved state to remote...');
    try {
      await this.git.push("origin", "gitgov-state");
      log('Push successful');
    } catch (pushError) {
      // Don't fail resolution just because push failed - local commit is enough
      // This handles: no remote, no network, permission denied, etc.
      const pushErrorMsg = pushError instanceof Error ? pushError.message : String(pushError);
      log(`Push failed (non-fatal): ${pushErrorMsg}`);
    }

    // 9. Return to original branch and restore .gitgov/ files
    // This is complex because:
    // - In main branch, .gitgov/ is in .gitignore (untracked)
    // - When we checkout from gitgov-state to main, Git doesn't preserve untracked files
    // - We need to: save local-only files, checkout, restore from gitgov-state, restore local-only
    log('Returning to original branch and restoring .gitgov/ files...');
    const repoRoot = await this.git.getRepoRoot();
    const gitgovDir = path.join(repoRoot, '.gitgov');

    // 9a. Save LOCAL_ONLY_FILES and EXCLUDED files to temp BEFORE checkout
    const tempDir = path.join(os.tmpdir(), `gitgov-resolve-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    log(`Created temp directory for local files: ${tempDir}`);

    // Save LOCAL_ONLY_FILES
    for (const fileName of LOCAL_ONLY_FILES) {
      const srcPath = path.join(gitgovDir, fileName);
      const destPath = path.join(tempDir, fileName);
      try {
        await fs.access(srcPath);
        await fs.cp(srcPath, destPath, { force: true });
        log(`Saved LOCAL_ONLY_FILE to temp: ${fileName}`);
      } catch {
        // File doesn't exist, ok
      }
    }

    // Save EXCLUDED files (like .key files) recursively
    const saveExcludedFiles = async (srcDir: string, destDir: string) => {
      try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(srcDir, entry.name);
          const dstPath = path.join(destDir, entry.name);
          if (entry.isDirectory()) {
            await fs.mkdir(dstPath, { recursive: true });
            await saveExcludedFiles(srcPath, dstPath);
          } else {
            const isExcluded = SYNC_EXCLUDED_PATTERNS.some(pattern => pattern.test(entry.name));
            if (isExcluded) {
              await fs.mkdir(path.dirname(dstPath), { recursive: true });
              await fs.copyFile(srcPath, dstPath);
              log(`Saved EXCLUDED file to temp: ${entry.name}`);
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    };
    await saveExcludedFiles(gitgovDir, tempDir);

    // 9b. Checkout to original branch
    try {
      await execAsync('git checkout -', { cwd: repoRoot });
      log('Returned to original branch');
    } catch (checkoutError) {
      log(`Warning: Could not return to original branch: ${checkoutError}`);
    }

    // 9c. Restore .gitgov/ from gitgov-state branch
    log('Restoring .gitgov/ from gitgov-state...');
    try {
      await this.git.checkoutFilesFromBranch('gitgov-state', ['.gitgov/']);
      // [EARS-B24] Unstage files - git checkout adds them to staging area
      await execAsync('git reset HEAD .gitgov/ 2>/dev/null || true', { cwd: repoRoot });
      log('Restored .gitgov/ from gitgov-state (unstaged)');
    } catch (checkoutFilesError) {
      log(`Warning: Could not restore .gitgov/ from gitgov-state: ${checkoutFilesError}`);
    }

    // 9d. Restore LOCAL_ONLY_FILES from temp
    for (const fileName of LOCAL_ONLY_FILES) {
      const srcPath = path.join(tempDir, fileName);
      const destPath = path.join(gitgovDir, fileName);
      try {
        await fs.access(srcPath);
        await fs.cp(srcPath, destPath, { force: true });
        log(`Restored LOCAL_ONLY_FILE from temp: ${fileName}`);
      } catch {
        // File wasn't saved, ok
      }
    }

    // 9e. Restore EXCLUDED files from temp
    const restoreExcludedFiles = async (srcDir: string, destDir: string) => {
      try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(srcDir, entry.name);
          const dstPath = path.join(destDir, entry.name);
          if (entry.isDirectory()) {
            await restoreExcludedFiles(srcPath, dstPath);
          } else {
            const isExcluded = SYNC_EXCLUDED_PATTERNS.some(pattern => pattern.test(entry.name));
            if (isExcluded) {
              await fs.mkdir(path.dirname(dstPath), { recursive: true });
              await fs.copyFile(srcPath, dstPath);
              log(`Restored EXCLUDED file from temp: ${entry.name}`);
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    };
    await restoreExcludedFiles(tempDir, gitgovDir);

    // 9f. Cleanup temp
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      log('Temp directory cleaned up');
    } catch {
      // Cleanup failure is not critical
    }

    // 10. Re-index after conflict resolution (EARS-D4)
    logger.info("Invoking RecordProjector.generateIndex() after conflict resolution...");
    try {
      await this.indexer.generateIndex();
      logger.info("Index regenerated successfully after conflict resolution");
    } catch (error) {
      logger.warn(`Failed to regenerate index after resolution: ${(error as Error).message}`);
      // Non-critical: index regeneration failure doesn't fail the resolution
    }

    log(`=== resolveConflict COMPLETED: ${resolvedRecords.length} conflicts resolved ===`);

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
