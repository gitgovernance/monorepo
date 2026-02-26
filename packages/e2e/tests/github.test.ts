/**
 * Block C: GitHub Integration — 5 EARS (CC1-CC5)
 * Blueprint: e2e/specs/github.md
 *
 * Validates that GitHubRecordStore works against a real GitHub repository:
 * write, list, read records, and build a projection entirely from GitHub
 * (no local filesystem). This simulates the saas-api path via core.
 *
 * Requires: GITHUB_TOKEN + GITHUB_TEST_OWNER + GITHUB_TEST_REPO_NAME
 * Skipped when GITHUB_TOKEN is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';

import {
  createTestPrisma,
  cleanupDb,
  HAS_GITHUB,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
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

// ===== Test Record Factories =====

const now = Date.now();
const taskId = `${now}-task-github-test`;
const actorId = `human:e2e-github-dev`;
const cycleId = `${now}-cycle-github-sprint`;

function makeTaskRecord(): GitGovTaskRecord {
  return {
    header: {
      version: '1.0' as const,
      type: 'task' as const,
      payloadChecksum: 'e2e-test-checksum-placeholder-0000000000000000000000000000000000',
      signatures: [{
        keyId: actorId,
        role: 'author',
        notes: 'E2E test record',
        signature: 'e2e-test-signature-placeholder',
        timestamp: now,
      }],
    },
    payload: {
      id: taskId,
      title: 'GitHub E2E Task',
      status: 'draft' as const,
      priority: 'high' as const,
      description: 'Task created for GitHub E2E testing',
      tags: ['e2e', 'github'],
    },
  };
}

function makeActorRecord(): GitGovActorRecord {
  return {
    header: {
      version: '1.0' as const,
      type: 'actor' as const,
      payloadChecksum: 'e2e-test-checksum-placeholder-0000000000000000000000000000000000',
      signatures: [{
        keyId: actorId,
        role: 'author',
        notes: 'E2E actor',
        signature: 'e2e-test-signature-placeholder',
        timestamp: now,
      }],
    },
    payload: {
      id: actorId,
      type: 'human' as const,
      displayName: 'E2E GitHub Dev',
      publicKey: 'e2e-placeholder-public-key-base64-xxxxxxxxxxxxxxxxx',
      roles: ['developer'] as [string, ...string[]],
    },
  };
}

function makeCycleRecord(): GitGovCycleRecord {
  return {
    header: {
      version: '1.0' as const,
      type: 'cycle' as const,
      payloadChecksum: 'e2e-test-checksum-placeholder-0000000000000000000000000000000000',
      signatures: [{
        keyId: actorId,
        role: 'author',
        notes: 'E2E cycle',
        signature: 'e2e-test-signature-placeholder',
        timestamp: now,
      }],
    },
    payload: {
      id: cycleId,
      title: 'GitHub E2E Sprint',
      status: 'active' as const,
      taskIds: [taskId],
    },
  };
}

// ===== Tests =====

describe('Block C: GitHub Integration (CC1-CC5)', () => {
  let octokit: Octokit;
  let prisma: PrismaClient;
  let repoId: string;
  let testBranch: string;
  let tasksStore: GitHubRecordStore<GitGovTaskRecord>;
  let actorsStore: GitHubRecordStore<GitGovActorRecord>;
  let cyclesStore: GitHubRecordStore<GitGovCycleRecord>;
  let feedbacksStore: GitHubRecordStore<GitGovFeedbackRecord>;
  let executionsStore: GitHubRecordStore<GitGovExecutionRecord>;

  beforeAll(async () => {
    if (!HAS_GITHUB) {
      throw new Error(
        'Block C requires GitHub credentials. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, '
        + 'GITHUB_TEST_REPO_NAME, and GITHUB_TEST_REPO in packages/e2e/.env',
      );
    }
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    prisma = createTestPrisma();
    repoId = `e2e-github-cc-${Date.now()}`;
    testBranch = `e2e-github-${Date.now()}`;

    // Create test branch based on default branch
    const { data: defaultRef } = await octokit.rest.git.getRef({
      owner: GITHUB_TEST_OWNER,
      repo: GITHUB_TEST_REPO_NAME,
      ref: 'heads/main',
    });

    await octokit.rest.git.createRef({
      owner: GITHUB_TEST_OWNER,
      repo: GITHUB_TEST_REPO_NAME,
      ref: `refs/heads/${testBranch}`,
      sha: defaultRef.object.sha,
    });

    // Create stores pointing to test branch
    const storeOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: testBranch };
    tasksStore = new GitHubRecordStore<GitGovTaskRecord>({ ...storeOpts, basePath: '.gitgov/tasks' }, octokit);
    actorsStore = new GitHubRecordStore<GitGovActorRecord>({ ...storeOpts, basePath: '.gitgov/actors' }, octokit);
    cyclesStore = new GitHubRecordStore<GitGovCycleRecord>({ ...storeOpts, basePath: '.gitgov/cycles' }, octokit);
    feedbacksStore = new GitHubRecordStore<GitGovFeedbackRecord>({ ...storeOpts, basePath: '.gitgov/feedbacks' }, octokit);
    executionsStore = new GitHubRecordStore<GitGovExecutionRecord>({ ...storeOpts, basePath: '.gitgov/executions' }, octokit);
  });

  afterAll(async () => {
    // Cleanup: delete test branch
    try {
      await octokit.rest.git.deleteRef({
        owner: GITHUB_TEST_OWNER,
        repo: GITHUB_TEST_REPO_NAME,
        ref: `heads/${testBranch}`,
      });
    } catch { /* branch may not exist if beforeAll failed */ }

    await cleanupDb(prisma, repoId);
    await prisma.$disconnect();
  });

  it('[EARS-CC1] should write record to GitHub repo and return commit SHA', async () => {
    const taskRecord = makeTaskRecord();
    const result = await tasksStore.put(taskId, taskRecord);
    expect(result).toBeDefined();
    expect(result.commitSha).toBeDefined();
    expect(typeof result.commitSha).toBe('string');
  });

  it('[EARS-CC2] should list all record IDs from GitHub directory', async () => {
    const ids = await tasksStore.list();
    expect(ids).toContain(taskId);
  });

  it('[EARS-CC3] should read record with intact signatures and payload', async () => {
    const record = await tasksStore.get(taskId);
    expect(record).not.toBeNull();

    const original = makeTaskRecord();
    expect(record!.payload.title).toBe(original.payload.title);
    expect(record!.payload.id).toBe(original.payload.id);
    expect(record!.payload.priority).toBe(original.payload.priority);
    expect(record!.payload.status).toBe(original.payload.status);
    expect(record!.header.signatures).toHaveLength(1);
    expect(record!.header.signatures[0].keyId).toBe(actorId);
    expect(record!.header.payloadChecksum).toBe(original.header.payloadChecksum);
  });

  it('[EARS-CC4] should compute IndexData from GitHub-stored records', async () => {
    // Write actor and cycle records too
    await actorsStore.put(actorId, makeActorRecord());
    await cyclesStore.put(cycleId, makeCycleRecord());

    // Create projector with GitHub stores
    const stores = {
      tasks: tasksStore,
      actors: actorsStore,
      cycles: cyclesStore,
      feedbacks: feedbacksStore,
      executions: executionsStore,
    };

    const typedStores = stores as unknown as RecordProjectorDependencies['stores'];
    const recordMetrics = new RecordMetrics({ stores: typedStores });
    const projector = new RecordProjector({ recordMetrics, stores: typedStores });

    const indexData = await projector.computeProjection();

    // Verify IndexData has our records
    expect(indexData.metadata.recordCounts['tasks']).toBeGreaterThanOrEqual(1);
    expect(indexData.metadata.recordCounts['actors']).toBeGreaterThanOrEqual(1);
    expect(indexData.metadata.recordCounts['cycles']).toBeGreaterThanOrEqual(1);

    // Verify task is present with correct data
    const task = indexData.tasks.find(t => t.payload.id === taskId);
    expect(task).toBeDefined();
    expect(task!.payload.title).toBe('GitHub E2E Task');
  });

  it('[EARS-CC5] should persist GitHub-sourced projection with correct enriched data', async () => {
    // Re-compute projection and persist to DB
    const stores = {
      tasks: tasksStore,
      actors: actorsStore,
      cycles: cyclesStore,
      feedbacks: feedbacksStore,
      executions: executionsStore,
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
      repoId,
      projectionType: 'index',
    });
    await sink.persist(indexData, {});

    // Verify DB
    const where = { repoId, projectionType: 'index' };

    const meta = await prisma.gitgovMeta.findFirst({ where });
    expect(meta).not.toBeNull();
    const counts = meta!.recordCountsJson as Record<string, number>;
    expect(counts['tasks']).toBeGreaterThanOrEqual(1);
    expect(counts['actors']).toBeGreaterThanOrEqual(1);

    const tasks = await prisma.gitgovTask.findMany({ where });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const dbTask = tasks.find(t => t.recordId === taskId);
    expect(dbTask).toBeDefined();
    expect(typeof dbTask!.healthScore).toBe('number');
    expect(typeof dbTask!.isStalled).toBe('boolean');
    expect(typeof dbTask!.executionCount).toBe('number');

    const actors = await prisma.gitgovActor.findMany({ where });
    expect(actors.length).toBeGreaterThanOrEqual(1);

    const cycles = await prisma.gitgovCycle.findMany({ where });
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});
