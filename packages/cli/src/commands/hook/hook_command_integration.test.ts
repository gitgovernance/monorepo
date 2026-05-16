/**
 * HookCommand Integration Tests
 *
 * Tests the full pipeline: stdin JSON → HookCommand → HookHandler → adapter
 * without mocking the core HookHandler (only mocks DI and adapters).
 *
 * These verify end-to-end behavior across the CLI and core layers.
 */

// Mock DI — provide real-ish adapters
const mockCreate = vi.fn();
const mockGetActorState = vi.fn();
const mockGetLastSession = vi.fn();
const mockDetectActorFromKeyFiles = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('@gitgov/core', async () => {
  const actual = await vi.importActual('@gitgov/core');
  return actual;
});

vi.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: vi.fn(() => ({
      validateDependencies: vi.fn().mockResolvedValue(true),
      getExecutionAdapter: vi.fn().mockResolvedValue({
        create: mockCreate,
        getExecution: vi.fn(),
        getExecutionsByTask: vi.fn(),
        getAllExecutions: vi.fn(),
      }),
      getSessionManager: vi.fn().mockResolvedValue({
        loadSession: vi.fn(),
        detectActorFromKeyFiles: mockDetectActorFromKeyFiles,
        getActorState: mockGetActorState,
        updateActorState: vi.fn(),
        getCloudSessionToken: vi.fn(),
        getSyncPreferences: vi.fn(),
        updateSyncPreferences: vi.fn(),
        getLastSession: mockGetLastSession,
      }),
      getConfigManager: vi.fn().mockResolvedValue({
        loadConfig: mockLoadConfig,
        getRootCycle: vi.fn(),
        getProjectInfo: vi.fn(),
        getSyncConfig: vi.fn(),
        getSyncDefaults: vi.fn(),
        getAuditState: vi.fn(),
        updateAuditState: vi.fn(),
        getStateBranch: vi.fn(),
      }),
    })),
  },
}));

import { HookCommand } from './hook_command';

// ─── Helpers ────────────────────────────────────────────────

function mockStdin(data: string): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
  vi.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
  vi.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
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
  let stdoutSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutOutput = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutOutput += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

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
    vi.restoreAllMocks();
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
