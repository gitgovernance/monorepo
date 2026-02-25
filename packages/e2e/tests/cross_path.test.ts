/**
 * Block D: Cross-Path Workflows — 5 EARS (CD1-CD5)
 * Blueprint: e2e/specs/cross_path.md
 *
 * Validates that records created via one path (CLI local) are visible and
 * projectable via another path (GitHub API), and vice versa.
 * Simulates a team where some use CLI and others use the web platform.
 *
 * Requires: GITHUB_TOKEN + GITHUB_TEST_REPO (SSH URL for git push/pull)
 *           + GITHUB_TEST_OWNER + GITHUB_TEST_REPO_NAME (for API access)
 * Skipped when GITHUB_TEST_REPO is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  runCliCommand,
  createGitRepo,
  createTestPrisma,
  cleanupDb,
  runProjector,
  listRecordFiles,
  readRecordFile,
  HAS_GITHUB,
  GITHUB_REMOTE_URL,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
  SKIP_CLEANUP,
  PrismaRecordProjection,
} from './helpers';
import type { PrismaClient, ProjectionClient } from './helpers';

import { GitHubRecordStore } from '../../core/src/record_store/github';
import { RecordProjector } from '../../core/src/record_projection';
import type { RecordProjectorDependencies } from '../../core/src/record_projection';
import { RecordMetrics } from '../../core/src/record_metrics';
import type {
  GitGovTaskRecord,
  GitGovActorRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
} from '../../core/src/record_types';

describe('Block D: Cross-Path Workflows (CD1-CD5)', () => {
  let prisma: PrismaClient;
  let octokit: Octokit;
  let tempDir: string;
  let userARepo: string;
  let branchName: string;
  let repoId: string;
  let cd1TaskId: string; // hoisted from CD1 for use in CD2+

  beforeAll(() => {
    if (!HAS_GITHUB) {
      throw new Error(
        'Block D requires GitHub credentials. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, '
        + 'GITHUB_TEST_REPO_NAME, and GITHUB_TEST_REPO in packages/e2e/.env',
      );
    }
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    prisma = createTestPrisma();
    repoId = `e2e-crosspath-${Date.now()}`;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-block-d-'));
    userARepo = path.join(tempDir, 'user-a');
    branchName = `e2e-crosspath-${Date.now()}`;

    // Create local git repo for CLI user A
    createGitRepo(userARepo);
    execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: userARepo, stdio: 'pipe' });

    // Fetch, create unique working branch, push to GitHub
    execSync('git fetch origin', { cwd: userARepo, stdio: 'pipe' });
    execSync(`git checkout -b ${branchName}`, { cwd: userARepo, stdio: 'pipe' });
    execSync(`git push -u origin ${branchName}`, { cwd: userARepo, stdio: 'pipe' });

    // Cleanup any leftover gitgov-state branch from previous runs
    try {
      execSync('git push origin --delete gitgov-state', { cwd: userARepo, stdio: 'pipe' });
    } catch { /* branch doesn't exist yet — expected */ }
  });

  afterAll(async () => {
    // Cleanup GitHub branches
    try {
      execSync(`git push origin --delete ${branchName}`, { cwd: userARepo, stdio: 'pipe' });
    } catch { /* ignore */ }
    try {
      execSync('git push origin --delete gitgov-state', { cwd: userARepo, stdio: 'pipe' });
    } catch { /* ignore */ }

    await cleanupDb(prisma, repoId);
    await prisma.$disconnect();
    if (!SKIP_CLEANUP) fs.rmSync(tempDir, { recursive: true, force: true });
    else console.log(`[SKIP_CLEANUP] Keeping tempDir=${tempDir}`);
  });

  it('[EARS-CD1] should project CLI-pushed records read from GitHub into DB', async () => {
    // 1. CLI: init + create task + sync push
    runCliCommand(['init', '--name', 'CD1 Project', '--actor-name', 'CLI Dev', '--quiet'], { cwd: userARepo });
    runCliCommand(['task', 'new', 'Cross-path task', '-d', 'Testing CLI to GitHub path', '-p', 'high', '-q'], { cwd: userARepo });
    runCliCommand(['sync', 'push'], { cwd: userARepo });

    // 2. API: Read records from GitHub via GitHubRecordStore
    const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
    const tasksStore = new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, octokit);
    const actorsStore = new GitHubRecordStore<GitGovActorRecord>({ ...storeOpts, basePath: '.gitgov/actors' }, octokit);
    const cyclesStore = new GitHubRecordStore<GitGovCycleRecord>({ ...storeOpts, basePath: '.gitgov/cycles' }, octokit);
    const feedbacksStore = new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, octokit);
    const executionsStore = new GitHubRecordStore<GitGovExecutionRecord>({ ...storeOpts, basePath: '.gitgov/executions' }, octokit);

    // Verify tasks are readable from GitHub
    const taskIds = await tasksStore.list();
    expect(taskIds.length).toBeGreaterThanOrEqual(1);

    // Read the task and verify payload
    const taskRecord = await tasksStore.get(taskIds[0]!);
    expect(taskRecord).not.toBeNull();
    expect(taskRecord!.payload.title).toBe('Cross-path task');
    expect(taskRecord!.header.signatures.length).toBeGreaterThanOrEqual(1);

    // Save task ID for downstream tests (CD2, CD3)
    cd1TaskId = taskRecord!.payload.id;

    // 3. Core: Project from GitHub stores to DB
    const stores = { tasks: tasksStore, actors: actorsStore, cycles: cyclesStore, feedbacks: feedbacksStore, executions: executionsStore };
    const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
    const recordMetrics = new RecordMetrics({ stores: typedStores });
    const projector = new RecordProjector({ recordMetrics, stores: typedStores });

    const indexData = await projector.computeProjection();
    indexData.activityHistory = indexData.activityHistory.filter(
      (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
    );
    indexData.metadata.generationTime = 1;

    const sink = new PrismaRecordProjection({
      client: prisma as unknown as ProjectionClient,
      repoId,
      projectionType: 'index',
    });
    await sink.persist(indexData, {});

    // 4. Verify DB
    const where = { repoId, projectionType: 'index' };
    const dbTasks = await prisma.gitgovTask.findMany({ where });
    expect(dbTasks.length).toBeGreaterThanOrEqual(1);
    const dbTask = dbTasks.find(t => t.title === 'Cross-path task');
    expect(dbTask).toBeDefined();
    expect(typeof dbTask!.healthScore).toBe('number');

    const dbActors = await prisma.gitgovActor.findMany({ where });
    expect(dbActors.length).toBeGreaterThanOrEqual(1);
  });

  it('[EARS-CD2] should deliver GitHub-written record to CLI via sync pull', async () => {
    // 1. API: Write a feedback record directly to GitHub via GitHubRecordStore
    const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
    const feedbacksStore = new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, octokit);

    const ts10 = String(Math.floor(Date.now() / 1000));
    const feedbackId = `${ts10}-feedback-api-written`;
    const feedbackRecord: GitGovFeedbackRecord = {
      header: {
        version: '1.0',
        type: 'feedback',
        payloadChecksum: 'a'.repeat(64),
        signatures: [{
          keyId: 'human:api-actor',
          role: 'author',
          notes: 'Written via API',
          signature: 'A'.repeat(86) + '==',
          timestamp: Date.now(),
        }],
      },
      payload: {
        id: feedbackId,
        type: 'suggestion',
        entityType: 'task',
        entityId: cd1TaskId,
        content: 'Feedback written via GitHub API',
        status: 'open',
      },
    };

    await feedbacksStore.put(feedbackId, feedbackRecord);

    // 2. CLI: sync pull to get the API-written record
    runCliCommand(['sync', 'pull'], { cwd: userARepo });

    // 3. Verify: feedback file exists locally
    const fbFiles = listRecordFiles(userARepo, 'feedbacks');
    expect(fbFiles.length).toBeGreaterThanOrEqual(1);

    // Find the API-written feedback
    let found = false;
    for (const fbFile of fbFiles) {
      const fb = readRecordFile(userARepo, 'feedbacks', fbFile);
      if (fb.payload.id === feedbackId) {
        expect(fb.payload.content).toBe('Feedback written via GitHub API');
        expect(fb.header.signatures.length).toBeGreaterThanOrEqual(1);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('[EARS-CD3] should produce unified projection from CLI and GitHub records', async () => {
    // At this point, gitgov-state has:
    // - Records pushed by CLI in CD1 (task, actor, cycle, config)
    // - Feedback written by API in CD2
    // Both should appear in a single unified projection

    const cd3RepoId = `e2e-crosspath-cd3-${Date.now()}`;
    try {
      const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
      const stores = {
        tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, octokit),
        actors: new GitHubRecordStore<GitGovActorRecord>({ ...storeOpts, basePath: '.gitgov/actors' }, octokit),
        cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...storeOpts, basePath: '.gitgov/cycles' }, octokit),
        feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, octokit),
        executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...storeOpts, basePath: '.gitgov/executions' }, octokit),
      };

      const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
      const recordMetrics = new RecordMetrics({ stores: typedStores });
      const projector = new RecordProjector({ recordMetrics, stores: typedStores });

      const indexData = await projector.computeProjection();
      indexData.activityHistory = indexData.activityHistory.filter(
        (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      indexData.metadata.generationTime = 1;

      // Persist to DB
      const sink = new PrismaRecordProjection({
        client: prisma as unknown as ProjectionClient,
        repoId: cd3RepoId,
        projectionType: 'index',
      });
      await sink.persist(indexData, {});

      // Verify: both CLI-created task AND API-created feedback are in projection
      const where = { repoId: cd3RepoId, projectionType: 'index' };
      const dbTasks = await prisma.gitgovTask.findMany({ where });
      expect(dbTasks.length).toBeGreaterThanOrEqual(1);

      const dbFeedbacks = await prisma.gitgovFeedback.findMany({ where });
      expect(dbFeedbacks.length).toBeGreaterThanOrEqual(1);

      // Verify meta has counts for both
      const meta = await prisma.gitgovMeta.findFirst({ where });
      expect(meta).not.toBeNull();
      const counts = meta!.recordCountsJson as Record<string, number>;
      expect(counts['tasks']).toBeGreaterThanOrEqual(1);
      expect(counts['feedback']).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupDb(prisma, cd3RepoId);
    }
  });

  it('[EARS-CD4] should project multi-actor multi-path collaboration correctly', async () => {
    // Verifies 3 actors from different paths produce a coherent projection:
    // 1. CLI User A (from CD1): task via CLI sync push
    // 2. CLI User B: task via CLI sync push (different identity)
    // 3. API Actor: feedback via GitHubRecordStore.put() (simulates saas-api)

    const cd4RepoId = `e2e-crosspath-cd4-${Date.now()}`;
    const userBRepo = path.join(tempDir, 'user-b');

    try {
      // User B: fresh repo with own identity, then sync with shared remote
      createGitRepo(userBRepo);
      execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: userBRepo, stdio: 'pipe' });

      // Init as User B (creates own actor identity + keypair)
      runCliCommand(['init', '--name', 'CD4 UserB Project', '--actor-name', 'User B Dev', '--quiet'], { cwd: userBRepo });

      // Commit init-generated files (.gitignore, .gitgov/) to avoid conflicts with gitgov-state checkout
      execSync('git add -A && git commit -m "gitgov init"', { cwd: userBRepo, stdio: 'pipe' });

      // Pull existing gitgov state (merges User A's records)
      runCliCommand(['sync', 'pull'], { cwd: userBRepo });

      // User B creates a task
      runCliCommand(['task', 'new', 'User B task', '-d', 'Task from second user', '-p', 'medium', '-q'], { cwd: userBRepo });
      runCliCommand(['sync', 'push'], { cwd: userBRepo });

      // Wait for GitHub to propagate after push (eventual consistency)
      await new Promise(r => setTimeout(r, 3000));

      // Fresh Octokit to avoid stale connection state
      const cd4Octokit = new Octokit({ auth: GITHUB_TOKEN });
      const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };

      // API actor writes feedback directly to gitgov-state (simulates saas-api WriterService)
      const cd4FeedbackStore = new GitHubRecordStore<GitGovFeedbackRecord>(
        { ...storeOpts, basePath: '.gitgov/feedbacks' }, cd4Octokit,
      );
      const apiTs = String(Math.floor(Date.now() / 1000));
      const apiFeedbackId = `${apiTs}-feedback-cd4-api`;
      const apiFeedback: GitGovFeedbackRecord = {
        header: {
          version: '1.0' as const,
          type: 'feedback' as const,
          payloadChecksum: 'a'.repeat(64),
          signatures: [{
            keyId: 'human:api-actor',
            role: 'author',
            notes: 'API actor write',
            signature: 'A'.repeat(86) + '==',
            timestamp: Date.now(),
          }],
        },
        payload: {
          id: apiFeedbackId,
          type: 'suggestion' as const,
          entityType: 'task' as const,
          entityId: cd1TaskId,
          content: 'API actor feedback via GitHubRecordStore',
          status: 'open' as const,
        },
      };
      await cd4FeedbackStore.put(apiFeedbackId, apiFeedback);
      await new Promise(r => setTimeout(r, 2000));

      const stores = {
        tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, cd4Octokit),
        actors: new GitHubRecordStore<GitGovActorRecord>({ ...storeOpts, basePath: '.gitgov/actors' }, cd4Octokit),
        cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...storeOpts, basePath: '.gitgov/cycles' }, cd4Octokit),
        feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, cd4Octokit),
        executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...storeOpts, basePath: '.gitgov/executions' }, cd4Octokit),
      };

      const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
      const recordMetrics = new RecordMetrics({ stores: typedStores });
      const projector = new RecordProjector({ recordMetrics, stores: typedStores });

      const indexData = await projector.computeProjection();
      indexData.activityHistory = indexData.activityHistory.filter(
        (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      indexData.metadata.generationTime = 1;

      const sink = new PrismaRecordProjection({
        client: prisma as unknown as ProjectionClient,
        repoId: cd4RepoId,
        projectionType: 'index',
      });
      await sink.persist(indexData, {});

      const where = { repoId: cd4RepoId, projectionType: 'index' };

      // Verify multiple tasks from different users
      const dbTasks = await prisma.gitgovTask.findMany({ where });
      expect(dbTasks.length).toBeGreaterThanOrEqual(2);
      const titles = dbTasks.map(t => t.title);
      expect(titles).toContain('Cross-path task');
      expect(titles).toContain('User B task');

      // Verify actors — should have actors from both CLI sessions
      const dbActors = await prisma.gitgovActor.findMany({ where });
      expect(dbActors.length).toBeGreaterThanOrEqual(1);

      // Verify API actor's feedback made it into the unified projection
      const dbFeedbacks = await prisma.gitgovFeedback.findMany({ where });
      expect(dbFeedbacks.length).toBeGreaterThanOrEqual(1);
      const apiFb = dbFeedbacks.find(fb => fb.recordId === apiFeedbackId);
      expect(apiFb).toBeDefined();
      expect(apiFb!.feedbackType).toBe('suggestion');
    } finally {
      await cleanupDb(prisma, cd4RepoId);
    }
  });

  it('[EARS-CD5] should sync records between two CLI users via shared GitHub remote', () => {
    // This test verifies the basic CLI push/pull round-trip via real GitHub
    // (migrated from old CF1-CF3)

    // At this point, user A already pushed in CD1. Let's verify a fresh clone can pull.
    const clonePath = path.join(tempDir, 'cd5-clone');

    execSync(`git clone "${GITHUB_REMOTE_URL}" "${clonePath}" --branch ${branchName}`, { stdio: 'pipe' });
    execSync('git config user.name "CD5 Clone User"', { cwd: clonePath, stdio: 'pipe' });
    execSync('git config user.email "cd5@test.local"', { cwd: clonePath, stdio: 'pipe' });

    const result = runCliCommand(['sync', 'pull'], { cwd: clonePath });
    expect(result.success).toBe(true);

    // Verify .gitgov/ arrived from gitgov-state branch
    expect(fs.existsSync(path.join(clonePath, '.gitgov'))).toBe(true);
    expect(fs.existsSync(path.join(clonePath, '.gitgov', 'config.json'))).toBe(true);

    // Verify records synced — tasks, actors should be present
    const syncedDirs = ['tasks', 'actors', 'cycles'];
    for (const dir of syncedDirs) {
      const files = listRecordFiles(clonePath, dir);
      expect(files.length).toBeGreaterThanOrEqual(1);
    }

    // Verify task content survived round-trip
    const origTasks = listRecordFiles(userARepo, 'tasks');
    const cloneTasks = listRecordFiles(clonePath, 'tasks');
    expect(cloneTasks.length).toBeGreaterThanOrEqual(origTasks.length);

    if (origTasks.length > 0 && cloneTasks.length > 0) {
      // Find matching task by filename
      for (const taskFile of origTasks) {
        if (cloneTasks.includes(taskFile)) {
          const origTask = readRecordFile(userARepo, 'tasks', taskFile);
          const cloneTask = readRecordFile(clonePath, 'tasks', taskFile);
          expect(cloneTask.payload.title).toBe(origTask.payload.title);
          expect(cloneTask.payload.id).toBe(origTask.payload.id);
          expect(cloneTask.header.payloadChecksum).toBe(origTask.header.payloadChecksum);
        }
      }
    }
  });
});
