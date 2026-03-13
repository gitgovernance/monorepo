/**
 * HookCommand Unit Tests
 *
 * All EARS prefixes map to hook_command.md §4.
 * 16 EARS across 4 blocks (A, B, C, D).
 *
 * Testing strategy: Mock DI, HookHandler, and stdin to test the CLI layer
 * in isolation. Core HookHandler logic is tested in core/hook_handler.test.ts.
 */

// Mock @gitgov/core — provide the HookHandler namespace
const mockHandleEvent = jest.fn();
jest.mock('@gitgov/core', () => ({
  HookHandler: {
    HookHandler: jest.fn().mockImplementation(() => ({
      handleEvent: mockHandleEvent,
    })),
    classifyCommand: jest.fn(),
  },
}));

// Mock DependencyInjectionService
const mockValidateDependencies = jest.fn();
const mockGetExecutionAdapter = jest.fn();
const mockGetSessionManager = jest.fn();
const mockGetConfigManager = jest.fn();

jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn(() => ({
      validateDependencies: mockValidateDependencies,
      getExecutionAdapter: mockGetExecutionAdapter,
      getSessionManager: mockGetSessionManager,
      getConfigManager: mockGetConfigManager,
    })),
  },
}));

import { HookCommand } from './hook_command';

// ─── Helpers ────────────────────────────────────────────────

/** Simulate piped stdin with given data */
function mockStdin(data: string): void {
  const originalIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

  const originalSetEncoding = process.stdin.setEncoding;
  const originalOn = process.stdin.on;

  // Queue the data delivery after event listeners are attached
  jest.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
  jest.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'data') {
      // Deliver data asynchronously
      setImmediate(() => handler(data));
    } else if (event === 'end') {
      // End after data
      setImmediate(() => setImmediate(() => handler()));
    }
    return process.stdin;
  });

  // Restore after test via afterEach
}

/** Simulate TTY stdin (no pipe) */
function mockStdinTTY(): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
}

/** Setup DI mocks to simulate valid .gitgov/ project */
function setupValidProject(): void {
  mockValidateDependencies.mockResolvedValue(true);
  mockGetExecutionAdapter.mockResolvedValue({});
  mockGetSessionManager.mockResolvedValue({});
  mockGetConfigManager.mockResolvedValue({});
}

// Capture stderr and stdout
let stderrOutput: string;
let stdoutOutput: string;
let stderrSpy: jest.SpyInstance;
let stdoutSpy: jest.SpyInstance;

// ─── Tests ──────────────────────────────────────────────────

