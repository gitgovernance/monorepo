import { MetricsAdapter } from './index';
import { RecordStore } from '../../store';
import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { FeedbackRecord } from '../../types/feedback_record';
import type { ExecutionRecord } from '../../types/execution_record';
import type { ChangelogRecord } from '../../types/changelog_record';
import type { ActorRecord } from '../../types/actor_record';
import type { GitGovRecord, Signature } from '../../models';

// Mock dependencies
jest.mock('../../store');

// Helper function to create mock task records
function createMockTaskRecord(overrides: Partial<TaskRecord> = {}): GitGovRecord & { payload: TaskRecord } {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        signature: 'mock-sig',
        timestamp,
        timestamp_iso: new Date(timestamp * 1000).toISOString()
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
function createMockFeedbackRecord(overrides: Partial<FeedbackRecord> = {}): GitGovRecord & { payload: FeedbackRecord } {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'feedback',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:reviewer',
        role: 'author',
        signature: 'mock-sig',
        timestamp,
        timestamp_iso: new Date(timestamp * 1000).toISOString()
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
function createMockExecutionRecord(overrides: Partial<ExecutionRecord> = {}): GitGovRecord & { payload: ExecutionRecord } {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'execution',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        signature: 'mock-sig',
        timestamp,
        timestamp_iso: new Date(timestamp * 1000).toISOString()
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `${timestamp}-exec-test-execution`,
      taskId: 'task-123',
      result: 'Test execution result with sufficient length for validation',
      type: 'progress',
      ...overrides
    }
  };
}

