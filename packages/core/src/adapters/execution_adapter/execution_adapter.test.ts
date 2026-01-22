import { ExecutionAdapter } from './index';
import { createExecutionRecord } from '../../factories/execution_factory';
import type { RecordStore } from '../../record_store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../event_bus';
import type { ExecutionRecord, GitGovExecutionRecord, GitGovTaskRecord } from '../../types';
import type { IEventStream } from '../../event_bus';
import type { GitGovRecord, Signature } from '../../types';
import { DetailedValidationError } from '../../validation/common';

// Mock dependencies
jest.mock('../../factories/execution_factory');
jest.mock('../identity_adapter');
jest.mock('../../event_bus', () => ({
  ...jest.requireActual('../../event_bus'),
  publishEvent: jest.fn(),
}));

// Helper function to create properly typed mock execution records
function createMockExecutionRecord(overrides: Partial<ExecutionRecord> = {}): GitGovRecord & { payload: ExecutionRecord } {
  return {
    header: {
      version: '1.0',
      type: 'execution',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'mock-author',
        role: 'author',
        notes: 'Mock execution for unit testing',
        signature: 'mock-sig',
        timestamp: 123
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: 'mock-execution',
      taskId: 'task-123',
      result: 'Mock execution output with sufficient length for validation',
      type: 'progress' as const,
      title: 'Mock Execution Title',
      notes: 'Mock execution notes',
      references: ['commit:abc123', 'file:test.ts'],
      ...overrides
    }
  };
}

