/**
 * Shared E2E test helpers — used by all 6 test files.
 *
 * Extracts CLI execution, git setup, DB management, projection,
 * and GitHub integration utilities into a single importable module.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../core/generated/prisma/index.js';

// Core internal imports (avoid @gitgov/core/fs public API which pulls in esm_helper.ts)
import { FsRecordStore, DEFAULT_ID_ENCODER } from '../../core/src/record_store/fs';
import { FsRecordProjection } from '../../core/src/record_projection/fs';
import { PrismaRecordProjection } from '../../core/src/record_projection/prisma';
import type { ProjectionClient } from '../../core/src/record_projection/prisma';
import { RecordProjector } from '../../core/src/record_projection';
import type { RecordProjectorDependencies, IndexGenerationReport, IndexData } from '../../core/src/record_projection';
import { RecordMetrics } from '../../core/src/record_metrics';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
} from '../../core/src/record_types';

// Re-export types used by test files
export type { PrismaClient } from '../../core/generated/prisma/index.js';
export type { IndexGenerationReport, IndexData, RecordProjectorDependencies, IRecordProjector } from '../../core/src/record_projection';
export type { ProjectionClient } from '../../core/src/record_projection/prisma';
export { PrismaRecordProjection } from '../../core/src/record_projection/prisma';
export { RecordProjector } from '../../core/src/record_projection';
export { RecordMetrics } from '../../core/src/record_metrics';
export { DEFAULT_ID_ENCODER } from '../../core/src/record_store/fs';

// Sync state (Block F)
export { GithubSyncStateModule } from '../../core/src/sync_state/github_sync_state';
export type { GithubSyncStateDependencies } from '../../core/src/sync_state/github_sync_state';
export type { StateDeltaFile, SyncStatePushResult, AuditStateReport } from '../../core/src/sync_state';

// ===== Types =====

export type CliResult = {
  success: boolean;
  output: string;
  error: string | null;
};

/**
 * Loose type for JSON-parsed record files.
 * Captures the common EmbeddedMetadata shape without requiring
 * exact payload types (which vary per record type).
 */
export type ParsedRecord = {
  header: {
    version: string;
    type: string;
    payloadChecksum: string;
    signatures: Array<{
      keyId: string;
      role: string;
      notes: string;
      signature: string;
      timestamp: number;
    }>;
  };
  payload: {
    id: string;
    [key: string]: unknown;
  };
};

// ===== CLI Helper =====

export const runCliCommand = (args: string[], options: { expectError?: boolean; cwd: string }): CliResult => {
  const cliPath = path.join(__dirname, '../../cli/build/dist/gitgov.mjs');
  const escapedArgs = args.map(arg => {
    if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
      return `"${arg}"`;
    }
    return arg;
  });
  const command = `node "${cliPath}" ${escapedArgs.join(' ')}`;

  try {
    const result = execSync(command, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (options.expectError) {
      return { success: false, output: result, error: 'Expected error but succeeded' };
    }
    return { success: true, output: result, error: null };
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    const stderr = execError.stderr ?? '';
    const stdout = execError.stdout ?? '';
    const message = execError.message ?? '';
    const combinedOutput = `${stdout}\n${stderr}\n${message}`.trim();

    if (options.expectError) {
      return { success: false, output: stdout || combinedOutput, error: stderr || combinedOutput };
    }
    throw new Error(`CLI command failed: ${stderr || message}\nStdout: ${stdout}`);
  }
};

// ===== Git Helpers =====

export const createGitRepo = (repoPath: string): void => {
  fs.mkdirSync(repoPath, { recursive: true });
  execSync('git init --initial-branch=main', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: repoPath, stdio: 'pipe' });
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# E2E Pipeline Test\n');
  execSync('git add README.md && git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
};

export const createBareRemote = (remotePath: string): void => {
  fs.mkdirSync(remotePath, { recursive: true });
  execSync('git init --bare --initial-branch=main', { cwd: remotePath, stdio: 'pipe' });
};

export const addRemote = (repoPath: string, remotePath: string): void => {
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
};

// ===== FS Helpers =====

export const listRecordFiles = (repoDir: string, dir: string): string[] => {
  const dirPath = path.join(repoDir, '.gitgov', dir);
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
};

