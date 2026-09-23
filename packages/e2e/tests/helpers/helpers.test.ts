/**
 * E2E Helpers Unit Tests — HLP-A1 to HLP-D2
 * Spec: e2e/specs/helpers.md
 *
 * Verifies that each helper works correctly in isolation.
 * These tests require: CLI binary built, PostgreSQL running, git available.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  runGitgovCli,
  spawnGitgovCli,
  resolveGitgovCli,
  CHECKOUT_ROOT,
  CHECKOUT_CLI_BIN,
  GITGOV_CLI_BIN_ENV,
  createTempGitRepo,
  cleanupWorktree,
  createProtocolPrisma,
  cleanupProtocol,
  runProjector,
  getGitgovDir,
  listRecordIds,
  readRecord,
  SKIP_CLEANUP,
  FsRecordStore,
  DEFAULT_ID_ENCODER,
  E2E_SOURCE_COMMIT_LABEL,
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

  describe('4.1. CLI Helpers (HLP-A1 to HLP-A7)', () => {

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

    it('[HLP-A4] should spawn gitgov CLI and resolve waitForOutput when output matches', async () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      const cli = spawnGitgovCli('--version', { cwd: repoDir });
      const output = await cli.waitForOutput(/\d+\.\d+\.\d+/, 5000);
      expect(output).toMatch(/\d+\.\d+\.\d+/);

      const result = await cli.waitForExit(5000);
      expect(result.exitCode).toBe(0);
    });

    /**
     * A `gitgov` placed first on PATH that answers a version no real CLI prints. A helper that
     * runs whatever `gitgov` the shell finds gets this answer; one that runs the checkout build
     * does not.
     */
    const IMPOSTOR_VERSION = '0.0.0-path-impostor';
    const pathWithImpostor = (): string => {
      const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-impostor-'));
      tempDirs.push(binDir);
      const impostor = path.join(binDir, 'gitgov');
      fs.writeFileSync(impostor, `#!/bin/sh\necho "${IMPOSTOR_VERSION}"\n`);
      fs.chmodSync(impostor, 0o755);
      return `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}`;
    };

    it('[HLP-A1] should run the checkout CLI even when another gitgov comes first on PATH', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);
      const env = { PATH: pathWithImpostor() };

      // ANTI-VACUITY: with this PATH the shell really resolves `gitgov` to the impostor, so a
      // version that is not the impostor's can only come from a binary chosen another way.
      const viaPath = execSync('gitgov --version', { cwd: repoDir, encoding: 'utf8', env: { ...process.env, ...env } });
      expect(viaPath.trim()).toBe(IMPOSTOR_VERSION);

      const result = runGitgovCli('--version', { cwd: repoDir, env });
      expect(result.output, `runGitgovCli ran the PATH impostor instead of ${CHECKOUT_CLI_BIN}`).not.toContain(IMPOSTOR_VERSION);
      expect(result.output).toMatch(/\d+\.\d+\.\d+/);
    });

    it('[HLP-A4] should spawn the checkout CLI even when another gitgov comes first on PATH', async () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      const cli = spawnGitgovCli('--version', { cwd: repoDir, env: { PATH: pathWithImpostor() } });
      const result = await cli.waitForExit(10000);

      expect(result.stdout, `spawnGitgovCli ran the PATH impostor instead of ${CHECKOUT_CLI_BIN}`).not.toContain(IMPOSTOR_VERSION);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(result.exitCode).toBe(0);
    });

    it('[HLP-A5] should resolve the checkout build by default and honor GITGOV_CLI_BIN with its realpath', () => {
      const checkout = resolveGitgovCli({});
      expect(checkout.source).toBe('checkout');
      expect(checkout.bin).toBe(path.join(CHECKOUT_ROOT, 'packages', 'cli', 'build', 'dist', 'gitgov.mjs'));
      expect(checkout.insideCheckout).toBe(true);

      // An override outside the checkout, reached through a symlink: the realpath is the file the
      // symlink points at, and it does not lie inside the checkout.
      const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-other-checkout-')));
      tempDirs.push(elsewhere);
      const target = path.join(elsewhere, 'gitgov.mjs');
      fs.writeFileSync(target, '');
      const link = path.join(elsewhere, 'gitgov-link.mjs');
      fs.symlinkSync(target, link);

      const override = resolveGitgovCli({ [GITGOV_CLI_BIN_ENV]: link });
      expect(override).toEqual({ bin: link, realpath: target, source: 'GITGOV_CLI_BIN', insideCheckout: false });
    });

    it('[HLP-A6] should run the checkout binary with the caller env merged, even when that env\'s PATH puts an impostor gitgov first', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      // A preload that runs inside the CLI's own node process and writes down what that process
      // sees: which script it is running and the two keys under test. It only runs if the
      // caller's NODE_OPTIONS reached the process, so its file is itself proof the env arrived.
      const probeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hlp-a6-probe-')));
      tempDirs.push(probeDir);
      const probe = path.join(probeDir, 'probe.cjs');
      const probeOut = path.join(probeDir, 'seen.json');
      fs.writeFileSync(probe, [
        `require('fs').writeFileSync(process.env.HLP_A6_PROBE_OUT, JSON.stringify({`,
        `  script: process.argv[1],`,
        `  key: process.env.HLP_A6_KEY ?? null,`,
        `  inherited: process.env.HLP_A6_INHERITED ?? null,`,
        `}));`,
      ].join('\n'));

      // Both keys exist in the parent: HLP_A6_KEY is also passed by the caller (the caller must
      // win), HLP_A6_INHERITED is not (it must survive the merge).
      const saved = { key: process.env['HLP_A6_KEY'], inherited: process.env['HLP_A6_INHERITED'] };
      process.env['HLP_A6_KEY'] = 'from-parent';
      process.env['HLP_A6_INHERITED'] = 'from-parent';
      try {
        const env = {
          PATH: pathWithImpostor(),
          NODE_OPTIONS: `--require "${probe}"`,
          HLP_A6_PROBE_OUT: probeOut,
          HLP_A6_KEY: 'from-caller',
        };

        // ANTI-VACUITY: this env's PATH really resolves `gitgov` to the impostor.
        const viaPath = execSync('gitgov --version', { cwd: repoDir, encoding: 'utf8', env: { ...process.env, PATH: env.PATH } });
        expect(viaPath.trim()).toBe(IMPOSTOR_VERSION);

        const result = runGitgovCli('--version', { cwd: repoDir, env });
        expect(result.output, `runGitgovCli resolved gitgov through the env's PATH instead of running ${CHECKOUT_CLI_BIN}`).not.toContain(IMPOSTOR_VERSION);
        expect(result.output).toMatch(/\d+\.\d+\.\d+/);

        expect(fs.existsSync(probeOut), 'the caller env (NODE_OPTIONS) never reached the CLI process').toBe(true);
        const seen = JSON.parse(fs.readFileSync(probeOut, 'utf8')) as { script: string; key: string | null; inherited: string | null };
        expect(fs.realpathSync(seen.script), 'the env was applied to a binary other than the one HLP-A1 runs').toBe(resolveGitgovCli().realpath);
        expect(seen.key, 'an inherited key won over the caller\'s').toBe('from-caller');
        expect(seen.inherited, 'the caller env replaced the inherited environment instead of merging over it').toBe('from-parent');
      } finally {
        if (saved.key === undefined) delete process.env['HLP_A6_KEY']; else process.env['HLP_A6_KEY'] = saved.key;
        if (saved.inherited === undefined) delete process.env['HLP_A6_INHERITED']; else process.env['HLP_A6_INHERITED'] = saved.inherited;
      }
    });

    it('[HLP-A7] should return the real exit code: 0 on success, the process status on failure, null when killed by the timeout', () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      expect(runGitgovCli('--version', { cwd: repoDir }).exitCode).toBe(0);

      // Measured 2026-09-23 on the checkout build: an unknown option exits 1.
      const failed = runGitgovCli('--no-such-option', { cwd: repoDir, expectError: true });
      expect(failed.exitCode).toBe(1);

      // The CLI itself only exits 0 or 1. A status other than 1 comes from the process the helper
      // spawns: node rejects a flag in NODE_OPTIONS and exits 9 before the CLI runs. A helper that
      // reports every failure as 1 cannot pass this.
      const rejected = runGitgovCli('--version', { cwd: repoDir, expectError: true, env: { NODE_OPTIONS: '--no-such-node-flag' } });
      expect(rejected.exitCode).toBe(9);

      // `success` says nothing under expectError: it is false on a clean exit too. Only exitCode
      // tells the two apart.
      const succeeded = runGitgovCli('--version', { cwd: repoDir, expectError: true });
      expect(succeeded.success).toBe(false);
      expect(succeeded.exitCode).toBe(0);

      // Killed by the helper's own timeout: there is no exit status.
      const killed = runGitgovCli('--version', { cwd: repoDir, expectError: true, timeout: 1 });
      expect(killed.exitCode).toBeNull();
    });
  });

  describe('4.2. Prisma Helpers (HLP-B1 to HLP-B3)', () => {

    it('[HLP-B1] should connect to PostgreSQL and return a working PrismaClient', async () => {
      const prisma = createProtocolPrisma();
      try {
        // Verify connection works by executing a real query
        const count = await prisma.gitgovTask.count();
        expect(typeof count).toBe('number');
      } finally {
        await prisma.$disconnect();
      }
    });

    it('[HLP-B2] should delete all rows from all 9 protocol tables', async () => {
      const prisma = createProtocolPrisma();
      try {
        await cleanupProtocol(prisma);

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

      const prisma = createProtocolPrisma();
      try {
        await cleanupProtocol(prisma);

        const report = await runProjector(prisma, repoDir);

        expect(report.success).toBe(true);
        expect(report.errors).toHaveLength(0);

        const tasks = await prisma.gitgovTask.findMany({});
        expect(tasks.length).toBeGreaterThanOrEqual(1);
      } finally {
        cleanupWorktree(repoDir);
        await cleanupProtocol(prisma);
        await prisma.$disconnect();
      }
    });

    // Additional e2e coverage for PP-C3b, whose unit vertex lives in
    // core/src/record_projection/prisma/prisma_record_projection.test.ts.
    //
    // The unit test proves persist() writes the value it is handed. This one proves the value
    // SURVIVES the real pipeline, and that is a different claim: `computeProjection()` and
    // `persist()` receive the provenance through separate parameters, so a helper that passed one
    // and forgot the other would still project successfully and write the wrong sourceCommitSha.
    // Nothing else in this package reads the column back, so without this assertion
    // E2E_SOURCE_COMMIT_LABEL is decorative and that drift lands green.
    it('[PP-C3b] should stamp every projected row with the provenance label the helper used', async () => {
      const { tmpDir, repoDir } = createTempGitRepo();
      tempDirs.push(tmpDir);

      runGitgovCli('init --name ProvenanceTest --actor-name Dev -q', { cwd: repoDir });
      runGitgovCli('task new "Provenance task" -p high -q', { cwd: repoDir });

      const prisma = createProtocolPrisma();
      try {
        await cleanupProtocol(prisma);
        const report = await runProjector(prisma, repoDir);
        expect(report.success).toBe(true);

        const tasks = await prisma.gitgovTask.findMany({});
        const actors = await prisma.gitgovActor.findMany({});

        // Anti-vacuity: with zero rows every `every()` below is trivially true.
        expect(tasks.length).toBeGreaterThanOrEqual(1);
        expect(actors.length).toBeGreaterThanOrEqual(1);

        for (const row of [...tasks, ...actors]) {
          expect(row.sourceCommitSha).toBe(E2E_SOURCE_COMMIT_LABEL);
        }
      } finally {
        cleanupWorktree(repoDir);
        await cleanupProtocol(prisma);
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
