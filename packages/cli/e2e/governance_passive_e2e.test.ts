/**
 * Governance Passive E2E — Hook-based invisible governance (GP1-GP11)
 *
 * Tests the passive governance workflow: Claude Code hooks pipe JSON
 * to `gitgov hook <subcommand>` via stdin. ExecutionRecords are created
 * automatically without user intervention.
 *
 * REQUIRES: CLI build with hook command (branch epic/skill-gitgov-c3).
 * Tests skip automatically when hook command is not available.
 *
 * IMPORTANT: GP11 (dry-run) requires a bugfix in hook_command.ts
 * to avoid persisting records in dry-run mode.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCliCommand, setupGitgovProject, createGitRepo } from './helpers';

// ── Record reading helpers ────────────────────────────────────────

type ParsedRecord = {
  header: {
    payloadChecksum: string;
    signatures: Array<{ keyId: string; signature: string; timestamp: number }>;
  };
  payload: { id: string; [key: string]: unknown };
};

const listRecords = (repoPath: string, dir: string): string[] => {
  const dirPath = path.join(repoPath, '.gitgov', dir);
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
};

const readRecord = (repoPath: string, dir: string, filename: string): ParsedRecord => {
  return JSON.parse(
    fs.readFileSync(path.join(repoPath, '.gitgov', dir, filename), 'utf-8'),
  ) as ParsedRecord;
};

/** Find the file present in `after` but not in `before` */
const findNewFile = (before: string[], after: string[]): string | undefined => {
  const beforeSet = new Set(before);
  return after.find(f => !beforeSet.has(f));
};

// ── Hook command availability guard ───────────────────────────────

