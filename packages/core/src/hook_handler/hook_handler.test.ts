/**
 * HookHandler Unit Tests
 *
 * All EARS prefixes map to hook_handler_module.md §4.
 * 13 EARS total across 3 blocks (A, B, C).
 */

import { HookHandler, classifyCommand } from './hook_handler';
import type {
  HookHandlerDependencies,
  CommandExecutedEvent,
  FileChangedEvent,
  TaskCompletedEvent,
  TeammateIdleEvent,
  SessionEndEvent,
} from './hook_handler.types';

// ─── Mock Factories ────────────────────────────────────────────

function createMockDependencies(overrides?: Partial<{
  configReturns: unknown;
  actorStateReturns: unknown;
  lastSessionReturns: unknown;
  detectActorReturns: string | null;
  createReturns: unknown;
  createThrows: Error;
}>): HookHandlerDependencies {
  const opts = overrides ?? {};

  return {
    configManager: {
      loadConfig: jest.fn().mockResolvedValue('configReturns' in opts ? opts.configReturns : { projectId: 'test', projectName: 'Test' }),
      getRootCycle: jest.fn(),
      getProjectInfo: jest.fn(),
      getSyncConfig: jest.fn(),
      getSyncDefaults: jest.fn(),
      getAuditState: jest.fn(),
      updateAuditState: jest.fn(),
      getStateBranch: jest.fn(),
    } as unknown as HookHandlerDependencies['configManager'],

    sessionManager: {
      loadSession: jest.fn(),
      detectActorFromKeyFiles: jest.fn().mockResolvedValue('detectActorReturns' in opts ? opts.detectActorReturns : 'actor-123'),
      getActorState: jest.fn().mockResolvedValue(opts.actorStateReturns ?? { activeTaskId: 'task-001' }),
      updateActorState: jest.fn(),
      getCloudSessionToken: jest.fn(),
      getSyncPreferences: jest.fn(),
      updateSyncPreferences: jest.fn(),
      getLastSession: jest.fn().mockResolvedValue(
        'lastSessionReturns' in opts ? opts.lastSessionReturns : { actorId: 'actor-123', timestamp: new Date().toISOString() }
      ),
      setCloudToken: jest.fn(),
      setLastSession: jest.fn(),
      clearCloudToken: jest.fn(),
    } as unknown as HookHandlerDependencies['sessionManager'],

    executionAdapter: {
      create: opts.createThrows
        ? jest.fn().mockImplementation(() => Promise.reject(opts.createThrows))
        : jest.fn().mockResolvedValue(opts.createReturns ?? { id: 'exec-001', taskId: 'task-001', type: 'completion', title: 'test', result: 'test' }),
      getExecution: jest.fn(),
      getExecutionsByTask: jest.fn(),
      getAllExecutions: jest.fn(),
    } as unknown as HookHandlerDependencies['executionAdapter'],
  };
}

function makeCommitEvent(overrides?: Partial<CommandExecutedEvent>): CommandExecutedEvent {
  return {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "feat: add auth flow"' },
    tool_output: '[main abc1234] feat: add auth flow\n 3 files changed, 120 insertions(+)',
    exit_code: 0,
    ...overrides,
  };
}

function makePrEvent(): CommandExecutedEvent {
  return {
    tool_name: 'Bash',
    tool_input: { command: 'gh pr create --title "feat: auth" --body "..."' },
    tool_output: 'https://github.com/org/repo/pull/42\n',
    exit_code: 0,
  };
}

