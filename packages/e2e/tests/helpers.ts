/**
 * Shared E2E test helpers — used by all 6 test files.
 *
 * Extracts CLI execution, git setup, DB management, projection,
 * and GitHub integration utilities into a single importable module.
 *
 * IMPORTANT: All imports use @gitgov/core public API — NEVER ../../core/src/.
 * Record I/O uses FsRecordStore — NEVER raw fs.readFileSync/readdirSync.
 * See Cycle 3.10 in roadmap for rationale.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
// PrismaClient comes from core's generated prisma output — not a src/ internal import.
// This is the one acceptable ../../core/ path because the generated client has no public export path.
import { PrismaClient } from '../../core/generated/prisma/index.js';

// === @gitgov/core public API ===
import { FsRecordStore, DEFAULT_ID_ENCODER, FsRecordProjection, getWorktreeBasePath } from '@gitgov/core/fs';
import { PrismaRecordProjection } from '@gitgov/core/prisma';
import type { ProjectionClient } from '@gitgov/core/prisma';
import { GithubSyncStateModule, GitHubRecordStore } from '@gitgov/core/github';
import type { GithubSyncStateDependencies } from '@gitgov/core/github';
import { RecordProjection, RecordMetrics as RecordMetricsNs } from '@gitgov/core';
import type {
  RecordProjectorDependencies,
  IndexGenerationReport,
  IndexData,
  IRecordProjector,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from '@gitgov/core';

// Unwrap namespace exports for convenience
const RecordProjector = RecordProjection.RecordProjector;
const RecordMetrics = RecordMetricsNs.RecordMetrics;

// Re-export for test files — all from public API
export type { PrismaClient } from '../../core/generated/prisma/index.js';
export type {
  IndexGenerationReport,
  IndexData,
  RecordProjectorDependencies,
  IRecordProjector,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovActorRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovAgentRecord,
  ILintModule,
} from '@gitgov/core';
export type { ProjectionClient } from '@gitgov/core/prisma';
export type { GithubSyncStateDependencies } from '@gitgov/core/github';
export { PrismaRecordProjection } from '@gitgov/core/prisma';
export { GithubSyncStateModule, GitHubRecordStore } from '@gitgov/core/github';
export { FsRecordStore, DEFAULT_ID_ENCODER } from '@gitgov/core/fs';
export { RecordProjector, RecordMetrics };

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

// ===== Worktree Helpers =====
//
// The CLI stores .gitgov/ in ~/.gitgov/worktrees/<SHA256(realpathSync(repoRoot))[0:12]>/
// NOT in the repo directory itself. getWorktreeBasePath lives in @gitgov/core/fs.

/**
 * Returns the .gitgov/ directory path where the CLI stores records.
 * This is inside the worktree, not the repo directory.
 */
export const getGitgovDir = (repoPath: string): string => {
  return path.join(getWorktreeBasePath(repoPath), '.gitgov');
};

/**
 * Clean up a worktree created by CLI init.
 * Must be called in afterAll/finally to avoid leaking worktrees in ~/.gitgov/worktrees/.
 */
export const cleanupWorktree = (repoPath: string): void => {
  const wtPath = getWorktreeBasePath(repoPath);
  if (fs.existsSync(wtPath)) {
    try {
      execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' });
    } catch { /* ignore */ }
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }
};

// ===== Record Helpers (via @gitgov/core/fs — NEVER raw fs) =====
//
// All record helpers resolve through getGitgovDir() to read from the
// worktree location where the CLI actually stores .gitgov/ records.

/**
 * Lists record IDs in a .gitgov/ subdirectory via FsRecordStore.
 * Resolves through worktree path (CLI stores records in ~/.gitgov/worktrees/<hash>/).
 */
export const listRecordIds = async (repoDir: string, dir: string): Promise<string[]> => {
  const gitgovDir = getGitgovDir(repoDir);
  const store = new FsRecordStore<ParsedRecord>({ basePath: path.join(gitgovDir, dir) });
  return store.list();
};

/**
 * Reads a single record from .gitgov/ via FsRecordStore.
 * Resolves through worktree path.
 */
export const readRecord = async <T = ParsedRecord>(repoDir: string, dir: string, id: string): Promise<T> => {
  const gitgovDir = getGitgovDir(repoDir);
  const store = new FsRecordStore<T>({ basePath: path.join(gitgovDir, dir) });
  const record = await store.get(id);
  if (!record) throw new Error(`Record not found: ${gitgovDir}/${dir}/${id}`);
  return record;
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
 * Creates typed FsRecordStores for all .gitgov/ record directories.
 * Resolves through worktree path. Shared by runProjector and projectAndCompare.
 */
function createRecordStores(repoDir: string): RecordProjectorDependencies['stores'] {
  const gitgovDir = getGitgovDir(repoDir);
  return {
    tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(gitgovDir, 'tasks') }),
    cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(gitgovDir, 'cycles') }),
    feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(gitgovDir, 'feedbacks') }),
    executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(gitgovDir, 'executions') }),
    actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(gitgovDir, 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
    agents: new FsRecordStore<GitGovAgentRecord>({ basePath: path.join(gitgovDir, 'agents'), idEncoder: DEFAULT_ID_ENCODER }),
  };
}

/**
 * Wires up FsRecordStore -> RecordProjector -> PrismaRecordProjection.
 * Reads CLI-created records from .gitgov/, computes projection, persists to Prisma.
 */
export async function runProjector(
  prisma: PrismaClient,
  repoDir: string,
  repoId: string,
): Promise<IndexGenerationReport> {
  const stores = createRecordStores(repoDir);

  const sink = new PrismaRecordProjection({
    client: prisma as unknown as ProjectionClient,
    repoId,
    projectionType: 'index',
  });

  const recordMetrics = new RecordMetrics({ stores });
  const projector = new RecordProjector({ recordMetrics, stores });

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
  const stores = createRecordStores(repoDir);
  const recordMetrics = new RecordMetrics({ stores });
  const projector = new RecordProjector({ recordMetrics, stores });

  // 1. Compute once
  const indexData = await projector.computeProjection();
  indexData.activityHistory = indexData.activityHistory.filter(
    (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
  );
  indexData.metadata.generationTime = 1; // deterministic value for comparison

  // 2. Persist to FS (CLI path) — uses worktree .gitgov/ path
  const fsSink = new FsRecordProjection({ basePath: getGitgovDir(repoDir) });
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

// ============================================================
// GitLab Guards (Block J)
// ============================================================

export const GITLAB_TOKEN = process.env['GITLAB_TOKEN'] ?? '';
export const GITLAB_TEST_PROJECT_ID = process.env['GITLAB_TEST_PROJECT_ID'] ?? '';
export const HAS_GITLAB = GITLAB_TOKEN.length > 0 && GITLAB_TEST_PROJECT_ID.length > 0;

/**
 * Guard: call at the beginning of GitLab-dependent test suites.
 * When GITLAB_TOKEN is not set, logs a skip message.
 */
export function requireGitLab(): void {
  if (!HAS_GITLAB) {
    console.log('[SKIP] GitLab tests require GITLAB_TOKEN + GITLAB_TEST_PROJECT_ID env vars');
  }
}