const HAS_HOOK_COMMAND = (() => {
  try {
    const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
    // Commander exits 1 when `hook` is called without a subcommand, even
    // though the command exists. The help text goes to stderr.
    execSync(`node "${cliPath}" hook`, { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (err: unknown) {
    const e = err as { stderr?: string | Buffer };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
    return stderr.includes('command-executed');
  }
})();

// ── Stdin payloads ────────────────────────────────────────────────

const COMMIT_PAYLOAD = JSON.stringify({
  tool_name: 'Bash',
  tool_input: { command: 'git commit -m "feat: add auth module"', description: 'Commit changes' },
  tool_output: '[main abc1234] feat: add auth module\n 3 files changed, 42 insertions(+), 5 deletions(-)',
  exit_code: 0,
});

const TEST_RUN_PAYLOAD = JSON.stringify({
  tool_name: 'Bash',
  tool_input: { command: 'pnpm test', description: 'Run tests' },
  tool_output: 'Tests  12 passed | 1 failed | 13 total\nTime   4.2s',
  exit_code: 0,
});

const TASK_COMPLETED_PAYLOAD = JSON.stringify({
  hook_type: 'TaskCompleted',
  task: { id: '7', subject: 'Implement auth module', status: 'completed', owner: 'dev-agent' },
  session_id: 'e2e-session-001',
});

const SESSION_END_PAYLOAD = JSON.stringify({
  hook_type: 'Stop',
  session_id: 'e2e-session-001',
});

const INVALID_JSON = '{not valid json at all!!!';

// ── Tests ─────────────────────────────────────────────────────────

const describeHook = HAS_HOOK_COMMAND ? describe : describe.skip;

describeHook('Governance Passive E2E (GP1-GP11)', () => {
  let tempDir: string;
  let testProjectRoot: string;
  let worktreeBasePath: string;
  let cleanupFn: () => void;
  let actorId: string;
  let taskId: string;
  let baselineExecCount: number;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-gov-passive-'));
    const setup = setupGitgovProject(tempDir, 'gov-passive');
    testProjectRoot = setup.testProjectRoot;
    worktreeBasePath = setup.worktreeBasePath;
    cleanupFn = setup.cleanup;

    // Extract actorId
    const actorFiles = listRecords(worktreeBasePath, 'actors');
    const actor = readRecord(worktreeBasePath, 'actors', actorFiles[0]!);
    actorId = actor.payload.id;

    // Create and activate a task so HookHandler has activeTaskId
    runCliCommand(
      ['task', 'new', 'Hook test task', '-d', 'Task for passive governance testing', '-p', 'medium', '-q'],
      { cwd: testProjectRoot },
    );
    const taskFiles = listRecords(worktreeBasePath, 'tasks');
    const task = taskFiles
      .map(f => readRecord(worktreeBasePath, 'tasks', f))
      .find(t => t.payload['title'] === 'Hook test task');
    taskId = task!.payload.id;

    runCliCommand(['task', 'submit', taskId, '-q'], { cwd: testProjectRoot });
    runCliCommand(['task', 'approve', taskId, '-q'], { cwd: testProjectRoot });
    runCliCommand(['task', 'assign', taskId, '--to', actorId, '-q'], { cwd: testProjectRoot });
    runCliCommand(['task', 'activate', taskId, '-q'], { cwd: testProjectRoot });

    // Record baseline execution count (before hook events)
    baselineExecCount = listRecords(worktreeBasePath, 'executions').length;
  });

  afterAll(() => {
    cleanupFn();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Skip Conditions (GP1-GP4) ─────────────────────────────────

  describe('4.1. Skip Conditions (GP1-GP4)', () => {
    it('[EARS-GP1] should not create records when GITGOV_PASSIVE is false', () => {
      const execsBefore = listRecords(worktreeBasePath, 'executions').length;

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: testProjectRoot, input: COMMIT_PAYLOAD, env: { GITGOV_PASSIVE: 'false' } },
      );
      expect(result.success).toBe(true);

      const execsAfter = listRecords(worktreeBasePath, 'executions').length;
      expect(execsAfter).toBe(execsBefore);
    });

    it('[EARS-GP2] should not create records when .gitgov does not exist', () => {
      // Create a bare repo without gitgov init
      const bareRepo = path.join(tempDir, 'bare-no-gitgov');
      createGitRepo(bareRepo);

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: bareRepo, input: COMMIT_PAYLOAD },
      );
      expect(result.success).toBe(true);

      // No .gitgov/executions/ should exist
      expect(fs.existsSync(path.join(bareRepo, '.gitgov', 'executions'))).toBe(false);
    });

    it('[EARS-GP3] should not create records when stdin is empty', () => {
      const execsBefore = listRecords(worktreeBasePath, 'executions').length;

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: testProjectRoot, input: '' },
      );
      expect(result.success).toBe(true);

      const execsAfter = listRecords(worktreeBasePath, 'executions').length;
      expect(execsAfter).toBe(execsBefore);
    });

    it('[EARS-GP4] should not create records when stdin JSON is malformed', () => {
      const execsBefore = listRecords(worktreeBasePath, 'executions').length;

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: testProjectRoot, input: INVALID_JSON },
      );
      expect(result.success).toBe(true);

      const execsAfter = listRecords(worktreeBasePath, 'executions').length;
      expect(execsAfter).toBe(execsBefore);
    });
  });

  // ── Record Creation: command-executed (GP5-GP6) ───────────────

  describe('4.2. Record Creation — command-executed (GP5-GP6)', () => {
    it('[EARS-GP5] should create execution record from git commit hook event', () => {
      const filesBefore = listRecords(worktreeBasePath, 'executions');

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: testProjectRoot, input: COMMIT_PAYLOAD },
      );
      expect(result.success).toBe(true);

      const filesAfter = listRecords(worktreeBasePath, 'executions');
      expect(filesAfter.length).toBe(filesBefore.length + 1);

      const newFile = findNewFile(filesBefore, filesAfter)!;
      const record = readRecord(worktreeBasePath, 'executions', newFile);
      expect(record.payload['type']).toBe('completion');
      expect(record.payload['title']).toContain('abc1234');
      expect(record.payload['references']).toEqual(
        expect.arrayContaining([expect.stringContaining('commit:')]),
      );
    });

    it('[EARS-GP6] should create execution record from test runner hook event', () => {
      const filesBefore = listRecords(worktreeBasePath, 'executions');

      const result = runCliCommand(
        ['hook', 'command-executed'],
        { cwd: testProjectRoot, input: TEST_RUN_PAYLOAD },
      );
      expect(result.success).toBe(true);

      const filesAfter = listRecords(worktreeBasePath, 'executions');
      expect(filesAfter.length).toBe(filesBefore.length + 1);

      const newFile = findNewFile(filesBefore, filesAfter)!;
      const record = readRecord(worktreeBasePath, 'executions', newFile);
      expect(record.payload['type']).toBe('analysis');
      expect(record.payload['title']).toBe('Test run');
    });
  });

  // ── Record Creation: task-completed (GP7) ─────────────────────

  describe('4.3. Record Creation — task-completed (GP7)', () => {
    it('[EARS-GP7] should create execution record from task-completed hook event', () => {
      const filesBefore = listRecords(worktreeBasePath, 'executions');

      const result = runCliCommand(
        ['hook', 'task-completed'],
        { cwd: testProjectRoot, input: TASK_COMPLETED_PAYLOAD },
      );
      expect(result.success).toBe(true);

      const filesAfter = listRecords(worktreeBasePath, 'executions');
      expect(filesAfter.length).toBe(filesBefore.length + 1);

      const newFile = findNewFile(filesBefore, filesAfter)!;
      const record = readRecord(worktreeBasePath, 'executions', newFile);
      expect(record.payload['type']).toBe('completion');
      expect(record.payload['title']).toContain('Implement auth module');
      expect(record.payload['references']).toEqual(
        expect.arrayContaining([expect.stringContaining('task:')]),
      );
    });
  });

  // ── Record Creation: session-end (GP8-GP9) ────────────────────

  describe('4.4. Record Creation — session-end (GP8-GP9)', () => {
    // GP9 runs FIRST (while task is still active)
    it('[EARS-GP9] should create session-end record with real taskId when task is active', () => {
      const filesBefore = listRecords(worktreeBasePath, 'executions');

      const result = runCliCommand(
        ['hook', 'session-end'],
        { cwd: testProjectRoot, input: SESSION_END_PAYLOAD },
      );
      expect(result.success).toBe(true);

      const filesAfter = listRecords(worktreeBasePath, 'executions');
      expect(filesAfter.length).toBe(filesBefore.length + 1);

      const newFile = findNewFile(filesBefore, filesAfter)!;
      const record = readRecord(worktreeBasePath, 'executions', newFile);
      expect(record.payload['type']).toBe('analysis');
      expect(record.payload['title']).toBe('Session ended');
      // Should use real activeTaskId, NOT sentinel
      expect(record.payload['taskId']).toBe(taskId);
    });

    // GP8 runs AFTER completing the task (no activeTaskId)
    // NOTE: Execution schema requires a valid taskId and the adapter validates
    // the referenced task exists, so session-end without activeTaskId is skipped.
    // Future protocol amendment could add sentinel support.
    it('[EARS-GP8] should skip session-end record when no active task', () => {
      // Complete the active task so activeTaskId is cleared
      runCliCommand(['task', 'complete', taskId, '-q'], { cwd: testProjectRoot });

      const execsBefore = listRecords(worktreeBasePath, 'executions').length;

      const result = runCliCommand(
        ['hook', 'session-end'],
        { cwd: testProjectRoot, input: SESSION_END_PAYLOAD },
      );
      expect(result.success).toBe(true);

      // No record should be created (no activeTaskId available)
      const execsAfter = listRecords(worktreeBasePath, 'executions').length;
      expect(execsAfter).toBe(execsBefore);
    });
  });

  // ── Integrity (GP10) ──────────────────────────────────────────

  describe('4.5. Integrity (GP10)', () => {
    it('[EARS-GP10] should have valid signatures and checksums on all hook-created records', () => {
      const execFiles = listRecords(worktreeBasePath, 'executions');
      // We created: commit + test + task-completed + session-end (with task) = 4
      // (session-end without task is skipped — no valid taskId)
      const hookRecords = execFiles.slice(baselineExecCount);
      expect(hookRecords.length).toBeGreaterThanOrEqual(4);

      for (const file of hookRecords) {
        const record = readRecord(worktreeBasePath, 'executions', file);

        expect(record.header).toBeDefined();
        expect(record.header.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);
        expect(record.header.signatures.length).toBeGreaterThanOrEqual(1);

        for (const sig of record.header.signatures) {
          expect(sig.keyId).toBeDefined();
          expect(sig.signature).toBeDefined();
          expect(sig.timestamp).toBeDefined();
          expect(typeof sig.timestamp).toBe('number');
        }
      }
    });
  });

  // ── Dry-run (GP11) ────────────────────────────────────────────

  describe('4.6. Dry-run (GP11)', () => {
    it('[EARS-GP11] should output JSON result in dry-run mode without creating records', () => {
      const execsBefore = listRecords(worktreeBasePath, 'executions').length;

      // Need a new active task for dry-run to produce 'recorded' action
      runCliCommand(
        ['task', 'new', 'Dry run task', '-p', 'low', '-q'],
        { cwd: testProjectRoot },
      );
      const taskFiles = listRecords(worktreeBasePath, 'tasks');
      const dryRunTask = taskFiles
        .map(f => readRecord(worktreeBasePath, 'tasks', f))
        .find(t => t.payload['title'] === 'Dry run task');
      const dryRunTaskId = dryRunTask!.payload.id;
      runCliCommand(['task', 'submit', dryRunTaskId, '-q'], { cwd: testProjectRoot });
      runCliCommand(['task', 'approve', dryRunTaskId, '-q'], { cwd: testProjectRoot });
      runCliCommand(['task', 'assign', dryRunTaskId, '--to', actorId, '-q'], { cwd: testProjectRoot });
      runCliCommand(['task', 'activate', dryRunTaskId, '-q'], { cwd: testProjectRoot });

      const result = runCliCommand(
        ['hook', 'command-executed', '--dry-run'],
        { cwd: testProjectRoot, input: COMMIT_PAYLOAD },
      );
      expect(result.success).toBe(true);

      // Should output JSON to stdout
      const output = JSON.parse(result.output);
      expect(output.event_type).toBe('command-executed');
      expect(output.success).toBe(true);

      // Should NOT create records in filesystem
      // NOTE: This assertion requires the dry-run bugfix in hook_command.ts.
      // If it fails, the fix is: don't call handleEvent() in dry-run mode,
      // or pass dryRun flag to HookHandler to skip executionAdapter.create().
      const execsAfter = listRecords(worktreeBasePath, 'executions').length;
      expect(execsAfter).toBe(execsBefore);
    });
  });
});
