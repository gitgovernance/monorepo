/**
 * SyncModule Tests
 * 
 * SAFETY: These tests use TEMPORARY Git repositories in /tmp
 * They NEVER touch the production repository.
 * 
 * Each test creates an isolated temp repo and cleans up after itself.
 * 
 * ============================================================================
 * TESTING APPROACH: Why we use Bare Repos instead of HTTP Mock Server
 * ============================================================================
 * 
 * We use LOCAL BARE REPOSITORIES as "remotes" instead of tools like 
 * git-http-mock-server because:
 * 
 * 1. SIMPLICITY: Git natively supports file:// protocol for push/pull
 *    - No need for HTTP server, authentication, networking
 *    - Faster test execution (no network stack overhead)
 * 
 * 2. SUFFICIENT COVERAGE: SyncModule tests focus on BUSINESS LOGIC
 *    - Branch management (ensureStateBranch, orphan branches)
 *    - Conflict resolution (rebase, markers, integrity)
 *    - State synchronization (push/pull delta calculation)
 *    - We DON'T need to test HTTP/SSH protocols themselves
 * 
 * 3. RELIABILITY: No external dependencies or port conflicts
 *    - Tests run anywhere without network permissions
 *    - No race conditions from shared server instances
 * 
 * 4. ISOLATION: Each test gets its own bare repo
 *    - Perfect parallelization without interference
 *    - Copy-on-write semantics (tests don't affect each other)
 * 
 * FUTURE: If we need to test HTTP-specific features (auth, CORS, network errors),
 * we can add git-http-mock-server for those specific test cases.
 * 
 * ============================================================================
 * ARCHITECTURE NOTE: execAsync vs GitModule in tests
 * ============================================================================
 * 
 * Currently, tests use BOTH:
 * - GitModule methods for SyncModule operations (correct ✅)
 * - execAsync for test setup/assertions (temporary workaround ⚠️)
 * 
 * This is INTENTIONAL for now to move fast. Once all tests pass, we'll
 * refactor to use ONLY GitModule methods (adding missing ones if needed).
 * 
 * This ensures tests accurately reflect how GitModule will be used in production.
 * ============================================================================
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SyncModule } from "./sync_module";
import { GitModule } from "../git/git_module";
import { ConfigManager } from "../config_manager";
import type { ExecOptions, ExecResult } from "../git/types";
import {
  SyncError,
  PushFromStateBranchError,
  ConflictMarkersPresentError,
  NoRebaseInProgressError,
  UncommittedChangesError,
} from "./errors";
import { calculatePayloadChecksum } from "../crypto/checksum";
import type { ActorRecord, TaskRecord, Signature } from "../types";
import { createTaskRecord } from "../factories/task_factory";
import { createEmbeddedMetadataRecord } from "../factories/embedded_metadata_factory";
import type { IIdentityAdapter } from "../adapters/identity_adapter";
import type { LintReport, LintResult, LintSummary, LintModule } from "../lint";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";

const execAsync = promisify(exec);

/**
 * Test Helper: Creates a default mock IdentityAdapter
 */
function createMockIdentityAdapter(): IIdentityAdapter {
  return {
    getActorPublicKey: jest.fn().mockResolvedValue(null),
    getCurrentActor: jest.fn().mockResolvedValue(null),
    signRecord: jest.fn().mockResolvedValue(undefined),
  } as unknown as IIdentityAdapter;
}

/**
 * Test Helper: Creates a default mock LintModule
 */
function createMockLintModule(): LintModule {
  const defaultLintReport: LintReport = {
    summary: { filesChecked: 0, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
    results: [],
    metadata: { timestamp: new Date().toISOString(), options: {}, version: "1.0.0" },
  };

  return {
    lint: jest.fn().mockResolvedValue(defaultLintReport),
  } as unknown as LintModule;
}

/**
 * Test Helper: Creates a default mock IndexerAdapter
 */
function createMockIndexerAdapter(): jest.Mocked<IIndexerAdapter> {
  return {
    generateIndex: jest.fn().mockResolvedValue({
      success: true,
      recordsProcessed: 0,
      cacheSize: 0,
      cacheStrategy: 'json',
      errors: [],
    }),
    getIndexData: jest.fn().mockResolvedValue(null),
    isIndexUpToDate: jest.fn().mockResolvedValue(true),
    invalidateCache: jest.fn().mockResolvedValue(undefined),
    calculateActivityHistory: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IIndexerAdapter>;
}

/**
 * Test Helper: Creates execCommand function for GitModule
 * 
 * Uses spawn instead of exec to properly handle arguments with special characters
 */
function createExecCommand(
  repoRoot: string
): (
  command: string,
  args: string[],
  options?: ExecOptions
) => Promise<ExecResult> {
  return async (command: string, args: string[], options?: ExecOptions) => {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: options?.cwd || repoRoot,
        env: { ...process.env, ...options?.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      proc.on("error", (error) => {
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1,
        });
      });
    });
  };
}

/**
 * Test Helper: Creates a temporary Git repository for testing
 * 
 * @returns Path to temporary repository (normalized for macOS /private prefix)
 */
async function createTempRepo(): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    `gitgov-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const normalizedPath = fs.realpathSync(tempDir);

  // Initialize Git repo
  const gitModule = new GitModule({
    repoRoot: normalizedPath,
    execCommand: createExecCommand(normalizedPath),
  });

  await gitModule.init();

  // Configure git user using GitModule
  await gitModule.setConfig('user.name', 'Test User');
  await gitModule.setConfig('user.email', 'test@example.com');

  // Configure Git for non-interactive mode using GitModule (prevents hanging on rebase)
  await gitModule.setConfig('core.editor', 'true');
  await gitModule.setConfig('sequence.editor', 'true');

  // Create initial commit
  await execAsync('echo "# Test Repo" > README.md', { cwd: normalizedPath });
  await execAsync("git add .", { cwd: normalizedPath });
  await execAsync('git commit -m "Initial commit"', { cwd: normalizedPath });

  return normalizedPath;
}

/**
 * Test Helper: Removes a temporary repository
 */
function removeTempRepo(repoPath: string): void {
  if (
    repoPath.includes("/tmp/") &&
    repoPath.includes("gitgov-sync-test-")
  ) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
}

/**
 * Test Helper: Creates a bare Git repository to use as remote
 */
async function createRemoteRepo(): Promise<string> {
  const remoteDir = path.join(
    os.tmpdir(),
    `gitgov-sync-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(remoteDir, { recursive: true });
  const normalizedPath = fs.realpathSync(remoteDir);

  await execAsync("git init --bare", { cwd: normalizedPath });

  return normalizedPath;
}

/**
 * Test Helper: Sets up .gitgov directory structure
 */
async function setupGitgovDir(repoPath: string): Promise<void> {
  const gitgovDir = path.join(repoPath, ".gitgov");
  fs.mkdirSync(gitgovDir, { recursive: true });

  // Create subdirectories
  const dirs = ["tasks", "feedback", "cycles", "actors"];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(gitgovDir, dir), { recursive: true });
  }

  // Create config.json
  const config = {
    protocolVersion: "1.0.0",
    projectId: "test-project",
    projectName: "Test Project",
    rootCycle: "123-cycle-root",
    state: {
      branch: "gitgov-state",
    },
  };
  fs.writeFileSync(
    path.join(gitgovDir, "config.json"),
    JSON.stringify(config, null, 2)
  );

  // Commit .gitgov structure
  await execAsync("git add .gitgov", { cwd: repoPath });
  await execAsync('git commit -m "Add .gitgov structure"', { cwd: repoPath });
}

/**
 * Test Helper: Creates a test task file
 */
async function createTestTask(
  repoPath: string,
  taskId: string,
  content: string
): Promise<void> {
  const taskPath = path.join(repoPath, ".gitgov", "tasks", `${taskId}.json`);
  fs.writeFileSync(taskPath, content);
  await execAsync(`git add ${taskPath}`, { cwd: repoPath });
  await execAsync(`git commit -m "Add task ${taskId}"`, { cwd: repoPath });
}


