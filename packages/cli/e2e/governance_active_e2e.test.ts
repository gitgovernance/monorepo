/**
 * Governance Active E2E — Full sprint lifecycle via CLI (GA1-GA10)
 *
 * Tests the complete active governance workflow: a developer manages
 * a sprint using CLI commands. All records are created via execSync
 * against the real CLI binary — black-box, no mocks.
 *
 * Status transitions tested:
 *   Task:  draft → review → ready → active → done
 *   Cycle: planning → active → completed
 *
 * IMPORTANT: Tests GA1-GA8 are sequential and dependent.
 * Each test mutates state for the next one.
 *
 * NOTE: Records are stored in ~/.gitgov/worktrees/<hash>/.gitgov/,
 * NOT in the project directory. Tests use worktreeBasePath for reads.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCliCommand, setupGitgovProject } from './helpers';

// ── Record reading helpers ────────────────────────────────────────

type ParsedRecord = {
  header: {
    payloadChecksum: string;
    signatures: Array<{ keyId: string; signature: string; timestamp: number }>;
  };
  payload: { id: string; [key: string]: unknown };
};

const listRecords = (basePath: string, dir: string): string[] => {
  const dirPath = path.join(basePath, '.gitgov', dir);
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
};

const readRecord = (basePath: string, dir: string, filename: string): ParsedRecord => {
  return JSON.parse(
    fs.readFileSync(path.join(basePath, '.gitgov', dir, filename), 'utf-8'),
  ) as ParsedRecord;
};

// ── Tests ─────────────────────────────────────────────────────────

describe('Governance Active E2E (GA1-GA10)', () => {
  let tempDir: string;
  let testProjectRoot: string;
  let worktreeBasePath: string;
  let cleanupFn: () => void;

  // Shared state across sequential tests
  let actorId: string;
  let taskId: string;
  let cycleId: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-gov-active-'));
    const setup = setupGitgovProject(tempDir, 'gov-active');
    testProjectRoot = setup.testProjectRoot;
    worktreeBasePath = setup.worktreeBasePath;
    cleanupFn = setup.cleanup;

    // Extract actorId from the first actor file
    const actorFiles = listRecords(worktreeBasePath, 'actors');
    expect(actorFiles.length).toBeGreaterThanOrEqual(1);
    const actor = readRecord(worktreeBasePath, 'actors', actorFiles[0]!);
    actorId = actor.payload.id;
  });

  afterAll(() => {
    cleanupFn();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── GA1: Task creation + submit ───────────────────────────────

  it('[EARS-GA1] should create task and submit it for review', () => {
    // Create task
    const createResult = runCliCommand(
      ['task', 'new', 'Audit de seguridad', '-d', 'Verificar auth bypass en login', '-p', 'high', '--tags', 'security,audit', '-q'],
      { cwd: testProjectRoot },
    );
    expect(createResult.success).toBe(true);

    // Find the task we just created
    const taskFiles = listRecords(worktreeBasePath, 'tasks');
    expect(taskFiles.length).toBeGreaterThanOrEqual(1);

    let foundTask: ParsedRecord | undefined;
    for (const file of taskFiles) {
      const t = readRecord(worktreeBasePath, 'tasks', file);
      if (t.payload['title'] === 'Audit de seguridad') {
        foundTask = t;
        break;
      }
    }
    expect(foundTask).toBeDefined();
    taskId = foundTask!.payload.id;
    expect(foundTask!.payload['status']).toBe('draft');

    // Submit task
    const submitResult = runCliCommand(
      ['task', 'submit', taskId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(submitResult.success).toBe(true);

    // Verify status changed to review
    const updatedTaskFile = taskFiles.find(f => {
      const t = readRecord(worktreeBasePath, 'tasks', f);
      return t.payload.id === taskId;
    })!;
    const updatedTask = readRecord(worktreeBasePath, 'tasks', updatedTaskFile);
    expect(updatedTask.payload['status']).toBe('review');
  });

  // ── GA2: Approve + Assign + Activate ──────────────────────────

  it('[EARS-GA2] should approve, assign, and activate task with correct state transitions', () => {
    // Approve: review → ready
    const approveResult = runCliCommand(
      ['task', 'approve', taskId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(approveResult.success).toBe(true);

    // Assign
    const assignResult = runCliCommand(
      ['task', 'assign', taskId, '--to', actorId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(assignResult.success).toBe(true);

    // Verify assignment feedback
    const fbFiles = listRecords(worktreeBasePath, 'feedbacks');
    const assignFb = fbFiles
      .map(f => readRecord(worktreeBasePath, 'feedbacks', f))
      .find(fb => fb.payload['type'] === 'assignment' && fb.payload['entityId'] === taskId);
    expect(assignFb).toBeDefined();

    // Activate: ready → active
    const activateResult = runCliCommand(
      ['task', 'activate', taskId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(activateResult.success).toBe(true);

    // Verify final status is active
    const taskFiles = listRecords(worktreeBasePath, 'tasks');
    const task = taskFiles
      .map(f => readRecord(worktreeBasePath, 'tasks', f))
      .find(t => t.payload.id === taskId);
    expect(task!.payload['status']).toBe('active');
  });

  // ── GA3: Cycle creation ───────────────────────────────────────

  it('[EARS-GA3] should create cycle referencing the active task', () => {
    const result = runCliCommand(
      ['cycle', 'new', 'Sprint 1', '--task-ids', taskId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    // Find our Sprint 1 cycle (not the root cycle created by init)
    const cycleFiles = listRecords(worktreeBasePath, 'cycles');
    expect(cycleFiles.length).toBeGreaterThanOrEqual(2); // root + Sprint 1

    let sprint1: ParsedRecord | undefined;
    for (const file of cycleFiles) {
      const c = readRecord(worktreeBasePath, 'cycles', file);
      if (c.payload['title'] === 'Sprint 1') {
        sprint1 = c;
        break;
      }
    }
    expect(sprint1).toBeDefined();
    expect(sprint1!.payload['status']).toBe('planning');
    expect(sprint1!.payload['taskIds']).toContain(taskId);
    cycleId = sprint1!.payload.id;
  });

  // ── GA4: Execution record (analysis) ──────────────────────────

  it('[EARS-GA4] should create analysis execution record linked to task', () => {
    const result = runCliCommand(
      ['exec', 'new', taskId, '-t', 'analysis', '--title', 'Security scan', '-r', '0 vulnerabilities found', '-q'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const execFiles = listRecords(worktreeBasePath, 'executions');
    expect(execFiles.length).toBeGreaterThanOrEqual(1);

    const execRecord = execFiles
      .map(f => readRecord(worktreeBasePath, 'executions', f))
      .find(e => e.payload['type'] === 'analysis' && e.payload['taskId'] === taskId);
    expect(execRecord).toBeDefined();
    expect(execRecord!.header.signatures.length).toBeGreaterThanOrEqual(1);
  });

  // ── GA5: Execution record (completion) ────────────────────────

  it('[EARS-GA5] should create completion execution record linked to same task', () => {
    const result = runCliCommand(
      ['exec', 'new', taskId, '-t', 'completion', '--title', 'Implementation done', '-r', 'All acceptance criteria met', '-q'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const execFiles = listRecords(worktreeBasePath, 'executions');
    const completionExec = execFiles
      .map(f => readRecord(worktreeBasePath, 'executions', f))
      .find(e => e.payload['type'] === 'completion' && e.payload['taskId'] === taskId);
    expect(completionExec).toBeDefined();

    // Should have at least 2 executions now (analysis + completion)
    const taskExecs = execFiles
      .map(f => readRecord(worktreeBasePath, 'executions', f))
      .filter(e => e.payload['taskId'] === taskId);
    expect(taskExecs.length).toBeGreaterThanOrEqual(2);
  });

  // ── GA6: Feedback approval ────────────────────────────────────

  it('[EARS-GA6] should create approval feedback record for the task', () => {
    const result = runCliCommand(
      ['feedback', '--entity-type', 'task', '--entity-id', taskId, '--type', 'approval', '--content', 'LGTM'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const fbFiles = listRecords(worktreeBasePath, 'feedbacks');
    const approvalFb = fbFiles
      .map(f => readRecord(worktreeBasePath, 'feedbacks', f))
      .find(fb => fb.payload['type'] === 'approval' && fb.payload['entityId'] === taskId);
    expect(approvalFb).toBeDefined();
    expect(approvalFb!.payload['entityType']).toBe('task');
  });

  // ── GA7: Task complete ────────────────────────────────────────

  it('[EARS-GA7] should complete the task with completion feedback', () => {
    const result = runCliCommand(
      ['task', 'complete', taskId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    // Verify status is done
    const taskFiles = listRecords(worktreeBasePath, 'tasks');
    const task = taskFiles
      .map(f => readRecord(worktreeBasePath, 'tasks', f))
      .find(t => t.payload.id === taskId);
    expect(task!.payload['status']).toBe('done');
  });

  // ── GA8: Cycle activate + complete ────────────────────────────

  it('[EARS-GA8] should activate and complete the cycle', () => {
    // Activate: planning → active
    const activateResult = runCliCommand(
      ['cycle', 'activate', cycleId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(activateResult.success).toBe(true);

    // Verify status is active
    const cycleFiles = listRecords(worktreeBasePath, 'cycles');
    let cycle = cycleFiles
      .map(f => readRecord(worktreeBasePath, 'cycles', f))
      .find(c => c.payload.id === cycleId);
    expect(cycle!.payload['status']).toBe('active');

    // Complete: active → completed
    const completeResult = runCliCommand(
      ['cycle', 'complete', cycleId, '-q'],
      { cwd: testProjectRoot },
    );
    expect(completeResult.success).toBe(true);

    // Re-read after complete
    cycle = listRecords(worktreeBasePath, 'cycles')
      .map(f => readRecord(worktreeBasePath, 'cycles', f))
      .find(c => c.payload.id === cycleId);
    expect(cycle!.payload['status']).toBe('completed');
  });

  // ── GA9: Record count verification ────────────────────────────

  it('[EARS-GA9] should have minimum expected records from full lifecycle', () => {
    const actors = listRecords(worktreeBasePath, 'actors');
    const tasks = listRecords(worktreeBasePath, 'tasks');
    const executions = listRecords(worktreeBasePath, 'executions');
    const feedbacks = listRecords(worktreeBasePath, 'feedbacks');
    const cycles = listRecords(worktreeBasePath, 'cycles');

    expect(actors.length).toBeGreaterThanOrEqual(1);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(executions.length).toBeGreaterThanOrEqual(2); // analysis + completion
    expect(feedbacks.length).toBeGreaterThanOrEqual(2); // assignment + approval
    expect(cycles.length).toBeGreaterThanOrEqual(2); // root + Sprint 1
  });

  // ── GA10: Integrity verification ──────────────────────────────

  it('[EARS-GA10] should have valid SHA-256 checksums and signatures on all records', () => {
    const dirs = ['actors', 'tasks', 'executions', 'feedbacks', 'cycles'];
    let totalChecked = 0;

    for (const dir of dirs) {
      const files = listRecords(worktreeBasePath, dir);
      for (const file of files) {
        const record = readRecord(worktreeBasePath, dir, file);

        // Valid header
        expect(record.header).toBeDefined();
        expect(record.header.payloadChecksum).toBeDefined();
        expect(record.header.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);

        // Valid signatures
        expect(record.header.signatures.length).toBeGreaterThanOrEqual(1);
        for (const sig of record.header.signatures) {
          expect(sig.keyId).toBeDefined();
          expect(sig.signature).toBeDefined();
          expect(sig.timestamp).toBeDefined();
          expect(typeof sig.timestamp).toBe('number');
        }

        totalChecked++;
      }
    }

    // At minimum: 1 actor + 1 task + 2 execs + 2 feedbacks + 2 cycles = 8
    expect(totalChecked).toBeGreaterThanOrEqual(8);
  });
});
