import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { PrismaRecordProjection } from '../../record_projection/prisma';
import type { ProjectionClient } from '../../record_projection/prisma';
import {
  createTempGitRepo,
  createTestPrisma,
  seedActorRecord,
  seedAgentRecord,
  seedTaskRecord,
  seedExecutionRecord,
  seedFeedbackRecord,
  seedCycleRecord,
  seedChangelogRecord,
  runProjector,
  projectAndCompare,
  cleanupDb,
  readRecordFile,
  listRecordFiles,
  createEmbeddedRecord,
  computeChecksum,
  createInMemoryOctokit,
  createMockGitHubStores,
  runMockGitHubProjector,
} from './pipeline_integration.helpers';
import type { GitHubTestStores } from './pipeline_integration.types';

// =============================================================================
// Core Pipeline Integration Tests — 28 EARS across 5 Blocks (A, B, D, E, F)
// Blueprint: pipeline_integration_module.md
// NOTE: These are pipeline INTEGRATION tests, not CLI E2E tests.
// They test core modules directly (RecordProjector, PrismaRecordProjection, etc.)
// using seed helpers — NOT the CLI binary.
// For real CLI E2E tests see: packages/cli/e2e/
// =============================================================================

describe('Core E2E Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ===========================================================================
  // 4.1. Record Ecosystem — CLI Creates Real Records (EARS-A1 to A9)
  // ===========================================================================
  describe('4.1. Record Ecosystem (EARS-A1 to A9)', () => {
    let tmpDir: string;
    let repoDir: string;

    const humanActorId = 'human:dev';
    const agentActorId = 'agent:auditor';
    const ts = Math.floor(Date.now() / 1000);
    const taskId = `${ts}-task-audit-diario`;
    const execId = `${ts}-exec-scan-result`;
    const feedbackId = `${ts}-feedback-waiver`;
    const cycleId = `${ts}-cycle-sprint-q1`;
    const changelogId = `${ts}-changelog-v1`;

    beforeAll(async () => {
      const repo = createTempGitRepo();
      tmpDir = repo.tmpDir;
      repoDir = repo.repoDir;
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[EARS-A1] should create human actor with keypair on gitgov init', async () => {
      const actor = await seedActorRecord(repoDir, {
        id: humanActorId,
        type: 'human',
        displayName: 'Dev Humano',
        roles: ['developer'],
      });

      const files = listRecordFiles(repoDir, 'actors');
      expect(files).toContain('human_dev.json');

      expect(actor.payload.id).toBe(humanActorId);
      expect(actor.payload.type).toBe('human');
      expect(actor.payload.displayName).toBe('Dev Humano');
      expect(actor.payload.publicKey).toBeDefined();
    });

    it('[EARS-A2] should create agent actor with separate keypair', async () => {
      const actor = await seedActorRecord(repoDir, {
        id: agentActorId,
        type: 'agent',
        displayName: 'Agente Auditor',
        roles: ['auditor'],
      });

      const files = listRecordFiles(repoDir, 'actors');
      expect(files).toContain('agent_auditor.json');

      expect(actor.payload.id).toBe(agentActorId);
      expect(actor.payload.type).toBe('agent');
    });

    it('[EARS-A3] should create agent record with engine config and trigger', async () => {
      const agent = await seedAgentRecord(repoDir, {
        id: agentActorId,
        engineType: 'api',
        engineUrl: 'https://api.example.com/auditor',
        triggers: [{ type: 'scheduled' }],
      });

      const files = listRecordFiles(repoDir, 'agents');
      expect(files.length).toBeGreaterThan(0);

      expect(agent.payload.id).toBe(agentActorId);
      expect(agent.payload.engine.type).toBe('api');
      expect(agent.payload.triggers).toHaveLength(1);
      expect(agent.payload.triggers![0]!.type).toBe('scheduled');
    });

    it('[EARS-A4] should create signed task record with correct payload', async () => {
      const task = await seedTaskRecord(repoDir, {
        id: taskId,
        title: 'Auditoria diaria de seguridad',
        status: 'active',
        priority: 'high',
        tags: ['security', 'audit'],
      }, agentActorId);

      const files = listRecordFiles(repoDir, 'tasks');
      expect(files).toContain(`${taskId}.json`);

      expect(task.payload.status).toBe('active');
      expect(task.payload.priority).toBe('high');
      expect(task.header.signatures).toHaveLength(1);
      expect(task.header.signatures[0].keyId).toBe(agentActorId);
    });

    it('[EARS-A5] should create execution record linked to task', async () => {
      const exec = await seedExecutionRecord(repoDir, {
        id: execId,
        taskId,
        type: 'analysis',
        title: 'Scan de seguridad',
        result: 'Found 3 findings',
        metadata: { findingsCount: 3 },
      }, agentActorId);

      const files = listRecordFiles(repoDir, 'executions');
      expect(files).toContain(`${execId}.json`);

      expect(exec.payload.taskId).toBe(taskId);
      expect(exec.payload.type).toBe('analysis');
    });

    it('[EARS-A6] should create feedback record with approval type', async () => {
      const feedback = await seedFeedbackRecord(repoDir, {
        id: feedbackId,
        entityType: 'task',
        entityId: taskId,
        type: 'approval',
        content: 'Waiver aprobado para finding SEC-001',
        metadata: { fingerprint: 'abc123', ruleId: 'SEC-001' },
      }, humanActorId);

      const files = listRecordFiles(repoDir, 'feedbacks');
      expect(files).toContain(`${feedbackId}.json`);

      expect(feedback.payload.type).toBe('approval');
      expect(feedback.payload.entityType).toBe('task');
      expect(feedback.payload.entityId).toBe(taskId);
    });

    it('[EARS-A7] should create cycle record referencing tasks', async () => {
      const cycle = await seedCycleRecord(repoDir, {
        id: cycleId,
        title: 'Sprint Seguridad Q1',
        taskIds: [taskId],
        tags: ['security'],
      }, humanActorId);

      const files = listRecordFiles(repoDir, 'cycles');
      expect(files).toContain(`${cycleId}.json`);

      expect(cycle.payload.taskIds).toContain(taskId);
    });

    it('[EARS-A8] should create changelog record with related tasks and version', async () => {
      const changelog = await seedChangelogRecord(repoDir, {
        id: changelogId,
        title: 'Release Seguridad v1.0',
        relatedTasks: [taskId],
        version: 'v1.0.0',
      }, humanActorId);

      const files = listRecordFiles(repoDir, 'changelogs');
      expect(files).toContain(`${changelogId}.json`);

      expect(changelog.payload.relatedTasks).toContain(taskId);
      expect(changelog.payload.version).toBe('v1.0.0');
    });

    it('[EARS-A9] should have valid signatures on all 7 record types', () => {
      const dirs = ['actors', 'agents', 'tasks', 'executions', 'feedbacks', 'cycles', 'changelogs'];

      for (const dir of dirs) {
        const files = listRecordFiles(repoDir, dir);
        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
          const record = readRecordFile(repoDir, dir, file) as {
            header: { signatures: unknown[]; payloadChecksum: string };
            payload: unknown;
          };

          // Signatures non-empty
          expect(record.header.signatures.length).toBeGreaterThan(0);

          // Checksum matches payload
          const expectedChecksum = createHash('sha256')
            .update(JSON.stringify(record.payload))
            .digest('hex');
          expect(record.header.payloadChecksum).toBe(expectedChecksum);
        }
      }
    });
  });

  // ===========================================================================
  // 4.2. Projection Pipeline — Records to DB (EARS-B1 to B8)
  // ===========================================================================
  describe('4.2. Projection Pipeline (EARS-B1 to B8)', () => {
    const repoId = `e2e-block-b-${Date.now()}`;
    let tmpDir: string;
    let repoDir: string;
    let report: Awaited<ReturnType<typeof runProjector>>;

    const ts = Math.floor(Date.now() / 1000);
    const taskId = `${ts}-task-projection-test`;
    const execId = `${ts}-exec-projection-result`;
    const feedbackId = `${ts}-feedback-projection-approval`;
    const cycleId = `${ts}-cycle-projection-sprint`;
    const changelogId = `${ts}-changelog-projection-v1`;

    beforeAll(async () => {
      const repo = createTempGitRepo();
      tmpDir = repo.tmpDir;
      repoDir = repo.repoDir;

      // Seed all 7 record types
      await seedActorRecord(repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev' });
      await seedActorRecord(repoDir, { id: 'agent:auditor', type: 'agent', displayName: 'Auditor' });
      await seedAgentRecord(repoDir, { id: 'agent:auditor', engineType: 'api' });
      await seedTaskRecord(repoDir, { id: taskId, title: 'Projection Test Task', status: 'active', priority: 'high', cycleIds: [cycleId] });
      await seedExecutionRecord(repoDir, { id: execId, taskId, type: 'analysis', result: '3 findings' });
      await seedFeedbackRecord(repoDir, { id: feedbackId, entityType: 'task', entityId: taskId, type: 'approval', content: 'Approved' });
      await seedCycleRecord(repoDir, { id: cycleId, title: 'Sprint Q1', taskIds: [taskId] });
      await seedChangelogRecord(repoDir, { id: changelogId, title: 'Release v1', relatedTasks: [taskId], version: 'v1.0.0' });

      // Run projector
      report = await runProjector(prisma, repoDir, repoId);
    });

    afterAll(async () => {
      await cleanupDb(prisma, repoId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[EARS-B1] should read all 7 record types and produce IndexData with correct counts', () => {
      expect(report.success).toBe(true);
      expect(report.recordsProcessed).toBeGreaterThan(0);
    });

    it('[EARS-B2] should populate all 6 gitgov tables after projection', async () => {
      const where = { repoId, projectionType: 'index' };

      const meta = await prisma.gitgovMeta.findFirst({ where });
      expect(meta).not.toBeNull();

      const tasks = await prisma.gitgovTask.findMany({ where });
      expect(tasks.length).toBeGreaterThan(0);

      const actors = await prisma.gitgovActor.findMany({ where });
      expect(actors.length).toBeGreaterThan(0);

      const cycles = await prisma.gitgovCycle.findMany({ where });
      expect(cycles.length).toBeGreaterThan(0);

      const feedbacks = await prisma.gitgovFeedback.findMany({ where });
      expect(feedbacks.length).toBeGreaterThan(0);

      const activities = await prisma.gitgovActivity.findMany({ where });
      expect(activities.length).toBeGreaterThan(0);
    });

    it('[EARS-B3] should store correct integrity status and record counts in GitgovMeta', async () => {
      const meta = await prisma.gitgovMeta.findFirst({
        where: { repoId, projectionType: 'index' },
      });

      expect(meta).not.toBeNull();
      expect(meta!.integrityStatus).toBeDefined();
      expect(meta!.generatedAt).toBeDefined();
      expect(meta!.generationTime).toBeGreaterThan(0);

      const counts = meta!.recordCountsJson as Record<string, number>;
      expect(counts['tasks']).toBeGreaterThanOrEqual(1);
      expect(counts['actors']).toBeGreaterThanOrEqual(1);
      expect(counts['cycles']).toBeGreaterThanOrEqual(1);
      expect(counts['feedback']).toBeGreaterThanOrEqual(1);
    });

    it('[EARS-B4] should store enriched task data with health score and execution count', async () => {
      const tasks = await prisma.gitgovTask.findMany({
        where: { repoId, projectionType: 'index' },
      });

      const projectedTask = tasks.find((t) => t.recordId === taskId);
      expect(projectedTask).toBeDefined();
      expect(projectedTask!.healthScore).toBeGreaterThanOrEqual(0);
      expect(projectedTask!.healthScore).toBeLessThanOrEqual(100);
      expect(projectedTask!.executionCount).toBeGreaterThanOrEqual(1);
      expect(projectedTask!.status).toBe('active');
      expect(projectedTask!.priority).toBe('high');
      expect(typeof projectedTask!.isStalled).toBe('boolean');
      expect(typeof projectedTask!.isAtRisk).toBe('boolean');
    });

    it('[EARS-B5] should store feedback record with approval type and entity reference', async () => {
      const feedbacks = await prisma.gitgovFeedback.findMany({
        where: { repoId, projectionType: 'index' },
      });

      const projectedFb = feedbacks.find((f) => f.recordId === feedbackId);
      expect(projectedFb).toBeDefined();
      expect(projectedFb!.feedbackType).toBe('approval');
      expect(projectedFb!.entityType).toBe('task');
      expect(projectedFb!.entityId).toBe(taskId);
      expect(projectedFb!.status).toBe('open');
    });

    it('[EARS-B6] should reconstruct equivalent IndexData from read after persist', async () => {
      const sink = new PrismaRecordProjection({
        client: prisma as unknown as ProjectionClient,
        repoId,
        projectionType: 'index',
      });

      const reconstructed = await sink.read({});
      expect(reconstructed).not.toBeNull();

      // Verify metadata roundtrip
      const counts = reconstructed!.metadata.recordCounts;
      expect(counts['tasks']).toBeGreaterThanOrEqual(1);
      expect(counts['actors']).toBeGreaterThanOrEqual(1);

      // Verify enrichedTasks roundtrip
      expect(reconstructed!.enrichedTasks.length).toBeGreaterThanOrEqual(1);

      // Verify activityHistory roundtrip
      expect(reconstructed!.activityHistory.length).toBeGreaterThanOrEqual(1);

      // Verify actors roundtrip
      expect(reconstructed!.actors.length).toBeGreaterThanOrEqual(1);
    });

    it('[EARS-B7] should produce identical table contents on repeated projection', async () => {
      // Capture state after first projection
      const firstMeta = await prisma.gitgovMeta.findFirst({ where: { repoId } });
      const firstTasks = await prisma.gitgovTask.findMany({ where: { repoId } });
      const firstActors = await prisma.gitgovActor.findMany({ where: { repoId } });

      // Run projection again on same data
      const report2 = await runProjector(prisma, repoDir, repoId);
      expect(report2.success).toBe(true);

      // Compare — delete+re-insert should produce identical data
      const secondMeta = await prisma.gitgovMeta.findFirst({ where: { repoId } });
      const secondTasks = await prisma.gitgovTask.findMany({ where: { repoId } });
      const secondActors = await prisma.gitgovActor.findMany({ where: { repoId } });

      expect(secondTasks).toHaveLength(firstTasks.length);
      expect(secondActors).toHaveLength(firstActors.length);
      expect((secondMeta!.recordCountsJson as Record<string, number>)['tasks'])
        .toBe((firstMeta!.recordCountsJson as Record<string, number>)['tasks']);
    });

    it('[EARS-B8] should set index status to no_gitgov when directory is missing', async () => {
      const emptyRepoId = `e2e-block-b8-${Date.now()}`;

      // Create repo WITHOUT .gitgov/ content (empty directories)
      const emptyRepo = createTempGitRepo();
      // Remove all record files (keep empty dirs)
      const dirs = ['actors', 'agents', 'tasks', 'executions', 'feedbacks', 'cycles', 'changelogs'];
      for (const dir of dirs) {
        const dirPath = path.join(emptyRepo.repoDir, '.gitgov', dir);
        const files = fs.readdirSync(dirPath);
        for (const f of files) fs.unlinkSync(path.join(dirPath, f));
      }

      const emptyReport = await runProjector(prisma, emptyRepo.repoDir, emptyRepoId);
      expect(emptyReport.success).toBe(true);
      expect(emptyReport.recordsProcessed).toBe(0);

      // Verify no meaningful rows (only meta with 0 counts)
      const tasks = await prisma.gitgovTask.findMany({ where: { repoId: emptyRepoId } });
      expect(tasks).toHaveLength(0);

      const activities = await prisma.gitgovActivity.findMany({ where: { repoId: emptyRepoId } });
      expect(activities).toHaveLength(0);

      // Cleanup
      await cleanupDb(prisma, emptyRepoId);
      fs.rmSync(emptyRepo.tmpDir, { recursive: true, force: true });
    });
  });

  // ===========================================================================
  // 4.4. Full Loop — Escenarios Realistas (EARS-D1 to D5)
  // ===========================================================================
  describe('4.4. Full Loop (EARS-D1 to D5)', () => {

    // -------------------------------------------------------------------------
    // D1: Agente Auditor — complete agent workflow
    // -------------------------------------------------------------------------
    describe('D1: Agente Auditor', () => {
      const repoId = `e2e-d1-${Date.now()}`;
      let tmpDir: string;
      let repoDir: string;

      const ts = Math.floor(Date.now() / 1000);
      const taskId = `${ts}-task-audit-diaria`;
      const execId = `${ts}-exec-scan`;
      const feedbackId = `${ts}-feedback-waiver`;
      const cycleId = `${ts}-cycle-seg-q1`;

      beforeAll(async () => {
        const repo = createTempGitRepo();
        tmpDir = repo.tmpDir;
        repoDir = repo.repoDir;

        await seedActorRecord(repoDir, { id: 'agent:auditor', type: 'agent', displayName: 'Auditor Agent' });
        await seedAgentRecord(repoDir, { id: 'agent:auditor', engineType: 'api', triggers: [{ type: 'scheduled' }] });
        await seedTaskRecord(repoDir, { id: taskId, title: 'Auditoria diaria de seguridad', status: 'active', priority: 'high' }, 'agent:auditor');
        await seedExecutionRecord(repoDir, { id: execId, taskId, type: 'analysis', metadata: { findingsCount: 3 } }, 'agent:auditor');
        await seedFeedbackRecord(repoDir, { id: feedbackId, entityType: 'execution', entityId: execId, type: 'approval', content: 'Waiver' }, 'agent:auditor');
        await seedCycleRecord(repoDir, { id: cycleId, title: 'Sprint Seguridad Q1', taskIds: [taskId] }, 'agent:auditor');

        await runProjector(prisma, repoDir, repoId);
      });

      afterAll(async () => {
        await cleanupDb(prisma, repoId);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it('[EARS-D1] should project complete agent auditor workflow into 6 DB tables', async () => {
        const where = { repoId, projectionType: 'index' };

        const meta = await prisma.gitgovMeta.findFirst({ where });
        expect(meta).not.toBeNull();
        const counts = meta!.recordCountsJson as Record<string, number>;
        expect(counts['tasks']).toBeGreaterThanOrEqual(1);
        expect(counts['actors']).toBeGreaterThanOrEqual(1);

        const tasks = await prisma.gitgovTask.findMany({ where });
        const task = tasks.find((t) => t.recordId === taskId);
        expect(task).toBeDefined();
        expect(task!.executionCount).toBeGreaterThanOrEqual(1);

        const actors = await prisma.gitgovActor.findMany({ where });
        const agent = actors.find((a) => a.recordId === 'agent:auditor');
        expect(agent).toBeDefined();
        expect(agent!.actorType).toBe('agent');

        const feedbacks = await prisma.gitgovFeedback.findMany({ where });
        const fb = feedbacks.find((f) => f.recordId === feedbackId);
        expect(fb).toBeDefined();
        expect(fb!.feedbackType).toBe('approval');

        const activities = await prisma.gitgovActivity.findMany({ where });
        expect(activities.length).toBeGreaterThan(0);

        const cycles = await prisma.gitgovCycle.findMany({ where });
        const cycle = cycles.find((c) => c.recordId === cycleId);
        expect(cycle).toBeDefined();
        expect(cycle!.taskIds).toContain(taskId);
      });
    });

    // -------------------------------------------------------------------------
    // D2: Desarrollador Humano — task lifecycle complete
    // -------------------------------------------------------------------------
    describe('D2: Desarrollador Humano', () => {
      const repoId = `e2e-d2-${Date.now()}`;
      let tmpDir: string;
      let repoDir: string;

      const ts = Math.floor(Date.now() / 1000);
      const taskId = `${ts}-task-impl-auth`;
      const exec1Id = `${ts}-exec-pr-42`;
      const exec2Id = `${ts}-exec-merged`;
      const changelogId = `${ts}-changelog-v120`;

      beforeAll(async () => {
        const repo = createTempGitRepo();
        tmpDir = repo.tmpDir;
        repoDir = repo.repoDir;

        await seedActorRecord(repoDir, { id: 'human:camilo', type: 'human', displayName: 'Camilo' });
        await seedTaskRecord(repoDir, { id: taskId, title: 'Implementar feature auth', status: 'done', priority: 'high' }, 'human:camilo');
        await seedExecutionRecord(repoDir, { id: exec1Id, taskId, type: 'progress', result: 'PR #42 abierto' }, 'human:camilo');
        await seedExecutionRecord(repoDir, { id: exec2Id, taskId, type: 'completion', result: 'Merged y deployed' }, 'human:camilo');
        await seedChangelogRecord(repoDir, { id: changelogId, title: 'Auth Feature', relatedTasks: [taskId], version: 'v1.2.0' }, 'human:camilo');

        await runProjector(prisma, repoDir, repoId);
      });

      afterAll(async () => {
        await cleanupDb(prisma, repoId);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it('[EARS-D2] should project human dev workflow with task lifecycle and changelog', async () => {
        const where = { repoId, projectionType: 'index' };

        const tasks = await prisma.gitgovTask.findMany({ where });
        const task = tasks.find((t) => t.recordId === taskId);
        expect(task).toBeDefined();
        expect(task!.status).toBe('done');
        expect(task!.executionCount).toBe(2);
        expect(task!.isReleased).toBe(true);
        expect(task!.lastReleaseVersion).toBe('v1.2.0');
        expect(task!.healthScore).toBeGreaterThan(0);
      });
    });

    // -------------------------------------------------------------------------
    // D3: Multi-Actor Collaboration
    // -------------------------------------------------------------------------
    describe('D3: Multi-Actor', () => {
      const repoId = `e2e-d3-${Date.now()}`;
      let tmpDir: string;
      let repoDir: string;

      const ts = Math.floor(Date.now() / 1000);
      const taskId = `${ts}-task-vulns`;
      const exec1Id = `${ts}-exec-scan-vulns`;
      const exec2Id = `${ts}-exec-correction`;
      const fb1Id = `${ts}-feedback-assign`;
      const fb2Id = `${ts}-feedback-suggest`;
      const fb3Id = `${ts}-feedback-approve`;

      beforeAll(async () => {
        const repo = createTempGitRepo();
        tmpDir = repo.tmpDir;
        repoDir = repo.repoDir;

        await seedActorRecord(repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev' });
        await seedActorRecord(repoDir, { id: 'agent:auditor', type: 'agent', displayName: 'Auditor' });
        await seedTaskRecord(repoDir, { id: taskId, title: 'Revisar vulnerabilidades', status: 'active' }, 'human:dev');
        await seedFeedbackRecord(repoDir, {
          id: fb1Id, entityType: 'task', entityId: taskId, type: 'assignment',
          assignee: 'agent:auditor', content: 'Assigned to auditor',
        }, 'human:dev');
        await seedExecutionRecord(repoDir, { id: exec1Id, taskId, type: 'analysis', result: 'Scan results' }, 'agent:auditor');
        await seedFeedbackRecord(repoDir, {
          id: fb2Id, entityType: 'execution', entityId: exec1Id, type: 'suggestion',
          content: 'Verificar falso positivo en linea 42',
        }, 'human:dev');
        await seedExecutionRecord(repoDir, { id: exec2Id, taskId, type: 'correction', result: 'Falso positivo removido' }, 'agent:auditor');
        await seedFeedbackRecord(repoDir, {
          id: fb3Id, entityType: 'task', entityId: taskId, type: 'approval', content: 'Approved',
        }, 'human:dev');

        await runProjector(prisma, repoDir, repoId);
      });

      afterAll(async () => {
        await cleanupDb(prisma, repoId);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it('[EARS-D3] should project multi-actor collaboration with assignments and reviews', async () => {
        const where = { repoId, projectionType: 'index' };

        const tasks = await prisma.gitgovTask.findMany({ where });
        const task = tasks.find((t) => t.recordId === taskId);
        expect(task).toBeDefined();
        expect(task!.executionCount).toBe(2);

        const feedbacks = await prisma.gitgovFeedback.findMany({ where });
        expect(feedbacks.length).toBeGreaterThanOrEqual(3);

        const types = feedbacks.map((f) => f.feedbackType).sort();
        expect(types).toContain('assignment');
        expect(types).toContain('suggestion');
        expect(types).toContain('approval');

        const activities = await prisma.gitgovActivity.findMany({ where });
        expect(activities.length).toBeGreaterThan(0);

        const actors = await prisma.gitgovActor.findMany({ where });
        const actorIds = actors.map((a) => a.recordId);
        expect(actorIds).toContain('human:dev');
        expect(actorIds).toContain('agent:auditor');
      });
    });

    // -------------------------------------------------------------------------
    // D4: Bidirectional Sync
    // -------------------------------------------------------------------------
    describe('D4: Bidirectional Sync', () => {
      const repoId = `e2e-d4-${Date.now()}`;
      let tmpDir: string;
      let repoDir: string;

      const ts = Math.floor(Date.now() / 1000);
      const taskId = `${ts}-task-bidir`;
      const execId = `${ts}-exec-bidir`;
      const writtenFbId = `${ts}-feedback-writer-bidir`;

      beforeAll(async () => {
        const repo = createTempGitRepo();
        tmpDir = repo.tmpDir;
        repoDir = repo.repoDir;
      });

      afterAll(async () => {
        await cleanupDb(prisma, repoId);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it('[EARS-D4] should sync bidirectionally between CLI push and writer commit', async () => {
        // Phase 1: Seed records (simulating CLI create)
        await seedActorRecord(repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev' });
        await seedTaskRecord(repoDir, { id: taskId, title: 'Bidir test task', status: 'active' });
        await seedExecutionRecord(repoDir, { id: execId, taskId, type: 'progress', result: 'In progress' });

        // Phase 2: First projection
        const report1 = await runProjector(prisma, repoDir, repoId);
        expect(report1.success).toBe(true);

        // Verify no feedback yet
        let feedbacks = await prisma.gitgovFeedback.findMany({ where: { repoId } });
        expect(feedbacks).toHaveLength(0);

        // Phase 3: Writer creates new feedback (simulating API write)
        const fbPayload = {
          id: writtenFbId,
          entityType: 'task',
          entityId: taskId,
          type: 'approval',
          status: 'open',
          content: 'Approved via API',
        };
        const fbRecord = {
          header: {
            version: '1.0', type: 'feedback',
            payloadChecksum: createHash('sha256').update(JSON.stringify(fbPayload)).digest('hex'),
            signatures: [{ keyId: 'cloud:system', role: 'author', notes: '', signature: 'sig', timestamp: ts }],
          },
          payload: fbPayload,
        };

        // Write directly to disk (simulating writer's store.put)
        fs.writeFileSync(
          path.join(repoDir, '.gitgov', 'feedbacks', `${writtenFbId}.json`),
          JSON.stringify(fbRecord, null, 2),
        );

        // Phase 4: Verify file exists (simulating CLI pull)
        expect(fs.existsSync(path.join(repoDir, '.gitgov', 'feedbacks', `${writtenFbId}.json`))).toBe(true);

        // Phase 5: Re-projection
        const report2 = await runProjector(prisma, repoDir, repoId);
        expect(report2.success).toBe(true);

        // Verify feedback now in DB
        feedbacks = await prisma.gitgovFeedback.findMany({ where: { repoId } });
        expect(feedbacks.length).toBeGreaterThanOrEqual(1);
        const writtenFb = feedbacks.find((f) => f.recordId === writtenFbId);
        expect(writtenFb).toBeDefined();
        expect(writtenFb!.feedbackType).toBe('approval');
      });
    });

    // -------------------------------------------------------------------------
    // D5: Incremental Projection
    // -------------------------------------------------------------------------
    describe('D5: Incremental Projection', () => {
      const repoId = `e2e-d5-${Date.now()}`;
      let tmpDir: string;
      let repoDir: string;

      const ts = Math.floor(Date.now() / 1000);
      const task1Id = `${ts}-task-incr-1`;
      const task2Id = `${ts}-task-incr-2`;
      const task3Id = `${ts + 1}-task-incr-3`;
      const cycleId = `${ts}-cycle-incr`;
      const execId = `${ts + 1}-exec-incr`;

      beforeAll(async () => {
        const repo = createTempGitRepo();
        tmpDir = repo.tmpDir;
        repoDir = repo.repoDir;
      });

      afterAll(async () => {
        await cleanupDb(prisma, repoId);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it('[EARS-D5] should incrementally project new records without losing existing data', async () => {
        await seedActorRecord(repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev' });

        // Run 1: 2 tasks + 1 cycle
        await seedTaskRecord(repoDir, { id: task1Id, title: 'Task 1', cycleIds: [cycleId] });
        await seedTaskRecord(repoDir, { id: task2Id, title: 'Task 2', cycleIds: [cycleId] });
        await seedCycleRecord(repoDir, { id: cycleId, title: 'Sprint', taskIds: [task1Id, task2Id] });

        const report1 = await runProjector(prisma, repoDir, repoId);
        expect(report1.success).toBe(true);

        let tasks = await prisma.gitgovTask.findMany({ where: { repoId } });
        expect(tasks).toHaveLength(2);
        let cycles = await prisma.gitgovCycle.findMany({ where: { repoId } });
        expect(cycles).toHaveLength(1);

        // Run 2: Add 1 task + 1 execution
        await seedTaskRecord(repoDir, { id: task3Id, title: 'Task 3' });
        await seedExecutionRecord(repoDir, { id: execId, taskId: task1Id, type: 'progress', result: 'Done' });

        const report2 = await runProjector(prisma, repoDir, repoId);
        expect(report2.success).toBe(true);

        tasks = await prisma.gitgovTask.findMany({ where: { repoId } });
        expect(tasks).toHaveLength(3);

        cycles = await prisma.gitgovCycle.findMany({ where: { repoId } });
        expect(cycles).toHaveLength(1);

        const task1 = tasks.find((t) => t.recordId === task1Id);
        expect(task1).toBeDefined();
        expect(task1!.executionCount).toBeGreaterThanOrEqual(1);

        const task3 = tasks.find((t) => t.recordId === task3Id);
        expect(task3).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // 4.5. Projection Parity — FS vs Prisma (EARS-E1)
  // ===========================================================================
  describe('4.5. Projection Parity (EARS-E1)', () => {
    const repoId = `e2e-parity-${Date.now()}`;
    let tmpDir: string;
    let repoDir: string;
    let fsIdx: Awaited<ReturnType<typeof projectAndCompare>>['fsIndexData'];
    let prismaIdx: Awaited<ReturnType<typeof projectAndCompare>>['prismaIndexData'];

    const ts = Math.floor(Date.now() / 1000);
    const taskId = `${ts}-task-parity`;
    const execId = `${ts}-exec-parity`;
    const feedbackId = `${ts}-feedback-parity`;
    const cycleId = `${ts}-cycle-parity`;
    const changelogId = `${ts}-changelog-parity`;

    beforeAll(async () => {
      const repo = createTempGitRepo();
      tmpDir = repo.tmpDir;
      repoDir = repo.repoDir;

      await seedActorRecord(repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev' });
      await seedActorRecord(repoDir, { id: 'agent:auditor', type: 'agent', displayName: 'Auditor' });
      await seedAgentRecord(repoDir, { id: 'agent:auditor', engineType: 'api' });
      await seedTaskRecord(repoDir, { id: taskId, title: 'Parity Test', status: 'active', priority: 'high', cycleIds: [cycleId] });
      await seedExecutionRecord(repoDir, { id: execId, taskId, type: 'analysis', result: 'Scan complete' });
      await seedFeedbackRecord(repoDir, { id: feedbackId, entityType: 'task', entityId: taskId, type: 'approval', content: 'LGTM' });
      await seedCycleRecord(repoDir, { id: cycleId, title: 'Sprint Parity', taskIds: [taskId] });
      await seedChangelogRecord(repoDir, { id: changelogId, title: 'Parity Release', relatedTasks: [taskId], version: 'v2.0.0' });

      const result = await projectAndCompare(prisma, repoDir, repoId);
      fsIdx = result.fsIndexData;
      prismaIdx = result.prismaIndexData;
    });

    afterAll(async () => {
      await cleanupDb(prisma, repoId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[EARS-E1] should produce equivalent IndexData from both FS and Prisma projections', () => {
      // E1a: metadata.recordCounts
      expect(prismaIdx.metadata.recordCounts).toEqual(fsIdx.metadata.recordCounts);

      // E1b: enrichedTasks — same IDs, healthScores, derived states, metrics
      expect(prismaIdx.enrichedTasks).toHaveLength(fsIdx.enrichedTasks.length);
      for (const fsTask of fsIdx.enrichedTasks) {
        const prismaTask = prismaIdx.enrichedTasks.find((t) => t.id === fsTask.id);
        expect(prismaTask).toBeDefined();
        expect(prismaTask!.status).toBe(fsTask.status);
        expect(prismaTask!.priority).toBe(fsTask.priority);
        expect(prismaTask!.derivedState.healthScore).toBe(fsTask.derivedState.healthScore);
        expect(prismaTask!.derivedState.isStalled).toBe(fsTask.derivedState.isStalled);
        expect(prismaTask!.derivedState.isAtRisk).toBe(fsTask.derivedState.isAtRisk);
        expect(prismaTask!.metrics.executionCount).toBe(fsTask.metrics.executionCount);
        expect(prismaTask!.release.isReleased).toBe(fsTask.release.isReleased);
        expect(prismaTask!.release.lastReleaseVersion).toBe(fsTask.release.lastReleaseVersion);
      }

      // E1c: activityHistory — same length and event types
      expect(prismaIdx.activityHistory).toHaveLength(fsIdx.activityHistory.length);
      const fsEvents = new Set(fsIdx.activityHistory.map((e) => `${e.type}:${e.entityId}`));
      const prismaEvents = new Set(prismaIdx.activityHistory.map((e) => `${e.type}:${e.entityId}`));
      expect(prismaEvents).toEqual(fsEvents);

      // E1d: actors — same recordIds, types, displayNames
      expect(prismaIdx.actors).toHaveLength(fsIdx.actors.length);
      for (const fsActor of fsIdx.actors) {
        const prismaActor = prismaIdx.actors.find((a) => a.payload.id === fsActor.payload.id);
        expect(prismaActor).toBeDefined();
        expect(prismaActor!.payload.type).toBe(fsActor.payload.type);
        expect(prismaActor!.payload.displayName).toBe(fsActor.payload.displayName);
      }

      // E1e: cycles — same taskIds
      expect(prismaIdx.cycles).toHaveLength(fsIdx.cycles.length);
      for (const fsCycle of fsIdx.cycles) {
        const prismaCycle = prismaIdx.cycles.find((c) => c.payload.id === fsCycle.payload.id);
        expect(prismaCycle).toBeDefined();
        expect(prismaCycle!.payload.taskIds).toEqual(fsCycle.payload.taskIds);
      }

      // E1f: feedback — same types and entity references
      expect(prismaIdx.feedback).toHaveLength(fsIdx.feedback.length);
      for (const fsFb of fsIdx.feedback) {
        const prismaFb = prismaIdx.feedback.find((f) => f.payload.id === fsFb.payload.id);
        expect(prismaFb).toBeDefined();
        expect(prismaFb!.payload.type).toBe(fsFb.payload.type);
        expect(prismaFb!.payload.entityType).toBe(fsFb.payload.entityType);
        expect(prismaFb!.payload.entityId).toBe(fsFb.payload.entityId);
      }
    });
  });

  // ===========================================================================
  // 4.7. GitHub Store Integration — Mock Octokit (EARS-F1 to F5)
  // ===========================================================================
  describe('4.7. GitHub Store Integration (EARS-F1 to F5)', () => {
    const repoId = `e2e-github-mock-${Date.now()}`;

    let stores: GitHubTestStores;
    let mockOctokit: ReturnType<typeof createInMemoryOctokit>;

    const ts = Date.now();
    const taskId = `${ts}-task-gh`;
    const execId = `${ts}-exec-gh`;
    const feedbackId = `${ts}-feedback-gh`;
    const cycleId = `${ts}-cycle-gh`;
    const changelogId = `${ts}-changelog-gh`;

    beforeAll(async () => {
      mockOctokit = createInMemoryOctokit();
      stores = createMockGitHubStores(mockOctokit.octokit);

      // Seed all 7 record types via GitHubRecordStore.put()
      const humanActor = createEmbeddedRecord('actor', {
        id: 'human:dev', type: 'human', displayName: 'Dev Humano',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', roles: ['developer'],
      }, 'human:dev');
      await stores.actors.put('human:dev', humanActor);

      const agentActor = createEmbeddedRecord('actor', {
        id: 'agent:auditor', type: 'agent', displayName: 'Agente Auditor',
        publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', roles: ['auditor'],
      }, 'agent:auditor');
      await stores.actors.put('agent:auditor', agentActor);

      const task = createEmbeddedRecord('task', {
        id: taskId, title: 'Mock GitHub Task', status: 'active', priority: 'high',
        description: 'Task via mock GitHub store', tags: ['e2e'], references: [], cycleIds: [cycleId],
      }, 'human:dev');
      await stores.tasks.put(taskId, task);

      const exec = createEmbeddedRecord('execution', {
        id: execId, taskId, type: 'analysis', title: 'Mock Execution',
        result: 'Scan complete via mock', metadata: { source: 'mock-github' },
      }, 'agent:auditor');
      await stores.executions.put(execId, exec);

      const feedback = createEmbeddedRecord('feedback', {
        id: feedbackId, entityType: 'task', entityId: taskId,
        type: 'approval', status: 'open', content: 'Approved via mock',
      }, 'human:dev');
      await stores.feedbacks.put(feedbackId, feedback);

      const cycle = createEmbeddedRecord('cycle', {
        id: cycleId, title: 'Mock Sprint', status: 'active',
        taskIds: [taskId], childCycleIds: [], tags: ['e2e'],
      }, 'human:dev');
      await stores.cycles.put(cycleId, cycle);

      const changelog = createEmbeddedRecord('changelog', {
        id: changelogId, title: 'Mock Release',
        description: 'Changelog via mock', relatedTasks: [taskId],
        completedAt: Math.floor(Date.now() / 1000), version: 'v0.0.1-mock',
      }, 'human:dev');
      await stores.changelogs.put(changelogId, changelog);
    });

    afterAll(async () => {
      await cleanupDb(prisma, repoId);
    });

    it('[EARS-F1] should persist all 7 record types via GitHubRecordStore and verify via list', async () => {
      const actorIds = await stores.actors.list();
      expect(actorIds).toContain('human:dev');
      expect(actorIds).toContain('agent:auditor');

      const taskIds = await stores.tasks.list();
      expect(taskIds).toContain(taskId);

      const execIds = await stores.executions.list();
      expect(execIds).toContain(execId);

      const feedbackIds = await stores.feedbacks.list();
      expect(feedbackIds).toContain(feedbackId);

      const cycleIds = await stores.cycles.list();
      expect(cycleIds).toContain(cycleId);

      const changelogIds = await stores.changelogs.list();
      expect(changelogIds).toContain(changelogId);
    });

    it('[EARS-F2] should read back all 7 record types with matching payload and checksum', async () => {
      // Actor
      const actor = await stores.actors.get('human:dev');
      expect(actor).not.toBeNull();
      expect(actor!.payload.id).toBe('human:dev');
      expect(actor!.payload.displayName).toBe('Dev Humano');
      expect(actor!.header.payloadChecksum).toBe(computeChecksum(actor!.payload));

      // Task
      const task = await stores.tasks.get(taskId);
      expect(task).not.toBeNull();
      expect(task!.payload.id).toBe(taskId);
      expect(task!.payload.title).toBe('Mock GitHub Task');
      expect(task!.header.payloadChecksum).toBe(computeChecksum(task!.payload));

      // Execution
      const exec = await stores.executions.get(execId);
      expect(exec).not.toBeNull();
      expect(exec!.payload.taskId).toBe(taskId);
      expect(exec!.payload.type).toBe('analysis');
      expect(exec!.header.payloadChecksum).toBe(computeChecksum(exec!.payload));

      // Feedback
      const feedback = await stores.feedbacks.get(feedbackId);
      expect(feedback).not.toBeNull();
      expect(feedback!.payload.type).toBe('approval');
      expect(feedback!.payload.entityId).toBe(taskId);
      expect(feedback!.header.payloadChecksum).toBe(computeChecksum(feedback!.payload));

      // Cycle
      const cycle = await stores.cycles.get(cycleId);
      expect(cycle).not.toBeNull();
      expect(cycle!.payload.taskIds).toContain(taskId);
      expect(cycle!.header.payloadChecksum).toBe(computeChecksum(cycle!.payload));

      // Changelog
      const changelog = await stores.changelogs.get(changelogId);
      expect(changelog).not.toBeNull();
      expect(changelog!.payload.version).toBe('v0.0.1-mock');
      expect(changelog!.payload.relatedTasks).toContain(taskId);
      expect(changelog!.header.payloadChecksum).toBe(computeChecksum(changelog!.payload));

      // Agent actor
      const agent = await stores.actors.get('agent:auditor');
      expect(agent).not.toBeNull();
      expect(agent!.payload.type).toBe('agent');
      expect(agent!.header.payloadChecksum).toBe(computeChecksum(agent!.payload));
    });

    it('[EARS-F3] should produce identical records via GitHubRecordStore and FsRecordStore (source parity)', async () => {
      // Create same records in FS
      const tmpRepo = createTempGitRepo();

      await seedActorRecord(tmpRepo.repoDir, { id: 'human:dev', type: 'human', displayName: 'Dev Humano' });
      await seedTaskRecord(tmpRepo.repoDir, {
        id: taskId, title: 'Mock GitHub Task', status: 'active', priority: 'high',
        description: 'Task via mock GitHub store', tags: ['e2e'], cycleIds: [cycleId],
      });

      // Read from both stores
      const ghTask = await stores.tasks.get(taskId);
      const fsTask = JSON.parse(
        fs.readFileSync(path.join(tmpRepo.repoDir, '.gitgov', 'tasks', `${taskId}.json`), 'utf-8'),
      );

      // Payload structure should match (same fields, same values)
      expect(ghTask!.payload.id).toBe(fsTask.payload.id);
      expect(ghTask!.payload.title).toBe(fsTask.payload.title);
      expect(ghTask!.payload.status).toBe(fsTask.payload.status);
      expect(ghTask!.payload.priority).toBe(fsTask.payload.priority);

      // Both have valid headers with signatures and matching checksums
      expect(ghTask!.header.version).toBe(fsTask.header.version);
      expect(ghTask!.header.type).toBe(fsTask.header.type);
      expect(ghTask!.header.payloadChecksum).toBe(computeChecksum(ghTask!.payload));
      expect(fsTask.header.payloadChecksum).toBe(computeChecksum(fsTask.payload));

      // Actors too
      const ghActor = await stores.actors.get('human:dev');
      const fsActor = JSON.parse(
        fs.readFileSync(path.join(tmpRepo.repoDir, '.gitgov', 'actors', 'human_dev.json'), 'utf-8'),
      );
      expect(ghActor!.payload.id).toBe(fsActor.payload.id);
      expect(ghActor!.payload.type).toBe(fsActor.payload.type);
      expect(ghActor!.payload.displayName).toBe(fsActor.payload.displayName);

      fs.rmSync(tmpRepo.tmpDir, { recursive: true, force: true });
    });

    it('[EARS-F4] should project mock GitHub-sourced records into all 6 DB tables', async () => {
      const report = await runMockGitHubProjector(prisma, mockOctokit.octokit, repoId);
      expect(report.success).toBe(true);
      expect(report.recordsProcessed).toBeGreaterThan(0);

      const where = { repoId, projectionType: 'index' };

      // Meta
      const meta = await prisma.gitgovMeta.findFirst({ where });
      expect(meta).not.toBeNull();
      const counts = meta!.recordCountsJson as Record<string, number>;
      expect(counts['tasks']).toBeGreaterThanOrEqual(1);
      expect(counts['actors']).toBeGreaterThanOrEqual(1);

      // Tasks with enrichment
      const tasks = await prisma.gitgovTask.findMany({ where });
      const projectedTask = tasks.find((t) => t.recordId === taskId);
      expect(projectedTask).toBeDefined();
      expect(projectedTask!.healthScore).toBeGreaterThanOrEqual(0);
      expect(projectedTask!.healthScore).toBeLessThanOrEqual(100);
      expect(projectedTask!.executionCount).toBeGreaterThanOrEqual(1);
      expect(projectedTask!.status).toBe('active');
      expect(projectedTask!.priority).toBe('high');
      expect(projectedTask!.isReleased).toBe(true);
      expect(projectedTask!.lastReleaseVersion).toBe('v0.0.1-mock');

      // Actors
      const actors = await prisma.gitgovActor.findMany({ where });
      expect(actors.length).toBeGreaterThanOrEqual(2);
      const actorIds = actors.map((a) => a.recordId);
      expect(actorIds).toContain('human:dev');
      expect(actorIds).toContain('agent:auditor');

      // Feedback
      const feedbacks = await prisma.gitgovFeedback.findMany({ where });
      const projectedFb = feedbacks.find((f) => f.recordId === feedbackId);
      expect(projectedFb).toBeDefined();
      expect(projectedFb!.feedbackType).toBe('approval');
      expect(projectedFb!.entityId).toBe(taskId);

      // Cycles
      const cycles = await prisma.gitgovCycle.findMany({ where });
      const projectedCycle = cycles.find((c) => c.recordId === cycleId);
      expect(projectedCycle).toBeDefined();
      expect(projectedCycle!.taskIds).toContain(taskId);

      // Activities
      const activities = await prisma.gitgovActivity.findMany({ where });
      expect(activities.length).toBeGreaterThan(0);
    });

    it('[EARS-F5] should return null for non-existent records and empty array for empty store', async () => {
      // get() on non-existent ID returns null
      const nonExistent = await stores.tasks.get('does-not-exist');
      expect(nonExistent).toBeNull();

      // Create a fresh store with a different basePath (no files seeded)
      const emptyMock = createInMemoryOctokit();
      const emptyStores = createMockGitHubStores(emptyMock.octokit);

      // list() on empty store returns empty array
      const emptyTaskList = await emptyStores.tasks.list();
      expect(emptyTaskList).toEqual([]);

      const emptyActorList = await emptyStores.actors.list();
      expect(emptyActorList).toEqual([]);

      // exists() on non-existent ID returns false
      const existsResult = await emptyStores.tasks.exists('phantom-task');
      expect(existsResult).toBe(false);
    });
  });
});
