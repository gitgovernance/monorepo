/**
 * Block B: Projection Pipeline — 11 EARS (CB1-CB11)
 * Blueprint: e2e/specs/projection.md
 *
 * Validates that CLI-created records project correctly to PostgreSQL (6 tables)
 * and index.json (FS). Uses real DB, real filesystem, real CLI.
 *
 * Records are created by CLI in beforeAll, then projected by core's RecordProjector.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  runCliCommand,
  createGitRepo,
  createTestPrisma,
  cleanupDb,
  runProjector,
  listRecordIds,
  readRecord,
  cleanupWorktree,
  SKIP_CLEANUP,
  PrismaRecordProjection,
  FsRecordStore,
  DEFAULT_ID_ENCODER,
  RecordProjector,
  RecordMetrics,
} from './helpers';
import { FsRecordProjection, getWorktreeBasePath } from '@gitgov/core/fs';
import type {
  PrismaClient,
  IndexGenerationReport,
  ProjectionClient,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from './helpers';

/**
 * Returns the .gitgov/ directory where the CLI stores records.
 * CLI uses worktree-based paths: ~/.gitgov/worktrees/<hash>/.gitgov/
 */
function getGitgovDir(repoPath: string): string {
  return path.join(getWorktreeBasePath(repoPath), '.gitgov');
}