describe('HookCommand', () => {
  let command: HookCommand;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    stderrOutput = '';
    stdoutOutput = '';
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput += String(chunk);
      return true;
    });
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutOutput += String(chunk);
      return true;
    });
    process.env = { ...originalEnv };
    command = new HookCommand();
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('4.1. Common Behavior (EARS-A1 to A5)', () => {
    it('[EARS-A1] should return immediately when GITGOV_PASSIVE is false', async () => {
      process.env['GITGOV_PASSIVE'] = 'false';
      mockStdinTTY();

      await command.processEvent('command-executed', {});

      // Should not even try to read stdin or validate project
      expect(mockValidateDependencies).not.toHaveBeenCalled();
      expect(mockHandleEvent).not.toHaveBeenCalled();
    });

    it('[EARS-A2] should return when .gitgov directory does not exist', async () => {
      mockValidateDependencies.mockResolvedValue(false);
      mockStdin('{"tool_name":"Bash","tool_input":{"command":"ls"},"exit_code":0}');

      await command.processEvent('command-executed', {});

      expect(mockHandleEvent).not.toHaveBeenCalled();
    });

    it('[EARS-A3] should return without error when stdin JSON is invalid', async () => {
      mockStdin('not valid json {{{');

      await command.processEvent('command-executed', {});

      expect(mockValidateDependencies).not.toHaveBeenCalled();
      expect(mockHandleEvent).not.toHaveBeenCalled();
      // No error output in non-verbose mode
      expect(stderrOutput).toBe('');
    });

    it('[EARS-A3] should return without error when stdin is empty', async () => {
      mockStdin('');

      await command.processEvent('command-executed', {});

      expect(mockValidateDependencies).not.toHaveBeenCalled();
      expect(mockHandleEvent).not.toHaveBeenCalled();
    });

    it('[EARS-A3] should return without error when stdin is TTY (not piped)', async () => {
      mockStdinTTY();

      await command.processEvent('command-executed', {});

      expect(mockValidateDependencies).not.toHaveBeenCalled();
      expect(mockHandleEvent).not.toHaveBeenCalled();
    });

    it('[EARS-A4] should catch internal errors and not throw', async () => {
      setupValidProject();
      mockStdin('{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"test\\""},"exit_code":0}');
      mockHandleEvent.mockImplementation(() => { throw new Error('internal failure'); });

      // Should NOT throw
      await command.processEvent('command-executed', {});

      // No output in non-verbose mode
      expect(stderrOutput).toBe('');
    });

    it('[EARS-A4] should output error diagnostics to stderr when --verbose and error occurs', async () => {
      setupValidProject();
      mockStdin('{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"test\\""},"exit_code":0}');
      mockHandleEvent.mockImplementation(() => { throw new Error('adapter exploded'); });

      await command.processEvent('command-executed', { verbose: true });

      expect(stderrOutput).toContain('adapter exploded');
      expect(stderrOutput).toContain('[hook]');
    });

    it('[EARS-A5] should output HookCommandResult JSON to stdout without creating records in dry-run', async () => {
      setupValidProject();
      mockStdin('{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"test\\""},"tool_output":"[main abc1234] test","exit_code":0}');
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-001' });

      await command.processEvent('command-executed', { dryRun: true });

      const output = JSON.parse(stdoutOutput);
      expect(output.success).toBe(true);
      expect(output.event_type).toBe('command-executed');
      expect(output.action).toBe('recorded');
      expect(output.executionId).toBe('exec-001');
    });
  });

  describe('4.2. command-executed (EARS-B1 to B4)', () => {
    beforeEach(() => {
      setupValidProject();
    });

    it('[EARS-B1] should delegate git commit event to HookHandler', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"feat: auth\\""},"tool_output":"[main abc1234] feat: auth\\n 3 files changed","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-001' });

      await command.executeCommandExecuted({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'Bash',
          tool_input: expect.objectContaining({ command: 'git commit -m "feat: auth"' }),
        }),
      );
    });

    it('[EARS-B2] should delegate gh pr create event to HookHandler', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title \\"feat\\" --body \\"...\\""},"tool_output":"https://github.com/org/repo/pull/42","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-002' });

      await command.executeCommandExecuted({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'Bash',
          tool_input: expect.objectContaining({ command: expect.stringContaining('gh pr create') }),
        }),
      );
    });

    it('[EARS-B3] should delegate test runner event to HookHandler', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"pnpm test"},"tool_output":"Tests  12 passed | 2 failed | 14 total","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-003' });

      await command.executeCommandExecuted({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'Bash',
          tool_input: expect.objectContaining({ command: 'pnpm test' }),
        }),
      );
    });

    it('[EARS-B4] should delegate unrecognized command to HookHandler which skips it', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"tool_output":"total 42","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'skipped', reason: 'unrecognized command' });

      await command.executeCommandExecuted({});

      expect(mockHandleEvent).toHaveBeenCalled();
    });
  });

  describe('4.3. Other Subcommands (EARS-C1 to C4)', () => {
    beforeEach(() => {
      setupValidProject();
    });

    it('[EARS-C1] should delegate file-changed event to HookHandler and skip', async () => {
      const payload = '{"tool_name":"Write","tool_input":{"file_path":"/src/main.ts","content":"export const x = 1;"}}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'skipped', reason: 'file changes are not recorded' });

      await command.executeFileChanged({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ tool_name: 'Write' }),
      );
    });

    it('[EARS-C2] should delegate task-completed event to HookHandler', async () => {
      const payload = '{"hook_type":"TaskCompleted","task":{"id":"3","subject":"Implement auth","status":"completed","owner":"transport"},"session_id":"sess-123"}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-004' });

      await command.executeTaskCompleted({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          hook_type: 'TaskCompleted',
          task: expect.objectContaining({ subject: 'Implement auth' }),
        }),
      );
    });

    it('[EARS-C3] should delegate teammate-idle event to HookHandler', async () => {
      const payload = '{"hook_type":"TeammateIdle","agent":{"name":"transport","agent_id":"abc-123"},"session_id":"sess-123"}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'skipped', reason: 'activity logged' });

      await command.executeTeammateIdle({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          hook_type: 'TeammateIdle',
          agent: expect.objectContaining({ name: 'transport' }),
        }),
      );
    });

    it('[EARS-C4] should delegate session-end event to HookHandler', async () => {
      const payload = '{"hook_type":"Stop","session_id":"sess-xyz","cwd":"/project"}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-005' });

      await command.executeSessionEnd({});

      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          hook_type: 'Stop',
          session_id: 'sess-xyz',
        }),
      );
    });
  });

  describe('4.4. Output and Diagnostics (EARS-D1 to D2)', () => {
    beforeEach(() => {
      setupValidProject();
    });

    it('[EARS-D1] should output diagnostic information to stderr when --verbose is provided', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"test\\""},"tool_output":"[main abc1234] test","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'recorded', executionId: 'exec-006' });

      await command.processEvent('command-executed', { verbose: true });

      expect(stderrOutput).toContain('[hook] event_type: command-executed');
      expect(stderrOutput).toContain('[hook] action: recorded');
      expect(stderrOutput).toContain('[hook] executionId: exec-006');
      expect(stderrOutput).toContain('[hook] elapsed:');
    });

    it('[EARS-D1] should output skip reason to stderr when --verbose and event is skipped', async () => {
      const payload = '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"tool_output":"total 42","exit_code":0}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'skipped', reason: 'unrecognized command' });

      await command.processEvent('command-executed', { verbose: true });

      expect(stderrOutput).toContain('[hook] action: skipped');
      expect(stderrOutput).toContain('[hook] reason: unrecognized command');
    });

    it('[EARS-D2] should output HookCommandResult JSON to stdout when --dry-run is provided', async () => {
      const payload = '{"tool_name":"Write","tool_input":{"file_path":"/src/main.ts"}}';
      mockStdin(payload);
      mockHandleEvent.mockResolvedValue({ action: 'skipped', reason: 'file changes are not recorded' });

      await command.processEvent('file-changed', { dryRun: true });

      const output = JSON.parse(stdoutOutput);
      expect(output).toEqual({
        success: true,
        event_type: 'file-changed',
        action: 'skipped',
        reason: 'file changes are not recorded',
      });
      // No stderr output in dry-run (unless also --verbose, which is not set here)
    });
  });
});
