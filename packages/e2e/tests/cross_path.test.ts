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
  runGitgovCli,
  createTempGitRepo,
  createProtocolPrisma,
  cleanupProtocol,
  runProjector,
  listRecordIds,
  readRecord,
  getGitgovDir,
  cleanupWorktree,
  HAS_GITHUB,
  GITHUB_REMOTE_URL,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
  SKIP_CLEANUP,
  PrismaRecordProjection,
  GitHubRecordStore,
  RecordProjector,
  RecordMetrics,
  createGitHubProjectorStores,
} from './helpers';
import type {
  ProtocolClient,
  ProjectionClient,
  GitGovTaskRecord,
  GitGovFeedbackRecord,
} from './helpers';

describe('Block D: Cross-Path Workflows (CD1-CD5)', () => {
  let prisma: ProtocolClient;
  let octokit: Octokit;
  let tmpDir: string;
  let userARepo: string;
  let branchName: string;
  let cd1TaskId: string; // hoisted from CD1 for use in CD2+

  beforeAll(() => {
    if (!HAS_GITHUB) {
      throw new Error(
        'Block D requires GitHub credentials. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, '
        + 'GITHUB_TEST_REPO_NAME, and GITHUB_TEST_REPO in packages/e2e/.env',
      );
    }
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    prisma = createProtocolPrisma();

    ({ tmpDir, repoDir: userARepo } = createTempGitRepo());
    branchName = `e2e-crosspath-${Date.now()}`;

    // Add remote for CLI user A
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

    // Cleanup worktrees for all repos used in tests
    cleanupWorktree(userARepo);
    await cleanupProtocol(prisma);
    await prisma.$disconnect();
    if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
    else console.log(`[SKIP_CLEANUP] Keeping tmpDir=${tmpDir}`);
  });

  it('[EARS-CD1] should project CLI-pushed records read from GitHub into DB', async () => {
    // 1. CLI: init + create task + sync push
    runGitgovCli('init --name "CD1 Project" --actor-name "CLI Dev" --quiet', { cwd: userARepo });
    runGitgovCli('task new "Cross-path task" -d "Testing CLI to GitHub path" -p high -q', { cwd: userARepo });
    runGitgovCli('sync push', { cwd: userARepo });

    // 2. API: Read records from GitHub via GitHubRecordStore
    const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
    const tasksStore = new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, octokit);

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
    const stores = createGitHubProjectorStores(octokit, { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' });
    const recordMetrics = new RecordMetrics({ stores });
    const projector = new RecordProjector({ recordMetrics, stores });

    const indexData = await projector.computeProjection();
    indexData.activityHistory = indexData.activityHistory.filter(
      (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
    );
    indexData.metadata.generationTime = 1;

    const sink = new PrismaRecordProjection({
      client: prisma as unknown as ProjectionClient,
    });
    await sink.persist(indexData, {});

    // 4. Verify DB
    const dbTasks = await prisma.gitgovTask.findMany({});
    expect(dbTasks.length).toBeGreaterThanOrEqual(1);
    const dbTask = dbTasks.find(t => t.title === 'Cross-path task');
    expect(dbTask).toBeDefined();
    expect(typeof dbTask!.healthScore).toBe('number');

    const dbActors = await prisma.gitgovActor.findMany({});
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
    runGitgovCli('sync pull', { cwd: userARepo });

    // 3. Verify: feedback file exists locally
    const fbIds = await listRecordIds(userARepo, 'feedbacks');
    expect(fbIds.length).toBeGreaterThanOrEqual(1);

    // Find the API-written feedback
    let found = false;
    for (const fbId of fbIds) {
      const fb = await readRecord(userARepo, 'feedbacks', fbId);
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

    try {
      const stores = createGitHubProjectorStores(octokit, { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' });
      const recordMetrics = new RecordMetrics({ stores });
      const projector = new RecordProjector({ recordMetrics, stores });

      const indexData = await projector.computeProjection();
      indexData.activityHistory = indexData.activityHistory.filter(
        (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      indexData.metadata.generationTime = 1;

      // Persist to DB
      const sink = new PrismaRecordProjection({
        client: prisma as unknown as ProjectionClient,
      });
      await sink.persist(indexData, {});

      // Verify: both CLI-created task AND API-created feedback are in projection
      const dbTasks = await prisma.gitgovTask.findMany({});
      expect(dbTasks.length).toBeGreaterThanOrEqual(1);

      const dbFeedbacks = await prisma.gitgovFeedback.findMany({});
      expect(dbFeedbacks.length).toBeGreaterThanOrEqual(1);

      // Verify meta has counts for both
      const meta = await prisma.gitgovMeta.findFirst({});
      expect(meta).not.toBeNull();
      const counts = meta!.recordCountsJson as Record<string, number>;
      expect(counts['tasks']).toBeGreaterThanOrEqual(1);
      expect(counts['feedback']).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupProtocol(prisma);
    }
  });

  it('[EARS-CD4] should project multi-actor multi-path collaboration correctly', async () => {
    // Verifies 3 actors from different paths produce a coherent projection:
    // 1. CLI User A (from CD1): task via CLI sync push
    // 2. CLI User B: task via CLI sync push (different identity)
    // 3. API Actor: feedback via GitHubRecordStore.put() (simulates saas-api)

    let userBTmpDir: string;
    let userBRepo: string;

    try {
      // User B: fresh repo, join existing project via sync pull (NOT init — project exists on remote)
      ({ tmpDir: userBTmpDir, repoDir: userBRepo } = createTempGitRepo());
      execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: userBRepo, stdio: 'pipe' });
      execSync('git fetch origin', { cwd: userBRepo, stdio: 'pipe' });

      // Pull existing gitgov state — CLI bootstraps worktree from origin/gitgov-state (WTSYNC-A5)
      runGitgovCli('sync pull', { cwd: userBRepo });

      // Create User B's identity (joins existing project, doesn't re-init)
      runGitgovCli('actor new -t human -n "User B Dev" -r developer', { cwd: userBRepo });

      // User B creates a task
      runGitgovCli('task new "User B task" -d "Task from second user" -p medium -q', { cwd: userBRepo });
      runGitgovCli('sync push', { cwd: userBRepo });

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

      const stores = createGitHubProjectorStores(cd4Octokit, storeOpts);
      const recordMetrics = new RecordMetrics({ stores });
      const projector = new RecordProjector({ recordMetrics, stores });

      const indexData = await projector.computeProjection();
      indexData.activityHistory = indexData.activityHistory.filter(
        (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      indexData.metadata.generationTime = 1;

      const sink = new PrismaRecordProjection({
        client: prisma as unknown as ProjectionClient,
      });
      await sink.persist(indexData, {});

      // Verify multiple tasks from different users
      const dbTasks = await prisma.gitgovTask.findMany({});
      expect(dbTasks.length).toBeGreaterThanOrEqual(2);
      const titles = dbTasks.map(t => t.title);
      expect(titles).toContain('Cross-path task');
      expect(titles).toContain('User B task');

      // Verify actors — should have actors from both CLI sessions
      const dbActors = await prisma.gitgovActor.findMany({});
      expect(dbActors.length).toBeGreaterThanOrEqual(1);

      // Verify API actor's feedback made it into the unified projection
      const dbFeedbacks = await prisma.gitgovFeedback.findMany({});
      expect(dbFeedbacks.length).toBeGreaterThanOrEqual(1);
      const apiFb = dbFeedbacks.find(fb => fb.recordId === apiFeedbackId);
      expect(apiFb).toBeDefined();
      expect(apiFb!.type).toBe('suggestion');
    } finally {
      cleanupWorktree(userBRepo);
      if (userBTmpDir! && !SKIP_CLEANUP) fs.rmSync(userBTmpDir!, { recursive: true, force: true });
      await cleanupProtocol(prisma);
    }
  });

  it('[EARS-CD5] should sync records between two CLI users via shared GitHub remote', async () => {
    // This test verifies the basic CLI push/pull round-trip via real GitHub
    // (migrated from old CF1-CF3)

    // At this point, user A already pushed in CD1. Let's verify a fresh clone can pull.
    const cloneTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-cd5-'));
    const clonePath = path.join(cloneTmpDir, 'cd5-clone');

    execSync(`git clone "${GITHUB_REMOTE_URL}" "${clonePath}" --branch ${branchName}`, { stdio: 'pipe' });
    execSync('git config user.name "CD5 Clone User"', { cwd: clonePath, stdio: 'pipe' });
    execSync('git config user.email "cd5@test.local"', { cwd: clonePath, stdio: 'pipe' });

    const result = runGitgovCli('sync pull', { cwd: clonePath });
    expect(result.success).toBe(true);

    // Verify .gitgov/ arrived in worktree path (CLI stores state in ~/.gitgov/worktrees/<hash>/)
    expect(fs.existsSync(path.join(getGitgovDir(clonePath)))).toBe(true);
    expect(fs.existsSync(path.join(getGitgovDir(clonePath), 'config.json'))).toBe(true);

    // Verify records synced — tasks, actors should be present
    const syncedDirs = ['tasks', 'actors', 'cycles'];
    for (const dir of syncedDirs) {
      const ids = await listRecordIds(clonePath, dir);
      expect(ids.length).toBeGreaterThanOrEqual(1);
    }

    // Verify task content survived round-trip
    const origTaskIds = await listRecordIds(userARepo, 'tasks');
    const cloneTaskIds = await listRecordIds(clonePath, 'tasks');
    expect(cloneTaskIds.length).toBeGreaterThanOrEqual(origTaskIds.length);

    if (origTaskIds.length > 0 && cloneTaskIds.length > 0) {
      // Find matching task by ID
      for (const taskId of origTaskIds) {
        if (cloneTaskIds.includes(taskId)) {
          const origTask = await readRecord(userARepo, 'tasks', taskId);
          const cloneTask = await readRecord(clonePath, 'tasks', taskId);
          expect(cloneTask.payload.title).toBe(origTask.payload.title);
          expect(cloneTask.payload.id).toBe(origTask.payload.id);
          expect(cloneTask.header.payloadChecksum).toBe(origTask.header.payloadChecksum);
        }
      }
    }
  });
});
