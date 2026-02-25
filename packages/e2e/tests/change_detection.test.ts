/**
 * Block F: Change Detection — 7 EARS (CF1-CF7)
 * Blueprint: e2e/specs/change_detection.md
 *
 * Validates GithubSyncStateModule against a real GitHub repository:
 * calculateStateDelta, pullState, pushState, concurrent conflict detection,
 * and auditState. This simulates the saas-api sync path via core.
 *
 * Requires: GITHUB_TOKEN + GITHUB_TEST_OWNER + GITHUB_TEST_REPO_NAME
 * Fails if GitHub credentials are not configured (never silently skipped).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Octokit } from '@octokit/rest';

import {
  runCliCommand,
  createGitRepo,
  createTestPrisma,
  cleanupDb,
  HAS_GITHUB,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_REMOTE_URL,
  GithubSyncStateModule,
  RecordProjector,
  RecordMetrics,
  PrismaRecordProjection,
  DEFAULT_ID_ENCODER,
} from './helpers';
import type {
  PrismaClient,
  ProjectionClient,
  GithubSyncStateDependencies,
  RecordProjectorDependencies,
  IRecordProjector,
} from './helpers';

import { GitHubRecordStore } from '../../core/src/record_store/github';
import type {
  GitGovTaskRecord,
  GitGovActorRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
} from '../../core/src/record_types';
import type { ILintModule } from '../../core/src/lint';

// ===== Factory Helpers =====

/** Minimal ILintModule stub — lintRecord always passes. */
function createLintStub(): ILintModule {
  return { lintRecord: () => [] } as unknown as ILintModule;
}

/**
 * GitHubRecordStore instances pointing to gitgov-state.
 * CLI sync push stores files WITH .gitgov/ prefix on gitgov-state.
 */
function createGitgovStateStores(octokit: Octokit) {
  const opts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
  return {
    tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...opts, basePath: '.gitgov/tasks' }, octokit),
    actors: new GitHubRecordStore<GitGovActorRecord>({ ...opts, basePath: '.gitgov/actors', idEncoder: DEFAULT_ID_ENCODER }, octokit),
    cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...opts, basePath: '.gitgov/cycles' }, octokit),
    feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...opts, basePath: '.gitgov/feedbacks' }, octokit),
    executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...opts, basePath: '.gitgov/executions' }, octokit),
  };
}

/** RecordProjector wired to gitgov-state stores. */
function createGitgovStateProjector(octokit: Octokit): IRecordProjector {
  const stores = createGitgovStateStores(octokit);
  const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
  const recordMetrics = new RecordMetrics({ stores: typedStores });
  return new RecordProjector({ recordMetrics, stores: typedStores });
}

/** GithubSyncStateModule with real Octokit and stub config/identity/lint. */
function createSyncModule(octokit: Octokit, indexer: IRecordProjector): GithubSyncStateModule {
  return new GithubSyncStateModule({
    octokit,
    owner: GITHUB_TEST_OWNER,
    repo: GITHUB_TEST_REPO_NAME,
    config: {} as unknown as GithubSyncStateDependencies['config'],
    identity: {} as unknown as GithubSyncStateDependencies['identity'],
    lint: createLintStub(),
    indexer,
  });
}

// ===== Tests =====

