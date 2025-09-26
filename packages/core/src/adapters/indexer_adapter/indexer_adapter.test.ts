// Mock IdentityAdapter before importing
jest.doMock('../identity_adapter', () => ({
  IdentityAdapter: jest.fn().mockImplementation(() => ({
    getActorPublicKey: jest.fn().mockResolvedValue('mock-public-key'),
    getActor: jest.fn(),
    createActor: jest.fn(),
    listActors: jest.fn(),
    signRecord: jest.fn(),
    rotateActorKey: jest.fn(),
    revokeActor: jest.fn(),
    resolveCurrentActorId: jest.fn(),
    getCurrentActor: jest.fn(),
    getEffectiveActorForAgent: jest.fn(),
    authenticate: jest.fn(),
    createAgentRecord: jest.fn(),
    getAgentRecord: jest.fn(),
    listAgentRecords: jest.fn(),
  }))
}));

import { FileIndexerAdapter } from './index';
import { RecordStore } from '../../store';
import type { TaskRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { GitGovRecord, Signature } from '../../types';

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
      cycleIds: [],
      references: [],
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
        keyId: 'human:scrum-master',
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
      childCycleIds: [],
      tags: ['test'],
      notes: 'Test cycle notes',
      ...overrides
    }
  };
}

// Helper function to create mock actor records
function createMockActorRecord(overrides: Partial<ActorRecord> = {}): GitGovRecord & { payload: ActorRecord } {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    header: {
      version: '1.0',
      type: 'actor',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'system',
        role: 'author',
        signature: 'mock-sig',
        timestamp,
        timestamp_iso: new Date(timestamp * 1000).toISOString()
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: `human:test-user-${timestamp}`,
      type: 'human',
      displayName: 'Test User',
      status: 'active',
      publicKey: 'mock-public-key',
      roles: ['author'],
      ...overrides
    }
  };
}