function makeTestEvent(): CommandExecutedEvent {
  return {
    tool_name: 'Bash',
    tool_input: { command: 'pnpm test' },
    tool_output: 'Tests  12 passed | 2 failed | 14 total',
    exit_code: 0,
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe('HookHandler', () => {
  let deps: HookHandlerDependencies;
  let handler: HookHandler;

  beforeEach(() => {
    deps = createMockDependencies();
    handler = new HookHandler(deps);
  });

  describe('4.1. Common Behavior (EARS-A1 to A4)', () => {
    it('[EARS-A1] should return skipped with reason "no config" when ConfigManager returns null', async () => {
      deps = createMockDependencies({ configReturns: null });
      handler = new HookHandler(deps);

      const result = await handler.handleEvent(makeCommitEvent());

      expect(result).toEqual({ action: 'skipped', reason: 'no config' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });

    it('[EARS-A2] should return skipped with reason "no active task" when activeTaskId is null for command-executed', async () => {
      deps = createMockDependencies({ actorStateReturns: { activeTaskId: null } });
      handler = new HookHandler(deps);

      const result = await handler.handleEvent(makeCommitEvent());

      expect(result).toEqual({ action: 'skipped', reason: 'no active task' });
    });

    it('[EARS-A2] should return skipped with reason "no active task" when activeTaskId is null for task-completed', async () => {
      deps = createMockDependencies({ actorStateReturns: { activeTaskId: null } });
      handler = new HookHandler(deps);

      const event: TaskCompletedEvent = {
        hook_type: 'TaskCompleted',
        task: { id: '3', subject: 'Implement auth', status: 'completed', owner: 'transport' },
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'no active task' });
    });

    it('[EARS-A3] should catch errors and return skipped with error message as reason', async () => {
      deps = createMockDependencies();
      (deps.executionAdapter.create as jest.Mock).mockImplementation(() => {
        throw new Error('adapter exploded');
      });
      handler = new HookHandler(deps);

      const result = await handler.handleEvent(makeCommitEvent());

      expect(result).toEqual({ action: 'skipped', reason: 'adapter exploded' });
    });

    it('[EARS-A4] should return skipped for Write events', async () => {
      const event: FileChangedEvent = {
        tool_name: 'Write',
        tool_input: { file_path: '/path/to/file.ts', content: 'export const x = 1;' },
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'file changes are not recorded' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });

    it('[EARS-A4] should return skipped for Edit events', async () => {
      const event: FileChangedEvent = {
        tool_name: 'Edit',
        tool_input: { file_path: '/path/to/file.ts', old_string: 'old', new_string: 'new' },
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'file changes are not recorded' });
    });
  });

  describe('4.2. CommandExecutedEvent Handling (EARS-B1 to B5)', () => {
    it('[EARS-B1] should return skipped when command has non-zero exit_code', async () => {
      const result = await handler.handleEvent(makeCommitEvent({ exit_code: 1 }));

      expect(result).toEqual({ action: 'skipped', reason: 'command failed' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });

    it('[EARS-B1] should return skipped when command has no exit_code property', async () => {
      const event: CommandExecutedEvent = {
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "test"' },
        tool_output: 'some output',
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'command failed' });
    });

    it('[EARS-B2] should create completion record for git commit with hash, message, and file count', async () => {
      const result = await handler.handleEvent(makeCommitEvent());

      expect(result.action).toBe('recorded');
      expect(result.executionId).toBe('exec-001');
      expect(deps.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
          type: 'completion',
          result: expect.stringContaining('abc1234'),
          references: ['commit:abc1234'],
        }),
        'actor-123',
      );
    });

    it('[EARS-B2] should include commit hash in references array', async () => {
      await handler.handleEvent(makeCommitEvent());

      const call = (deps.executionAdapter.create as jest.Mock).mock.calls[0];
      expect(call[0].references).toEqual(['commit:abc1234']);
    });

    it('[EARS-B3] should create completion record for gh pr create with PR number', async () => {
      const result = await handler.handleEvent(makePrEvent());

      expect(result.action).toBe('recorded');
      expect(deps.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
          type: 'completion',
          result: 'PR #42 created',
          references: ['pr:42'],
        }),
        'actor-123',
      );
    });

    it('[EARS-B4] should create analysis record for vitest with test results in metadata', async () => {
      const result = await handler.handleEvent(makeTestEvent());

      expect(result.action).toBe('recorded');
      expect(deps.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
          type: 'analysis',
          result: 'Tests: 12/14 passing, 2 failed',
          metadata: { tests: { passed: 12, failed: 2, total: 14 } },
        }),
        'actor-123',
      );
    });

    it('[EARS-B4] should recognize jest, vitest, pytest, npm test, and pnpm test', () => {
      expect(classifyCommand('npx jest --coverage').kind).toBe('test');
      expect(classifyCommand('npx vitest run').kind).toBe('test');
      expect(classifyCommand('pytest -v').kind).toBe('test');
      expect(classifyCommand('npm test').kind).toBe('test');
      expect(classifyCommand('pnpm test').kind).toBe('test');
    });

    it('[EARS-B5] should return skipped for unrecognized commands like ls or cat', async () => {
      const event: CommandExecutedEvent = {
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
        tool_output: 'total 42\ndrwxr-xr-x ...',
        exit_code: 0,
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'unrecognized command' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });
  });

  describe('4.3. Other Events (EARS-C1 to C3)', () => {
    it('[EARS-C1] should create completion record for task-completed with subject and owner', async () => {
      const event: TaskCompletedEvent = {
        hook_type: 'TaskCompleted',
        task: { id: '3', subject: 'Implement auth flow', status: 'completed', owner: 'transport' },
        session_id: 'sess-abc',
      };

      const result = await handler.handleEvent(event);

      expect(result.action).toBe('recorded');
      expect(deps.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-001',
          type: 'completion',
          result: expect.stringContaining('Implement auth flow'),
          references: ['task:3'],
        }),
        'actor-123',
      );
      // Verify owner is mentioned
      const call = (deps.executionAdapter.create as jest.Mock).mock.calls[0];
      expect(call[0].result).toContain('transport');
    });

    it('[EARS-C2] should return skipped with reason "activity logged" for teammate-idle', async () => {
      const event: TeammateIdleEvent = {
        hook_type: 'TeammateIdle',
        agent: { name: 'transport', agent_id: 'abc-123' },
        session_id: 'sess-abc',
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'activity logged' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });

    it('[EARS-C2] should not require activeTaskId for teammate-idle events', async () => {
      deps = createMockDependencies({ actorStateReturns: { activeTaskId: null } });
      handler = new HookHandler(deps);

      const event: TeammateIdleEvent = {
        hook_type: 'TeammateIdle',
        agent: { name: 'transport' },
      };

      const result = await handler.handleEvent(event);

      // Should still return 'activity logged', NOT 'no active task'
      expect(result).toEqual({ action: 'skipped', reason: 'activity logged' });
    });

    it('[EARS-C3] should create analysis record for session-end with session summary', async () => {
      const event: SessionEndEvent = {
        hook_type: 'Stop',
        session_id: 'sess-xyz',
      };

      const result = await handler.handleEvent(event);

      expect(result.action).toBe('recorded');
      expect(deps.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          title: 'Session ended',
          result: expect.stringContaining('sess-xyz'),
        }),
        'actor-123',
      );
    });

    it('[EARS-C3] should skip session-end when no activeTaskId (schema requires valid taskId)', async () => {
      deps = createMockDependencies({ actorStateReturns: { activeTaskId: null } });
      handler = new HookHandler(deps);

      const event: SessionEndEvent = {
        hook_type: 'Stop',
        session_id: 'sess-end',
      };

      const result = await handler.handleEvent(event);

      // Execution schema requires taskId and adapter validates it exists,
      // so session-end without activeTaskId is skipped
      expect(result.action).toBe('skipped');
      expect(result.reason).toBe('no active task');
    });

    it('[EARS-C3] should return skipped with reason "no actor" when actorId cannot be resolved', async () => {
      deps = createMockDependencies({
        lastSessionReturns: null,
        detectActorReturns: null,
      });
      handler = new HookHandler(deps);

      const event: SessionEndEvent = {
        hook_type: 'Stop',
        session_id: 'sess-no-actor',
      };

      const result = await handler.handleEvent(event);

      expect(result).toEqual({ action: 'skipped', reason: 'no actor' });
      expect(deps.executionAdapter.create).not.toHaveBeenCalled();
    });
  });
});

describe('classifyCommand', () => {
  it('should classify git commit commands', () => {
    const result = classifyCommand(
      'git commit -m "feat: add auth"',
      '[main abc1234] feat: add auth\n 3 files changed, 120 insertions(+)',
    );
    expect(result).toEqual({ kind: 'commit', hash: 'abc1234', message: 'feat: add auth', filesChanged: 3 });
  });

  it('should classify gh pr create commands', () => {
    const result = classifyCommand(
      'gh pr create --title "feat" --body "..."',
      'https://github.com/org/repo/pull/42',
    );
    expect(result).toEqual({ kind: 'pr', number: '42' });
  });

  it('should classify test runner commands', () => {
    const result = classifyCommand(
      'pnpm test',
      'Tests  12 passed | 2 failed | 14 total',
    );
    expect(result).toEqual({ kind: 'test', passed: 12, failed: 2, total: 14 });
  });

  it('should return unknown for unrecognized commands', () => {
    expect(classifyCommand('ls -la')).toEqual({ kind: 'unknown' });
    expect(classifyCommand('cat README.md')).toEqual({ kind: 'unknown' });
    expect(classifyCommand('docker compose up')).toEqual({ kind: 'unknown' });
  });
});
