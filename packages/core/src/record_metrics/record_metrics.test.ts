import { RecordMetrics } from './index';
import type { RecordStore } from '../record_store';
import type {
  TaskRecord,
  CycleRecord,
  FeedbackRecord,
  ExecutionRecord,
  ActorRecord,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  Signature
} from '../record_types';

// Helper function to create mock task records
function createMockTaskRecord(overrides: Partial<TaskRecord> = {}): GitGovTaskRecord {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        notes: '',
        signature: 'mock-sig',
        timestamp
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `${timestamp}-task-test-task`,
      title: 'Test Task',
      status: 'draft',
      priority: 'medium',
      description: 'Test task description',
      tags: ['test'],
      ...overrides
    }
  };
}

// Helper function to create mock feedback records
function createMockFeedbackRecord(overrides: Partial<FeedbackRecord> = {}): GitGovFeedbackRecord {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'feedback',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:reviewer',
        role: 'author',
        notes: '',
        signature: 'mock-sig',
        timestamp
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `${timestamp}-feedback-test-feedback`,
      entityType: 'task',
      entityId: 'task-123',
      type: 'suggestion',
      status: 'open',
      content: 'Test feedback content',
      ...overrides
    }
  };
}

// Helper function to create mock execution records
function createMockExecutionRecord(overrides: Partial<ExecutionRecord> = {}): GitGovExecutionRecord {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'execution',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        notes: '',
        signature: 'mock-sig',
        timestamp
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `${timestamp}-exec-test-execution`,
      taskId: 'task-123',
      type: 'progress',
      title: 'Test Execution',
      result: 'Test execution result with sufficient length for validation',
      ...overrides
    }
  };
}

// Helper function to create mock cycle records
function createMockCycleRecord(overrides: Partial<CycleRecord> = {}): GitGovCycleRecord {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'cycle',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        notes: '',
        signature: 'mock-sig',
        timestamp
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `${timestamp}-cycle-test-cycle`,
      title: 'Test Cycle',
      status: 'planning',
      taskIds: [],
      ...overrides
    }
  };
}

// Helper function to create mock actor records
function createMockActorRecord(overrides: Partial<ActorRecord> = {}): GitGovActorRecord {
  return {
    header: {
      version: '1.0',
      type: 'actor',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:admin',
        role: 'author',
        notes: '',
        signature: 'mock-sig',
        timestamp: 123
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: 'human:test-user',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'test-key',
      roles: ['developer'],
      status: 'active',
      ...overrides
    }
  };
}

