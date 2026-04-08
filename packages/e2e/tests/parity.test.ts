/**
 * Block E: Projection Parity — 3 EARS (CE1-CE3)
 * Blueprint: e2e/specs/parity.md
 *
 * CE1: FS (index.json) vs Prisma (9 DB tables) produce equivalent IndexData.
 * CE2: FS (local) vs GitHub (gitgov-state) produce equivalent IndexData.
 * CE3: FS (local) vs GitLab (branch) produce equivalent records.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { Gitlab } from '@gitbeaker/rest';

import {
  runGitgovCli,
  createTempGitRepo,
  createProtocolPrisma,
  cleanupProtocol,
  projectAndCompare,
  listRecordIds,
  readRecord,
  getGitgovDir,
  cleanupWorktree,
  SKIP_CLEANUP,
  GITHUB_TEST_OWNER,
  GITHUB_TEST_REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_REMOTE_URL,
  RecordProjector,
  RecordMetrics,
  DEFAULT_ID_ENCODER,
  FsRecordStore,
  GITLAB_TOKEN,
  GITLAB_TEST_PROJECT_ID,
  createGitHubProjectorStores,
} from './helpers';
import type {
  ProtocolClient,
  RecordProjectorDependencies,
} from './helpers';

export type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovActorRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovAgentRecord,
  IRecordProjector,
  ILintModule,
} from '@gitgov/core';

describe('Block E: Projection Parity (CE1-CE3)', () => {

  it('[CE1] should produce equivalent IndexData from FS and Prisma projections', async () => {
    const prisma: ProtocolClient = createProtocolPrisma();
    const { tmpDir, repoDir } = createTempGitRepo();

    try {
      // Create records via CLI
      runGitgovCli('init --name "CE1 Parity" --actor-name "Parity Dev" --quiet', { cwd: repoDir });
      runGitgovCli('task new "Parity task" -d "Testing FS vs Prisma parity" -p high -q', { cwd: repoDir });

      const taskIds = await listRecordIds(repoDir, 'tasks');
      const task = await readRecord(repoDir, 'tasks', taskIds[0]!);
      const actorIds = await listRecordIds(repoDir, 'actors');
      const actor = await readRecord(repoDir, 'actors', actorIds[0]!);

      runGitgovCli(`task assign ${task.payload.id} --to ${actor.payload.id} -q`, { cwd: repoDir });
      runGitgovCli(`cycle new "Parity Sprint" --task-ids ${task.payload.id} -q`, { cwd: repoDir });

      // Project to both sinks and compare
      const { fsIndexData, prismaIndexData } = await projectAndCompare(prisma, repoDir);

      // CE1a: Compare metadata record counts
      expect(prismaIndexData.metadata.recordCounts['tasks']).toBe(fsIndexData.metadata.recordCounts['tasks']);
      expect(prismaIndexData.metadata.recordCounts['actors']).toBe(fsIndexData.metadata.recordCounts['actors']);
      expect(prismaIndexData.metadata.recordCounts['cycles']).toBe(fsIndexData.metadata.recordCounts['cycles']);

      // CE1b: Compare tasks
      expect(prismaIndexData.tasks.length).toBe(fsIndexData.tasks.length);
      for (const fsTask of fsIndexData.tasks) {
        const prismaTask = prismaIndexData.tasks.find(t => t.payload.id === fsTask.payload.id);
        expect(prismaTask).toBeDefined();
        expect(prismaTask!.payload.title).toBe(fsTask.payload.title);
        expect(prismaTask!.payload.status).toBe(fsTask.payload.status);
        expect(prismaTask!.payload.priority).toBe(fsTask.payload.priority);
      }

      // CE1c: Compare actors
      expect(prismaIndexData.actors.length).toBe(fsIndexData.actors.length);

      // CE1d: Compare cycles
      expect(prismaIndexData.cycles.length).toBe(fsIndexData.cycles.length);

      // CE1e: Compare feedback
      expect(prismaIndexData.feedback.length).toBe(fsIndexData.feedback.length);
    } finally {
      cleanupWorktree(repoDir);
      await cleanupProtocol(prisma);
      await prisma.$disconnect();
      if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('[CE2] should produce equivalent projection from FsRecordStore and GitHubRecordStore', async () => {
    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const { tmpDir, repoDir } = createTempGitRepo();
    const testBranch = `e2e-ce2-${Date.now()}`;

    try {
      // 1. Add remote, create branch
      execSync(`git remote add origin "${GITHUB_REMOTE_URL}"`, { cwd: repoDir, stdio: 'pipe' });
      execSync('git fetch origin', { cwd: repoDir, stdio: 'pipe' });
      execSync(`git checkout -b ${testBranch}`, { cwd: repoDir, stdio: 'pipe' });
      execSync(`git push -u origin ${testBranch}`, { cwd: repoDir, stdio: 'pipe' });

      // Clean up residual gitgov-state
      try {
        await octokit.rest.git.deleteRef({
          owner: GITHUB_TEST_OWNER,
          repo: GITHUB_TEST_REPO_NAME,
          ref: 'heads/gitgov-state',
        });
      } catch { /* may not exist */ }

      // 2. Create records via CLI and sync push to GitHub
      runGitgovCli('init --name "CE2 Parity" --actor-name "CE2 Dev" --quiet', { cwd: repoDir });
      runGitgovCli('task new "CE2 parity task" -d "FS vs GitHub parity" -p high -q', { cwd: repoDir });

      const taskIds = await listRecordIds(repoDir, 'tasks');
      const task = await readRecord(repoDir, 'tasks', taskIds[0]!);
      const actorIds = await listRecordIds(repoDir, 'actors');
      const actor = await readRecord(repoDir, 'actors', actorIds[0]!);

      runGitgovCli(`task assign ${task.payload.id} --to ${actor.payload.id} -q`, { cwd: repoDir });
      runGitgovCli(`cycle new "CE2 Sprint" --task-ids ${task.payload.id} -q`, { cwd: repoDir });
      runGitgovCli('sync push --quiet', { cwd: repoDir });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Projection A: FsRecordStore (worktree .gitgov/)
      const gitgovDir = getGitgovDir(repoDir);
      const fsStores = {
        tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(gitgovDir, 'tasks') }),
        cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(gitgovDir, 'cycles') }),
        feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(gitgovDir, 'feedbacks') }),
        executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(gitgovDir, 'executions') }),
        actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(gitgovDir, 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
        agents: new FsRecordStore<GitGovAgentRecord>({ basePath: path.join(gitgovDir, 'agents'), idEncoder: DEFAULT_ID_ENCODER }),
      };
      const fsTypedStores = fsStores as unknown as RecordProjectorDependencies['stores'];
      const fsMetrics = new RecordMetrics({ stores: fsTypedStores });
      const fsProjector = new RecordProjector({ recordMetrics: fsMetrics, stores: fsTypedStores });
      const fsIndexData = await fsProjector.computeProjection();

      fsIndexData.activityHistory = fsIndexData.activityHistory.filter(
        ev => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      fsIndexData.metadata.generationTime = 1;

      // 4. Projection B: GitHubRecordStore (gitgov-state)
      const ghStores = createGitHubProjectorStores(octokit, { owner: GITHUB_TEST_OWNER, repo: GITHUB_TEST_REPO_NAME, ref: 'gitgov-state' });
      const ghMetrics = new RecordMetrics({ stores: ghStores });
      const ghProjector = new RecordProjector({ recordMetrics: ghMetrics, stores: ghStores });
      const ghIndexData = await ghProjector.computeProjection();

      ghIndexData.activityHistory = ghIndexData.activityHistory.filter(
        ev => typeof ev.timestamp === 'number' && !isNaN(ev.timestamp) && ev.timestamp > 0,
      );
      ghIndexData.metadata.generationTime = 1;

      // 5. Compare: FS and GitHub projections should be equivalent
      expect(ghIndexData.metadata.recordCounts['tasks']).toBe(fsIndexData.metadata.recordCounts['tasks']);
      expect(ghIndexData.metadata.recordCounts['cycles']).toBe(fsIndexData.metadata.recordCounts['cycles']);
      expect(ghIndexData.metadata.recordCounts['actors']).toBe(fsIndexData.metadata.recordCounts['actors']);

      expect(ghIndexData.tasks.length).toBe(fsIndexData.tasks.length);
      for (const fsTask of fsIndexData.tasks) {
        const ghTask = ghIndexData.tasks.find(t => t.payload.id === fsTask.payload.id);
        expect(ghTask).toBeDefined();
        expect(ghTask!.payload.title).toBe(fsTask.payload.title);
        expect(ghTask!.payload.status).toBe(fsTask.payload.status);
        expect(ghTask!.payload.priority).toBe(fsTask.payload.priority);
      }

      expect(ghIndexData.cycles.length).toBe(fsIndexData.cycles.length);
      expect(ghIndexData.actors.length).toBe(fsIndexData.actors.length);
      expect(ghIndexData.feedback.length).toBe(fsIndexData.feedback.length);
    } finally {
      for (const branch of [testBranch, 'gitgov-state']) {
        try {
          await octokit.rest.git.deleteRef({
            owner: GITHUB_TEST_OWNER,
            repo: GITHUB_TEST_REPO_NAME,
            ref: `heads/${branch}`,
          });
        } catch { /* may not exist */ }
      }
      cleanupWorktree(repoDir);
      if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(!GITLAB_TOKEN || !GITLAB_TEST_PROJECT_ID)('[CE3] should produce equivalent records from FsRecordStore and GitLab API', async () => {
    const api = new Gitlab({ token: GITLAB_TOKEN });
    const projectId = Number(GITLAB_TEST_PROJECT_ID);
    const { tmpDir, repoDir } = createTempGitRepo();
    const testBranch = `e2e-ce3-${Date.now()}`;

    try {
      // 1. Create records via CLI
      runGitgovCli('init --name "CE3 Parity" --actor-name "CE3 Dev" --quiet', { cwd: repoDir });
      runGitgovCli('task new "CE3 parity task" -d "FS vs GitLab parity" -p high -q', { cwd: repoDir });

      // 2. Read records from FS
      const gitgovDir = getGitgovDir(repoDir);
      const taskIds = await listRecordIds(repoDir, 'tasks');
      const actorIds = await listRecordIds(repoDir, 'actors');
      const fsTaskRecords = await Promise.all(taskIds.map(id => readRecord(repoDir, 'tasks', id)));
      const fsTasks = taskIds;
      const fsActors = actorIds;

      // 3. Push records to GitLab via Commits API
      await api.Branches.create(projectId, testBranch, 'main');

      const actions: Array<{ action: 'create'; file_path: string; content: string; encoding: 'base64' }> = [];

      for (const dir of ['tasks', 'actors', 'cycles', 'feedbacks', 'executions']) {
        const dirPath = path.join(gitgovDir, dir);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath)) {
          if (!file.endsWith('.json')) continue;
          const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
          actions.push({
            action: 'create',
            file_path: `.gitgov/${dir}/${file}`,
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
          });
        }
      }

      const configPath = path.join(gitgovDir, 'config.json');
      if (fs.existsSync(configPath)) {
        actions.push({
          action: 'create',
          file_path: '.gitgov/config.json',
          content: Buffer.from(fs.readFileSync(configPath, 'utf-8')).toString('base64'),
          encoding: 'base64',
        });
      }

      await api.Commits.create(projectId, testBranch, 'CE3: push all .gitgov/ records', actions);

      // 4. Read records back from GitLab
      const glTaskFiles = await api.Repositories.allRepositoryTrees(projectId, {
        path: '.gitgov/tasks',
        ref: testBranch,
      } as Parameters<typeof api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ name: string; type: string }>;

      const glTasks = glTaskFiles.filter(f => f.type === 'blob' && f.name.endsWith('.json'));

      const glTaskRecords = await Promise.all(
        glTasks.map(async (f) => {
          const file = await api.RepositoryFiles.show(projectId, `.gitgov/tasks/${f.name}`, testBranch);
          return JSON.parse(Buffer.from(String(file.content), 'base64').toString('utf-8'));
        }),
      );

      const glActorFiles = await api.Repositories.allRepositoryTrees(projectId, {
        path: '.gitgov/actors',
        ref: testBranch,
      } as Parameters<typeof api.Repositories.allRepositoryTrees>[1]) as unknown as Array<{ name: string; type: string }>;

      const glActors = glActorFiles.filter(f => f.type === 'blob' && f.name.endsWith('.json'));

      // 5. Compare: FS and GitLab should have identical records
      expect(glTasks.length).toBe(fsTasks.length);
      expect(glActors.length).toBe(fsActors.length);

      for (const fsTask of fsTaskRecords) {
        const glTask = glTaskRecords.find((t: { payload: { id: string } }) => t.payload.id === fsTask.payload.id);
        expect(glTask).toBeDefined();
        expect(glTask.payload.title).toBe(fsTask.payload.title);
        expect(glTask.payload.status).toBe(fsTask.payload.status);
        expect(glTask.payload.priority).toBe(fsTask.payload.priority);
      }
    } finally {
      try {
        await api.Branches.remove(projectId, testBranch);
      } catch { /* may not exist */ }
      cleanupWorktree(repoDir);
      if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 120_000);
});