export const readRecordFile = (repoDir: string, dir: string, filename: string): ParsedRecord => {
  const filePath = path.join(repoDir, '.gitgov', dir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ParsedRecord;
};

// ===== DB Helpers =====

export const SKIP_CLEANUP = process.env['SKIP_CLEANUP'] === '1';

export function createTestPrisma(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_dev';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export async function cleanupDb(prisma: PrismaClient, repoId: string): Promise<void> {
  if (SKIP_CLEANUP) {
    console.log(`[SKIP_CLEANUP] Keeping DB rows for repoId=${repoId} — inspect with: SELECT * FROM "GitgovTask" WHERE "repoId" = '${repoId}';`);
    return;
  }
  const where = { repoId };
  await prisma.$transaction([
    prisma.gitgovTask.deleteMany({ where }),
    prisma.gitgovCycle.deleteMany({ where }),
    prisma.gitgovActor.deleteMany({ where }),
    prisma.gitgovFeedback.deleteMany({ where }),
    prisma.gitgovActivity.deleteMany({ where }),
    prisma.gitgovMeta.deleteMany({ where }),
  ]);
}

// ===== Projection Helpers =====

/**
 * Wires up FsRecordStore -> RecordProjector -> PrismaRecordProjection.
 * Reads CLI-created records from .gitgov/, computes projection, persists to Prisma.
 */
export async function runProjector(
  prisma: PrismaClient,
  repoDir: string,
  repoId: string,
): Promise<IndexGenerationReport> {
  const stores = {
    tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(repoDir, '.gitgov', 'tasks') }),
    cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(repoDir, '.gitgov', 'cycles') }),
    feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(repoDir, '.gitgov', 'feedbacks') }),
    executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(repoDir, '.gitgov', 'executions') }),
    actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(repoDir, '.gitgov', 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
  };

  const typedStores: RecordProjectorDependencies['stores'] = stores;

  const sink = new PrismaRecordProjection({
    client: prisma as unknown as ProjectionClient,
    repoId,
    projectionType: 'index',
  });

  const recordMetrics = new RecordMetrics({ stores: typedStores });
  const projector = new RecordProjector({ recordMetrics, stores: typedStores });

  try {
    const startTime = performance.now();
    const indexData = await projector.computeProjection();

    // Filter NaN activity events (from non-numeric ID prefixes like 'human:dev')
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
    console.error(`[runProjector] FAILED repoId=${repoId} error=${msg}`);
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

/**
 * Computes IndexData once and persists to BOTH sinks (FS + Prisma),
 * then reads back from each for cross-projection comparison.
 */
export async function projectAndCompare(
  prisma: PrismaClient,
  repoDir: string,
  repoId: string,
): Promise<{ fsIndexData: IndexData; prismaIndexData: IndexData }> {
  const stores = {
    tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(repoDir, '.gitgov', 'tasks') }),
    cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(repoDir, '.gitgov', 'cycles') }),
    feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(repoDir, '.gitgov', 'feedbacks') }),
    executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(repoDir, '.gitgov', 'executions') }),
    actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(repoDir, '.gitgov', 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
  };

  const typedStores: RecordProjectorDependencies['stores'] = stores;
  const recordMetrics = new RecordMetrics({ stores: typedStores });
  const projector = new RecordProjector({ recordMetrics, stores: typedStores });

  // 1. Compute once
  const indexData = await projector.computeProjection();
  indexData.activityHistory = indexData.activityHistory.filter(
    (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
  );
  indexData.metadata.generationTime = 1; // deterministic value for comparison

  // 2. Persist to FS (CLI path)
  const fsSink = new FsRecordProjection({ basePath: path.join(repoDir, '.gitgov') });
  await fsSink.persist(indexData, {});

  // 3. Persist to Prisma (SaaS path)
  const prismaSink = new PrismaRecordProjection({
    client: prisma as unknown as ProjectionClient,
    repoId,
    projectionType: 'index',
  });
  await prismaSink.persist(indexData, {});

  // 4. Read back from both
  const fsIndexData = await fsSink.read({});
  const prismaIndexData = await prismaSink.read({});

  if (!fsIndexData) throw new Error('FsRecordProjection.read() returned null');
  if (!prismaIndexData) throw new Error('PrismaRecordProjection.read() returned null');

  return { fsIndexData, prismaIndexData };
}

// ===== GitHub E2E Configuration =====

export const GITHUB_TEST_REPO = process.env['GITHUB_TEST_REPO'] ?? '';
// Support SSH URLs (git@github.com:org/repo.git) and owner/repo format
export const GITHUB_REMOTE_URL = GITHUB_TEST_REPO.includes('@') || GITHUB_TEST_REPO.includes('://')
  ? GITHUB_TEST_REPO
  : GITHUB_TEST_REPO
    ? `git@github.com:${GITHUB_TEST_REPO}.git`
    : '';
export const HAS_GITHUB = GITHUB_REMOTE_URL.length > 0;

export const GITHUB_TEST_OWNER = process.env['GITHUB_TEST_OWNER'] ?? '';
export const GITHUB_TEST_REPO_NAME = process.env['GITHUB_TEST_REPO_NAME'] ?? '';
export const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] ?? '';

/**
 * Guard: call at the beginning of GitHub-dependent test suites.
 * When GITHUB_TOKEN is not set, logs a skip message.
 * Tests should use `(HAS_GITHUB ? describe : describe.skip)(...)` for conditional execution.
 */
export function requireGitHub(): void {
  if (!HAS_GITHUB) {
    console.log('[SKIP] GitHub tests require GITHUB_TEST_REPO env var');
  }
}