describe('RecordMetrics', () => {
  let recordMetrics: RecordMetrics;
  let mockTaskStore: jest.Mocked<RecordStore<GitGovTaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<GitGovCycleRecord>>;
  let mockFeedbackStore: jest.Mocked<RecordStore<GitGovFeedbackRecord>>;
  let mockExecutionStore: jest.Mocked<RecordStore<GitGovExecutionRecord>>;
  let mockActorStore: jest.Mocked<RecordStore<GitGovActorRecord>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock all stores with proper typing
    mockTaskStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovTaskRecord>>;

    mockCycleStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovCycleRecord>>;

    mockFeedbackStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovFeedbackRecord>>;

    mockExecutionStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovExecutionRecord>>;

    mockActorStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovActorRecord>>;

    // Create adapter with all dependencies
    recordMetrics = new RecordMetrics({
      stores: {
        tasks: mockTaskStore,
        cycles: mockCycleStore,
        feedbacks: mockFeedbackStore,
        executions: mockExecutionStore,
        actors: mockActorStore
      }
    });
  });

  describe('Block A: Public API - Tier 1 (EARS-A1 to EARS-A4)', () => {
    it('[EARS-A1] should return system status with tier 1 metrics', async () => {
      const mockTasks = [
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];
      mockTaskStore.list.mockResolvedValue(['task-1', 'task-2', 'task-3']);
      mockTaskStore.get
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[0]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[1]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[2]));

      mockCycleStore.list.mockResolvedValue(['cycle-1', 'cycle-2']);
      mockCycleStore.get
        .mockResolvedValueOnce(createMockCycleRecord({ id: 'cycle-1', status: 'active' }))
        .mockResolvedValueOnce(createMockCycleRecord({ id: 'cycle-2', status: 'completed' }));

      const result = await recordMetrics.getSystemStatus();

      expect(result.tasks.total).toBe(3);
      expect(result.cycles.total).toBe(2);
      expect(result.health.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.health.overallScore).toBeLessThanOrEqual(100);
    });

    it('[EARS-A2] should return task health report with tier 1 metrics', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const mockTask = createMockTaskRecord({ id: `${timestamp}-task-test-task`, status: 'active' });
      mockTaskStore.get.mockResolvedValue(mockTask);
      mockFeedbackStore.list.mockResolvedValue([]);
      mockExecutionStore.list.mockResolvedValue([]);

      const result = await recordMetrics.getTaskHealth(`${timestamp}-task-test-task`);

      expect(result.taskId).toBe(`${timestamp}-task-test-task`);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.timeInCurrentStage).toBeGreaterThanOrEqual(0);
      expect(result.stalenessIndex).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('[EARS-A3] should throw RecordNotFoundError for non-existent task', async () => {
      mockTaskStore.get.mockResolvedValue(null);

      await expect(recordMetrics.getTaskHealth('non-existent-task'))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent-task');
    });

    it('[EARS-A4] should execute in under 100ms for typical datasets', async () => {
      // Create mock data for performance test with valid timestamps
      const timestamp = Math.floor(Date.now() / 1000);
      const taskIds = Array.from({ length: 50 }, (_, i) => `${timestamp + i}-task-test-${i}`);
      const mockTasks = taskIds.map(id => createMockTaskRecord({ id }));

      mockTaskStore.list.mockResolvedValue(taskIds);
      mockTasks.forEach(task => {
        mockTaskStore.get.mockResolvedValueOnce(task);
      });
      mockCycleStore.list.mockResolvedValue([]);

      const startTime = Date.now();
      await recordMetrics.getSystemStatus();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Block B: Tier 1 Calculation Functions (EARS-B1 to EARS-B7)', () => {
    it('[EARS-B1] should calculate exact days since last state change', () => {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60);
      const task = createMockTaskRecord({ id: `${twoDaysAgo}-task-test` }).payload;

      const result = recordMetrics.calculateTimeInCurrentStage(task);

      expect(result).toBeCloseTo(2, 1); // Approximately 2 days
    });

    it('[EARS-B2] should calculate days since last execution record', () => {
      const tasks = [
        createMockTaskRecord().payload,
        createMockTaskRecord().payload
      ];

      const result = recordMetrics.calculateStalenessIndex(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-B3] should calculate days of oldest active blocking feedback', () => {
      const threeDaysAgo = Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60);
      const feedbacks = [
        createMockFeedbackRecord({
          id: `${threeDaysAgo}-feedback-old-block`,
          type: 'blocking',
          status: 'open'
        }).payload,
        createMockFeedbackRecord({
          type: 'suggestion',
          status: 'open'
        }).payload
      ];

      const result = recordMetrics.calculateBlockingFeedbackAge(feedbacks);

      expect(result).toBeCloseTo(3, 1); // Approximately 3 days
    });

    it('[EARS-B4] should calculate health percentage using protocol formula', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,      // 100 points
        createMockTaskRecord({ status: 'archived' }).payload,  // 100 points (NEW: Include archived)
        createMockTaskRecord({ status: 'active' }).payload,    // 80 points
        createMockTaskRecord({ status: 'paused' }).payload     // 0 points
      ];

      const result = recordMetrics.calculateHealth(tasks);

      expect(result).toBe(70); // (100 + 100 + 80 + 0) / (4*100) * 100 = 70%
    });

    it('[EARS-B5] should return status distribution with percentages', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = recordMetrics.calculateBacklogDistribution(tasks);

      expect(result['draft']).toBe(50); // 2/4 = 50%
      expect(result['active']).toBe(25); // 1/4 = 25%
      expect(result['done']).toBe(25); // 1/4 = 25%
    });

    it('[EARS-B6] should count tasks created in last 24 hours', () => {
      const now = Math.floor(Date.now() / 1000);
      const yesterday = now - (25 * 60 * 60); // 25 hours ago
      const today = now - (12 * 60 * 60); // 12 hours ago

      const tasks = [
        createMockTaskRecord({ id: `${today}-task-today` }).payload,
        createMockTaskRecord({ id: `${yesterday}-task-yesterday` }).payload,
        createMockTaskRecord({ id: `${today}-task-today-2` }).payload
      ];

      const result = recordMetrics.calculateTasksCreatedToday(tasks);

      expect(result).toBe(2); // Only tasks from today
    });

    it('[EARS-B7] should include archived tasks to prevent health drops during archiving', () => {
      const tasksBeforeArchiving = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'done' }).payload,
      ];

      const tasksAfterArchiving = [
        createMockTaskRecord({ status: 'archived' }).payload,  // Was 'done'
        createMockTaskRecord({ status: 'done' }).payload,
      ];

      const healthBefore = recordMetrics.calculateHealth(tasksBeforeArchiving);
      const healthAfter = recordMetrics.calculateHealth(tasksAfterArchiving);

      // Health should remain the same: both done and archived = 100%
      expect(healthBefore).toBe(100);
      expect(healthAfter).toBe(100);
    });
  });

  describe('Block D: Tier 2 Calculation Functions (EARS-D1 to EARS-D4)', () => {
    it('[EARS-D1] should count tasks done in last 7 days for throughput', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveDaysAgo = now - (5 * 24 * 60 * 60);
      const tenDaysAgo = now - (10 * 24 * 60 * 60);

      const tasks = [
        createMockTaskRecord({ id: `${fiveDaysAgo}-task-recent`, status: 'done' }).payload,
        createMockTaskRecord({ id: `${tenDaysAgo}-task-old`, status: 'done' }).payload,
        createMockTaskRecord({ id: `${fiveDaysAgo}-task-recent-2`, status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload
      ];

      const result = recordMetrics.calculateThroughput(tasks);

      expect(result).toBe(2); // Only tasks completed in last 7 days
    });

    it('[EARS-D2] should calculate average done-draft time for lead time', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload // Should be filtered out
      ];

      const result = recordMetrics.calculateLeadTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-D3] should calculate average done-active time for cycle time', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = recordMetrics.calculateCycleTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-D4] should count unique agents with executions in 24h', () => {
      const actors = [
        createMockActorRecord({ id: 'agent:ai-1', type: 'agent' }).payload,
        createMockActorRecord({ id: 'agent:ai-2', type: 'agent' }).payload,
        createMockActorRecord({ id: 'human:dev-1', type: 'human' }).payload
      ];

      const now = Math.floor(Date.now() / 1000);
      const executions = [
        createMockExecutionRecord({ id: `${now}-exec-recent` }).payload,
        createMockExecutionRecord({ id: `${now}-exec-recent-2` }).payload
      ];

      const result = recordMetrics.calculateActiveAgents(actors, executions);

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Block E: Public API - Tier 2 (EARS-E1 to EARS-E3)', () => {
    it('[EARS-E1] should return productivity metrics with tier 2 calculations', async () => {
      const mockTasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload
      ];

      mockTaskStore.list.mockResolvedValue(['task-1', 'task-2']);
      mockTaskStore.get
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[0]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[1]));

      const result = await recordMetrics.getProductivityMetrics();

      expect(result.throughput).toBeGreaterThanOrEqual(0);
      expect(result.leadTime).toBeGreaterThanOrEqual(0);
      expect(result.cycleTime).toBeGreaterThanOrEqual(0);
      expect(result.tasksCompleted7d).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-E2] should return collaboration metrics with agent activity', async () => {
      mockActorStore.list.mockResolvedValue(['actor-1']);
      mockActorStore.get.mockResolvedValue(createMockActorRecord({ type: 'agent' }));
      mockExecutionStore.list.mockResolvedValue(['exec-1']);
      mockExecutionStore.get.mockResolvedValue(createMockExecutionRecord());

      const result = await recordMetrics.getCollaborationMetrics();

      expect(result.activeAgents).toBeGreaterThanOrEqual(0);
      expect(result.totalAgents).toBeGreaterThanOrEqual(0);
      expect(result.agentUtilization).toBeGreaterThanOrEqual(0);
      expect(result.agentUtilization).toBeLessThanOrEqual(100);
    });

    it('[EARS-E3] should execute in under 200ms for tier 2 methods', async () => {
      // Setup mock data
      mockTaskStore.list.mockResolvedValue(['task-1']);
      mockTaskStore.get.mockResolvedValue(createMockTaskRecord());
      mockActorStore.list.mockResolvedValue(['actor-1']);
      mockActorStore.get.mockResolvedValue(createMockActorRecord());
      mockExecutionStore.list.mockResolvedValue(['exec-1']);
      mockExecutionStore.get.mockResolvedValue(createMockExecutionRecord());

      const startTime = Date.now();
      await recordMetrics.getProductivityMetrics();
      await recordMetrics.getCollaborationMetrics();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200);
    });

  });

  describe('Block C: Error Handling (EARS-C1 to EARS-C4)', () => {
    it('[EARS-C1] should validate input and throw InvalidDataError for invalid data', () => {
      expect(() => recordMetrics.calculateHealth('invalid' as unknown as TaskRecord[]))
        .toThrow('InvalidDataError: tasks must be an array');

      expect(() => recordMetrics.calculateBlockingFeedbackAge('invalid' as unknown as FeedbackRecord[]))
        .toThrow('InvalidDataError: feedback must be an array');
    });

    it('[EARS-C2] should return 0 for empty datasets', () => {
      const result = recordMetrics.calculateHealth([]);
      expect(result).toBe(0);

      const distributionResult = recordMetrics.calculateBacklogDistribution([]);
      expect(distributionResult).toEqual({});
    });

    it('[EARS-C3] should throw NotImplementedError for unimplemented tiers', () => {
      const tasks = [createMockTaskRecord().payload];

      expect(() => recordMetrics.calculateQuality(tasks))
        .toThrow('NotImplementedError: Tier 3 metrics not implemented yet');

      expect(() => recordMetrics.calculateReworkRate(tasks))
        .toThrow('NotImplementedError: Tier 3 metrics not implemented yet');
    });

    it('[EARS-C4] should throw NotImplementedError for Tier 4 premium metrics', () => {
      expect(() => recordMetrics.calculateCostBurnRate())
        .toThrow('NotImplementedError: Tier 4 premium metrics not implemented yet');

      expect(() => recordMetrics.calculateTokenConsumption())
        .toThrow('NotImplementedError: Tier 4 premium metrics not implemented yet');

      expect(() => recordMetrics.calculateTokenConsumptionByAgent())
        .toThrow('NotImplementedError: Tier 4 premium metrics not implemented yet');
    });

  });

  describe('Block F: Mathematical Robustness & Edge Cases (EARS-F1 to EARS-F6)', () => {
    it('[EARS-F1] should use creation timestamp as fallback without signatures', () => {
      const task = createMockTaskRecord().payload;

      const result = recordMetrics.calculateTimeInCurrentStage(task);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-F2] should filter only completed tasks for lead time calculation', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = recordMetrics.calculateLeadTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
      // Should only consider the 2 'done' tasks
    });

    it('[EARS-F3] should return 0 for tasks that were never active', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'review' }).payload
      ];

      const result = recordMetrics.calculateCycleTime(tasks);

      expect(result).toBe(0); // No tasks were ever active
    });

    it('[EARS-F4] should validate timestamps and throw error for invalid data', () => {
      const invalidTask = createMockTaskRecord({ id: 'invalid-id-format' }).payload;

      expect(() => recordMetrics.calculateTimeInCurrentStage(invalidTask))
        .toThrow('InvalidDataError');
    });

    it('[EARS-F5] should ignore tasks with invalid status in distribution', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        { ...createMockTaskRecord().payload, status: 'invalid-status' as unknown as TaskRecord['status'] }
      ];

      const result = recordMetrics.calculateBacklogDistribution(tasks);

      // Should only count valid tasks (2 out of 3)
      expect(result['draft']).toBe(50); // 1/2 = 50%
      expect(result['active']).toBe(50); // 1/2 = 50%
    });

    it('[EARS-F6] should return 0 for division by zero', () => {
      const result = recordMetrics.calculateHealth([]);
      expect(result).toBe(0);

      const leadTimeResult = recordMetrics.calculateLeadTime([]);
      expect(leadTimeResult).toBe(0);

      const cycleTimeResult = recordMetrics.calculateCycleTime([]);
      expect(cycleTimeResult).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      const largeTasks = Array.from({ length: 1000 }, (_, i) =>
        createMockTaskRecord({ id: `${Date.now()}-task-${i}` }).payload
      );

      const startTime = Date.now();
      recordMetrics.calculateHealth(largeTasks);
      recordMetrics.calculateBacklogDistribution(largeTasks);
      recordMetrics.calculateTasksCreatedToday(largeTasks);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be very fast for pure calculations
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with real-like data', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const task1Id = `${timestamp}-task-active`;
      const task2Id = `${timestamp + 1}-task-done`;

      const mockTask1 = createMockTaskRecord({ id: task1Id, status: 'active', priority: 'high' });
      const mockTask2 = createMockTaskRecord({ id: task2Id, status: 'done', priority: 'medium' });

      mockTaskStore.list.mockResolvedValue([task1Id, task2Id]);
      mockTaskStore.get
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2)
        .mockResolvedValueOnce(mockTask1); // For getTaskHealth call

      mockCycleStore.list.mockResolvedValue([]);
      mockFeedbackStore.list.mockResolvedValue([]);
      mockExecutionStore.list.mockResolvedValue([]);

      const systemStatus = await recordMetrics.getSystemStatus();
      const taskHealth = await recordMetrics.getTaskHealth(task1Id);

      expect(systemStatus.tasks.total).toBe(2);
      expect(taskHealth.taskId).toBe(task1Id);
    });
  });
});