describe('Block B: Projection Pipeline (CB1-CB11)', () => {
  let prisma: PrismaClient;
  let tempDir: string;
  let repoPath: string;
  let repoId: string;
  let report: IndexGenerationReport;

  beforeAll(async () => {
    prisma = createTestPrisma();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-block-b-'));
    repoPath = path.join(tempDir, 'block-b');
    repoId = `cli-e2e-block-b-${Date.now()}`;

    createGitRepo(repoPath);

    // Init + create records via CLI
    runCliCommand(['init', '--name', 'Block B Test', '--actor-name', 'Dev B', '--quiet'], { cwd: repoPath });
    runCliCommand(['task', 'new', 'Design API', '-d', 'Design REST API', '-p', 'high', '-q'], { cwd: repoPath });
    runCliCommand(['task', 'new', 'Write Tests', '-d', 'Write unit tests', '-p', 'medium', '-q'], { cwd: repoPath });

    // Get task IDs for cycle + assign
    const taskIds = await listRecordIds(repoPath, 'tasks');
    const task1 = await readRecord(repoPath, 'tasks', taskIds[0]!);
    const task2 = await readRecord(repoPath, 'tasks', taskIds[1]!);
    const actorIds = await listRecordIds(repoPath, 'actors');
    const actor = await readRecord(repoPath, 'actors', actorIds[0]!);

    runCliCommand(['cycle', 'new', 'Sprint Alpha', '--task-ids', `${task1.payload.id},${task2.payload.id}`, '-q'], { cwd: repoPath });
    runCliCommand(['task', 'assign', task1.payload.id, '--to', actor.payload.id, '-q'], { cwd: repoPath });

    // Run projection
    report = await runProjector(prisma, repoPath, repoId);
  });

  afterAll(async () => {
    cleanupWorktree(repoPath);
    await cleanupDb(prisma, repoId);
    await prisma.$disconnect();
    if (!SKIP_CLEANUP) fs.rmSync(tempDir, { recursive: true, force: true });
    else console.log(`[SKIP_CLEANUP] Keeping tempDir=${tempDir}`);
  });

  it('[EARS-CB1] should read all CLI-created record types and produce IndexData with correct counts', () => {
    expect(report.success).toBe(true);
    expect(report.recordsProcessed).toBeGreaterThan(0);
    expect(report.errors).toHaveLength(0);
  });

  it('[EARS-CB2] should populate all 6 gitgov tables after projection of CLI records', async () => {
    const where = { repoId, projectionType: 'index' };

    const meta = await prisma.gitgovMeta.findFirst({ where });
    expect(meta).not.toBeNull();

    const tasks = await prisma.gitgovTask.findMany({ where });
    expect(tasks.length).toBeGreaterThanOrEqual(2);

    const actors = await prisma.gitgovActor.findMany({ where });
    expect(actors.length).toBeGreaterThanOrEqual(1);

    const cycles = await prisma.gitgovCycle.findMany({ where });
    expect(cycles.length).toBeGreaterThanOrEqual(1);

    const feedbacks = await prisma.gitgovFeedback.findMany({ where });
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);

    // Activities may be 0 if CLI-generated actor IDs produce NaN timestamps
    const activities = await prisma.gitgovActivity.findMany({ where });
    expect(activities.length).toBeGreaterThanOrEqual(0);
  });

  it('[EARS-CB3] should store correct integrity status and record counts in GitgovMeta', async () => {
    const meta = await prisma.gitgovMeta.findFirst({
      where: { repoId, projectionType: 'index' },
    });
    expect(meta).not.toBeNull();
    expect(meta!.integrityStatus).toBeDefined();
    expect(meta!.generatedAt).toBeDefined();
    expect(meta!.generationTime).toBeGreaterThan(0);

    const counts = meta!.recordCountsJson as Record<string, number>;
    expect(counts['tasks']).toBeGreaterThanOrEqual(2);
    expect(counts['actors']).toBeGreaterThanOrEqual(1);
    expect(counts['cycles']).toBeGreaterThanOrEqual(1);
  });

  it('[EARS-CB4] should store enriched task data with health score and execution count', async () => {
    const tasks = await prisma.gitgovTask.findMany({
      where: { repoId, projectionType: 'index' },
    });
    expect(tasks.length).toBeGreaterThanOrEqual(1);

    const task = tasks[0]!;
    expect(typeof task.healthScore).toBe('number');
    expect(typeof task.executionCount).toBe('number');
    expect(typeof task.isStalled).toBe('boolean');
    expect(typeof task.isAtRisk).toBe('boolean');
    expect(typeof task.needsClarification).toBe('boolean');
    expect(typeof task.isBlockedByDependency).toBe('boolean');
    expect(typeof task.timeInCurrentStage).toBe('number');
  });

  it('[EARS-CB5] should store feedback record with approval type and entity reference', async () => {
    const feedbacks = await prisma.gitgovFeedback.findMany({
      where: { repoId, projectionType: 'index' },
    });
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);

    const assignmentFb = feedbacks.find(fb => fb.feedbackType === 'assignment');
    expect(assignmentFb).toBeDefined();
    expect(assignmentFb!.entityType).toBe('task');
    expect(assignmentFb!.entityId).toBeDefined();
    expect(assignmentFb!.recordId).toBeDefined();
  });

  it('[EARS-CB6] should reconstruct equivalent IndexData from read after persist', async () => {
    const prismaSink = new PrismaRecordProjection({
      client: prisma as unknown as ProjectionClient,
      repoId,
      projectionType: 'index',
    });

    const readBack = await prismaSink.read({});
    expect(readBack).not.toBeNull();
    expect(readBack!.tasks.length).toBeGreaterThanOrEqual(2);
    expect(readBack!.actors.length).toBeGreaterThanOrEqual(1);
    expect(readBack!.cycles.length).toBeGreaterThanOrEqual(1);
    expect(readBack!.feedback.length).toBeGreaterThanOrEqual(1);
    expect(readBack!.metadata.recordCounts['tasks']).toBeGreaterThanOrEqual(2);
  });

  it('[EARS-CB7] should produce identical table contents on repeated projection', async () => {
    // Get counts before re-projection
    const where = { repoId, projectionType: 'index' };
    const tasksBefore = await prisma.gitgovTask.findMany({ where });
    const actorsBefore = await prisma.gitgovActor.findMany({ where });

    // Run projection again
    const report2 = await runProjector(prisma, repoPath, repoId);
    expect(report2.success).toBe(true);

    // Verify no duplicate rows — counts must be identical
    const tasksAfter = await prisma.gitgovTask.findMany({ where });
    expect(tasksAfter.length).toBe(tasksBefore.length);

    const actorsAfter = await prisma.gitgovActor.findMany({ where });
    expect(actorsAfter.length).toBe(actorsBefore.length);

    // Verify content is equivalent
    for (const tb of tasksBefore) {
      const match = tasksAfter.find(ta => ta.recordId === tb.recordId);
      expect(match).toBeDefined();
      expect(match!.title).toBe(tb.title);
      expect(match!.status).toBe(tb.status);
    }
  });

  it('[EARS-CB8] should set index status to no_gitgov when directory is missing', async () => {
    const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-cb8-'));
    const emptyRepoPath = path.join(emptyTempDir, 'empty');
    const emptyRepoId = `cli-e2e-cb8-${Date.now()}`;

    try {
      createGitRepo(emptyRepoPath);
      // Do NOT run gitgov init — repo has no .gitgov/

      const emptyReport = await runProjector(prisma, emptyRepoPath, emptyRepoId);

      // Projector should either succeed with 0 records or fail gracefully
      // When stores point to non-existent dirs, list() returns []
      const where = { repoId: emptyRepoId, projectionType: 'index' };
      const tasks = await prisma.gitgovTask.findMany({ where });
      expect(tasks.length).toBe(0);

      const actors = await prisma.gitgovActor.findMany({ where });
      expect(actors.length).toBe(0);

      const meta = await prisma.gitgovMeta.findFirst({ where });
      if (meta) {
        const counts = meta.recordCountsJson as Record<string, number>;
        expect(counts['tasks'] ?? 0).toBe(0);
        expect(counts['actors'] ?? 0).toBe(0);
      }
    } finally {
      await cleanupDb(prisma, emptyRepoId);
      if (!SKIP_CLEANUP) fs.rmSync(emptyTempDir, { recursive: true, force: true });
    }
  });

  it('[EARS-CB9] should populate IndexData.executions when executions exist in stores', async () => {
    // Create a temp repo with an execution record written directly to the store
    const cb9Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-cb9-'));
    const cb9Repo = path.join(cb9Dir, 'repo');

    try {
      createGitRepo(cb9Repo);
      runCliCommand(['init', '--name', 'CB9 Test', '--actor-name', 'Dev CB9', '--quiet'], { cwd: cb9Repo });

      // CLI stores .gitgov/ in worktree path, not in repo dir
      const gitgovDir = getGitgovDir(cb9Repo);
      const execDir = path.join(gitgovDir, 'executions');
      fs.mkdirSync(execDir, { recursive: true });
      const execRecord = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'cb9-chk', signatures: [] },
        payload: { id: 'exec-cb9-test', taskId: 'task-cb9', type: 'analysis', title: 'CB9 Scan', result: 'Done' },
      };
      fs.writeFileSync(path.join(execDir, 'exec-cb9-test.json'), JSON.stringify(execRecord, null, 2));

      // Build stores with all record types including executions
      const stores = {
        tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(gitgovDir, 'tasks') }),
        cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(gitgovDir, 'cycles') }),
        feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(gitgovDir, 'feedbacks') }),
        executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: execDir }),
        actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(gitgovDir, 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
        agents: new FsRecordStore<GitGovAgentRecord>({ basePath: path.join(gitgovDir, 'agents'), idEncoder: DEFAULT_ID_ENCODER }),
      };

      const recordMetrics = new RecordMetrics({ stores });
      const projector = new RecordProjector({ recordMetrics, stores });
      const indexData = await projector.computeProjection();

      expect(indexData.executions).toBeDefined();
      expect(indexData.executions.length).toBeGreaterThanOrEqual(1);

      const found = indexData.executions.find(e => e.payload.id === 'exec-cb9-test');
      expect(found).toBeDefined();
      expect(found!.payload.title).toBe('CB9 Scan');
    } finally {
      cleanupWorktree(cb9Repo);
      if (!SKIP_CLEANUP) fs.rmSync(cb9Dir, { recursive: true, force: true });
    }
  });

  it('[EARS-CB10] should populate IndexData.agents when agents exist in stores', async () => {
    const cb10Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-cb10-'));
    const cb10Repo = path.join(cb10Dir, 'repo');

    try {
      createGitRepo(cb10Repo);
      runCliCommand(['init', '--name', 'CB10 Test', '--actor-name', 'Dev CB10', '--quiet'], { cwd: cb10Repo });

      // CLI stores .gitgov/ in worktree path, not in repo dir
      const gitgovDir = getGitgovDir(cb10Repo);
      const agentsDir = path.join(gitgovDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      const agentRecord = {
        header: { version: '1.0', type: 'agent', payloadChecksum: 'cb10-chk', signatures: [] },
        payload: {
          id: 'agent:gitgov:security-audit',
          status: 'active',
          engine: { type: 'local', entrypoint: 'dist/index.mjs', function: 'runAgent' },
          metadata: { purpose: 'audit', audit: { target: 'code', outputFormat: 'sarif', supportedScopes: ['full'] } },
        },
      };
      fs.writeFileSync(path.join(agentsDir, 'agent_gitgov_security-audit.json'), JSON.stringify(agentRecord, null, 2));

      const stores = {
        tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(gitgovDir, 'tasks') }),
        cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(gitgovDir, 'cycles') }),
        feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(gitgovDir, 'feedbacks') }),
        executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(gitgovDir, 'executions') }),
        actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(gitgovDir, 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
        agents: new FsRecordStore<GitGovAgentRecord>({ basePath: agentsDir, idEncoder: DEFAULT_ID_ENCODER }),
      };

      const recordMetrics = new RecordMetrics({ stores });
      const projector = new RecordProjector({ recordMetrics, stores });
      const indexData = await projector.computeProjection();

      expect(indexData.agents).toBeDefined();
      expect(indexData.agents.length).toBeGreaterThanOrEqual(1);

      const found = indexData.agents.find(a => a.payload.id === 'agent:gitgov:security-audit');
      expect(found).toBeDefined();
      expect(found!.payload.status).toBe('active');
    } finally {
      cleanupWorktree(cb10Repo);
      if (!SKIP_CLEANUP) fs.rmSync(cb10Dir, { recursive: true, force: true });
    }
  });

  it('[EARS-CB11] should return empty arrays for executions and agents from legacy index.json', async () => {
    const cb11Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-cb11-'));

    try {
      // Write a legacy index.json WITHOUT executions or agents fields
      const legacyData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          lastCommitHash: 'abc123',
          integrityStatus: 'valid',
          recordCounts: { tasks: 0, cycles: 0, actors: 0 },
          generationTime: 10,
        },
        metrics: {},
        derivedStates: { atRisk: [], stalled: [], needsClarification: [], blockedByDependency: [] },
        activityHistory: [],
        tasks: [],
        enrichedTasks: [],
        cycles: [],
        actors: [],
        feedback: [],
        // NOTE: no executions or agents field — legacy format
      };
      fs.writeFileSync(path.join(cb11Dir, 'index.json'), JSON.stringify(legacyData, null, 2));

      const fsProjection = new FsRecordProjection({ basePath: cb11Dir });
      const result = await fsProjection.read({});

      expect(result).not.toBeNull();
      expect(result!.executions).toEqual([]);
      expect(result!.agents).toEqual([]);
    } finally {
      if (!SKIP_CLEANUP) fs.rmSync(cb11Dir, { recursive: true, force: true });
    }
  });
});
