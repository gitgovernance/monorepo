import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import type { Octokit } from '@octokit/rest';
import { FsRecordStore, DEFAULT_ID_ENCODER } from '../../record_store/fs';
import { FsRecordProjection } from '../../record_projection/fs';
import { PrismaRecordProjection } from '../../record_projection/prisma';
import type { ProjectionClient } from '../../record_projection/prisma';
import { RecordProjector } from '../../record_projection';
import type { RecordProjectorDependencies, IndexGenerationReport, IndexData } from '../../record_projection';
import { RecordMetrics } from '../../record_metrics';
import { GitHubRecordStore } from '../../record_store/github';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
  EmbeddedMetadataHeader,
  Signature,
} from '../../record_types';
import type {
  TaskRecord,
  ActorRecord,
  AgentRecord,
  ExecutionRecord,
  FeedbackRecord,
  CycleRecord,
  ChangelogRecord,
} from '../../record_types';
import { PrismaClient } from '../../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { GitHubTestStores } from './pipeline_integration.types';

// ===== Infrastructure Helpers =====

/**
 * Creates a temp git repo with initial commit and .gitgov/ directory structure.
 * Returns the tmpDir path (repo is at tmpDir/repo).
 */
export function createTempGitRepo(): { tmpDir: string; repoDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-'));
  const repoDir = path.join(tmpDir, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  execSync('git init --initial-branch=main', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: repoDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# E2E Test\n');
  execSync('git add README.md && git commit -m "Initial commit"', { cwd: repoDir, stdio: 'pipe' });

  const dirs = ['actors', 'agents', 'tasks', 'executions', 'feedbacks', 'cycles', 'changelogs'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(repoDir, '.gitgov', dir), { recursive: true });
  }

  return { tmpDir, repoDir };
}

/**
 * Creates a bare git remote for push/pull testing.
 */
export function createBareRemote(): string {
  const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-remote-'));
  execSync('git init --bare', { cwd: remotePath, stdio: 'pipe' });
  return remotePath;
}

/**
 * Creates a PrismaClient connected to the test database (Docker PostgreSQL).
 */
export function createTestPrisma(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://gitgov:gitgov@localhost:5432/gitgov_dev';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// ===== Record Creation Helpers =====

export function computeChecksum(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function makeSignature(signerId: string): Signature {
  return {
    keyId: signerId,
    role: 'author',
    notes: 'E2E test record',
    signature: 'e2e-' + createHash('sha256').update(signerId + String(Date.now())).digest('base64').slice(0, 84) + '====',
    timestamp: Math.floor(Date.now() / 1000),
  };
}

type RecordTypeName = EmbeddedMetadataHeader['type'];

export function createEmbeddedRecord(type: 'actor', payload: ActorRecord, signerId: string): GitGovActorRecord;
export function createEmbeddedRecord(type: 'agent', payload: AgentRecord, signerId: string): GitGovAgentRecord;
export function createEmbeddedRecord(type: 'task', payload: TaskRecord, signerId: string): GitGovTaskRecord;
export function createEmbeddedRecord(type: 'execution', payload: ExecutionRecord, signerId: string): GitGovExecutionRecord;
export function createEmbeddedRecord(type: 'feedback', payload: FeedbackRecord, signerId: string): GitGovFeedbackRecord;
export function createEmbeddedRecord(type: 'cycle', payload: CycleRecord, signerId: string): GitGovCycleRecord;
export function createEmbeddedRecord(type: 'changelog', payload: ChangelogRecord, signerId: string): GitGovChangelogRecord;
export function createEmbeddedRecord(
  type: RecordTypeName,
  payload: ActorRecord | AgentRecord | TaskRecord | ExecutionRecord | FeedbackRecord | CycleRecord | ChangelogRecord,
  signerId: string,
): { header: EmbeddedMetadataHeader; payload: typeof payload } {
  return {
    header: {
      version: '1.0',
      type,
      payloadChecksum: computeChecksum(payload),
      signatures: [makeSignature(signerId)],
    },
    payload,
  };
}

// ===== Seed Helpers =====

export async function seedActorRecord(
  repoDir: string,
  opts: {
    id: string;
    type: 'human' | 'agent';
    displayName: string;
    publicKey?: string;
    roles?: [string, ...string[]];
  },
): Promise<GitGovActorRecord> {
  const payload: ActorRecord = {
    id: opts.id,
    type: opts.type,
    displayName: opts.displayName,
    publicKey: opts.publicKey ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    roles: opts.roles ?? ['developer'],
  };

  const record = createEmbeddedRecord('actor', payload, opts.id);

  const store = new FsRecordStore<GitGovActorRecord>({
    basePath: path.join(repoDir, '.gitgov', 'actors'),
    idEncoder: DEFAULT_ID_ENCODER,
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedAgentRecord(
  repoDir: string,
  opts: {
    id: string;
    engineType?: 'api' | 'local' | 'mcp';
    engineUrl?: string;
    triggers?: AgentRecord['triggers'];
  },
): Promise<GitGovAgentRecord> {
  const engine = opts.engineType === 'api'
    ? { type: 'api' as const, url: opts.engineUrl ?? 'https://api.example.com/agent' }
    : { type: 'local' as const, runtime: 'typescript', entrypoint: 'agent.ts' };

  const payload: AgentRecord = {
    id: opts.id,
    engine,
    triggers: opts.triggers ?? [{ type: 'scheduled' as const }],
  };

  const record = createEmbeddedRecord('agent', payload, opts.id);

  const store = new FsRecordStore<GitGovAgentRecord>({
    basePath: path.join(repoDir, '.gitgov', 'agents'),
    idEncoder: DEFAULT_ID_ENCODER,
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedTaskRecord(
  repoDir: string,
  opts: {
    id: string;
    title: string;
    status?: TaskRecord['status'];
    priority?: TaskRecord['priority'];
    description?: string;
    tags?: string[];
    references?: string[];
    cycleIds?: string[];
  },
  signerId?: string,
): Promise<GitGovTaskRecord> {
  const payload: TaskRecord = {
    id: opts.id,
    title: opts.title,
    status: opts.status ?? 'active',
    priority: opts.priority ?? 'medium',
    description: opts.description ?? `E2E test task: ${opts.title}`,
    tags: opts.tags ?? [],
    references: opts.references ?? [],
    cycleIds: opts.cycleIds ?? [],
  };

  const record = createEmbeddedRecord('task', payload, signerId ?? 'human:dev');

  const store = new FsRecordStore<GitGovTaskRecord>({
    basePath: path.join(repoDir, '.gitgov', 'tasks'),
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedExecutionRecord(
  repoDir: string,
  opts: {
    id: string;
    taskId: string;
    type?: ExecutionRecord['type'];
    title?: string;
    result?: string;
    metadata?: Record<string, unknown>;
  },
  signerId?: string,
): Promise<GitGovExecutionRecord> {
  const payload: ExecutionRecord = {
    id: opts.id,
    taskId: opts.taskId,
    type: opts.type ?? 'analysis',
    title: opts.title ?? `Execution ${opts.id}`,
    result: opts.result ?? 'E2E test execution result',
    ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
  };

  const record = createEmbeddedRecord('execution', payload, signerId ?? 'human:dev');

  const store = new FsRecordStore<GitGovExecutionRecord>({
    basePath: path.join(repoDir, '.gitgov', 'executions'),
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedFeedbackRecord(
  repoDir: string,
  opts: {
    id: string;
    entityType: FeedbackRecord['entityType'];
    entityId: string;
    type: FeedbackRecord['type'];
    status?: FeedbackRecord['status'];
    content?: string;
    assignee?: string;
    metadata?: Record<string, unknown>;
  },
  signerId?: string,
): Promise<GitGovFeedbackRecord> {
  const payload: FeedbackRecord = {
    id: opts.id,
    entityType: opts.entityType,
    entityId: opts.entityId,
    type: opts.type,
    status: opts.status ?? 'open',
    content: opts.content ?? `E2E feedback: ${opts.type}`,
    ...(opts.assignee !== undefined ? { assignee: opts.assignee } : {}),
    ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
  };

  const record = createEmbeddedRecord('feedback', payload, signerId ?? 'human:dev');

  const store = new FsRecordStore<GitGovFeedbackRecord>({
    basePath: path.join(repoDir, '.gitgov', 'feedbacks'),
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedCycleRecord(
  repoDir: string,
  opts: {
    id: string;
    title: string;
    status?: CycleRecord['status'];
    taskIds?: string[];
    childCycleIds?: string[];
    tags?: string[];
  },
  signerId?: string,
): Promise<GitGovCycleRecord> {
  const payload: CycleRecord = {
    id: opts.id,
    title: opts.title,
    status: opts.status ?? 'active',
    taskIds: opts.taskIds ?? [],
    childCycleIds: opts.childCycleIds ?? [],
    tags: opts.tags ?? [],
  };

  const record = createEmbeddedRecord('cycle', payload, signerId ?? 'human:dev');

  const store = new FsRecordStore<GitGovCycleRecord>({
    basePath: path.join(repoDir, '.gitgov', 'cycles'),
  });
  await store.put(opts.id, record);

  return record;
}

export async function seedChangelogRecord(
  repoDir: string,
  opts: {
    id: string;
    title: string;
    description?: string;
    relatedTasks: [string, ...string[]];
    version?: string;
    completedAt?: number;
  },
  signerId?: string,
): Promise<GitGovChangelogRecord> {
  const payload: ChangelogRecord = {
    id: opts.id,
    title: opts.title,
    description: opts.description ?? `E2E changelog: ${opts.title}`,
    relatedTasks: opts.relatedTasks,
    completedAt: opts.completedAt ?? Math.floor(Date.now() / 1000),
    ...(opts.version !== undefined ? { version: opts.version } : {}),
  };

  const record = createEmbeddedRecord('changelog', payload, signerId ?? 'human:dev');

  const store = new FsRecordStore<GitGovChangelogRecord>({
    basePath: path.join(repoDir, '.gitgov', 'changelogs'),
  });
  await store.put(opts.id, record);

  return record;
}

// ===== Projection Helpers =====

function buildProjectorStores(stores: {
  tasks: FsRecordStore<GitGovTaskRecord>;
  cycles: FsRecordStore<GitGovCycleRecord>;
  feedbacks: FsRecordStore<GitGovFeedbackRecord>;
  executions: FsRecordStore<GitGovExecutionRecord>;
  changelogs: FsRecordStore<GitGovChangelogRecord>;
  actors: FsRecordStore<GitGovActorRecord>;
}): RecordProjectorDependencies['stores'] {
  return stores;
}

function createFsStores(repoDir: string) {
  return {
    tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(repoDir, '.gitgov', 'tasks') }),
    cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(repoDir, '.gitgov', 'cycles') }),
    feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(repoDir, '.gitgov', 'feedbacks') }),
    executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(repoDir, '.gitgov', 'executions') }),
    changelogs: new FsRecordStore<GitGovChangelogRecord>({ basePath: path.join(repoDir, '.gitgov', 'changelogs') }),
    actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(repoDir, '.gitgov', 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
  };
}

/**
 * Wires up FsRecordStore → RecordProjector → PrismaRecordProjection.
 * Uses computeProjection() + manual persist() to filter invalid activity events.
 */
export async function runProjector(
  prisma: PrismaClient,
  repoDir: string,
  repoId: string,
): Promise<IndexGenerationReport> {
  const stores = createFsStores(repoDir);
  const projectorStores = buildProjectorStores(stores);
  return runProjection(prisma, projectorStores, repoId);
}

/**
 * Computes IndexData once and persists to BOTH sinks (FS + Prisma), then reads
 * back from each to allow cross-projection comparison.
 */
export async function projectAndCompare(
  prisma: PrismaClient,
  repoDir: string,
  repoId: string,
): Promise<{ fsIndexData: IndexData; prismaIndexData: IndexData }> {
  const stores = createFsStores(repoDir);
  const projectorStores = buildProjectorStores(stores);

  const recordMetrics = new RecordMetrics({ stores: projectorStores });
  const projector = new RecordProjector({ recordMetrics, stores: projectorStores });

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

/**
 * Core projection logic shared by runProjector and runGitHubProjector.
 */
async function runProjection(
  prisma: PrismaClient,
  projectorStores: RecordProjectorDependencies['stores'],
  repoId: string,
): Promise<IndexGenerationReport> {
  const sink = new PrismaRecordProjection({
    client: prisma as unknown as ProjectionClient,
    repoId,
    projectionType: 'index',
  });

  const recordMetrics = new RecordMetrics({ stores: projectorStores });
  const projector = new RecordProjector({ recordMetrics, stores: projectorStores });

  try {
    const startTime = performance.now();
    const indexData = await projector.computeProjection();

    // Filter out activity events with invalid timestamps (NaN from non-numeric ID prefixes)
    indexData.activityHistory = indexData.activityHistory.filter(
      (ev) => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
    );

    // Set generationTime before persist (computeProjection leaves it at 0 for the caller)
    const computeTime = performance.now() - startTime;
    indexData.metadata.generationTime = computeTime;

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
    console.error(`[runProjection] FAILED repoId=${repoId} error=${msg}`);
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

// ===== DB Helpers =====

/**
 * Deletes all gitgov_* rows for a given repoId (cleanup after tests).
 */
export async function cleanupDb(prisma: PrismaClient, repoId: string): Promise<void> {
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

// ===== Utility =====

/**
 * Reads a record JSON file from .gitgov/{dir}/{id}.json
 */
export function readRecordFile(repoDir: string, dir: string, filename: string): Record<string, unknown> {
  const filePath = path.join(repoDir, '.gitgov', dir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Lists files in .gitgov/{dir}/
 */
export function listRecordFiles(repoDir: string, dir: string): string[] {
  const dirPath = path.join(repoDir, '.gitgov', dir);
  try {
    return fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

// ===== Mock GitHub Helpers =====

type InMemoryFile = { content: string; sha: string };

/**
 * Creates an in-memory Octokit mock that simulates the GitHub Contents API.
 * Files are stored in a Map<path, {content: base64, sha}>.
 * Supports getContent (file + directory), createOrUpdateFileContents, deleteFile.
 *
 * Note: `as unknown as Octokit` is required because Octokit has ~200 methods
 * and we only implement the 3 that GitHubRecordStore uses.
 */
export function createInMemoryOctokit(): { octokit: Octokit; files: Map<string, InMemoryFile> } {
  const files = new Map<string, InMemoryFile>();

  const getContent = async (params: { owner: string; repo: string; path: string; ref?: string }) => {
    const filePath = params.path;

    // Exact file match
    const file = files.get(filePath);
    if (file) {
      return {
        data: {
          type: 'file' as const,
          content: file.content,
          sha: file.sha,
          encoding: 'base64' as const,
          name: filePath.split('/').pop()!,
          path: filePath,
        },
      };
    }

    // Directory listing: find all direct children
    const prefix = filePath.endsWith('/') ? filePath : filePath + '/';
    const entries: Array<{ name: string; type: string; path: string; sha: string }> = [];
    for (const [key, value] of files) {
      if (key.startsWith(prefix)) {
        const relativePath = key.slice(prefix.length);
        if (!relativePath.includes('/')) {
          entries.push({
            name: relativePath,
            type: 'file',
            path: key,
            sha: value.sha,
          });
        }
      }
    }
    if (entries.length > 0) {
      return { data: entries };
    }

    // Not found
    const error = new Error(`Not Found: ${filePath}`) as Error & { status: number };
    error.status = 404;
    throw error;
  };

  const createOrUpdateFileContents = async (params: {
    owner: string; repo: string; path: string; content: string;
    message: string; branch?: string; sha?: string;
  }) => {
    const newSha = createHash('sha1').update(params.content + String(Date.now())).digest('hex');
    files.set(params.path, { content: params.content, sha: newSha });
    return {
      data: {
        content: { sha: newSha },
        commit: { sha: createHash('sha1').update(params.path + String(Date.now())).digest('hex') },
      },
    };
  };

  const deleteFile = async (params: {
    owner: string; repo: string; path: string;
    sha: string; message: string; branch?: string;
  }) => {
    files.delete(params.path);
    return { data: {} };
  };

  const octokit = {
    rest: { repos: { getContent, createOrUpdateFileContents, deleteFile } },
  } as unknown as Octokit;

  return { octokit, files };
}

/**
 * Creates 6 GitHubRecordStore instances backed by an in-memory Octokit mock.
 */
export function createMockGitHubStores(octokit: Octokit): GitHubTestStores {
  const opts = { owner: 'test-org', repo: 'test-repo', ref: 'test-branch' };

  return {
    tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...opts, basePath: '.gitgov/tasks' }, octokit),
    cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...opts, basePath: '.gitgov/cycles' }, octokit),
    feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...opts, basePath: '.gitgov/feedbacks' }, octokit),
    executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...opts, basePath: '.gitgov/executions' }, octokit),
    changelogs: new GitHubRecordStore<GitGovChangelogRecord>({ ...opts, basePath: '.gitgov/changelogs' }, octokit),
    actors: new GitHubRecordStore<GitGovActorRecord>(
      { ...opts, basePath: '.gitgov/actors', idEncoder: DEFAULT_ID_ENCODER },
      octokit,
    ),
  };
}

/**
 * Wires up GitHubRecordStore (mock) → RecordProjector → PrismaRecordProjection.
 */
export async function runMockGitHubProjector(
  prisma: PrismaClient,
  octokit: Octokit,
  repoId: string,
): Promise<IndexGenerationReport> {
  const stores = createMockGitHubStores(octokit);
  // GitHubRecordStore<V> implements RecordStore<V, GitHubWriteResult, GitHubWriteOpts>.
  // RecordProjector only calls get() and list() — the return type of put() (R parameter)
  // is irrelevant. We cast through the stores type to satisfy the projector's dependency.
  const projectorStores = stores as unknown as RecordProjectorDependencies['stores'];
  return runProjection(prisma, projectorStores, repoId);
}