describe('Block F: Change Detection (CF1-CF7)', () => {
  let octokit: Octokit;
  let prisma: PrismaClient;
  let cf3RepoId: string;
  let tempDir: string;
  let repoPath: string;
  let testBranch: string;
  let syncModule: GithubSyncStateModule;
  const conflictBranches: string[] = [];

  beforeAll(async () => {
    if (!HAS_GITHUB) {
      throw new Error(
        'Block F requires GitHub credentials. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, '
        + 'GITHUB_TEST_REPO_NAME, and GITHUB_TEST_REPO in packages/e2e/.env',
      );
    }

    octokit = new Octokit({ auth: GITHUB_TOKEN });
    prisma = createTestPrisma();
    cf3RepoId = `e2e-cf3-${Date.now()}`;
    testBranch = `e2e-cf-${Date.now()}`;

    // 1. Create local git repo
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-block-f-'));
    repoPath = path.join(tempDir, 'block-f');
    createGitRepo(repoPath);

    // 2. Add remote + create test branch
    execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: repoPath, stdio: 'pipe' });
    execSync('git fetch origin', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git checkout -b ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push -u origin ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });

    // 3. Clean up residual gitgov-state from previous runs
    try {
      await octokit.rest.git.deleteRef({
        owner: GITHUB_TEST_OWNER,
        repo: GITHUB_TEST_REPO_NAME,
        ref: 'heads/gitgov-state',
      });
    } catch { /* may not exist */ }

    // 4. CLI: init + task + sync push → creates gitgov-state branch
    runCliCommand(
      ['init', '--name', 'CF Test Project', '--actor-name', 'CF Dev', '--quiet'],
      { cwd: repoPath },
    );
    runCliCommand(
      ['task', 'new', 'CF initial task', '-d', 'Seed task for Block F', '-p', 'medium', '-q'],
      { cwd: repoPath },
    );
    runCliCommand(['sync', 'push', '--quiet'], { cwd: repoPath });

    // 5. Push .gitgov/ to working branch (needed for CF5 pushState)
    execSync('git add .gitgov/', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "add .gitgov for CF5"', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push origin ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 6. Create sync module (indexer wired to gitgov-state stores)
    const indexer = createGitgovStateProjector(octokit);
    syncModule = createSyncModule(octokit, indexer);
  }, 60_000);

  afterAll(async () => {
    const branchesToDelete = [testBranch, 'gitgov-state', ...conflictBranches];
    for (const branch of branchesToDelete) {
      try {
        await octokit.rest.git.deleteRef({
          owner: GITHUB_TEST_OWNER,
          repo: GITHUB_TEST_REPO_NAME,
          ref: `heads/${branch}`,
        });
      } catch { /* may not exist */ }
    }

    await cleanupDb(prisma, cf3RepoId);
    await prisma.$disconnect();

    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }, 30_000);

  // ===== Tests are SEQUENTIAL — they share syncModule state (lastKnownSha) =====

  it('[EARS-CF1] should return full delta when lastKnownSha is null (first sync)', async () => {
    // syncModule starts fresh → lastKnownSha is null → full sync
    const delta = await syncModule.calculateStateDelta('main');

    expect(delta.length).toBeGreaterThan(0);
    expect(delta.every(d => d.status === 'A')).toBe(true);

    // CLI sync push stores files with .gitgov/ prefix on gitgov-state
    const files = delta.map(d => d.file);
    expect(files.some(f => f.includes('/tasks/') || f.startsWith('tasks/'))).toBe(true);
    expect(files.some(f => f.includes('/actors/') || f.startsWith('actors/'))).toBe(true);
    expect(files.some(f => f.endsWith('config.json'))).toBe(true);
  }, 30_000);

  it('[EARS-CF2] should return empty delta when no remote changes', async () => {
    // pullState updates lastKnownSha to current gitgov-state SHA
    const pullResult = await syncModule.pullState();
    expect(pullResult.success).toBe(true);

    // Now calculateStateDelta should return empty (lastKnownSha === currentSha)
    const delta = await syncModule.calculateStateDelta('main');
    expect(delta).toHaveLength(0);
  }, 30_000);

  it('[EARS-CF3] should detect CLI-pushed changes and project to DB', async () => {
    // CLI pushes a new task → gitgov-state advances
    runCliCommand(
      ['task', 'new', 'CF3 delta task', '-d', 'Delta detection test', '-p', 'high', '-q'],
      { cwd: repoPath },
    );
    runCliCommand(['sync', 'push', '--quiet'], { cwd: repoPath });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // calculateStateDelta should detect the new files (lastKnownSha is stale)
    const delta = await syncModule.calculateStateDelta('main');
    expect(delta.length).toBeGreaterThan(0);
    expect(delta.some(d => d.file.includes('tasks/'))).toBe(true);

    // Update lastKnownSha for subsequent tests
    await syncModule.pullState();

    // Project from GitHub → Prisma (simulates saas-api path)
    const stores = createGitgovStateStores(octokit);
    const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
    const recordMetrics = new RecordMetrics({ stores: typedStores });
    const projector = new RecordProjector({ recordMetrics, stores: typedStores });

    const indexData = await projector.computeProjection();
    indexData.activityHistory = indexData.activityHistory.filter(
      ev => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
    );
    indexData.metadata.generationTime = 1;

    const sink = new PrismaRecordProjection({
      client: prisma as unknown as ProjectionClient,
      repoId: cf3RepoId,
      projectionType: 'index',
    });
    await sink.persist(indexData, {});

    // Verify DB has the new task with enriched data
    const tasks = await prisma.gitgovTask.findMany({ where: { repoId: cf3RepoId } });
    expect(tasks.length).toBeGreaterThanOrEqual(2); // initial + CF3
    expect(tasks.some(t => t.title === 'CF3 delta task')).toBe(true);

    const meta = await prisma.gitgovMeta.findFirst({
      where: { repoId: cf3RepoId, projectionType: 'index' },
    });
    expect(meta).not.toBeNull();
    const counts = meta!.recordCountsJson as Record<string, number>;
    expect(counts['tasks']).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('[EARS-CF4] should pull state with reindexing after new changes', async () => {
    // Write a new task directly to gitgov-state via API (avoids CLI git checkout issues)
    const cf4TaskId = `${Date.now()}-task-cf4-pull`;
    const cf4Store = new GitHubRecordStore<GitGovTaskRecord>(
      { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state', basePath: '.gitgov/tasks' },
      octokit,
    );
    await cf4Store.put(cf4TaskId, {
      header: {
        version: '1.0' as const,
        type: 'task' as const,
        payloadChecksum: 'a'.repeat(64),
        signatures: [{
          keyId: 'human:cf-dev',
          role: 'author',
          notes: 'CF4 pull test',
          signature: 'A'.repeat(86) + '==',
          timestamp: Date.now(),
        }],
      },
      payload: {
        id: cf4TaskId,
        title: 'CF4 pull task',
        status: 'draft' as const,
        priority: 'low' as const,
        description: 'Pull reindex test via API',
        tags: ['e2e'],
      },
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // pullState should detect changes and trigger re-indexing via indexer.computeProjection()
    const result = await syncModule.pullState();
    expect(result.success).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(result.filesUpdated).toBeGreaterThan(0);
    expect(result.reindexed).toBe(true);
  }, 30_000);

  it('[EARS-CF5] should push state via API with dryRun and no-op detection', async () => {
    // Add new task and push to working branch (simulates dev committing)
    runCliCommand(
      ['task', 'new', 'CF5 pushState task', '-d', 'API push test', '-p', 'medium', '-q'],
      { cwd: repoPath },
    );
    execSync('git add .gitgov/', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "CF5 pushState task"', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push origin ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // pushState: sync from working branch to gitgov-state (WriterService path)
    // Note: pushState strips .gitgov/ prefix, so files end up at tasks/ on gitgov-state
    const pushResult = await syncModule.pushState({
      sourceBranch: testBranch,
      actorId: 'human:cf-dev',
    });
    expect(pushResult.success).toBe(true);
    expect(pushResult.filesSynced).toBeGreaterThan(0);
    expect(pushResult.commitHash).not.toBeNull();
    expect(pushResult.conflictDetected).toBe(false);

    // Verify: API-pushed records are readable at root paths (tasks/, no .gitgov/ prefix)
    const apiTasksStore = new GitHubRecordStore<GitGovTaskRecord>(
      { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state', basePath: 'tasks' },
      octokit,
    );
    const taskIds = await apiTasksStore.list();
    expect(taskIds.length).toBeGreaterThanOrEqual(3);

    // No-op: pushState again with same content → no commit created
    const noopResult = await syncModule.pushState({
      sourceBranch: testBranch,
      actorId: 'human:cf-dev',
    });
    expect(noopResult.success).toBe(true);
    expect(noopResult.filesSynced).toBe(0);
    expect(noopResult.commitHash).toBeNull();

    // dryRun: add another task, push to branch, then dryRun pushState
    runCliCommand(
      ['task', 'new', 'CF5 dryRun task', '-d', 'Should not appear on gitgov-state', '-p', 'low', '-q'],
      { cwd: repoPath },
    );
    execSync('git add .gitgov/', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "CF5 dryRun task"', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push origin ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const dryRunResult = await syncModule.pushState({
      sourceBranch: testBranch,
      actorId: 'human:cf-dev',
      dryRun: true,
    });
    expect(dryRunResult.success).toBe(true);
    expect(dryRunResult.filesSynced).toBeGreaterThan(0);
    expect(dryRunResult.commitHash).toBeNull(); // dryRun → no commit
  }, 90_000);

  it('[EARS-CF6] should handle concurrent pushState (optimistic concurrency)', async () => {
    const branchA = `${testBranch}-conflict-a`;
    const branchB = `${testBranch}-conflict-b`;
    conflictBranches.push(branchA, branchB);

    // Branch A: from testBranch, add unique task
    execSync(`git checkout -b ${branchA}`, { cwd: repoPath, stdio: 'pipe' });
    runCliCommand(
      ['task', 'new', 'Conflict A Task', '-d', 'Branch A only', '-p', 'high', '-q'],
      { cwd: repoPath },
    );
    execSync('git add .gitgov/', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "conflict A task"', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push -u origin ${branchA}`, { cwd: repoPath, stdio: 'pipe' });

    // Branch B: from testBranch (without branch A's task), add different task
    execSync(`git checkout ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
    execSync(`git checkout -b ${branchB}`, { cwd: repoPath, stdio: 'pipe' });
    runCliCommand(
      ['task', 'new', 'Conflict B Task', '-d', 'Branch B only', '-p', 'low', '-q'],
      { cwd: repoPath },
    );
    execSync('git add .gitgov/', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "conflict B task"', { cwd: repoPath, stdio: 'pipe' });
    execSync(`git push -u origin ${branchB}`, { cwd: repoPath, stdio: 'pipe' });

    // Back to testBranch
    execSync(`git checkout ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Concurrent pushState from both branches
    const moduleA = createSyncModule(octokit, createGitgovStateProjector(octokit));
    const moduleB = createSyncModule(octokit, createGitgovStateProjector(octokit));

    const [resultA, resultB] = await Promise.all([
      moduleA.pushState({ sourceBranch: branchA, actorId: 'human:dev-a' }),
      moduleB.pushState({ sourceBranch: branchB, actorId: 'human:dev-b' }),
    ]);

    // At least one must succeed
    expect(resultA.success || resultB.success).toBe(true);

    // Both outcomes are valid (race condition is non-deterministic):
    if (resultA.conflictDetected || resultB.conflictDetected) {
      // Optimistic concurrency detected: one got 422/409 from updateRef
      const conflicted = resultA.conflictDetected ? resultA : resultB;
      expect(conflicted.success).toBe(false);
      expect(conflicted.conflictInfo).toBeDefined();
      expect(conflicted.conflictInfo!.type).toBe('rebase_conflict');
      expect(conflicted.conflictInfo!.affectedFiles.length).toBeGreaterThan(0);
    } else {
      // Both succeeded (GitHub resolved in order, no race at updateRef)
      expect(resultA.filesSynced).toBeGreaterThan(0);
      expect(resultB.filesSynced).toBeGreaterThan(0);
    }
  }, 90_000);

  it('[EARS-CF7] should audit gitgov-state records and report no violations', async () => {
    const report = await syncModule.auditState();

    expect(report.passed).toBe(true);
    expect(report.totalCommits).toBeGreaterThan(0);
    expect(report.summary).toContain('Audit passed');

    // lintReport should show records were checked with 0 errors
    expect(report.lintReport).toBeDefined();
    expect(report.lintReport!.summary.filesChecked).toBeGreaterThan(0);
    expect(report.lintReport!.summary.errors).toBe(0);
  }, 30_000);
});