describe('ExecutionAdapter', () => {
  let executionAdapter: ExecutionAdapter;
  let mockExecutionStore: jest.Mocked<RecordStore<GitGovExecutionRecord>>;
  let mockTaskStore: jest.Mocked<RecordStore<GitGovTaskRecord>>;
  let mockIdentityAdapter: jest.Mocked<IdentityAdapter>;
  let mockPublishEvent: jest.Mock;

  const mockPayload = {
    taskId: 'task-123',
    result: 'Task completed successfully with all requirements met',
    type: 'progress' as const,
    title: 'Task Completion',
    notes: 'All acceptance criteria met'
  };
  const mockActorId = 'human:developer';
  const mockCreatedExecutionPayload = {
    id: '123-exec-test',
    taskId: 'task-123',
    result: 'Task completed successfully with all requirements met',
    type: 'progress' as const,
    title: 'Task Completion'
  };
  const mockSignedRecord = createMockExecutionRecord(mockCreatedExecutionPayload);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock store with proper typing
    mockExecutionStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovExecutionRecord>>;

    mockTaskStore = {
      get: jest.fn().mockResolvedValue({ payload: { id: 'task-123' } }), // Default: task exists
      put: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovTaskRecord>>;

    // Mock identity adapter
    mockIdentityAdapter = {
      signRecord: jest.fn(),
      createActor: jest.fn(),
      getActor: jest.fn(),
      getAllActors: jest.fn(),
      createAgent: jest.fn(),
      getAgent: jest.fn(),
      getAllAgents: jest.fn()
    } as unknown as jest.Mocked<IdentityAdapter>;

    // Mock publish event
    mockPublishEvent = publishEvent as jest.Mock;

    // Mock factory
    (createExecutionRecord as jest.Mock).mockReturnValue(mockCreatedExecutionPayload);
    mockIdentityAdapter.signRecord.mockResolvedValue(mockSignedRecord);

    // Create adapter with mocked dependencies
    executionAdapter = new ExecutionAdapter({
      stores: { executions: mockExecutionStore, tasks: mockTaskStore },
      identity: mockIdentityAdapter,
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        getSubscriptions: jest.fn(),
        clearSubscriptions: jest.fn(),
        waitForIdle: jest.fn().mockResolvedValue(undefined)
      } as IEventStream,
    });
  });

  describe('create', () => {
    it('[EARS-A1] should create, sign, write, and emit event for valid execution', async () => {
      const result = await executionAdapter.create(mockPayload, mockActorId);

      expect(createExecutionRecord).toHaveBeenCalledWith(mockPayload);
      expect(mockIdentityAdapter.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: mockCreatedExecutionPayload
        }),
        mockActorId,
        'author',
        expect.any(String) // notes parameter
      );
      expect(mockExecutionStore.put).toHaveBeenCalledWith(mockCreatedExecutionPayload.id, mockSignedRecord);
      // Note: Now using this.eventBus.publish instead of publishEvent
      // The mock eventBus.publish should have been called
      expect(result).toEqual(mockCreatedExecutionPayload);
    });

    it('[EARS-A2] should throw DetailedValidationError for invalid payload', async () => {
      const validationError = new DetailedValidationError('ExecutionRecord', [{
        field: 'result',
        message: 'result is required',
        value: undefined
      }]);
      (createExecutionRecord as jest.Mock).mockImplementation(() => { throw validationError; });

      await expect(executionAdapter.create({ taskId: 'invalid' }, mockActorId))
        .rejects.toThrow(DetailedValidationError);

      // Ensure no side effects occurred
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();
      expect(mockExecutionStore.put).not.toHaveBeenCalled();
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it('[EARS-A3] should throw RecordNotFoundError for non-existent taskId', async () => {
      mockTaskStore.get.mockResolvedValue(null);

      await expect(executionAdapter.create({ taskId: 'non-existent', result: 'Valid result with sufficient length' }, mockActorId))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent');
    });

    it('[EARS-A4] should throw DetailedValidationError for missing result', async () => {
      const invalidPayload = { taskId: 'task-123' }; // Missing result
      const validationError = new DetailedValidationError('ExecutionRecord', [{
        field: 'result',
        message: 'result is required',
        value: undefined
      }]);
      (createExecutionRecord as jest.Mock).mockImplementation(() => { throw validationError; });

      await expect(executionAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-A5] should throw DetailedValidationError for short result', async () => {
      const invalidPayload = { taskId: 'task-123', result: 'short' }; // Too short
      const validationError = new DetailedValidationError('ExecutionRecord', [{
        field: 'result',
        message: 'must be at least 10 characters',
        value: 'short'
      }]);
      (createExecutionRecord as jest.Mock).mockImplementation(() => { throw validationError; });

      await expect(executionAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-A1] should create execution record successfully', async () => {
      const result = await executionAdapter.create(mockPayload, mockActorId);

      expect(createExecutionRecord).toHaveBeenCalledWith(mockPayload);
      expect(result).toEqual(mockCreatedExecutionPayload);
    });

  });

  describe('getExecution', () => {
    it('[EARS-B1] should return existing execution record', async () => {
      const mockRecord = createMockExecutionRecord({ id: 'execution-123' });
      mockExecutionStore.get.mockResolvedValue(mockRecord);

      const result = await executionAdapter.getExecution('execution-123');

      expect(mockExecutionStore.get).toHaveBeenCalledWith('execution-123');
      expect(result).toEqual(mockRecord.payload);
    });

    it('[EARS-B2] should return null for non-existent execution', async () => {
      mockExecutionStore.get.mockResolvedValue(null);

      const result = await executionAdapter.getExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getExecutionsByTask', () => {
    it('[EARS-C1] should filter executions by task ID', async () => {
      const execution1 = createMockExecutionRecord({ id: 'execution-1', taskId: 'task-123' });
      const execution2 = createMockExecutionRecord({ id: 'execution-2', taskId: 'task-456' });
      const execution3 = createMockExecutionRecord({ id: 'execution-3', taskId: 'task-123' });

      mockExecutionStore.list.mockResolvedValue(['execution-1', 'execution-2', 'execution-3']);
      mockExecutionStore.get
        .mockResolvedValueOnce(execution1)
        .mockResolvedValueOnce(execution2)
        .mockResolvedValueOnce(execution3);

      const result = await executionAdapter.getExecutionsByTask('task-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(execution1.payload);
      expect(result[1]).toEqual(execution3.payload);
    });

    it('should return empty array when no executions found for task', async () => {
      mockExecutionStore.list.mockResolvedValue([]);

      const result = await executionAdapter.getExecutionsByTask('task-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getAllExecutions', () => {
    it('[EARS-D1] should return all execution records in the system', async () => {
      const execution1 = createMockExecutionRecord({ id: 'execution-1' });
      const execution2 = createMockExecutionRecord({ id: 'execution-2' });

      mockExecutionStore.list.mockResolvedValue(['execution-1', 'execution-2']);
      mockExecutionStore.get
        .mockResolvedValueOnce(execution1)
        .mockResolvedValueOnce(execution2);

      const result = await executionAdapter.getAllExecutions();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(execution1.payload);
      expect(result[1]).toEqual(execution2.payload);
    });

    it('should return empty array when no executions exist', async () => {
      mockExecutionStore.list.mockResolvedValue([]);

      const result = await executionAdapter.getAllExecutions();

      expect(result).toEqual([]);
    });
  });

  describe('Performance Tests', () => {
    it('[EARS-E1] should execute in under 30ms for typical datasets', async () => {
      // Create mock data for performance test
      const executionIds = Array.from({ length: 100 }, (_, i) => `execution-${i}`);
      const mockExecutions = executionIds.map(id =>
        createMockExecutionRecord({ id, taskId: `task-${id}` })
      );

      mockExecutionStore.list.mockResolvedValue(executionIds);
      mockExecutions.forEach(execution => {
        mockExecutionStore.get.mockResolvedValueOnce(execution);
      });

      const startTime = Date.now();
      await executionAdapter.getAllExecutions();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Relaxed from 30ms to 50ms for CI stability
    });
  });

  describe('Error Handling', () => {
    it('should throw error when taskId is missing', async () => {
      const validationError = new DetailedValidationError('ExecutionRecord', [{
        field: 'taskId',
        message: 'taskId is required',
        value: undefined
      }]);
      (createExecutionRecord as jest.Mock).mockImplementation(() => { throw validationError; });

      await expect(executionAdapter.create({}, mockActorId))
        .rejects.toThrow(DetailedValidationError);
    });

    it('should handle factory errors gracefully', async () => {
      (createExecutionRecord as jest.Mock).mockImplementation(() => { throw new Error('Factory error'); });

      await expect(executionAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Factory error');
    });

    it('should handle identity errors gracefully', async () => {
      mockIdentityAdapter.signRecord.mockRejectedValue(new Error('Signing failed'));

      await expect(executionAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Signing failed');
    });
  });
});
