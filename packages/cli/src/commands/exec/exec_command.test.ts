/**
 * Exec Command tests — Block A (ICOMP-A1 to ICOMP-A9)
 * Blueprint: exec_command.md §4
 */

// Mock @gitgov/core FIRST to avoid import.meta issues
jest.mock('@gitgov/core', () => ({
  Records: {},
  Factories: {
    createExecutionRecord: jest.fn((data) => data),
    createTestSignature: jest.fn((keyId, role, notes) => ({
      keyId, role, notes, timestamp: Date.now(), signature: 'A'.repeat(86) + '=='
    })),
  }
}));

// Mock DependencyInjectionService
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { ExecCommand } from './exec_command';
import { DependencyInjectionService } from '../../services/dependency-injection';

// Test fixtures
const mockExecution = {
  id: '1752361200-exec-oauth-callback',
  taskId: '1752274500-task-oauth',
  type: 'progress',
  title: 'Implement OAuth callback',
  result: 'OAuth2 callback handler completed with token validation.',
  notes: 'Used NextAuth.js',
  references: ['commit:abc123'],
};

const mockExecution2 = {
  id: '1752361300-exec-api-blocker',
  taskId: '1752274500-task-oauth',
  type: 'blocker',
  title: 'API down',
  result: 'Cannot continue — payment API returns 503.',
  references: [],
};

// Mock console and process.exit at module level (task-command pattern)
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('ExecCommand', () => {
  let execCommand: ExecCommand;
  let mockExecutionAdapter: {
    create: jest.MockedFunction<any>;
    getExecution: jest.MockedFunction<any>;
    getExecutionsByTask: jest.MockedFunction<any>;
    getAllExecutions: jest.MockedFunction<any>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<any>;
  };
  let mockProjector: {
    invalidateCache: jest.MockedFunction<any>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockExecutionAdapter = {
      create: jest.fn().mockResolvedValue(mockExecution),
      getExecution: jest.fn().mockResolvedValue(null),
      getExecutionsByTask: jest.fn().mockResolvedValue([]),
      getAllExecutions: jest.fn().mockResolvedValue([]),
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn().mockResolvedValue({ id: 'human:dev', displayName: 'Dev', type: 'human' }),
    };

    mockProjector = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const mockDependencyService = {
      getExecutionAdapter: jest.fn().mockResolvedValue(mockExecutionAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getRecordProjector: jest.fn().mockResolvedValue(mockProjector),
    };

    // Set up mock BEFORE constructing command (critical — BaseCommand reads DI in constructor)
    (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    execCommand = new ExecCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('4.1. Subcommand new — Creation (ICOMP-A1 to ICOMP-A5)', () => {

    it('[ICOMP-A1] should abort when --result is not provided', async () => {
      await execCommand.executeNew('task-1', { result: '' } as any);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('--result is required')
      );
    });

    it('[ICOMP-A2] should abort when taskId does not exist', async () => {
      mockExecutionAdapter.create.mockRejectedValue(new Error('Task not found: task-nonexistent'));

      await execCommand.executeNew('task-nonexistent', { result: 'Some result' } as any);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });

    it('[ICOMP-A3] should create ExecutionRecord via adapter', async () => {
      await execCommand.executeNew('1752274500-task-oauth', {
        result: 'OAuth2 callback handler completed with token validation.',
        type: 'progress',
        title: 'Implement OAuth callback',
      } as any);

      expect(mockExecutionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: '1752274500-task-oauth',
          result: 'OAuth2 callback handler completed with token validation.',
          type: 'progress',
          title: 'Implement OAuth callback',
        }),
        'human:dev',
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Execution created')
      );
    });

    it('[ICOMP-A4] should pass multiple references to adapter', async () => {
      await execCommand.executeNew('1752274500-task-oauth', {
        result: 'Done',
        reference: ['commit:abc123', 'pr:456', 'file:src/auth.ts'],
      } as any);

      expect(mockExecutionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          references: ['commit:abc123', 'pr:456', 'file:src/auth.ts'],
        }),
        'human:dev',
      );
    });

    it('[ICOMP-A5] should default to type progress when not specified', async () => {
      await execCommand.executeNew('1752274500-task-oauth', {
        result: 'Some work done',
      } as any);

      expect(mockExecutionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
        }),
        'human:dev',
      );
    });
  });

  describe('4.2. Subcommand list — Query (ICOMP-A6 to ICOMP-A7)', () => {

    it('[ICOMP-A6] should list executions for a specific task', async () => {
      mockExecutionAdapter.getExecutionsByTask.mockResolvedValue([mockExecution, mockExecution2]);

      await execCommand.executeList('1752274500-task-oauth', { json: true } as any);

      expect(mockExecutionAdapter.getExecutionsByTask).toHaveBeenCalledWith('1752274500-task-oauth');
      const output = JSON.parse(mockConsoleLog.mock.calls[0]![0]);
      expect(output.data.total).toBe(2);
      expect(output.data.executions).toHaveLength(2);
    });

    it('[ICOMP-A7] should list all executions when no taskId given', async () => {
      mockExecutionAdapter.getAllExecutions.mockResolvedValue([mockExecution]);

      await execCommand.executeList(undefined, { json: true } as any);

      expect(mockExecutionAdapter.getAllExecutions).toHaveBeenCalled();
      const output = JSON.parse(mockConsoleLog.mock.calls[0]![0]);
      expect(output.data.total).toBe(1);
    });
  });

  describe('4.3. Subcommand show — Detail (ICOMP-A8 to ICOMP-A9)', () => {

    it('[ICOMP-A8] should display full execution details', async () => {
      mockExecutionAdapter.getExecution.mockResolvedValue(mockExecution);

      await execCommand.executeShow('1752361200-exec-oauth-callback', { json: true } as any);

      expect(mockExecutionAdapter.getExecution).toHaveBeenCalledWith('1752361200-exec-oauth-callback');
      const output = JSON.parse(mockConsoleLog.mock.calls[0]![0]);
      expect(output.data.id).toBe('1752361200-exec-oauth-callback');
      expect(output.data.taskId).toBe('1752274500-task-oauth');
      expect(output.data.type).toBe('progress');
      expect(output.data.result).toBe('OAuth2 callback handler completed with token validation.');
    });

    it('[ICOMP-A9] should abort when executionId does not exist', async () => {
      mockExecutionAdapter.getExecution.mockResolvedValue(null);

      await execCommand.executeShow('exec-nonexistent', {} as any);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Execution not found')
      );
    });
  });
});
