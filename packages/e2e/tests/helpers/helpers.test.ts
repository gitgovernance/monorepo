/**
 * E2E Helpers Unit Tests — HLP-A1 to HLP-D2
 * Spec: e2e/specs/helpers.md
 *
 * Verifies that each helper works correctly in isolation.
 * These tests require: CLI binary built, PostgreSQL running, git available.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  runGitgovCli,
  createTempGitRepo,
  cleanupWorktree,
  createTestPrisma,
  cleanupDb,
  getGitgovDir,
  listRecordIds,
  readRecord,
  SKIP_CLEANUP,
  FsRecordStore,
  DEFAULT_ID_ENCODER,
} from './index';
import { Factories, generateTaskId } from '@gitgov/core';
import type { GitGovTaskRecord } from '@gitgov/core';

// Temp dirs to clean up
const tempDirs: string[] = [];

afterAll(() => {
  if (!SKIP_CLEANUP) {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('E2E Helpers', () => {

  describe('4.1. CLI Helpers (HLP-A1 to HLP-A3)', () => {

    it('[HLP-A1] should execute gitgov --version and return success', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      const result = runGitgovCli('--version', { cwd: repoDir });
      expect(result.success).toBe(true);
      expect(result.output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('[HLP-A2] should create git repo with .git/ directory and initial commit', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      expect(fs.existsSync(path.join(repoDir, '.git'))).toBe(true);

      const { execSync } = require('child_process');
      const log = execSync('git log --oneline', { cwd: repoDir, encoding: 'utf-8' });
      expect(log.trim().length).toBeGreaterThan(0);
    });

    it('[HLP-A3] should remove worktree directory after cleanup', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name CleanupTest --actor-name Dev -q', { cwd: repoDir });

      const gitgovDir = getGitgovDir(repoDir);
      expect(fs.existsSync(gitgovDir)).toBe(true);

      cleanupWorktree(repoDir);

      expect(fs.existsSync(gitgovDir)).toBe(false);
    });
  });

  describe('4.2. Prisma Helpers (HLP-B1 to HLP-B3)', () => {

    it('[HLP-B1] should connect to PostgreSQL and return a working PrismaClient', async () => {
      const prisma = createTestPrisma();
      try {
        // Verify connection works by executing a real query
        const count = await prisma.gitgovTask.count();
        expect(typeof count).toBe('number');
      } finally {
        await prisma.$disconnect();
      }
    });

    it('[HLP-B2] should delete all rows from all 9 protocol tables', async () => {
      const prisma = createTestPrisma();
      try {
        await cleanupDb(prisma);

        const tasks = await prisma.gitgovTask.findMany({});
        const actors = await prisma.gitgovActor.findMany({});
        const meta = await prisma.gitgovMeta.findFirst({});

        expect(tasks).toHaveLength(0);
        expect(actors).toHaveLength(0);
        expect(meta).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });

    it('[HLP-B3] should compute projection and persist to DB without errors', async () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name PrismaTest --actor-name Dev -q', { cwd: repoDir });
      runGitgovCli('task new "Test task" -p high -q', { cwd: repoDir });

      const prisma = createTestPrisma();
      try {
        await cleanupDb(prisma);

        const { runProjector } = await import('./prisma');
        const report = await runProjector(prisma, repoDir);

        expect(report.success).toBe(true);
        expect(report.errors).toHaveLength(0);

        const tasks = await prisma.gitgovTask.findMany({});
        expect(tasks.length).toBeGreaterThanOrEqual(1);
      } finally {
        cleanupWorktree(repoDir);
        await cleanupDb(prisma);
        await prisma.$disconnect();
      }
    });
  });

  describe('4.3. FS Helpers (HLP-C1 to HLP-C2)', () => {

    it('[HLP-C1] should resolve gitgov dir to worktree path containing .gitgov', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name FsTest --actor-name Dev -q', { cwd: repoDir });

      const gitgovDir = getGitgovDir(repoDir);
      expect(fs.existsSync(gitgovDir)).toBe(true);
      expect(fs.existsSync(path.join(gitgovDir, 'config.json'))).toBe(true);

      cleanupWorktree(repoDir);
    });

    it('[HLP-C2] should read and parse a JSON record from .gitgov/ directory', async () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name ReadTest --actor-name Dev -q', { cwd: repoDir });
      runGitgovCli('task new "Read task" -p medium -q', { cwd: repoDir });

      const taskIds = await listRecordIds(repoDir, 'tasks');
      expect(taskIds.length).toBeGreaterThanOrEqual(1);

      const record = await readRecord(repoDir, 'tasks', taskIds[0]!);
      expect(record).toBeDefined();
      expect(record.payload).toBeDefined();
      expect(record.payload.title).toBe('Read task');

      cleanupWorktree(repoDir);
    });
  });

  describe('4.4. Data Creation Rules (HLP-D1 to HLP-D2)', () => {

    it('[HLP-D1] should create record with valid ID format using core factory', async () => {
      const taskId = generateTaskId('test', Math.floor(Date.now() / 1000));
      expect(taskId).toMatch(/^\d{10}-task-[a-z0-9-]+$/);

      const exec = await Factories.createExecutionRecord({
        taskId,
        type: 'analysis',
        title: 'Factory test',
        result: 'Validates that factory produces valid IDs',
      });
      expect(exec.id).toMatch(/^\d{10}-exec-[a-z0-9-]+$/);
    });

    it('[HLP-D2] should create records via CLI command not direct filesystem write', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name CliCreate --actor-name Dev -q', { cwd: repoDir });

      const result = runGitgovCli('task new "CLI created task" -p high -q', { cwd: repoDir });
      expect(result.success).toBe(true);

      const gitgovDir = getGitgovDir(repoDir);
      const tasksDir = path.join(gitgovDir, 'tasks');
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      expect(taskFiles.length).toBeGreaterThanOrEqual(1);

      const taskContent = JSON.parse(fs.readFileSync(path.join(tasksDir, taskFiles[0]!), 'utf-8'));
      expect(taskContent.payload.id).toMatch(/^\d{10}-task-/);

      cleanupWorktree(repoDir);
    });
  });
});
