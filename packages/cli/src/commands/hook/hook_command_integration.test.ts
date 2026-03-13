/**
 * HookCommand Integration Tests
 *
 * Tests the full pipeline: stdin JSON → HookCommand → HookHandler → adapter
 * without mocking the core HookHandler (only mocks DI and adapters).
 *
 * These verify end-to-end behavior across the CLI and core layers.
 */

// Mock DI — provide real-ish adapters
const mockCreate = jest.fn();
const mockGetActorState = jest.fn();
const mockGetLastSession = jest.fn();
const mockDetectActorFromKeyFiles = jest.fn();
const mockLoadConfig = jest.fn();

jest.mock('@gitgov/core', () => {
  // Import the real HookHandler but with mock-able dependencies
  const actual = jest.requireActual('@gitgov/core');
  return actual;
});

jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn(() => ({
      validateDependencies: jest.fn().mockResolvedValue(true),
      getExecutionAdapter: jest.fn().mockResolvedValue({
        create: mockCreate,
        getExecution: jest.fn(),
        getExecutionsByTask: jest.fn(),
        getAllExecutions: jest.fn(),
      }),
      getSessionManager: jest.fn().mockResolvedValue({
        loadSession: jest.fn(),
        detectActorFromKeyFiles: mockDetectActorFromKeyFiles,
        getActorState: mockGetActorState,
        updateActorState: jest.fn(),
        getCloudSessionToken: jest.fn(),
        getSyncPreferences: jest.fn(),
        updateSyncPreferences: jest.fn(),
        getLastSession: mockGetLastSession,
      }),
      getConfigManager: jest.fn().mockResolvedValue({
        loadConfig: mockLoadConfig,
        getRootCycle: jest.fn(),
        getProjectInfo: jest.fn(),
        getSyncConfig: jest.fn(),
        getSyncDefaults: jest.fn(),
        getAuditState: jest.fn(),
        updateAuditState: jest.fn(),
        getStateBranch: jest.fn(),
      }),
    })),
  },
}));

import { HookCommand } from './hook_command';

// ─── Helpers ────────────────────────────────────────────────

function mockStdin(data: string): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
  jest.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
  jest.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'data') {
      setImmediate(() => handler(data));
    } else if (event === 'end') {
      setImmediate(() => setImmediate(() => handler()));
    }
    return process.stdin;
  });
}

// ─── Tests ──────────────────────────────────────────────────

describe('HookCommand Integration', () => {
  let command: HookCommand;
  let stdoutOutput: string;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    stdoutOutput = '';
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutOutput += String(chunk);
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Setup default mocks
    mockLoadConfig.mockResolvedValue({ projectId: 'test', projectName: 'Test' });
    mockGetLastSession.mockResolvedValue({ actorId: 'actor-123', timestamp: new Date().toISOString() });
    mockGetActorState.mockResolvedValue({ activeTaskId: 'task-001' });
    mockDetectActorFromKeyFiles.mockResolvedValue('actor-123');
    mockCreate.mockResolvedValue({ id: 'exec-integration-001', taskId: 'task-001', type: 'completion', title: 'test', result: 'test' });

    command = new HookCommand();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('should classify git commit event in dry-run without persisting (full pipeline)', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: add auth"' },
      tool_output: '[main abc1234] feat: add auth\n 3 files changed, 120 insertions(+)',
      exit_code: 0,
    });
    mockStdin(payload);

    await command.executeCommandExecuted({ dryRun: true });

    const output = JSON.parse(stdoutOutput);
    expect(output.success).toBe(true);
    expect(output.event_type).toBe('command-executed');
    expect(output.action).toBe('recorded');
    expect(output.executionId).toBe('dry-run');

    // Dry-run should NOT call create (no persistence)
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should skip event when no active task (full pipeline)', async () => {
    mockGetActorState.mockResolvedValue({ activeTaskId: null });

    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' },
      tool_output: '[main def5678] test',
      exit_code: 0,
    });
    mockStdin(payload);

    await command.executeCommandExecuted({ dryRun: true });

    const output = JSON.parse(stdoutOutput);
    expect(output.action).toBe('skipped');
    expect(output.reason).toBe('no active task');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should skip when GITGOV_PASSIVE=false (no adapter calls)', async () => {
    const originalEnv = process.env['GITGOV_PASSIVE'];
    process.env['GITGOV_PASSIVE'] = 'false';

    await command.executeCommandExecuted({ dryRun: true });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(stdoutOutput).toBe(''); // No output at all

    process.env['GITGOV_PASSIVE'] = originalEnv;
  });
});
