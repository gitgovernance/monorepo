/**
 * Prisma Helpers — PostgreSQL connection, DB cleanup, projector execution.
 * [HLP-B1] Real PostgreSQL, [HLP-B2] Full cleanup, [HLP-B3] Projector execution.
 */
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../core/generated/prisma/index.js';
import { FsRecordStore, DEFAULT_ID_ENCODER, FsRecordProjection } from '@gitgov/core/fs';
import { PrismaRecordProjection } from '@gitgov/core/prisma';
import type { ProjectionClient } from '@gitgov/core/prisma';
import { RecordProjection, RecordMetrics as RecordMetricsNs } from '@gitgov/core';
import type {
  RecordProjectorDependencies,
  IndexGenerationReport,
  IndexData,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from '@gitgov/core';
import { getGitgovDir } from './fs';

const RecordProjector = RecordProjection.RecordProjector;
const RecordMetrics = RecordMetricsNs.RecordMetrics;

export { PrismaRecordProjection, RecordProjector, RecordMetrics };
export type {
  PrismaClient, ProjectionClient, IndexGenerationReport, IndexData, RecordProjectorDependencies,
  GitGovTaskRecord, GitGovCycleRecord, GitGovFeedbackRecord, GitGovExecutionRecord, GitGovActorRecord, GitGovAgentRecord,
};

// [HLP-B1] Connect to real PostgreSQL
export function createTestPrisma(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_dev';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// [HLP-B2] Clean ALL rows from all protocol tables
export async function cleanupDb(prisma: PrismaClient): Promise<void> {
  const SKIP_CLEANUP = process.env['SKIP_CLEANUP'] === '1';
  if (SKIP_CLEANUP) {
    console.log(`[SKIP_CLEANUP] Keeping DB rows for inspection.`);
    return;
  }
  await prisma.$transaction([
    prisma.gitgovTask.deleteMany({}),
    prisma.gitgovCycle.deleteMany({}),
    prisma.gitgovActor.deleteMany({}),
    prisma.gitgovFeedback.deleteMany({}),
    prisma.gitgovActivity.deleteMany({}),
    prisma.gitgovExecution.deleteMany({}),
    prisma.gitgovAgent.deleteMany({}),
    prisma.gitgovWorkflow.deleteMany({}),
    prisma.gitgovMeta.deleteMany({}),
  ]);
}

function createRecordStores(repoDir: string): RecordProjectorDependencies['stores'] {
  const gitgovDir = getGitgovDir(repoDir);
  return {
    tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: `${gitgovDir}/tasks` }),
    cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: `${gitgovDir}/cycles` }),
    feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: `${gitgovDir}/feedbacks` }),
    executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: `${gitgovDir}/executions` }),
    actors: new FsRecordStore<GitGovActorRecord>({ basePath: `${gitgovDir}/actors`, idEncoder: DEFAULT_ID_ENCODER }),
    agents: new FsRecordStore<GitGovAgentRecord>({ basePath: `${gitgovDir}/agents`, idEncoder: DEFAULT_ID_ENCODER }),
  };
}

// [HLP-B3] Run projector: FsRecordStore → RecordProjector → PrismaRecordProjection
export async function runProjector(
  prisma: PrismaClient,
  repoDir: string,
): Promise<IndexGenerationReport> {
  const stores = createRecordStores(repoDir);
  const sink = new PrismaRecordProjection({ client: prisma as unknown as ProjectionClient });
  const recordMetrics = new RecordMetrics({ stores });
  const projector = new RecordProjector({ recordMetrics, stores });

  try {
    const startTime = performance.now();
    const indexData = await projector.computeProjection();

    indexData.activityHistory = indexData.activityHistory.filter(
      (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
    );
    indexData.metadata.generationTime = performance.now() - startTime;
    await sink.persist(indexData, {});

    const totalTime = performance.now() - startTime;
    const taskCount = indexData.metadata.recordCounts['tasks'] || 0;
    const cycleCount = indexData.metadata.recordCounts['cycles'] || 0;
    const actorCount = indexData.metadata.recordCounts['actors'] || 0;

    return {
      success: true,
      recordsProcessed: taskCount + cycleCount + actorCount,
      metricsCalculated: 3,
      derivedStatesApplied: Object.values(indexData.derivedStates).reduce((sum, arr) => sum + arr.length, 0),
      generationTime: totalTime,
      errors: [],
      performance: { readTime: 0, calculationTime: 0, writeTime: totalTime },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[runProjector] FAILED error=${msg}`);
    return {
      success: false,
      recordsProcessed: 0,
      metricsCalculated: 0,
      derivedStatesApplied: 0,
      generationTime: 0,
      errors: [msg],
      performance: { readTime: 0, calculationTime: 0, writeTime: 0 },
    };
  }
}

export async function projectAndCompare(
  prisma: PrismaClient,
  repoDir: string,
): Promise<{ fsIndexData: IndexData; prismaIndexData: IndexData }> {
  const stores = createRecordStores(repoDir);
  const recordMetrics = new RecordMetrics({ stores });
  const projector = new RecordProjector({ recordMetrics, stores });

  const indexData = await projector.computeProjection();
  indexData.activityHistory = indexData.activityHistory.filter(
    (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
  );
  indexData.metadata.generationTime = 1;

  const fsSink = new FsRecordProjection({ basePath: getGitgovDir(repoDir) });
  await fsSink.persist(indexData, {});

  const prismaSink = new PrismaRecordProjection({ client: prisma as unknown as ProjectionClient });
  await prismaSink.persist(indexData, {});

  const fsIndexData = await fsSink.read({});
  const prismaIndexData = await prismaSink.read({});

  if (!fsIndexData) throw new Error('FsRecordProjection.read() returned null');
  if (!prismaIndexData) throw new Error('PrismaRecordProjection.read() returned null');

  return { fsIndexData, prismaIndexData };
}
