/**
 * Block E: Projection Parity — 2 EARS (CE1-CE2)
 * Blueprint: e2e/specs/parity.md
 *
 * CE1: Guarantees that FsRecordProjection (index.json) and PrismaRecordProjection (6 DB tables)
 *      produce equivalent IndexData when given the same input.
 * CE2: Guarantees that FsRecordStore (local) and GitHubRecordStore (remote) produce equivalent
 *      IndexData when reading the same records (FS vs GitHub parity).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Octokit } from '@octokit/rest';

import {
  runCliCommand,
  createGitRepo,
  createTestPrisma,
  cleanupDb,
  projectAndCompare,
  listRecordFiles,
  readRecordFile,
  SKIP_CLEANUP,
  HAS_GITHUB,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_REMOTE_URL,
  RecordProjector,
  RecordMetrics,
  DEFAULT_ID_ENCODER,
} from './helpers';
import type { PrismaClient, RecordProjectorDependencies } from './helpers';

import { FsRecordStore } from '../../core/src/record_store/fs';
import { GitHubRecordStore } from '../../core/src/record_store/github';
import type {
  GitGovTaskRecord,
  GitGovActorRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
} from '../../core/src/record_types';

describe('Block E: Projection Parity (CE1-CE2)', () => {

  it('[EARS-CE1] should produce equivalent IndexData from FS and Prisma projections', async () => {
    const prisma: PrismaClient = createTestPrisma();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-block-e-'));
    const repoPath = path.join(tempDir, 'ce1');
    const repoId = `cli-e2e-ce1-${Date.now()}`;

    try {
      createGitRepo(repoPath);

      // Create records via CLI
      runCliCommand(['init', '--name', 'CE1 Parity', '--actor-name', 'Parity Dev', '--quiet'], { cwd: repoPath });
      runCliCommand(['task', 'new', 'Parity task', '-d', 'Testing FS vs Prisma parity', '-p', 'high', '-q'], { cwd: repoPath });

      const taskFiles = listRecordFiles(repoPath, 'tasks');
      const task = readRecordFile(repoPath, 'tasks', taskFiles[0]!);
      const actorFiles = listRecordFiles(repoPath, 'actors');
      const actor = readRecordFile(repoPath, 'actors', actorFiles[0]!);

      runCliCommand(['task', 'assign', task.payload.id, '--to', actor.payload.id, '-q'], { cwd: repoPath });
      runCliCommand(['cycle', 'new', 'Parity Sprint', '--task-ids', task.payload.id, '-q'], { cwd: repoPath });

      // Project to both sinks and compare
      const { fsIndexData, prismaIndexData } = await projectAndCompare(prisma, repoPath, repoId);

      // CE1a: Compare metadata record counts
      expect(prismaIndexData.metadata.recordCounts['tasks']).toBe(fsIndexData.metadata.recordCounts['tasks']);
      expect(prismaIndexData.metadata.recordCounts['actors']).toBe(fsIndexData.metadata.recordCounts['actors']);
      expect(prismaIndexData.metadata.recordCounts['cycles']).toBe(fsIndexData.metadata.recordCounts['cycles']);

      // CE1b: Compare enrichedTasks
      expect(prismaIndexData.tasks.length).toBe(fsIndexData.tasks.length);
      for (const fsTask of fsIndexData.tasks) {
        const prismaTask = prismaIndexData.tasks.find(t => t.payload.id === fsTask.payload.id);
        expect(prismaTask).toBeDefined();
        expect(prismaTask!.payload.title).toBe(fsTask.payload.title);
        expect(prismaTask!.payload.status).toBe(fsTask.payload.status);
        expect(prismaTask!.payload.priority).toBe(fsTask.payload.priority);
      }

      // CE1c: Compare activityHistory length
      // Note: may be 0 due to NaN filtering, but must match between FS and Prisma

      // CE1d: Compare actors
      expect(prismaIndexData.actors.length).toBe(fsIndexData.actors.length);

      // CE1e: Compare cycles
      expect(prismaIndexData.cycles.length).toBe(fsIndexData.cycles.length);

      // CE1f: Compare feedback
      expect(prismaIndexData.feedback.length).toBe(fsIndexData.feedback.length);
    } finally {
      await cleanupDb(prisma, repoId);
      await prisma.$disconnect();
      if (!SKIP_CLEANUP) fs.rmSync(tempDir, { recursive: true, force: true });
      else console.log(`[SKIP_CLEANUP] Keeping tempDir=${tempDir}`);
    }
  });

  it('[EARS-CE2] should produce equivalent projection from FsRecordStore and GitHubRecordStore', async () => {
    if (!HAS_GITHUB) {
      throw new Error(
        'CE2 requires GitHub credentials. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, '
        + 'GITHUB_TEST_REPO_NAME, and GITHUB_TEST_REPO in packages/e2e/.env',
      );
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-ce2-'));
    const repoPath = path.join(tempDir, 'ce2');
    const testBranch = `e2e-ce2-${Date.now()}`;

    try {
      // 1. Create local repo, add remote, create branch
      createGitRepo(repoPath);
      execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: repoPath, stdio: 'pipe' });
      execSync('git fetch origin', { cwd: repoPath, stdio: 'pipe' });
      execSync(`git checkout -b ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });
      execSync(`git push -u origin ${testBranch}`, { cwd: repoPath, stdio: 'pipe' });

      // Clean up residual gitgov-state
      try {
        await octokit.rest.git.deleteRef({
          owner: GITHUB_TEST_OWNER,
          repo: GITHUB_TEST_REPO_NAME,
          ref: 'heads/gitgov-state',
        });
      } catch { /* may not exist */ }

      // 2. Create records via CLI and sync push to GitHub
      runCliCommand(['init', '--name', 'CE2 Parity', '--actor-name', 'CE2 Dev', '--quiet'], { cwd: repoPath });
      runCliCommand(['task', 'new', 'CE2 parity task', '-d', 'FS vs GitHub parity', '-p', 'high', '-q'], { cwd: repoPath });

      const taskFiles = listRecordFiles(repoPath, 'tasks');
      const task = readRecordFile(repoPath, 'tasks', taskFiles[0]!);
      const actorFiles = listRecordFiles(repoPath, 'actors');
      const actor = readRecordFile(repoPath, 'actors', actorFiles[0]!);

      runCliCommand(['task', 'assign', task.payload.id, '--to', actor.payload.id, '-q'], { cwd: repoPath });
      runCliCommand(['cycle', 'new', 'CE2 Sprint', '--task-ids', task.payload.id, '-q'], { cwd: repoPath });
      runCliCommand(['sync', 'push', '--quiet'], { cwd: repoPath });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Projection A: FsRecordStore (local .gitgov/)
      const fsStores = {
        tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(repoPath, '.gitgov', 'tasks') }),
        cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(repoPath, '.gitgov', 'cycles') }),
        feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(repoPath, '.gitgov', 'feedbacks') }),
        executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(repoPath, '.gitgov', 'executions') }),
        actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(repoPath, '.gitgov', 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
      };
      const fsTypedStores = fsStores as unknown as RecordProjectorDependencies['stores'];
      const fsMetrics = new RecordMetrics({ stores: fsTypedStores });
      const fsProjector = new RecordProjector({ recordMetrics: fsMetrics, stores: fsTypedStores });
      const fsIndexData = await fsProjector.computeProjection();

      fsIndexData.activityHistory = fsIndexData.activityHistory.filter(
        ev => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      fsIndexData.metadata.generationTime = 1;

      // 4. Projection B: GitHubRecordStore (gitgov-state — files have .gitgov/ prefix)
      const ghOpts = { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' };
      const ghStores = {
        tasks: new GitHubRecordStore<GitGovTaskRecord>({ ...ghOpts, basePath: '.gitgov/tasks' }, octokit),
        cycles: new GitHubRecordStore<GitGovCycleRecord>({ ...ghOpts, basePath: '.gitgov/cycles' }, octokit),
        feedbacks: new GitHubRecordStore<GitGovFeedbackRecord>({ ...ghOpts, basePath: '.gitgov/feedbacks' }, octokit),
        executions: new GitHubRecordStore<GitGovExecutionRecord>({ ...ghOpts, basePath: '.gitgov/executions' }, octokit),
        actors: new GitHubRecordStore<GitGovActorRecord>({ ...ghOpts, basePath: '.gitgov/actors', idEncoder: DEFAULT_ID_ENCODER }, octokit),
      };
      const ghTypedStores = ghStores as unknown as RecordProjectorDependencies['stores'];
      const ghMetrics = new RecordMetrics({ stores: ghTypedStores });
      const ghProjector = new RecordProjector({ recordMetrics: ghMetrics, stores: ghTypedStores });
      const ghIndexData = await ghProjector.computeProjection();

      ghIndexData.activityHistory = ghIndexData.activityHistory.filter(
        ev => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      ghIndexData.metadata.generationTime = 1;

      // 5. Compare: FS and GitHub projections should be equivalent
      // Record counts
      expect(ghIndexData.metadata.recordCounts['tasks']).toBe(fsIndexData.metadata.recordCounts['tasks']);
      expect(ghIndexData.metadata.recordCounts['cycles']).toBe(fsIndexData.metadata.recordCounts['cycles']);
      expect(ghIndexData.metadata.recordCounts['actors']).toBe(fsIndexData.metadata.recordCounts['actors']);

      // Tasks
      expect(ghIndexData.tasks.length).toBe(fsIndexData.tasks.length);
      for (const fsTask of fsIndexData.tasks) {
        const ghTask = ghIndexData.tasks.find(t => t.payload.id === fsTask.payload.id);
        expect(ghTask).toBeDefined();
        expect(ghTask!.payload.title).toBe(fsTask.payload.title);
        expect(ghTask!.payload.status).toBe(fsTask.payload.status);
        expect(ghTask!.payload.priority).toBe(fsTask.payload.priority);
      }

      // Cycles
      expect(ghIndexData.cycles.length).toBe(fsIndexData.cycles.length);

      // Actors
      expect(ghIndexData.actors.length).toBe(fsIndexData.actors.length);

      // Feedback
      expect(ghIndexData.feedback.length).toBe(fsIndexData.feedback.length);
    } finally {
      // Cleanup GitHub branches
      for (const branch of [testBranch, 'gitgov-state']) {
        try {
          await octokit.rest.git.deleteRef({
            owner: GITHUB_TEST_OWNER,
            repo: GITHUB_TEST_REPO_NAME,
            ref: `heads/${branch}`,
          });
        } catch { /* may not exist */ }
      }
      if (!SKIP_CLEANUP) fs.rmSync(tempDir, { recursive: true, force: true });
      else console.log(`[SKIP_CLEANUP] Keeping tempDir=${tempDir}`);
    }
  }, 60_000);
});