// Helper function to create mock cycle records
function createMockCycleRecord(overrides: Partial<CycleRecord> = {}): GitGovRecord & { payload: CycleRecord } {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'cycle',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:developer',
        role: 'author',
        signature: 'mock-sig',
        timestamp,
        timestamp_iso: new Date(timestamp * 1000).toISOString()
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
function createMockActorRecord(overrides: Partial<ActorRecord> = {}): GitGovRecord & { payload: ActorRecord } {
  return {
    header: {
      version: '1.0',
      type: 'actor',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:admin',
        role: 'author',
        signature: 'mock-sig',
        timestamp: 123,
        timestamp_iso: '2025-01-01T00:00:00Z'
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

describe('MetricsAdapter', () => {
  let metricsAdapter: MetricsAdapter;
  let mockTaskStore: jest.Mocked<RecordStore<TaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<CycleRecord>>;
  let mockFeedbackStore: jest.Mocked<RecordStore<FeedbackRecord>>;
  let mockExecutionStore: jest.Mocked<RecordStore<ExecutionRecord>>;
  let mockChangelogStore: jest.Mocked<RecordStore<ChangelogRecord>>;
  let mockActorStore: jest.Mocked<RecordStore<ActorRecord>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock all stores with proper typing
    mockTaskStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<TaskRecord>>;

    mockCycleStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<CycleRecord>>;

    mockFeedbackStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<FeedbackRecord>>;

    mockExecutionStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<ExecutionRecord>>;

    mockChangelogStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<ChangelogRecord>>;

    mockActorStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<ActorRecord>>;

    // Create adapter with all dependencies
    metricsAdapter = new MetricsAdapter({
      taskStore: mockTaskStore,
      cycleStore: mockCycleStore,
      feedbackStore: mockFeedbackStore,
      executionStore: mockExecutionStore,
      changelogStore: mockChangelogStore,
      actorStore: mockActorStore
    });
  });

  describe('Public API - Tier 1 (EARS 1-4)', () => {
    it('[EARS-1] should return system status with tier 1 metrics', async () => {
      const mockTasks = [
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];
      mockTaskStore.list.mockResolvedValue(['task-1', 'task-2', 'task-3']);
      mockTaskStore.read
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[0]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[1]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[2]));

      mockCycleStore.list.mockResolvedValue(['cycle-1', 'cycle-2']);
      mockCycleStore.read
        .mockResolvedValueOnce(createMockCycleRecord({ id: 'cycle-1', status: 'active' }))
        .mockResolvedValueOnce(createMockCycleRecord({ id: 'cycle-2', status: 'completed' }));

      const result = await metricsAdapter.getSystemStatus();

      expect(result.tasks.total).toBe(3);
      expect(result.cycles.total).toBe(2);
      expect(result.health.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.health.overallScore).toBeLessThanOrEqual(100);
    });

    it('[EARS-2] should return task health report with tier 1 metrics', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const mockTask = createMockTaskRecord({ id: `${timestamp}-task-test-task`, status: 'active' });
      mockTaskStore.read.mockResolvedValue(mockTask);
      mockFeedbackStore.list.mockResolvedValue([]);
      mockExecutionStore.list.mockResolvedValue([]);

      const result = await metricsAdapter.getTaskHealth(`${timestamp}-task-test-task`);

      expect(result.taskId).toBe(`${timestamp}-task-test-task`);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.timeInCurrentStage).toBeGreaterThanOrEqual(0);
      expect(result.stalenessIndex).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('[EARS-3] should throw RecordNotFoundError for non-existent task', async () => {
      mockTaskStore.read.mockResolvedValue(null);

      await expect(metricsAdapter.getTaskHealth('non-existent-task'))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent-task');
    });

    it('[EARS-4] should execute in under 100ms for typical datasets', async () => {
      // Create mock data for performance test with valid timestamps
      const timestamp = Math.floor(Date.now() / 1000);
      const taskIds = Array.from({ length: 50 }, (_, i) => `${timestamp + i}-task-test-${i}`);
      const mockTasks = taskIds.map(id => createMockTaskRecord({ id }));

      mockTaskStore.list.mockResolvedValue(taskIds);
      mockTasks.forEach(task => {
        mockTaskStore.read.mockResolvedValueOnce(task);
      });
      mockCycleStore.list.mockResolvedValue([]);

      const startTime = Date.now();
      await metricsAdapter.getSystemStatus();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Tier 1 Calculation Functions (EARS 5-10)', () => {
    it('[EARS-5] should calculate exact days since last state change', () => {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60);
      const task = createMockTaskRecord({ id: `${twoDaysAgo}-task-test` }).payload;

      const result = metricsAdapter.calculateTimeInCurrentStage(task);

      expect(result).toBeCloseTo(2, 1); // Approximately 2 days
    });

    it('[EARS-6] should calculate days since last execution record', () => {
      const tasks = [
        createMockTaskRecord().payload,
        createMockTaskRecord().payload
      ];

      const result = metricsAdapter.calculateStalenessIndex(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-7] should calculate days of oldest active blocking feedback', () => {
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

      const result = metricsAdapter.calculateBlockingFeedbackAge(feedbacks);

      expect(result).toBeCloseTo(3, 1); // Approximately 3 days
    });

    it('[EARS-8] should calculate health percentage using protocol formula', () => {
      const tasks = [
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'paused' }).payload
      ];

      const result = metricsAdapter.calculateHealth(tasks);

      expect(result).toBe(53); // (2*80 + 1*0) / (3*100) * 100 = 53.33% → rounded to 53
    });

    it('[EARS-9] should return status distribution with percentages', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = metricsAdapter.calculateBacklogDistribution(tasks);

      expect(result['draft']).toBe(50); // 2/4 = 50%
      expect(result['active']).toBe(25); // 1/4 = 25%
      expect(result['done']).toBe(25); // 1/4 = 25%
    });

    it('[EARS-10] should count tasks created in last 24 hours', () => {
      const now = Math.floor(Date.now() / 1000);
      const yesterday = now - (25 * 60 * 60); // 25 hours ago
      const today = now - (12 * 60 * 60); // 12 hours ago

      const tasks = [
        createMockTaskRecord({ id: `${today}-task-today` }).payload,
        createMockTaskRecord({ id: `${yesterday}-task-yesterday` }).payload,
        createMockTaskRecord({ id: `${today}-task-today-2` }).payload
      ];

      const result = metricsAdapter.calculateTasksCreatedToday(tasks);

      expect(result).toBe(2); // Only tasks from today
    });
  });

  describe('Tier 2 Calculation Functions (EARS 17-20)', () => {
    it('[EARS-17] should count tasks done in last 7 days for throughput', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveDaysAgo = now - (5 * 24 * 60 * 60);
      const tenDaysAgo = now - (10 * 24 * 60 * 60);

      const tasks = [
        createMockTaskRecord({ id: `${fiveDaysAgo}-task-recent`, status: 'done' }).payload,
        createMockTaskRecord({ id: `${tenDaysAgo}-task-old`, status: 'done' }).payload,
        createMockTaskRecord({ id: `${fiveDaysAgo}-task-recent-2`, status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload
      ];

      const result = metricsAdapter.calculateThroughput(tasks);

      expect(result).toBe(2); // Only tasks completed in last 7 days
    });

    it('[EARS-18] should calculate average done-draft time for lead time', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload // Should be filtered out
      ];

      const result = metricsAdapter.calculateLeadTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-19] should calculate average done-active time for cycle time', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = metricsAdapter.calculateCycleTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-20] should count unique agents with executions in 24h', () => {
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

      const result = metricsAdapter.calculateActiveAgents(actors, executions);

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Public API - Tier 2 (EARS 21-24)', () => {
    it('[EARS-21] should return productivity metrics with tier 2 calculations', async () => {
      const mockTasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload
      ];

      mockTaskStore.list.mockResolvedValue(['task-1', 'task-2']);
      mockTaskStore.read
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[0]))
        .mockResolvedValueOnce(createMockTaskRecord(mockTasks[1]));

      const result = await metricsAdapter.getProductivityMetrics();

      expect(result.throughput).toBeGreaterThanOrEqual(0);
      expect(result.leadTime).toBeGreaterThanOrEqual(0);
      expect(result.cycleTime).toBeGreaterThanOrEqual(0);
      expect(result.tasksCompleted7d).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-22] should return collaboration metrics with agent activity', async () => {
      mockActorStore.list.mockResolvedValue(['actor-1']);
      mockActorStore.read.mockResolvedValue(createMockActorRecord({ type: 'agent' }));
      mockExecutionStore.list.mockResolvedValue(['exec-1']);
      mockExecutionStore.read.mockResolvedValue(createMockExecutionRecord());

      const result = await metricsAdapter.getCollaborationMetrics();

      expect(result.activeAgents).toBeGreaterThanOrEqual(0);
      expect(result.totalAgents).toBeGreaterThanOrEqual(0);
      expect(result.agentUtilization).toBeGreaterThanOrEqual(0);
      expect(result.agentUtilization).toBeLessThanOrEqual(100);
    });

    it('[EARS-23] should execute in under 200ms for tier 2 methods', async () => {
      // Setup mock data
      mockTaskStore.list.mockResolvedValue(['task-1']);
      mockTaskStore.read.mockResolvedValue(createMockTaskRecord());
      mockActorStore.list.mockResolvedValue(['actor-1']);
      mockActorStore.read.mockResolvedValue(createMockActorRecord());
      mockExecutionStore.list.mockResolvedValue(['exec-1']);
      mockExecutionStore.read.mockResolvedValue(createMockExecutionRecord());

      const startTime = Date.now();
      await metricsAdapter.getProductivityMetrics();
      await metricsAdapter.getCollaborationMetrics();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200);
    });

    it('[EARS-24] should apply graceful degradation for missing stores in tier 2', async () => {
      const metricsAdapterMinimal = new MetricsAdapter({
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore
        // No optional stores
      });

      mockTaskStore.list.mockResolvedValue([]);

      const productivityResult = await metricsAdapterMinimal.getProductivityMetrics();
      const collaborationResult = await metricsAdapterMinimal.getCollaborationMetrics();

      expect(productivityResult.throughput).toBe(0);
      expect(collaborationResult.activeAgents).toBe(0);
    });
  });

  describe('Error Handling & Graceful Degradation (EARS 11-16)', () => {
    it('[EARS-11] should validate input and throw InvalidDataError for invalid data', () => {
      expect(() => metricsAdapter.calculateHealth('invalid' as unknown as TaskRecord[]))
        .toThrow('InvalidDataError: tasks must be an array');

      expect(() => metricsAdapter.calculateBlockingFeedbackAge('invalid' as unknown as FeedbackRecord[]))
        .toThrow('InvalidDataError: feedback must be an array');
    });

    it('[EARS-12] should return 0 for empty datasets with graceful degradation', () => {
      const result = metricsAdapter.calculateHealth([]);
      expect(result).toBe(0);

      const distributionResult = metricsAdapter.calculateBacklogDistribution([]);
      expect(distributionResult).toEqual({});
    });

    it('[EARS-13] should return 0 without execution store with graceful degradation', () => {
      const metricsAdapterNoExecution = new MetricsAdapter({
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore
        // No executionStore
      });

      const tasks = [createMockTaskRecord().payload];
      const result = metricsAdapterNoExecution.calculateStalenessIndex(tasks);

      expect(result).toBe(0);
    });

    it('[EARS-14] should return 0 without feedback store with graceful degradation', () => {
      const metricsAdapterNoFeedback = new MetricsAdapter({
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore
        // No feedbackStore
      });

      const feedbacks = [createMockFeedbackRecord().payload];
      const result = metricsAdapterNoFeedback.calculateBlockingFeedbackAge(feedbacks);

      expect(result).toBe(0);
    });

    it('[EARS-15] should throw NotImplementedError for unimplemented tiers', () => {
      const tasks = [createMockTaskRecord().payload];

      expect(() => metricsAdapter.calculateQuality(tasks))
        .toThrow('NotImplementedError: Tier 3 metrics not implemented yet');

      expect(() => metricsAdapter.calculateReworkRate(tasks))
        .toThrow('NotImplementedError: Tier 3 metrics not implemented yet');
    });

    it('[EARS-16] should return null for premium metrics without platform API', () => {
      const result1 = metricsAdapter.calculateCostBurnRate([]);
      const result2 = metricsAdapter.calculateTokenConsumption([]);
      const result3 = metricsAdapter.calculateTokenConsumptionByAgent([]);

      expect(result1).toBe(0);
      expect(result2).toBe(0);
      expect(result3).toEqual({});
    });
  });

  describe('Mathematical Robustness & Edge Cases (EARS 25-30)', () => {
    it('[EARS-25] should use creation timestamp as fallback without signatures', () => {
      const task = createMockTaskRecord().payload;

      const result = metricsAdapter.calculateTimeInCurrentStage(task);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-26] should filter only completed tasks for lead time calculation', () => {
      const tasks = [
        createMockTaskRecord({ status: 'done' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        createMockTaskRecord({ status: 'done' }).payload
      ];

      const result = metricsAdapter.calculateLeadTime(tasks);

      expect(result).toBeGreaterThanOrEqual(0);
      // Should only consider the 2 'done' tasks
    });

    it('[EARS-27] should return 0 for tasks that were never active', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'review' }).payload
      ];

      const result = metricsAdapter.calculateCycleTime(tasks);

      expect(result).toBe(0); // No tasks were ever active
    });

    it('[EARS-28] should validate timestamps and throw error for invalid data', () => {
      const invalidTask = createMockTaskRecord({ id: 'invalid-id-format' }).payload;

      expect(() => metricsAdapter.calculateTimeInCurrentStage(invalidTask))
        .toThrow('InvalidDataError');
    });

    it('[EARS-29] should ignore tasks with invalid status in distribution', () => {
      const tasks = [
        createMockTaskRecord({ status: 'draft' }).payload,
        createMockTaskRecord({ status: 'active' }).payload,
        { ...createMockTaskRecord().payload, status: 'invalid-status' as unknown as TaskRecord['status'] }
      ];

      const result = metricsAdapter.calculateBacklogDistribution(tasks);

      // Should only count valid tasks (2 out of 3)
      expect(result['draft']).toBe(50); // 1/2 = 50%
      expect(result['active']).toBe(50); // 1/2 = 50%
    });

    it('[EARS-30] should return 0 for division by zero with graceful degradation', () => {
      const result = metricsAdapter.calculateHealth([]);
      expect(result).toBe(0);

      const leadTimeResult = metricsAdapter.calculateLeadTime([]);
      expect(leadTimeResult).toBe(0);

      const cycleTimeResult = metricsAdapter.calculateCycleTime([]);
      expect(cycleTimeResult).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      const largeTasks = Array.from({ length: 1000 }, (_, i) =>
        createMockTaskRecord({ id: `${Date.now()}-task-${i}` }).payload
      );

      const startTime = Date.now();
      metricsAdapter.calculateHealth(largeTasks);
      metricsAdapter.calculateBacklogDistribution(largeTasks);
      metricsAdapter.calculateTasksCreatedToday(largeTasks);
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
      mockTaskStore.read
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2)
        .mockResolvedValueOnce(mockTask1); // For getTaskHealth call

      mockCycleStore.list.mockResolvedValue([]);
      mockFeedbackStore.list.mockResolvedValue([]);
      mockExecutionStore.list.mockResolvedValue([]);

      const systemStatus = await metricsAdapter.getSystemStatus();
      const taskHealth = await metricsAdapter.getTaskHealth(task1Id);

      expect(systemStatus.tasks.total).toBe(2);
      expect(taskHealth.taskId).toBe(task1Id);
    });
  });
});