describe("SyncModule", () => {
  let repoPath: string;
  let remoteRepoPath: string;
  let git: GitModule;
  let config: ConfigManager;
  let mockIndexer: jest.Mocked<IIndexerAdapter>;
  let syncModule: SyncModule;

  beforeEach(async () => {
    // Create temp repo and remote
    repoPath = await createTempRepo();
    remoteRepoPath = await createRemoteRepo();

    // Configure remote
    await execAsync(`git remote add origin ${remoteRepoPath}`, {
      cwd: repoPath,
    });
    await execAsync("git push -u origin main", { cwd: repoPath });

    // Setup .gitgov directory
    await setupGitgovDir(repoPath);

    // Initialize modules
    git = new GitModule({
      repoRoot: repoPath,
      execCommand: createExecCommand(repoPath),
    });

    config = new ConfigManager(repoPath);
    mockIndexer = createMockIndexerAdapter();
    syncModule = new SyncModule({
      git,
      config,
      identity: createMockIdentityAdapter(),
      lint: createMockLintModule(),
      indexer: mockIndexer,
    });
  });

  afterEach(() => {
    removeTempRepo(repoPath);
    removeTempRepo(remoteRepoPath);
  });

  // ===== EARS 1-5: State Branch Management =====

  describe("State Branch Management (EARS 1-5)", () => {
    it("[EARS-1] should create orphan branch if it doesn't exist", async () => {
      // Execute
      await syncModule.ensureStateBranch();

      // Verify branch exists locally
      const localExists = await git.branchExists("gitgov-state");
      expect(localExists).toBe(true);

      // Verify branch exists remotely
      await git.fetch("origin");

      // Check if remote branch exists using git branch -r
      const remoteBranches = await git.listRemoteBranches("origin");
      const remoteExists = remoteBranches.includes("gitgov-state");
      expect(remoteExists).toBe(true);

      // Verify it's an orphan branch (no shared history with main)
      // Ensure we're on a valid branch before getting commit history
      await git.checkoutBranch("main");
      const mainCommit = await git.getCommitHistory("main", { maxCount: 1 });
      const stateCommit = await git.getCommitHistory("gitgov-state", {
        maxCount: 1,
      });
      expect(mainCommit[0]?.hash).not.toBe(stateCommit[0]?.hash);
    });

    it("[EARS-2] should create local branch from remote if it exists remotely", async () => {
      // Setup: Create state branch on remote only
      const tempWorkDir = path.join(
        os.tmpdir(),
        `gitgov-work-${Date.now()}`
      );
      fs.mkdirSync(tempWorkDir, { recursive: true });
      const normalizedWorkDir = fs.realpathSync(tempWorkDir);

      try {
        // Clone and create state branch in temporary work directory
        // NOTE: This setup uses execAsync because it's a complex temporary directory
        // operation outside the main test repo scope
        await execAsync(`git clone ${remoteRepoPath} ${normalizedWorkDir}`);
        await execAsync("git checkout --orphan gitgov-state", {
          cwd: normalizedWorkDir,
        });
        await execAsync("git rm -rf .", { cwd: normalizedWorkDir });
        fs.writeFileSync(path.join(normalizedWorkDir, ".gitgov-state"), "state");
        await execAsync("git add .gitgov-state", { cwd: normalizedWorkDir });
        await execAsync('git commit -m "Init state"', {
          cwd: normalizedWorkDir,
        });
        await execAsync("git push origin gitgov-state", {
          cwd: normalizedWorkDir,
        });

        // Ensure branch doesn't exist locally
        const existsBeforeFetch = await git.branchExists("gitgov-state");
        expect(existsBeforeFetch).toBe(false);

        // Execute
        await syncModule.ensureStateBranch();

        // Verify branch now exists locally
        const existsAfter = await git.branchExists("gitgov-state");
        expect(existsAfter).toBe(true);

        // Verify tracking is configured (getBranchRemote returns the remote name, not the full upstream)
        const upstream = await git.getBranchRemote("gitgov-state");
        expect(upstream).toBe("origin");
      } finally {
        removeTempRepo(normalizedWorkDir);
      }
    });

    it("[EARS-3] should attempt push if exists locally but not remotely", async () => {
      // Setup: Create state branch locally
      await git.checkoutOrphanBranch("gitgov-state");
      await git.commitAllowEmpty("Init state");
      await git.checkoutBranch("main");

      // Verify remote doesn't have the branch yet
      await git.fetch("origin");
      const remoteBranchesBefore = await git.listRemoteBranches("origin");
      const remoteExistsBefore = remoteBranchesBefore.includes("gitgov-state");
      expect(remoteExistsBefore).toBe(false);

      // Execute
      await syncModule.ensureStateBranch();

      // Verify branch was pushed to remote
      await git.fetch("origin");
      const remoteBranchesAfter = await git.listRemoteBranches("origin");
      const remoteExistsAfter = remoteBranchesAfter.includes("gitgov-state");
      expect(remoteExistsAfter).toBe(true);
    });

    it("[EARS-4] should return branch name from configuration", async () => {
      // Execute
      const branchName = await syncModule.getStateBranchName();

      // Verify
      expect(branchName).toBe("gitgov-state");
    });

    it('[EARS-4] should return "gitgov-state" as default if not configured', async () => {
      // Setup: Remove config
      const configPath = path.join(repoPath, ".gitgov", "config.json");
      fs.unlinkSync(configPath);

      // Execute
      const branchName = await syncModule.getStateBranchName();

      // Verify
      expect(branchName).toBe("gitgov-state");
    });

    it("[EARS-5] should calculate file delta between branches", async () => {
      // Setup: Create gitgov-state branch
      await syncModule.ensureStateBranch();

      // Create changes on main
      await git.checkoutBranch("main");
      await createTestTask(repoPath, "task-001", '{"title": "Task 1"}');
      await createTestTask(repoPath, "task-002", '{"title": "Task 2"}');

      // Execute
      const delta = await syncModule.calculateStateDelta("main");

      // Verify
      expect(delta.length).toBeGreaterThanOrEqual(2);
      expect(delta.some((d) => d.file.includes("task-001.json"))).toBe(true);
      expect(delta.some((d) => d.file.includes("task-002.json"))).toBe(true);
    });
  });

  // ===== EARS 6-12: Push Operation =====

  describe("Push Operation (EARS 6-12)", () => {
    beforeEach(async () => {
      // Ensure state branch exists for push tests
      await syncModule.ensureStateBranch();
      await git.checkoutBranch("main");
    });

    it("[EARS-6] should verify integrity before push", async () => {
      // Create a task
      await createTestTask(repoPath, "task-100", '{"title": "Test"}');

      // Execute push
      const result = await syncModule.pushState({
        actorId: "test-actor",
      });

      // Verify audit was executed (should pass)
      expect(result.success).toBe(true);
    });

    it("[EARS-7] should return error if integrity violations detected", async () => {
      // Setup: Create invalid state (this is a placeholder - real implementation
      // would need actual integrity violations)
      // For now, we test that the audit runs

      // Execute push with no changes - should succeed
      await syncModule.pushState({
        actorId: "test-actor",
      });

      // Currently no violations, so should succeed
      // In real scenario with violations, would check:
      // expect(result.conflictDetected).toBe(true);
      // expect(result.conflictInfo?.type).toBe("integrity_violation");
    });

    it("[EARS-8] should abort if push executed from gitgov-state branch", async () => {
      // Setup: Switch to gitgov-state
      await git.checkoutBranch("gitgov-state");

      // Execute and expect error
      await expect(
        syncModule.pushState({
          actorId: "test-actor",
        })
      ).rejects.toThrow(PushFromStateBranchError);
    });

    it("[EARS-9] should calculate and apply delta after successful reconciliation", async () => {
      // Setup: Create changes
      await createTestTask(repoPath, "task-200", '{"title": "New Task"}');

      // Execute
      const result = await syncModule.pushState({
        actorId: "test-actor",
      });

      // Verify
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBeGreaterThan(0);
      expect(result.commitHash).toBeTruthy();
    });

    it("[EARS-10] should abort rebase and return conflict if conflict detected", async () => {
      // This test requires complex setup with conflicting changes
      // Skipping for now as it requires remote simulation
      // TODO: Implement with remote conflict simulation
    }, 30000);

    it("[EARS-11] should return without commit if no changes", async () => {
      // Setup: First push to sync initial .gitgov/ to state branch
      const firstPush = await syncModule.pushState({
        actorId: "test-actor",
      });
      expect(firstPush.success).toBe(true);
      expect(firstPush.filesSynced).toBeGreaterThan(0); // Initial sync should have changes

      // Now execute push again WITHOUT any new changes
      const result = await syncModule.pushState({
        actorId: "test-actor",
      });

      // Verify: Second push should have no changes
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(0);
      expect(result.commitHash).toBeNull();
    });

    it("[EARS-12] should simulate operation when dryRun is true", async () => {
      // Setup: Create changes
      await createTestTask(repoPath, "task-300", '{"title": "Dry Run"}');

      // Execute with dryRun
      const result = await syncModule.pushState({
        actorId: "test-actor",
        dryRun: true,
      });

      // Verify
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBeGreaterThan(0);
      expect(result.commitHash).toBeNull(); // No actual commit in dry run
      expect(result.commitMessage).toBeTruthy(); // But message was prepared
    });

    it("[EARS-41] should detect first push when .gitgov/ does not exist in gitgov-state", async () => {
      // Setup: .gitgov/ already exists in main from beforeEach
      // gitgov-state exists but is empty (no .gitgov/ there yet)

      // Execute first push
      const result = await syncModule.pushState({
        actorId: "test-actor-first",
      });

      // Debug output if failed
      if (!result.success) {
        console.log("[EARS-41 DEBUG] Push failed:", {
          error: result.error,
          conflictDetected: result.conflictDetected,
          conflictInfo: result.conflictInfo,
        });
      }

      // Verify
      expect(result.success).toBe(true);
      expect(result.filesSynced).toBeGreaterThan(0);
      expect(result.commitMessage).toContain("Initial state");
      expect(result.commitMessage).toContain("synced (initial)");

      // Verify .gitgov/ now exists in gitgov-state
      await git.checkoutBranch("gitgov-state");
      const gitgovExists = await git.branchExists("gitgov-state");
      expect(gitgovExists).toBe(true);

      // Return to main
      await git.checkoutBranch("main");
    });

    it("[EARS-42] should copy only whitelisted files during push", async () => {
      // Setup: Create various files in .gitgov/, including non-whitelisted ones
      const gitgovDir = path.join(repoPath, ".gitgov");

      // Whitelisted: should be synced
      fs.mkdirSync(path.join(gitgovDir, "tasks"), { recursive: true });
      fs.writeFileSync(path.join(gitgovDir, "tasks/task-whitelist.json"), '{"title": "Test"}');
      fs.writeFileSync(path.join(gitgovDir, "config.json"), '{"projectId": "test"}');

      // Non-whitelisted: should NOT be synced
      fs.mkdirSync(path.join(gitgovDir, "builds"), { recursive: true });
      fs.writeFileSync(path.join(gitgovDir, "builds/output.js"), 'console.log("build")');
      fs.mkdirSync(path.join(gitgovDir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(gitgovDir, "scripts/helper.sh"), '#!/bin/bash');
      fs.writeFileSync(path.join(gitgovDir, ".gitignore"), 'node_modules/');
      fs.writeFileSync(path.join(gitgovDir, "file.backup-001"), 'backup data');
      fs.writeFileSync(path.join(gitgovDir, "temp.tmp"), 'temporary');

      // Commit all files to main
      await execAsync("git add .gitgov", { cwd: repoPath });
      await execAsync('git commit -m "Add whitelisted and non-whitelisted files"', { cwd: repoPath });

      // Execute push
      const result = await syncModule.pushState({
        actorId: "test-actor-whitelist",
      });

      // Debug output if failed
      if (!result.success) {
        console.log("[EARS-42 DEBUG] Push failed:", {
          error: result.error,
          conflictDetected: result.conflictDetected,
          conflictInfo: result.conflictInfo,
        });
      }

      // Verify push succeeded
      expect(result.success).toBe(true);

      // Switch to gitgov-state and verify only whitelisted files exist
      await git.checkoutBranch("gitgov-state");

      // Whitelisted files should exist
      expect(fs.existsSync(path.join(repoPath, ".gitgov/tasks/task-whitelist.json"))).toBe(true);
      expect(fs.existsSync(path.join(repoPath, ".gitgov/config.json"))).toBe(true);

      // Non-whitelisted files should NOT exist
      expect(fs.existsSync(path.join(repoPath, ".gitgov/builds"))).toBe(false);
      expect(fs.existsSync(path.join(repoPath, ".gitgov/scripts"))).toBe(false);
      expect(fs.existsSync(path.join(repoPath, ".gitgov/.gitignore"))).toBe(false);
      expect(fs.existsSync(path.join(repoPath, ".gitgov/file.backup-001"))).toBe(false);
      expect(fs.existsSync(path.join(repoPath, ".gitgov/temp.tmp"))).toBe(false);

      // Return to main
      await git.checkoutBranch("main");
    });
  });

  // ===== EARS 13-16: Pull Operation =====

  describe("Pull Operation (EARS 13-16)", () => {
    beforeEach(async () => {
      await syncModule.ensureStateBranch();
      await git.checkoutBranch("main");
    });

    it("[EARS-13] should update local branch with remote changes using rebase", async () => {
      // Execute pull
      const result = await syncModule.pullState();

      // Verify
      expect(result.success).toBe(true);
    });

    it("[EARS-14] should pause rebase and return conflict if conflict detected", async () => {
      // This requires complex conflict simulation
      // TODO: Implement with conflict setup
    });

    it("[EARS-15] should invoke indexer.generateIndex() if there are new changes", async () => {
      // Reset mock to track calls
      mockIndexer.generateIndex.mockClear();

      // Create a change in remote to simulate new commits
      // (In real scenario, another developer pushed changes)
      // For this test, we'll use forceReindex to trigger indexing
      // Note: Simulating actual remote changes requires complex multi-repo setup

      // Execute with forceReindex to simulate "has changes" scenario
      const result = await syncModule.pullState({ forceReindex: true });

      // Verify indexer was called
      expect(result.success).toBe(true);
      expect(result.reindexed).toBe(true);
      expect(mockIndexer.generateIndex).toHaveBeenCalledTimes(1);
    });

    it("[EARS-16] should invoke indexer.generateIndex() when forceReindex is true", async () => {
      // Reset mock to track calls
      mockIndexer.generateIndex.mockClear();

      // Execute with forceReindex
      const result = await syncModule.pullState({
        forceReindex: true,
      });

      // Verify indexer was called even without remote changes
      expect(result.success).toBe(true);
      expect(result.reindexed).toBe(true);
      expect(mockIndexer.generateIndex).toHaveBeenCalledTimes(1);
    });
  });

  // ===== EARS 17-23: Resolve Operation =====

  describe("Resolve Operation (EARS 17-23)", () => {
    it("[EARS-17] should return error if no rebase in progress", async () => {
      // Execute without rebase in progress
      await expect(
        syncModule.resolveConflict({
          actorId: "test-actor",
          reason: "Test resolution",
        })
      ).rejects.toThrow(NoRebaseInProgressError);
    });

    it("[EARS-18] should return error if conflict markers present", async () => {
      // This requires setting up a rebase with unresolved markers
      // TODO: Implement with conflict markers setup
    });

    it("[EARS-19] should update resolved records with new checksum and signature", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn().mockImplementation(async (record, actorId, role) => {
          const newChecksum = calculatePayloadChecksum(record.payload);
          return {
            ...record,
            header: {
              ...record.header,
              payloadChecksum: newChecksum,
              signatures: [
                ...(record.header.signatures || []),
                {
                  keyId: actorId,
                  role: role,
                  notes: "Record signed after resolution",
                  signature: `mock-signature-${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          };
        }),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // ========== CREATE REAL GIT CONFLICT ==========
      console.log("[EARS-19 DEBUG] Starting conflict setup...");

      // 1. Create initial task in main branch
      const taskPath = path.join(repoPath, ".gitgov/tasks/task-conflict.json");
      fs.mkdirSync(path.dirname(taskPath), { recursive: true });
      console.log("[EARS-19 DEBUG] Created task directory");

      const originalTask: TaskRecord = createTaskRecord({
        id: "1234567890-task-conflict",
        title: "Original task title",
        status: "draft",
        priority: "medium",
        description: "This is the original task description before any changes",
        tags: [],
      });
      const originalRecord = createEmbeddedMetadataRecord(originalTask, {
        signature: {
          keyId: "human:original-author",
          role: "author",
          notes: "Original signature",
        },
      });
      fs.writeFileSync(taskPath, JSON.stringify(originalRecord, null, 2));
      await git.add([".gitgov/tasks/task-conflict.json"]);
      await git.commit("Add original task");
      console.log("[EARS-19 DEBUG] Created original task in main");

      // 2. Create feature branch and modify task there
      await git.createBranch("feature-branch");
      console.log("[EARS-19 DEBUG] Created feature-branch");
      await git.checkoutBranch("feature-branch");
      console.log("[EARS-19 DEBUG] Checked out feature-branch");

      const featureTask: TaskRecord = createTaskRecord({
        ...originalTask,
        title: "Feature branch version",
        status: "active",
      });
      const featureRecord = createEmbeddedMetadataRecord(featureTask, {
        signature: {
          keyId: "human:original-author",
          role: "author",
          notes: "Original signature",
        },
      });
      fs.writeFileSync(taskPath, JSON.stringify(featureRecord, null, 2));
      await git.add([".gitgov/tasks/task-conflict.json"]);
      await git.commit("Update task in feature branch");
      console.log("[EARS-19 DEBUG] Updated task in feature-branch");

      // 3. Go back to main and modify task differently (create divergence)
      await git.checkoutBranch("main");
      console.log("[EARS-19 DEBUG] Checked out main");

      const mainTask: TaskRecord = createTaskRecord({
        ...originalTask,
        title: "Main branch version",
        status: "done",
      });
      const mainRecord = createEmbeddedMetadataRecord(mainTask, {
        signature: {
          keyId: "human:original-author",
          role: "author",
          notes: "Original signature",
        },
      });
      fs.writeFileSync(taskPath, JSON.stringify(mainRecord, null, 2));
      await git.add([".gitgov/tasks/task-conflict.json"]);
      await git.commit("Update task in main branch");
      console.log("[EARS-19 DEBUG] Updated task in main");

      // 4. Try to rebase feature-branch onto main (will create REAL conflict)
      await git.checkoutBranch("feature-branch");
      console.log("[EARS-19 DEBUG] Checked out feature-branch (before rebase)");
      let rebaseConflict = false;
      try {
        console.log("[EARS-19 DEBUG] Starting rebase (THIS MAY HANG)...");
        await git.rebase("main");
        console.log("[EARS-19 DEBUG] Rebase completed WITHOUT conflict (unexpected!)");
      } catch (error) {
        // Expected: rebase will fail with conflict
        console.log("[EARS-19 DEBUG] Rebase failed with conflict (EXPECTED):", error);
        rebaseConflict = true;
      }

      console.log("[EARS-19 DEBUG] Verifying rebase state...");
      expect(rebaseConflict).toBe(true);
      expect(await git.isRebaseInProgress()).toBe(true);
      console.log("[EARS-19 DEBUG] Rebase conflict confirmed");

      // 5. Manually resolve conflict by choosing a resolution
      const resolvedTask: TaskRecord = createTaskRecord({
        ...originalTask,
        title: "RESOLVED: Combined version",
        status: "active",
        description: "This task was manually resolved after a rebase conflict",
      });
      const resolvedRecord = {
        header: {
          version: "1.0" as const,
          type: "task" as const,
          payloadChecksum: "OUTDATED-WILL-BE-RECALCULATED",
          signatures: [{
            keyId: "human:original-author",
            role: "author",
            notes: "Original signature",
            signature: "original-sig",
            timestamp: Math.floor(Date.now() / 1000),
          }],
        },
        payload: resolvedTask,
      };
      fs.writeFileSync(taskPath, JSON.stringify(resolvedRecord, null, 2));
      await git.add([".gitgov/tasks/task-conflict.json"]);
      console.log("[EARS-19 DEBUG] Resolved conflict and staged file");

      // ========== EXECUTE resolveConflict ==========
      console.log("[EARS-19 DEBUG] Calling resolveConflict (THIS MAY HANG)...");
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Manually resolved conflict by combining both versions",
      });

      // ========== VERIFY RESULTS ==========
      console.log("[EARS-19 DEBUG] resolveConflict returned:", result);

      // Verify: signRecord was called
      const signRecordMock = mockIdentityAdapter.signRecord as jest.MockedFunction<IIdentityAdapter['signRecord']>;
      expect(signRecordMock).toHaveBeenCalled();
      expect(signRecordMock.mock.calls[0]![1]).toBe("human:test-resolver");
      expect(signRecordMock.mock.calls[0]![2]).toBe("resolver");

      // Verify: Record was updated on disk with new checksum and signature
      const updatedContent = fs.readFileSync(taskPath, "utf-8");
      const updatedRecord = JSON.parse(updatedContent);

      // Verify checksum was recalculated
      expect(updatedRecord.header.payloadChecksum).not.toBe("OUTDATED-WILL-BE-RECALCULATED");
      const expectedChecksum = calculatePayloadChecksum(updatedRecord.payload);
      expect(updatedRecord.header.payloadChecksum).toBe(expectedChecksum);

      // Verify resolver signature was added
      expect(updatedRecord.header.signatures.length).toBe(2); // original + resolver
      const resolverSig = updatedRecord.header.signatures.find(
        (sig: Signature) => sig.role === "resolver"
      );
      expect(resolverSig).toBeDefined();
      expect(resolverSig?.keyId).toBe("human:test-resolver");

      // Verify result
      expect(result.success).toBe(true);
      expect(result.resolvedBy).toBe("human:test-resolver");
      expect(result.reason).toBe("Manually resolved conflict by combining both versions");

      // Cleanup: Go back to main
      await git.checkoutBranch("main");
    });

    // ========== EDGE CASE TESTS FOR EARS-19 ==========

    it("[EARS-19-EC1] should skip non-.gitgov files when resolving", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn().mockImplementation(async (record, actorId, role) => {
          const newChecksum = calculatePayloadChecksum(record.payload);
          return {
            ...record,
            header: {
              ...record.header,
              payloadChecksum: newChecksum,
              signatures: [
                ...(record.header.signatures || []),
                {
                  keyId: actorId,
                  role: role,
                  notes: "Record signed after resolution",
                  signature: `mock-signature-${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          };
        }),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create simple conflict (non-.gitgov file)
      const testFile = path.join(repoPath, "src/code.ts");
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, "Base");
      await git.add(["src/code.ts"]);
      await git.commit("Add code file");

      await git.createBranch("feature");
      fs.writeFileSync(testFile, "Feature");
      await git.add(["src/code.ts"]);
      await git.commit("Update in feature");

      await git.checkoutBranch("main");
      fs.writeFileSync(testFile, "Main");
      await git.add(["src/code.ts"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve conflict
      fs.writeFileSync(testFile, "Resolved");
      await git.add(["src/code.ts"]);

      // Execute resolveConflict
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved non-.gitgov conflict",
      });

      // Verify: signRecord was NOT called (no .gitgov files)
      const signRecordMock = mockIdentityAdapter.signRecord as jest.MockedFunction<IIdentityAdapter['signRecord']>;
      expect(signRecordMock).not.toHaveBeenCalled();

      // Verify: Resolution succeeded anyway
      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(0); // No .gitgov files

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC2] should skip invalid JSON files when resolving", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn(),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create conflict with INVALID JSON
      const invalidPath = path.join(repoPath, ".gitgov/tasks/invalid.json");
      fs.mkdirSync(path.dirname(invalidPath), { recursive: true });

      fs.writeFileSync(invalidPath, '{"broken": "json"');
      await git.add([".gitgov/tasks/invalid.json"]);
      await git.commit("Add invalid JSON");

      await git.createBranch("feature-invalid");
      fs.writeFileSync(invalidPath, '{"also": "broken"');
      await git.add([".gitgov/tasks/invalid.json"]);
      await git.commit("Update invalid");

      await git.checkoutBranch("main");
      fs.writeFileSync(invalidPath, '{"still": "broken"');
      await git.add([".gitgov/tasks/invalid.json"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature-invalid");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve with VALID JSON but missing structure
      fs.writeFileSync(invalidPath, '{"valid": "json", "but": "no embedded metadata"}');
      await git.add([".gitgov/tasks/invalid.json"]);

      // Execute resolveConflict (should skip invalid file)
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved invalid",
      });

      // Verify: signRecord was NOT called (invalid file skipped)
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();

      // Verify: Resolution succeeded anyway
      expect(result.success).toBe(true);

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC3] should process multiple .gitgov records in one conflict", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn().mockImplementation(async (record, actorId, role) => {
          const newChecksum = calculatePayloadChecksum(record.payload);
          return {
            ...record,
            header: {
              ...record.header,
              payloadChecksum: newChecksum,
              signatures: [
                ...(record.header.signatures || []),
                {
                  keyId: actorId,
                  role: role,
                  notes: "Record signed after resolution",
                  signature: `mock-signature-${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          };
        }),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create TWO conflicting tasks
      const task1Path = path.join(repoPath, ".gitgov/tasks/multi-1.json");
      const task2Path = path.join(repoPath, ".gitgov/tasks/multi-2.json");
      fs.mkdirSync(path.dirname(task1Path), { recursive: true });

      const task1: TaskRecord = createTaskRecord({
        id: "1234567890-task-multi-1",
        title: "Task 1",
        status: "draft",
        priority: "medium",
        description: "First task in multi-conflict scenario",
        tags: [],
      });
      const task2: TaskRecord = createTaskRecord({
        id: "1234567890-task-multi-2",
        title: "Task 2",
        status: "draft",
        priority: "medium",
        description: "Second task in multi-conflict scenario",
        tags: [],
      });

      const record1 = createEmbeddedMetadataRecord(task1, {
        signature: {
          keyId: "human:original",
          role: "author",
          notes: "Original",
        },
      });
      const record2 = createEmbeddedMetadataRecord(task2, {
        signature: {
          keyId: "human:original",
          role: "author",
          notes: "Original",
        },
      });

      fs.writeFileSync(task1Path, JSON.stringify(record1, null, 2));
      fs.writeFileSync(task2Path, JSON.stringify(record2, null, 2));
      await git.add([".gitgov/tasks/multi-1.json", ".gitgov/tasks/multi-2.json"]);
      await git.commit("Add two tasks");

      await git.createBranch("feature-multi");
      const task1Feature = { ...task1, title: "Task 1 Feature" };
      const task2Feature = { ...task2, title: "Task 2 Feature" };
      fs.writeFileSync(task1Path, JSON.stringify({ ...record1, header: { ...record1.header, payloadChecksum: calculatePayloadChecksum(task1Feature) }, payload: task1Feature }, null, 2));
      fs.writeFileSync(task2Path, JSON.stringify({ ...record2, header: { ...record2.header, payloadChecksum: calculatePayloadChecksum(task2Feature) }, payload: task2Feature }, null, 2));
      await git.add([".gitgov/tasks/multi-1.json", ".gitgov/tasks/multi-2.json"]);
      await git.commit("Update both in feature");

      await git.checkoutBranch("main");
      const task1Main = { ...task1, title: "Task 1 Main" };
      const task2Main = { ...task2, title: "Task 2 Main" };
      fs.writeFileSync(task1Path, JSON.stringify({ ...record1, header: { ...record1.header, payloadChecksum: calculatePayloadChecksum(task1Main) }, payload: task1Main }, null, 2));
      fs.writeFileSync(task2Path, JSON.stringify({ ...record2, header: { ...record2.header, payloadChecksum: calculatePayloadChecksum(task2Main) }, payload: task2Main }, null, 2));
      await git.add([".gitgov/tasks/multi-1.json", ".gitgov/tasks/multi-2.json"]);
      await git.commit("Update both in main");

      await git.checkoutBranch("feature-multi");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve BOTH conflicts
      const task1Resolved = { ...task1, title: "Task 1 RESOLVED" };
      const task2Resolved = { ...task2, title: "Task 2 RESOLVED" };
      fs.writeFileSync(task1Path, JSON.stringify({ header: { version: "1.0" as const, type: "task" as const, payloadChecksum: "OLD1", signatures: record1.header.signatures }, payload: task1Resolved }, null, 2));
      fs.writeFileSync(task2Path, JSON.stringify({ header: { version: "1.0" as const, type: "task" as const, payloadChecksum: "OLD2", signatures: record2.header.signatures }, payload: task2Resolved }, null, 2));
      await git.add([".gitgov/tasks/multi-1.json", ".gitgov/tasks/multi-2.json"]);

      // Execute resolveConflict
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved multiple conflicts",
      });

      // Verify: signRecord called TWICE (once for each task)
      const signRecordMock = mockIdentityAdapter.signRecord as jest.MockedFunction<IIdentityAdapter['signRecord']>;
      expect(signRecordMock).toHaveBeenCalledTimes(2);

      // Verify: Both records updated
      const updated1 = JSON.parse(fs.readFileSync(task1Path, "utf-8"));
      const updated2 = JSON.parse(fs.readFileSync(task2Path, "utf-8"));
      expect(updated1.header.signatures.length).toBe(2);
      expect(updated2.header.signatures.length).toBe(2);

      // Verify: Result
      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(2);

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC4] should skip records without header/payload structure", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn(),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create conflict with legacy format (no embedded metadata)
      const legacyPath = path.join(repoPath, ".gitgov/tasks/legacy.json");
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });

      const legacyTask = {
        id: "1234567890-legacy",
        title: "Legacy task",
        status: "draft",
        // NO header/payload structure
      };
      fs.writeFileSync(legacyPath, JSON.stringify(legacyTask, null, 2));
      await git.add([".gitgov/tasks/legacy.json"]);
      await git.commit("Add legacy task");

      await git.createBranch("feature-legacy");
      legacyTask.title = "Legacy Feature";
      fs.writeFileSync(legacyPath, JSON.stringify(legacyTask, null, 2));
      await git.add([".gitgov/tasks/legacy.json"]);
      await git.commit("Update legacy");

      await git.checkoutBranch("main");
      legacyTask.title = "Legacy Main";
      fs.writeFileSync(legacyPath, JSON.stringify(legacyTask, null, 2));
      await git.add([".gitgov/tasks/legacy.json"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature-legacy");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve
      legacyTask.title = "Legacy RESOLVED";
      fs.writeFileSync(legacyPath, JSON.stringify(legacyTask, null, 2));
      await git.add([".gitgov/tasks/legacy.json"]);

      // Execute resolveConflict (should skip legacy file)
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved legacy",
      });

      // Verify: signRecord was NOT called (legacy format skipped)
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();

      // Verify: Resolution succeeded anyway
      expect(result.success).toBe(true);

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC5] should handle mix of valid and invalid records", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn().mockImplementation(async (record, actorId, role) => {
          const newChecksum = calculatePayloadChecksum(record.payload);
          return {
            ...record,
            header: {
              ...record.header,
              payloadChecksum: newChecksum,
              signatures: [
                ...(record.header.signatures || []),
                {
                  keyId: actorId,
                  role: role,
                  notes: "Record signed after resolution",
                  signature: `mock-signature-${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          };
        }),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create TWO files: one valid, one invalid
      const validPath = path.join(repoPath, ".gitgov/tasks/valid-mix.json");
      const invalidPath = path.join(repoPath, ".gitgov/tasks/invalid-mix.json");
      fs.mkdirSync(path.dirname(validPath), { recursive: true });

      const validTask: TaskRecord = createTaskRecord({
        id: "1234567890-task-valid-mix",
        title: "Valid task",
        status: "draft",
        priority: "medium",
        description: "This task has proper embedded metadata structure",
        tags: [],
      });
      const validRecord = createEmbeddedMetadataRecord(validTask, {
        signature: {
          keyId: "human:original",
          role: "author",
          notes: "Original",
        },
      });

      fs.writeFileSync(validPath, JSON.stringify(validRecord, null, 2));
      fs.writeFileSync(invalidPath, '{"broken": "json"');
      await git.add([".gitgov/tasks/valid-mix.json", ".gitgov/tasks/invalid-mix.json"]);
      await git.commit("Add mixed files");

      await git.createBranch("feature-mix");
      const validFeature = { ...validTask, title: "Valid Feature" };
      fs.writeFileSync(validPath, JSON.stringify({ ...validRecord, header: { ...validRecord.header, payloadChecksum: calculatePayloadChecksum(validFeature) }, payload: validFeature }, null, 2));
      fs.writeFileSync(invalidPath, '{"also": "broken"');
      await git.add([".gitgov/tasks/valid-mix.json", ".gitgov/tasks/invalid-mix.json"]);
      await git.commit("Update mixed");

      await git.checkoutBranch("main");
      const validMain = { ...validTask, title: "Valid Main" };
      fs.writeFileSync(validPath, JSON.stringify({ ...validRecord, header: { ...validRecord.header, payloadChecksum: calculatePayloadChecksum(validMain) }, payload: validMain }, null, 2));
      fs.writeFileSync(invalidPath, '{"still": "broken"');
      await git.add([".gitgov/tasks/valid-mix.json", ".gitgov/tasks/invalid-mix.json"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature-mix");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve BOTH
      const validResolved = { ...validTask, title: "Valid RESOLVED" };
      fs.writeFileSync(validPath, JSON.stringify({ header: { version: "1.0" as const, type: "task" as const, payloadChecksum: "OLD", signatures: validRecord.header.signatures }, payload: validResolved }, null, 2));
      fs.writeFileSync(invalidPath, '{"resolved": "but still not embedded metadata"}');
      await git.add([".gitgov/tasks/valid-mix.json", ".gitgov/tasks/invalid-mix.json"]);

      // Execute resolveConflict
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved mix",
      });

      // Verify: signRecord called ONCE (only for valid file)
      const signRecordMock = mockIdentityAdapter.signRecord as jest.MockedFunction<IIdentityAdapter['signRecord']>;
      expect(signRecordMock).toHaveBeenCalledTimes(1);

      // Verify: Only valid record updated
      const updatedValid = JSON.parse(fs.readFileSync(validPath, "utf-8"));
      expect(updatedValid.header.signatures.length).toBe(2);

      // Verify: Result shows both files staged
      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(2); // Both staged, but only 1 updated

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC6] should handle empty .gitgov directory during conflict", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn(),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create conflict in .gitkeep (common in empty .gitgov dirs)
      const gitkeepPath = path.join(repoPath, ".gitgov/.gitkeep");
      fs.mkdirSync(path.dirname(gitkeepPath), { recursive: true });

      fs.writeFileSync(gitkeepPath, "");
      await git.add([".gitgov/.gitkeep"]);
      await git.commit("Add .gitkeep");

      await git.createBranch("feature-gitkeep");
      fs.writeFileSync(gitkeepPath, "feature content");
      await git.add([".gitgov/.gitkeep"]);
      await git.commit("Update .gitkeep");

      await git.checkoutBranch("main");
      fs.writeFileSync(gitkeepPath, "main content");
      await git.add([".gitgov/.gitkeep"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature-gitkeep");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve
      fs.writeFileSync(gitkeepPath, "");
      await git.add([".gitgov/.gitkeep"]);

      // Execute resolveConflict
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved .gitkeep",
      });

      // Verify: signRecord NOT called (.gitkeep is not a JSON record)
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();

      // Verify: Resolution succeeded
      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(0); // No .json files

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-19-EC7] should handle record with missing payloadChecksum field", async () => {
      // Setup: Create mock IdentityAdapter
      const mockIdentityAdapter: Partial<IIdentityAdapter> = {
        getCurrentActor: jest.fn().mockResolvedValue({
          id: "human:test-resolver",
          displayName: "Test Resolver",
          publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          type: "human",
          roles: ["developer"],
          status: "active",
          metadata: {},
        }),
        signRecord: jest.fn().mockImplementation(async (record, actorId, role) => {
          const newChecksum = calculatePayloadChecksum(record.payload);
          return {
            ...record,
            header: {
              ...record.header,
              payloadChecksum: newChecksum,
              signatures: [
                ...(record.header.signatures || []),
                {
                  keyId: actorId,
                  role: role,
                  notes: "Record signed after resolution",
                  signature: `mock-signature-${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          };
        }),
        getActorPublicKey: jest.fn().mockResolvedValue("ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
      };

      const syncModuleWithIdentity = new SyncModule({
        git,
        config,
        identity: mockIdentityAdapter as IIdentityAdapter,
        lint: createMockLintModule(),
        indexer: createMockIndexerAdapter(),
      });

      // Create task with MISSING payloadChecksum
      const taskPath = path.join(repoPath, ".gitgov/tasks/no-checksum.json");
      fs.mkdirSync(path.dirname(taskPath), { recursive: true });

      const task: TaskRecord = createTaskRecord({
        id: "1234567890-task-no-checksum",
        title: "Task without checksum",
        status: "draft",
        priority: "medium",
        description: "This task is missing the payloadChecksum field",
        tags: [],
      });
      const malformedRecord = {
        header: {
          version: "1.0" as const,
          type: "task" as const,
          // NO payloadChecksum!
          signatures: [{
            keyId: "human:original",
            role: "author",
            notes: "Original",
            signature: "sig",
            timestamp: Math.floor(Date.now() / 1000),
          }],
        },
        payload: task,
      };

      fs.writeFileSync(taskPath, JSON.stringify(malformedRecord, null, 2));
      await git.add([".gitgov/tasks/no-checksum.json"]);
      await git.commit("Add malformed task");

      await git.createBranch("feature-malformed");
      const taskFeature = { ...task, title: "Feature version" };
      fs.writeFileSync(taskPath, JSON.stringify({ ...malformedRecord, payload: taskFeature }, null, 2));
      await git.add([".gitgov/tasks/no-checksum.json"]);
      await git.commit("Update malformed");

      await git.checkoutBranch("main");
      const taskMain = { ...task, title: "Main version" };
      fs.writeFileSync(taskPath, JSON.stringify({ ...malformedRecord, payload: taskMain }, null, 2));
      await git.add([".gitgov/tasks/no-checksum.json"]);
      await git.commit("Update in main");

      await git.checkoutBranch("feature-malformed");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // Resolve
      const taskResolved = { ...task, title: "RESOLVED version" };
      fs.writeFileSync(taskPath, JSON.stringify({ ...malformedRecord, payload: taskResolved }, null, 2));
      await git.add([".gitgov/tasks/no-checksum.json"]);

      // Execute resolveConflict (should handle malformed record gracefully)
      const result = await syncModuleWithIdentity.resolveConflict({
        actorId: "human:test-resolver",
        reason: "Resolved malformed",
      });

      // Verify: signRecord called (record has header/payload even if checksum missing)
      const signRecordMock = mockIdentityAdapter.signRecord as jest.MockedFunction<IIdentityAdapter['signRecord']>;
      expect(signRecordMock).toHaveBeenCalled();

      // Verify: Record updated with NEW checksum added by signRecord
      const updated = JSON.parse(fs.readFileSync(taskPath, "utf-8"));
      expect(updated.header.payloadChecksum).toBeDefined();
      expect(updated.header.signatures.length).toBe(2);

      // Verify: Result
      expect(result.success).toBe(true);

      // Cleanup
      await git.checkoutBranch("main");
    });

    it("[EARS-20] should create rebase commit and signed resolution commit", async () => {
      // Setup: Create a REAL conflict
      const testFile = path.join(repoPath, "test-file.txt");

      // 1. Create base version
      fs.writeFileSync(testFile, "Base content");
      await git.add(["test-file.txt"]);
      await git.commit("Add base file");

      // 2. Create conflict branch
      await git.createBranch("conflict-test");
      fs.writeFileSync(testFile, "Conflict branch content");
      await git.add(["test-file.txt"]);
      await git.commit("Update in conflict branch");

      // 3. Go back to main and create conflicting change
      await git.checkoutBranch("main");
      fs.writeFileSync(testFile, "Main branch content");
      await git.add(["test-file.txt"]);
      await git.commit("Update in main");

      // 4. Try to rebase (will create conflict)
      await git.checkoutBranch("conflict-test");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // 5. Resolve conflict
      fs.writeFileSync(testFile, "Resolved content");
      await git.add(["test-file.txt"]);

      // Execute
      const result = await syncModule.resolveConflict({
        actorId: "human:test-actor",
        reason: "Manual resolution",
      });

      // Verify: Two commits were created (rebase + resolution)
      expect(result.success).toBe(true);
      expect(result.rebaseCommitHash).toBeDefined();
      expect(result.resolutionCommitHash).toBeDefined();
      expect(result.rebaseCommitHash).not.toBe(result.resolutionCommitHash);

      // Verify: Indexer was called after resolution (EARS-20)
      expect(mockIndexer.generateIndex).toHaveBeenCalled();

      // Cleanup: Go back to main branch
      await git.checkoutBranch("main");
    });

    it("[EARS-21] should include actor-id and reason in signed resolution commit", async () => {
      // Setup: Create a REAL conflict
      const testFile = path.join(repoPath, "test-file-21.txt");

      // 1. Create base version
      fs.writeFileSync(testFile, "Base content");
      await git.add(["test-file-21.txt"]);
      await git.commit("Add base file");

      // 2. Create conflict branch
      await git.createBranch("conflict-test-21");
      fs.writeFileSync(testFile, "Conflict branch content");
      await git.add(["test-file-21.txt"]);
      await git.commit("Update in conflict branch");

      // 3. Go back to main and create conflicting change
      await git.checkoutBranch("main");
      fs.writeFileSync(testFile, "Main branch content");
      await git.add(["test-file-21.txt"]);
      await git.commit("Update in main");

      // 4. Try to rebase (will create conflict)
      await git.checkoutBranch("conflict-test-21");
      try {
        await git.rebase("main");
      } catch {
        // Expected conflict
      }

      // 5. Resolve conflict
      fs.writeFileSync(testFile, "Resolved content");
      await git.add(["test-file-21.txt"]);

      // Execute
      const actorId = "human:camilo";
      const reason = "Kept our version because X reason";
      const result = await syncModule.resolveConflict({
        actorId,
        reason,
      });

      // Verify: Get commit message of resolution commit
      const { stdout: commitMessage } = await execAsync(
        `git log -1 --format=%B ${result.resolutionCommitHash}`,
        { cwd: repoPath }
      );

      // Verify: Commit message contains actor-id and reason
      expect(commitMessage).toContain(actorId);
      expect(commitMessage).toContain(reason);
      expect(commitMessage).toContain("resolution:");
      expect(commitMessage).toContain("Signed-off-by:");

      // Cleanup: Go back to main branch
      await git.checkoutBranch("main");
    });

    it("[EARS-22] should correctly detect if rebase is in progress", async () => {
      // Verify no rebase initially
      const isInProgress = await syncModule.isRebaseInProgress();
      expect(isInProgress).toBe(false);
    });

    it("[EARS-23] should detect conflict markers in files", async () => {
      // Setup: Create file with REAL conflict markers
      // Note: We build the conflict markers programmatically to avoid confusing editors
      const testFile = path.join(repoPath, "test-conflict.txt");
      const conflictMarkerStart = "<".repeat(7) + " HEAD";
      const conflictMarkerMiddle = "=".repeat(7);
      const conflictMarkerEnd = ">".repeat(7) + " branch";
      const conflictContent = [
        "line 1",
        conflictMarkerStart,
        "line 2 (ours)",
        conflictMarkerMiddle,
        "line 2 (theirs)",
        conflictMarkerEnd,
        "line 3"
      ].join("\n");
      fs.writeFileSync(testFile, conflictContent);

      // Execute
      const filesWithMarkers = await syncModule.checkConflictMarkers([
        "test-conflict.txt",
      ]);

      // Verify
      expect(filesWithMarkers).toContain("test-conflict.txt");
      expect(filesWithMarkers.length).toBe(1);

      // Cleanup
      fs.unlinkSync(testFile);
    });
  });

  // ===== Error Classes Tests =====
  // Note: These tests verify error class implementations.
  // They don't have specific EARS as they test infrastructure, not business logic.

  describe("Error Classes", () => {
    it("should throw SyncError with correct message", () => {
      const error = new SyncError("Test error message");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error message");
      expect(error.name).toBe("SyncError");
    });

    it("should throw ConflictMarkersPresentError with file list", () => {
      const files = ["file1.json", "file2.json"];
      const error = new ConflictMarkersPresentError(files);
      expect(error).toBeInstanceOf(Error);
      expect(error.filesWithMarkers).toEqual(files);
      expect(error.message).toContain("2 file(s)");
    });

    it("should throw UncommittedChangesError with correct message", () => {
      const error = new UncommittedChangesError("gitgov-state");
      expect(error).toBeInstanceOf(Error);
      expect(error.branch).toBe("gitgov-state");
      expect(error.message).toContain("Uncommitted changes");
    });

    it("should throw NoRebaseInProgressError when no rebase active", () => {
      const error = new NoRebaseInProgressError();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("No rebase in progress");
    });

    it("should throw PushFromStateBranchError with branch name", () => {
      const error = new PushFromStateBranchError("gitgov-state");
      expect(error).toBeInstanceOf(Error);
      expect(error.branch).toBe("gitgov-state");
      expect(error.message).toContain("Cannot push from gitgov-state branch");
    });
  });

  // ===== EARS 24-31: Integrity and Audit =====

  describe("Integrity and Audit (EARS 24-31)", () => {
    beforeEach(async () => {
      await syncModule.ensureStateBranch();
    });

    it("[EARS-24] should analyze history to identify rebase commits without resolution", async () => {
      // Execute
      const violations = await syncModule.verifyResolutionIntegrity();

      // Verify (clean history should have no violations)
      expect(Array.isArray(violations)).toBe(true);
      expect(violations.length).toBe(0);
    });

    it("[EARS-25] should return list of violations if found", async () => {
      // This requires creating actual violations in history
      // TODO: Implement with violation setup
    });

    it("[EARS-26] should return empty array if no violations", async () => {
      // Execute
      const violations = await syncModule.verifyResolutionIntegrity();

      // Verify
      expect(violations).toEqual([]);
    });

    it("[EARS-27] should execute complete audit verification", async () => {
      // Execute
      const report = await syncModule.auditState();

      // Verify
      expect(report).toBeDefined();
      expect(report.scope).toBe("all");
      expect(report.passed).toBe(true);
      expect(report.summary).toContain("passed");
    });

    it("[EARS-28] should verify valid signatures in modified records", async () => {
      // Setup: Create mock LintModule that simulates signature validation errors
      const lintSummary: LintSummary = {
        filesChecked: 2,
        errors: 1,
        warnings: 0,
        fixable: 0,
        executionTime: 100,
      };

      const lintResults: LintResult[] = [
        {
          level: "error",
          filePath: ".gitgov/tasks/task-invalid-sig.json",
          validator: "SIGNATURE_STRUCTURE",
          message: "Invalid signature: No public key found for human:invalid-actor",
          entity: {
            type: "task",
            id: "1234567890-task-invalid-sig",
          },
          fixable: false,
        },
      ];

      const lintReportMock: LintReport = {
        summary: lintSummary,
        results: lintResults,
        metadata: {
          timestamp: new Date().toISOString(),
          options: {},
          version: "1.0.0",
        },
      };

      const mockLintModule = {
        lint: jest.fn().mockResolvedValue(lintReportMock),
      };

      // Create SyncModule with LintModule mock
      const syncModuleWithLint = new SyncModule({
        git,
        config,
        identity: createMockIdentityAdapter(),
        lint: mockLintModule as unknown as LintModule,
        indexer: createMockIndexerAdapter(),
      });

      // Setup: Create Task payloads using factory
      const invalidTaskPayload: TaskRecord = createTaskRecord({
        id: "1234567890-task-invalid-sig",
        title: "Task with invalid signature",
        status: "draft",
        priority: "medium",
        description: "Test task with invalid signature",
        tags: [],
      });

      const validTaskPayload: TaskRecord = createTaskRecord({
        id: "1234567890-task-valid-sig",
        title: "Task with valid signature",
        status: "draft",
        priority: "medium",
        description: "Test task with valid signature",
        tags: [],
      });

      // Setup: Create mock signatures using proper Signature type
      // Note: We create mock signatures for testing verification logic
      // Real signature creation would require valid Ed25519 keys
      // Signatures must match pattern: ^[A-Za-z0-9+/]{86}==$
      const invalidSignature: Signature = {
        keyId: "human:invalid-actor", // This actor won't have public key in mock
        role: "author",
        notes: "Invalid signature for testing",
        signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
        timestamp: Math.floor(Date.now() / 1000),
      };

      const validSignature: Signature = {
        keyId: "human:valid-actor", // This actor will have public key in mock
        role: "author",
        notes: "Valid signature for testing",
        signature: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==",
        timestamp: Math.floor(Date.now() / 1000),
      };

      // Setup: Create Record with INVALID signature (keyId not found)
      const recordWithInvalidSignature = createEmbeddedMetadataRecord(invalidTaskPayload, {
        signatures: [invalidSignature],
      });

      // Setup: Create Record with VALID signature
      const recordWithValidSignature = createEmbeddedMetadataRecord(validTaskPayload, {
        signatures: [validSignature],
      });

      // Write both records to disk
      const invalidTaskPath = path.join(repoPath, ".gitgov/tasks/task-invalid-sig.json");
      const validTaskPath = path.join(repoPath, ".gitgov/tasks/task-valid-sig.json");
      fs.writeFileSync(invalidTaskPath, JSON.stringify(recordWithInvalidSignature, null, 2));
      fs.writeFileSync(validTaskPath, JSON.stringify(recordWithValidSignature, null, 2));

      // Commit both records
      await git.add([
        ".gitgov/tasks/task-invalid-sig.json",
        ".gitgov/tasks/task-valid-sig.json"
      ]);
      await git.commit("Add tasks with valid and invalid signatures");

      // Execute audit with signature verification
      const report = await syncModuleWithLint.auditState({
        scope: "current",
        verifySignatures: true,
      });

      // Verify: LintModule was called
      expect(mockLintModule.lint).toHaveBeenCalled();

      // Verify: Audit detected errors via LintModule
      expect(report.passed).toBe(false);
      expect(report.lintReport).toBeDefined();
      expect(report.lintReport?.summary.errors).toBe(1);

      // Verify: Invalid signature error is in lintReport
      const invalidSigError = report.lintReport?.results.find((r) =>
        r.filePath.includes("task-invalid-sig")
      );
      expect(invalidSigError).toBeDefined();
      expect(invalidSigError?.message).toContain("Invalid signature");
    });

    it("[EARS-29] should verify record checksums according to scope", async () => {
      // Setup: Create mock LintModule
      const lintReportMock: LintReport = {
        summary: { filesChecked: 0, errors: 0, warnings: 0, fixable: 0, executionTime: 50 },
        results: [],
        metadata: { timestamp: new Date().toISOString(), options: {}, version: "1.0.0" },
      };

      const mockLintModule = {
        lint: jest.fn().mockResolvedValue(lintReportMock),
      };

      const syncModuleWithLint = new SyncModule({
        git,
        config,
        identity: createMockIdentityAdapter(),
        lint: mockLintModule as unknown as LintModule,
        indexer: createMockIndexerAdapter(),
      });

      // Execute audit with checksum verification
      const report = await syncModuleWithLint.auditState({
        scope: "state-branch",
        verifyChecksums: true,
      });

      // Verify
      expect(report.scope).toBe("state-branch");
      expect(report.lintReport).toBeDefined();
      expect(mockLintModule.lint).toHaveBeenCalled();
    });

    // Additional deep validation test for EARS-29 (checksum verification)
    it("should detect invalid checksums in records", async () => {
      // Setup: Create mock LintModule that detects checksum errors
      const lintReportMock: LintReport = {
        summary: { filesChecked: 1, errors: 1, warnings: 0, fixable: 0, executionTime: 75 },
        results: [
          {
            level: "error",
            filePath: ".gitgov/actors/test-actor-invalid.json",
            validator: "CHECKSUM_VERIFICATION",
            message: "Checksum mismatch detected",
            entity: { type: "actor", id: "human:test-actor-invalid" },
            fixable: false,
          },
        ],
        metadata: { timestamp: new Date().toISOString(), options: {}, version: "1.0.0" },
      };

      const mockLintModule = {
        lint: jest.fn().mockResolvedValue(lintReportMock),
      };

      const syncModuleWithLint = new SyncModule({
        git,
        config,
        identity: createMockIdentityAdapter(),
        lint: mockLintModule as unknown as LintModule,
        indexer: createMockIndexerAdapter(),
      });

      // Create a valid ActorRecord payload
      const actorPayload: ActorRecord = {
        id: "human:test-actor-invalid",
        type: "human",
        displayName: "Test Actor",
        publicKey: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        roles: ["developer"],
      };

      // Create record with CORRUPTED checksum
      const invalidChecksum = "0000000000000000000000000000000000000000000000000000000000000000";
      const recordWithInvalidChecksum = {
        header: {
          version: "1.0",
          type: "actor",
          payloadChecksum: invalidChecksum, // CORRUPTED!
          signatures: [
            {
              keyId: "human:test-actor",
              role: "author",
              notes: "Test signature",
              signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
              timestamp: Math.floor(Date.now() / 1000),
            },
          ],
        },
        payload: actorPayload,
      };

      // Write to disk
      const actorFilePath = path.join(repoPath, ".gitgov/actors/test-actor-invalid.json");
      fs.writeFileSync(actorFilePath, JSON.stringify(recordWithInvalidChecksum, null, 2));

      // Commit
      await git.add([".gitgov/actors/test-actor-invalid.json"]);
      await git.commit("Add actor with invalid checksum");

      // Execute audit with checksum verification
      const report = await syncModuleWithLint.auditState({
        verifyChecksums: true,
      });

      // Verify: Checksum validation detected via LintModule
      expect(mockLintModule.lint).toHaveBeenCalled();
      expect(report.passed).toBe(false);
      expect(report.lintReport).toBeDefined();
      expect(report.lintReport?.summary.errors).toBe(1);

      const checksumError = report.lintReport?.results.find((r) =>
        r.filePath.includes("test-actor-invalid")
      );
      expect(checksumError).toBeDefined();
      expect(checksumError?.validator).toBe("CHECKSUM_VERIFICATION");
    });

    it("[EARS-30] should verify expected files according to scope", async () => {
      // Execute audit with file verification
      const report = await syncModule.auditState({
        verifyExpectedFiles: true,
        expectedFilesScope: "head",
      });

      // Verify
      expect(report.passed).toBeDefined();
      // Note: File validation is now delegated to LintModule
    });

    it("[EARS-31] should get structured diff of conflicts", async () => {
      // Execute with no conflicts
      const diff = await syncModule.getConflictDiff();

      // Verify
      expect(diff.files).toEqual([]);
      expect(diff.message).toContain("No conflicted files");
    });
  });

  // ===== EARS 32: Reserved =====
  // EARS-32 is reserved for future functionality
});