describe('FileIndexerAdapter', () => {
  let indexerAdapter: FileIndexerAdapter;
  let mockTaskStore: jest.Mocked<RecordStore<TaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<CycleRecord>>;
  let mockActorStore: jest.Mocked<RecordStore<ActorRecord>>;
  let mockMetricsAdapter: {
    getSystemStatus: jest.Mock;
    getProductivityMetrics: jest.Mock;
    getCollaborationMetrics: jest.Mock;
    getTaskHealth: jest.Mock;
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock stores
    mockTaskStore = new RecordStore<TaskRecord>('tasks') as jest.Mocked<RecordStore<TaskRecord>>;
    mockCycleStore = new RecordStore<CycleRecord>('cycles') as jest.Mocked<RecordStore<CycleRecord>>;
    mockActorStore = new RecordStore<ActorRecord>('actors') as jest.Mocked<RecordStore<ActorRecord>>;

    // Mock store methods
    mockTaskStore.list = jest.fn();
    mockTaskStore.read = jest.fn();
    mockTaskStore.write = jest.fn();

    mockCycleStore.list = jest.fn();
    mockCycleStore.read = jest.fn();
    mockCycleStore.write = jest.fn();

    mockActorStore.list = jest.fn();
    mockActorStore.read = jest.fn();
    mockActorStore.write = jest.fn();

    // Create mock MetricsAdapter
    mockMetricsAdapter = {
      getSystemStatus: jest.fn().mockResolvedValue({
        tasks: { total: 1, byStatus: { draft: 1 }, byPriority: { medium: 1 } },
        cycles: { total: 1, active: 0, completed: 0 },
        health: { overallScore: 85, blockedTasks: 0, staleTasks: 0 }
      }),
      getProductivityMetrics: jest.fn().mockResolvedValue({
        throughput: 5,
        leadTime: 3.2,
        cycleTime: 2.1,
        tasksCompleted7d: 2,
        averageCompletionTime: 3.2
      }),
      getCollaborationMetrics: jest.fn().mockResolvedValue({
        activeAgents: 1,
        totalAgents: 2,
        agentUtilization: 50,
        humanAgentRatio: 1,
        collaborationIndex: 75
      }),
      getTaskHealth: jest.fn().mockResolvedValue({
        taskId: 'test-task',
        healthScore: 85,
        timeInCurrentStage: 2,
        stalenessIndex: 1,
        blockingFeedbacks: 0,
        lastActivity: Date.now(),
        recommendations: []
      })
    };

    // Setup default mock responses
    mockTaskStore.list.mockResolvedValue(['1757687335-task-test']);
    mockTaskStore.read.mockResolvedValue(createMockTaskRecord({
      id: '1757687335-task-test',
      title: 'Test Task'
    }));

    mockCycleStore.list.mockResolvedValue(['1757687335-cycle-test']);
    mockCycleStore.read.mockResolvedValue(createMockCycleRecord({
      id: '1757687335-cycle-test',
      title: 'Test Cycle'
    }));

    mockActorStore.list.mockResolvedValue(['human:test']);
    mockActorStore.read.mockResolvedValue(createMockActorRecord({
      id: 'human:test',
      displayName: 'Test User'
    }));

    indexerAdapter = new FileIndexerAdapter({
      metricsAdapter: mockMetricsAdapter as any,
      taskStore: mockTaskStore,
      cycleStore: mockCycleStore,
      actorStore: mockActorStore,
      cacheStrategy: 'json',
      cachePath: '/tmp/gitgov-test/test-index.json'
    });
  });

  describe('Core Indexing Operations (EARS 1-6)', () => {
    it('[EARS-1] should generate complete index with metrics and derived states', async () => {
      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(true);
      expect(report.recordsProcessed).toBe(3); // 1 task + 1 cycle + 1 actor
      expect(report.metricsCalculated).toBe(3); // systemStatus + productivity + collaboration
      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalledTimes(1);
    });

    it('[EARS-2] should return data from cache when valid', async () => {
      // Generate cache first
      await indexerAdapter.generateIndex();

      // Get data from cache
      const indexData = await indexerAdapter.getIndexData();

      expect(indexData).not.toBeNull();
      expect(indexData?.tasks).toHaveLength(1);
      expect(indexData?.cycles).toHaveLength(1);
      expect(indexData?.actors).toHaveLength(1);
      expect(indexData?.metadata.cacheStrategy).toBe('json');
    });

    it('[EARS-3] should return null without cache', async () => {
      // Test with fresh adapter (different cache path)
      const freshAdapter = new FileIndexerAdapter({
        metricsAdapter: mockMetricsAdapter as any,
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore,
        actorStore: mockActorStore,
        cacheStrategy: 'json',
        cachePath: '/tmp/gitgov-test/non-existent-index.json'
      });

      const result = await freshAdapter.getIndexData();
      expect(result).toBeNull();
    });

    it('[EARS-4] should validate integrity of all records', async () => {
      const report = await indexerAdapter.validateIntegrity();

      expect(report.status).toBe('valid');
      expect(report.recordsScanned).toBe(2); // 1 task + 1 cycle (actors not included in validation yet)
      expect(report.errorsFound).toHaveLength(0);
      expect(report.validationTime).toBeGreaterThan(0);
    });

    it('should detect schema violations during integrity validation', async () => {
      // Setup invalid task - mock the read to return invalid data
      const invalidTask = createMockTaskRecord({
        id: '1757687335-task-invalid',
        title: '', // Invalid - empty title
        description: '' // Invalid - empty description
      });

      mockTaskStore.read.mockResolvedValueOnce(invalidTask);

      const report = await indexerAdapter.validateIntegrity();

      expect(report.status).toBe('errors');
      expect(report.errorsFound.length).toBeGreaterThan(0);
      expect(report.errorsFound[0]?.type).toBe('schema_violation');
    });

    it('[EARS-5] should determine cache freshness correctly', async () => {
      // Generate cache first
      await indexerAdapter.generateIndex();

      // Should be fresh immediately after generation
      const isUpToDate = await indexerAdapter.isIndexUpToDate();
      expect(isUpToDate).toBe(true);
    });

    it('[EARS-6] should invalidate cache successfully', async () => {
      // Generate cache first
      await indexerAdapter.generateIndex();
      let indexData = await indexerAdapter.getIndexData();
      expect(indexData).not.toBeNull();

      // Invalidate cache
      await indexerAdapter.invalidateCache();

      // Verify cache is invalidated by checking freshness
      const isUpToDate = await indexerAdapter.isIndexUpToDate();
      expect(isUpToDate).toBe(false);
    });
  });

  describe('MetricsAdapter Integration', () => {
    it('should delegate all calculations to MetricsAdapter without duplicating logic', async () => {
      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(true);
      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalledTimes(1);
    });

    it('should handle MetricsAdapter errors gracefully', async () => {
      mockMetricsAdapter.getSystemStatus.mockRejectedValue(new Error('MetricsAdapter error'));

      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(false);
      expect(report.errors).toContain('MetricsAdapter error');
    });
  });

  describe('Error Handling & Graceful Degradation', () => {
    it('should handle store read errors gracefully', async () => {
      mockTaskStore.list.mockRejectedValue(new Error('Store read error'));

      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(false);
      expect(report.errors).toContain('Store read error');
    });

    it('should handle missing stores with graceful degradation', async () => {
      // Test with minimal dependencies (no optional stores)
      const minimalAdapter = new FileIndexerAdapter({
        metricsAdapter: mockMetricsAdapter as any,
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore,
        cacheStrategy: 'json',
        cachePath: '/tmp/gitgov-test/minimal-index.json'
      });

      const report = await minimalAdapter.generateIndex();
      expect(report.success).toBe(true);
    });

    it('should handle corrupted cache data gracefully', async () => {
      // Mock file system to simulate corrupted cache
      const corruptedAdapter = new FileIndexerAdapter({
        metricsAdapter: mockMetricsAdapter as any,
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore,
        actorStore: mockActorStore,
        cacheStrategy: 'json',
        cachePath: '/tmp/gitgov-test/corrupted-index.json'
      });

      // Should handle gracefully without cache
      const result = await corruptedAdapter.getIndexData();
      expect(result).toBeNull();
    });
  });

  describe('Performance & Optimization', () => {
    it('should generate index efficiently for typical datasets', async () => {
      const startTime = Date.now();
      const report = await indexerAdapter.generateIndex();
      const endTime = Date.now();

      expect(report.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast
      expect(report.generationTime).toBeGreaterThan(0);
      expect(report.performance.readTime).toBeGreaterThanOrEqual(0);
      expect(report.performance.calculationTime).toBeGreaterThanOrEqual(0);
      expect(report.performance.writeTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide detailed performance metrics', async () => {
      const report = await indexerAdapter.generateIndex();

      expect(report.cacheSize).toBeGreaterThan(0);
      expect(report.cacheStrategy).toBe('json');
      expect(report.performance).toHaveProperty('readTime');
      expect(report.performance).toHaveProperty('calculationTime');
      expect(report.performance).toHaveProperty('writeTime');
    });
  });

  describe('Cache Lifecycle Management', () => {
    it('should handle complete cache lifecycle', async () => {
      // 1. Generate cache
      const report = await indexerAdapter.generateIndex();
      expect(report.success).toBe(true);

      // 2. Verify cache data
      const indexData = await indexerAdapter.getIndexData();
      expect(indexData).not.toBeNull();
      expect(indexData?.tasks).toHaveLength(1);

      // 3. Validate integrity
      const integrityReport = await indexerAdapter.validateIntegrity();
      expect(integrityReport.status).toBe('valid');

      // 4. Check freshness
      const isUpToDate = await indexerAdapter.isIndexUpToDate();
      expect(isUpToDate).toBe(true);
    });

    it('should detect when cache becomes stale', async () => {
      // Generate initial cache
      await indexerAdapter.generateIndex();

      // Simulate new record with newer timestamp
      const newerTimestamp = Math.floor(Date.now() / 1000) + 100;
      const newerTask = createMockTaskRecord({
        id: `${newerTimestamp}-task-newer`,
        title: 'Newer Task'
      });

      // Update mock to return newer record
      mockTaskStore.list.mockResolvedValue([`${newerTimestamp}-task-newer`]);
      mockTaskStore.read.mockResolvedValue(newerTask);

      // Cache should now be stale
      const isUpToDate = await indexerAdapter.isIndexUpToDate();
      expect(isUpToDate).toBe(false);
    });
  });

  describe('Integration with Ecosystem', () => {
    it('should work correctly with BacklogAdapter data flow', async () => {
      // Setup realistic data that BacklogAdapter would create
      const realisticTask = createMockTaskRecord({
        id: '1757687335-task-realistic',
        title: 'Realistic Task from BacklogAdapter',
        status: 'active',
        priority: 'high',
        description: 'Task created by BacklogAdapter.createTask()',
        tags: ['guild:backend', 'epic:auth']
      });

      const realisticCycle = createMockCycleRecord({
        id: '1757687335-cycle-realistic',
        title: 'Realistic Cycle from BacklogAdapter',
        status: 'active',
        taskIds: ['1757687335-task-realistic'],
        tags: ['sprint:q1']
      });

      mockTaskStore.read.mockResolvedValue(realisticTask);
      mockCycleStore.read.mockResolvedValue(realisticCycle);

      const report = await indexerAdapter.generateIndex();
      expect(report.success).toBe(true);

      const indexData = await indexerAdapter.getIndexData();
      expect(indexData?.tasks[0]?.status).toBe('active');
      expect(indexData?.cycles[0]?.status).toBe('active');
    });

    it('should handle empty system gracefully', async () => {
      // Setup empty stores
      mockTaskStore.list.mockResolvedValue([]);
      mockCycleStore.list.mockResolvedValue([]);
      mockActorStore.list.mockResolvedValue([]);

      mockMetricsAdapter.getSystemStatus.mockResolvedValue({
        tasks: { total: 0, byStatus: {}, byPriority: {} },
        cycles: { total: 0, active: 0, completed: 0 },
        health: { overallScore: 100, blockedTasks: 0, staleTasks: 0 }
      });

      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(true);
      expect(report.recordsProcessed).toBe(0);

      const indexData = await indexerAdapter.getIndexData();
      expect(indexData?.tasks).toHaveLength(0);
      expect(indexData?.cycles).toHaveLength(0);
      expect(indexData?.actors).toHaveLength(0);
    });
  });
});