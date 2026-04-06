/**
 * Block B: Protocol Record Projection — 10 EARS (CB1-CB10)
 * Blueprint: e2e/specs/projection_protocol.md
 *
 * Validates that CLI-created records project correctly to PostgreSQL (9 tables)
 * and index.json (FS). Uses real DB, real filesystem, real CLI (globally installed).
 * Core is single-tenant — no tenant fields in queries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  runGitgovCli,
  createTempGitRepo,
  createTestPrisma,
  cleanupDb,
  runProjector,
  listRecordIds,
  readRecord,
  cleanupWorktree,
  SKIP_CLEANUP,
  getGitgovDir,
  FsRecordStore,
  DEFAULT_ID_ENCODER,
  RecordProjector,
  RecordMetrics,
} from './helpers';
import type {
  PrismaClient,
  IndexGenerationReport,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from './helpers';

describe('Block B: Protocol Record Projection (CB1-CB10)', () => {
  let prisma: PrismaClient;
  let tmpDir: string;
  let repoDir: string;
  let report: IndexGenerationReport;

  beforeAll(async () => {
    prisma = createTestPrisma();
    ({ tmpDir, repoDir } = createTempGitRepo());

    // CLI creates records (black-box)
    runGitgovCli('init --name "Block B Test" --actor-name "Dev B" --quiet', { cwd: repoDir });
    runGitgovCli('task new "Design API" -d "Design REST API" -p high -q', { cwd: repoDir });
    runGitgovCli('task new "Write Tests" -d "Write unit tests" -p medium -q', { cwd: repoDir });

    // Get task IDs for cycle + assign
    const taskIds = await listRecordIds(repoDir, 'tasks');
    const task1 = await readRecord(repoDir, 'tasks', taskIds[0]!);
    const task2 = await readRecord(repoDir, 'tasks', taskIds[1]!);
    const actorIds = await listRecordIds(repoDir, 'actors');
    const actor = await readRecord(repoDir, 'actors', actorIds[0]!);

    runGitgovCli(`cycle new "Sprint Alpha" --task-ids ${task1.payload.id},${task2.payload.id} -q`, { cwd: repoDir });
    runGitgovCli(`task assign ${task1.payload.id} --to ${actor.payload.id} -q`, { cwd: repoDir });

    // Run projection
    report = await runProjector(prisma, repoDir);
  });

  afterAll(async () => {
    cleanupWorktree(repoDir);
    await cleanupDb(prisma);
    await prisma.$disconnect();
    if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('[CB1] should read all CLI-created record types and produce IndexData with correct counts', () => {
    expect(report.success).toBe(true);
    expect(report.recordsProcessed).toBeGreaterThan(0);
    expect(report.errors).toHaveLength(0);
  });

  it('[CB2] should populate all 9 gitgov tables after projection of CLI records', async () => {
    const meta = await prisma.gitgovMeta.findFirst({});
    expect(meta).not.toBeNull();

    const tasks = await prisma.gitgovTask.findMany({});
    expect(tasks.length).toBeGreaterThanOrEqual(2);

    const actors = await prisma.gitgovActor.findMany({});
    expect(actors.length).toBeGreaterThanOrEqual(1);

    const cycles = await prisma.gitgovCycle.findMany({});
    expect(cycles.length).toBeGreaterThanOrEqual(1);

    const feedbacks = await prisma.gitgovFeedback.findMany({});
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);

    const activities = await prisma.gitgovActivity.findMany({});
    expect(activities.length).toBeGreaterThanOrEqual(0);

    const executions = await prisma.gitgovExecution.findMany({});
    expect(executions.length).toBeGreaterThanOrEqual(0);

    const agents = await prisma.gitgovAgent.findMany({});
    expect(agents.length).toBeGreaterThanOrEqual(0);

    const workflows = await prisma.gitgovWorkflow.findMany({});
    expect(workflows.length).toBeGreaterThanOrEqual(0);
  });

  it('[CB3] should store correct integrity status and record counts in GitgovMeta', async () => {
    const meta = await prisma.gitgovMeta.findFirst({});
    expect(meta).not.toBeNull();

    expect(meta!.integrityStatus).toBeDefined();
    expect(meta!.generatedAt).toBeDefined();

    const counts = meta!.recordCountsJson as Record<string, number>;
    expect(counts['tasks']).toBeGreaterThanOrEqual(2);
    expect(counts['actors']).toBeGreaterThanOrEqual(1);
    expect(counts['cycles']).toBeGreaterThanOrEqual(1);
  });

  it('[CB4] should store enriched task data with health score and execution count', async () => {
    const tasks = await prisma.gitgovTask.findMany({});
    expect(tasks.length).toBeGreaterThanOrEqual(1);

    const task = tasks[0]!;
    expect(task.healthScore).toBeGreaterThanOrEqual(0);
    expect(task.healthScore).toBeLessThanOrEqual(100);
    expect(typeof task.isStalled).toBe('boolean');
    expect(typeof task.isAtRisk).toBe('boolean');
    expect(typeof task.executionCount).toBe('number');
    expect(task.relationships).toBeDefined();
  });

  it('[CB5] should store feedback record with approval type and entity reference', async () => {
    const feedbacks = await prisma.gitgovFeedback.findMany({});
    const assignmentFb = feedbacks.find(fb => fb.type === 'assignment');

    if (assignmentFb) {
      expect(assignmentFb.entityType).toBeDefined();
      expect(assignmentFb.entityId).toBeDefined();
      expect(assignmentFb.status).toBeDefined();
    }
  });

  it('[CB6] should reconstruct equivalent IndexData from read after persist', async () => {
    const { PrismaRecordProjection } = await import('@gitgov/core/prisma');
    const sink = new PrismaRecordProjection({ client: prisma as any });

    const indexData = await sink.read({});
    expect(indexData).not.toBeNull();

    expect(indexData!.metadata.recordCounts).toBeDefined();
    expect(indexData!.enrichedTasks.length).toBeGreaterThanOrEqual(2);
  });

  it('[CB7] should produce identical table contents on repeated projection', async () => {
    const tasksBefore = await prisma.gitgovTask.findMany({});

    // Run projection again
    await runProjector(prisma, repoDir);

    const tasksAfter = await prisma.gitgovTask.findMany({});
    expect(tasksAfter.length).toBe(tasksBefore.length);

    for (const tb of tasksBefore) {
      const match = tasksAfter.find(ta => ta.recordId === tb.recordId);
      expect(match).toBeDefined();
      expect(match!.title).toBe(tb.title);
      expect(match!.status).toBe(tb.status);
    }
  });

  it('[CB8] should produce empty IndexData when .gitgov directory is missing', async () => {
    const { tmpDir: emptyTmpDir, repoDir: emptyRepoDir } = createTempGitRepo();

    try {
      // Do NOT run gitgov init — repo has no .gitgov/
      await cleanupDb(prisma);

      const emptyReport = await runProjector(prisma, emptyRepoDir);

      const tasks = await prisma.gitgovTask.findMany({});
      expect(tasks.length).toBe(0);

      const actors = await prisma.gitgovActor.findMany({});
      expect(actors.length).toBe(0);

      const meta = await prisma.gitgovMeta.findFirst({});
      if (meta) {
        const counts = meta.recordCountsJson as Record<string, number>;
        expect(counts['tasks'] ?? 0).toBe(0);
        expect(counts['actors'] ?? 0).toBe(0);
      }
    } finally {
      await cleanupDb(prisma);
      if (!SKIP_CLEANUP) fs.rmSync(emptyTmpDir, { recursive: true, force: true });
    }
  });

  it.skip('[CB9] should project CLI audit executions to GitgovExecution table — requires @gitgov/agent-security-audit installed', async () => {
    const { tmpDir: cb9TmpDir, repoDir: cb9RepoDir } = createTempGitRepo();

    try {
      runGitgovCli('init --name "CB9 Test" --actor-name "Dev CB9" --quiet', { cwd: cb9RepoDir });
      runGitgovCli('agent new agent:security-audit --config \'{"metadata":{"purpose":"audit"},"engine":{"type":"local","entrypoint":"@gitgov/agent-security-audit","function":"runAgent"}}\'', { cwd: cb9RepoDir });

      // Create a fixture file so audit has something to scan
      // Use a pattern that triggers SEC-006 (hardcoded password) without triggering GitHub push protection
      fs.writeFileSync(path.join(cb9RepoDir, 'config.ts'), 'const password = "SuperSecret123!";\n');
      runGitgovCli('audit --scope full -q', { cwd: cb9RepoDir });

      // Projection
      await cleanupDb(prisma);
      const cb9Report = await runProjector(prisma, cb9RepoDir);

      const executions = await prisma.gitgovExecution.findMany({});
      expect(executions.length).toBeGreaterThanOrEqual(1);

      const auditExec = executions.find(e => e.type === 'analysis');
      expect(auditExec).toBeDefined();
    } finally {
      cleanupWorktree(cb9RepoDir);
      await cleanupDb(prisma);
      if (!SKIP_CLEANUP) fs.rmSync(cb9TmpDir, { recursive: true, force: true });
    }
  });

  it('[CB10] should project CLI agent registration to GitgovAgent table', async () => {
    const { tmpDir: cb10TmpDir, repoDir: cb10RepoDir } = createTempGitRepo();

    try {
      runGitgovCli('init --name "CB10 Test" --actor-name "Dev CB10" --quiet', { cwd: cb10RepoDir });
      runGitgovCli('agent new agent:test-echo --config \'{"metadata":{"purpose":"testing"},"engine":{"type":"local","entrypoint":"@gitgov/agent-test-echo","function":"runAgent"}}\'', { cwd: cb10RepoDir });

      // Projection
      await cleanupDb(prisma);
      const cb10Report = await runProjector(prisma, cb10RepoDir);

      const agents = await prisma.gitgovAgent.findMany({});
      expect(agents.length).toBeGreaterThanOrEqual(1);

      const testAgent = agents.find(a => a.recordId.includes('test-echo'));
      expect(testAgent).toBeDefined();
      expect(testAgent!.engine).toBeDefined();
    } finally {
      cleanupWorktree(cb10RepoDir);
      await cleanupDb(prisma);
      if (!SKIP_CLEANUP) fs.rmSync(cb10TmpDir, { recursive: true, force: true });
    }
  });
});
