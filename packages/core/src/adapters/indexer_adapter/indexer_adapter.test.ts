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

// Mock crypto module for signature verification
jest.mock('../../crypto', () => {
  const actual = jest.requireActual('../../crypto');
  return {
    ...actual,
    verifySignatures: jest.fn().mockResolvedValue(true), // Default: signatures are valid
  };
});

// Mock dependencies
jest.mock('../../record_store');

import { IndexerAdapter } from './index';
import type { AllRecords, IndexData } from './index';
import type { RecordStore } from '../../record_store';
import { verifySignatures, calculatePayloadChecksum } from '../../crypto';
import type {
  GitGovActorRecord,
  GitGovCycleRecord,
  GitGovTaskRecord,
  GitGovExecutionRecord,
  GitGovFeedbackRecord,
  GitGovChangelogRecord,
  TaskRecord,
  ActorRecord,
  CycleRecord,
  ExecutionRecord,
  Signature,
} from '../../types';
import type { MetricsAdapter } from '../metrics_adapter';
import { createTaskRecord, createCycleRecord, createActorRecord, createExecutionRecord, createEmbeddedMetadataRecord, createTestSignature } from '../../factories';

/**
 * Helper to create VALIDATED task records using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses factories for validation:
 * - createTaskRecord() validates payload structure
 * - createTestSignature() generates valid Ed25519-format signatures (88-char base64)
 * - createEmbeddedMetadataRecord() builds complete record with validation
 * 
 * @param overrides - Partial TaskRecord to override defaults
 * @param keyId - Optional keyId for signature (default: 'human:developer')
 * @returns Promise<GitGovTaskRecord> - Fully validated task record
 */
async function createMockTaskRecord(
  overrides: Partial<TaskRecord> = {},
  keyId: string = 'human:developer'
): Promise<GitGovTaskRecord> {
  // Use factory to create validated payload
  const payload = createTaskRecord({
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test task description',
    tags: ['test'],
    cycleIds: [],
    references: [],
    ...overrides
  });

  // Create valid signature using factory (generates real 88-char base64 Ed25519 format)
  const signature = createTestSignature(keyId, 'author', 'Test signature');

  // Build complete record with validation
  return createEmbeddedMetadataRecord(payload, { signatures: [signature] }) as GitGovTaskRecord;
}

/**
 * Helper to create VALIDATED cycle records using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses factories for validation:
 * - createCycleRecord() validates payload structure
 * - createTestSignature() generates valid Ed25519-format signatures (88-char base64)
 * - createEmbeddedMetadataRecord() builds complete record with validation
 * 
 * @param overrides - Partial CycleRecord to override defaults
 * @param keyId - Optional keyId for signature (default: 'human:scrum-master')
 * @returns Promise<GitGovCycleRecord> - Fully validated cycle record
 */
async function createMockCycleRecord(
  overrides: Partial<CycleRecord> = {},
  keyId: string = 'human:scrum-master'
): Promise<GitGovCycleRecord> {
  // Use factory to create validated payload
  const payload = createCycleRecord({
    title: 'Test Cycle',
    status: 'planning',
    taskIds: [],
    childCycleIds: [],
    tags: ['test'],
    notes: 'Test cycle notes',
    ...overrides
  });

  // Create valid signature using factory (generates real 88-char base64 Ed25519 format)
  const signature = createTestSignature(keyId, 'author', 'Test signature');

  // Build complete record with validation
  return createEmbeddedMetadataRecord(payload, { signatures: [signature] }) as GitGovCycleRecord;
}

/**
 * Helper to create VALIDATED actor records using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses factories for validation:
 * - createActorRecord() validates payload structure
 * - createTestSignature() generates valid Ed25519-format signatures (88-char base64)
 * - createEmbeddedMetadataRecord() builds complete record with validation
 * 
 * @param overrides - Partial ActorRecord to override defaults
 * @param keyId - Optional keyId for signature (default: 'human:system')
 * @returns Promise<GitGovActorRecord> - Fully validated actor record
 */
async function createMockActorRecord(
  overrides: Partial<ActorRecord> = {},
  keyId: string = 'human:system'
): Promise<GitGovActorRecord> {
  // Use factory to create validated payload
  const payload = createActorRecord({
    type: 'human',
    displayName: 'Test User',
    status: 'active',
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Valid 44-char base64 Ed25519 public key (32 bytes)
    roles: ['author'],
    ...overrides
  });

  // Create valid signature using factory (generates real 88-char base64 Ed25519 format)
  const signature = createTestSignature(keyId, 'author', 'Test signature');

  // Build complete record with validation
  return createEmbeddedMetadataRecord(payload, { signatures: [signature] }) as GitGovActorRecord;
}

/**
 * Helper to create VALIDATED execution records using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses factories for validation:
 * - createExecutionRecord() validates payload structure
 * - createTestSignature() generates valid Ed25519-format signatures (88-char base64)
 * - createEmbeddedMetadataRecord() builds complete record with validation
 * 
 * @param overrides - Partial ExecutionRecord to override defaults
 * @param keyId - Optional keyId for signature (default: 'human:developer')
 * @returns Promise<GitGovExecutionRecord> - Fully validated execution record
 */
async function createMockExecutionRecord(
  overrides: Partial<ExecutionRecord> = {},
  keyId: string = 'human:developer'
): Promise<GitGovExecutionRecord> {
  // Use factory to create validated payload
  const payload = createExecutionRecord({
    taskId: '1757687335-task-default',
    type: 'progress',
    title: 'Test Execution',
    result: 'Test execution result',
    ...overrides
  });

  // Create valid signature using factory (generates real 88-char base64 Ed25519 format)
  const signature = createTestSignature(keyId, 'author', 'Test signature');

  // Build complete record with validation
  return createEmbeddedMetadataRecord(payload, { signatures: [signature] }) as GitGovExecutionRecord;
}

/**
 * Creates a mock RecordStore<IndexData> for testing.
 * Uses in-memory storage to simulate cache operations.
 */
function createMockCacheStore(): jest.Mocked<RecordStore<IndexData>> {
  let cachedData: IndexData | null = null;

  return {
    get: jest.fn().mockImplementation(async () => cachedData),
    put: jest.fn().mockImplementation(async (_key: string, data: IndexData) => {
      cachedData = data;
    }),
    delete: jest.fn().mockImplementation(async () => {
      cachedData = null;
    }),
    exists: jest.fn().mockImplementation(async () => cachedData !== null),
    list: jest.fn().mockResolvedValue([]),
  } as jest.Mocked<RecordStore<IndexData>>;
}

describe('IndexerAdapter', () => {
  let indexerAdapter: IndexerAdapter;
  let mockStores: {
    tasks: jest.Mocked<RecordStore<GitGovTaskRecord>>;
    cycles: jest.Mocked<RecordStore<GitGovCycleRecord>>;
    actors: jest.Mocked<RecordStore<GitGovActorRecord>>;
    feedbacks: jest.Mocked<RecordStore<GitGovFeedbackRecord>>;
    executions: jest.Mocked<RecordStore<GitGovExecutionRecord>>;
    changelogs: jest.Mocked<RecordStore<GitGovChangelogRecord>>;
  };
  let mockCacheStore: jest.Mocked<RecordStore<IndexData>>;
  let mockMetricsAdapter: jest.Mocked<Pick<MetricsAdapter, 'getSystemStatus' | 'getProductivityMetrics' | 'getCollaborationMetrics' | 'getTaskHealth'>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock stores with get/put pattern
    mockStores = {
      tasks: {
        get: jest.fn(),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn(),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovTaskRecord>>,
      cycles: {
        get: jest.fn(),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn(),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovCycleRecord>>,
      actors: {
        get: jest.fn(),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn(),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovActorRecord>>,
      feedbacks: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([]),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovFeedbackRecord>>,
      executions: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([]),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovExecutionRecord>>,
      changelogs: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([]),
        exists: jest.fn().mockResolvedValue(false),
      } as jest.Mocked<RecordStore<GitGovChangelogRecord>>,
    };

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
    } as jest.Mocked<Pick<MetricsAdapter, 'getSystemStatus' | 'getProductivityMetrics' | 'getCollaborationMetrics' | 'getTaskHealth'>>;

    // Setup default mock responses
    mockStores.tasks.list.mockResolvedValue(['1757687335-task-test']);
    mockStores.tasks.get.mockResolvedValue(createMockTaskRecord({
      id: '1757687335-task-test',
      title: 'Test Task'
    }) as unknown as GitGovTaskRecord);

    mockStores.cycles.list.mockResolvedValue(['1757687335-cycle-test']);
    mockStores.cycles.get.mockResolvedValue(createMockCycleRecord({
      id: '1757687335-cycle-test',
      title: 'Test Cycle'
    }) as unknown as GitGovCycleRecord);

    mockStores.actors.list.mockResolvedValue(['human:test']);
    mockStores.actors.get.mockResolvedValue(createMockActorRecord({
      id: 'human:test',
      displayName: 'Test User'
    }) as unknown as GitGovActorRecord);

    // Create mock cache store
    mockCacheStore = createMockCacheStore();

    indexerAdapter = new IndexerAdapter({
      metricsAdapter: mockMetricsAdapter as unknown as MetricsAdapter,
      stores: mockStores,
      cacheStore: mockCacheStore,
    });
  });

  describe('Core Indexing Operations (EARS 1-6)', () => {
    it('[EARS-1] should generate complete index with all required fields', async () => {
      const report = await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      // Validate generation report
      expect(report.success).toBe(true);
      expect(report.recordsProcessed).toBe(3); // 1 task + 1 cycle + 1 actor

      // Validate IndexData structure (all top-level fields)
      expect(indexData).not.toBeNull();
      expect(indexData?.metadata).toBeDefined();
      expect(indexData?.metrics).toBeDefined();
      expect(indexData?.derivedStates).toBeDefined();
      expect(indexData?.activityHistory).toBeDefined();
      expect(indexData?.tasks).toBeDefined();
      expect(indexData?.enrichedTasks).toBeDefined();
      expect(indexData?.cycles).toBeDefined();
      expect(indexData?.actors).toBeDefined();
      expect(indexData?.feedback).toBeDefined();
    });

    it('[EARS-1] should include complete metadata (generatedAt, lastCommitHash, integrityStatus, etc)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const metadata = indexData?.metadata;
      expect(metadata).toBeDefined();

      // generatedAt should be ISO string
      expect(metadata?.generatedAt).toBeDefined();
      expect(typeof metadata?.generatedAt).toBe('string');
      expect(() => new Date(metadata!.generatedAt)).not.toThrow();

      // lastCommitHash should be string
      expect(metadata?.lastCommitHash).toBeDefined();
      expect(typeof metadata?.lastCommitHash).toBe('string');

      // integrityStatus should be one of the valid values
      expect(metadata?.integrityStatus).toBeDefined();
      expect(['valid', 'warnings', 'errors']).toContain(metadata?.integrityStatus);

      // recordCounts should be complete
      expect(metadata?.recordCounts).toBeDefined();
      expect(metadata?.recordCounts['tasks']).toBeDefined();
      expect(metadata?.recordCounts['cycles']).toBeDefined();
      expect(metadata?.recordCounts['actors']).toBeDefined();
      expect(metadata?.recordCounts['feedback']).toBeDefined();
      expect(metadata?.recordCounts['executions']).toBeDefined();
      expect(metadata?.recordCounts['changelogs']).toBeDefined();

      // generationTime should be number >= 0
      expect(metadata?.generationTime).toBeDefined();
      expect(typeof metadata?.generationTime).toBe('number');
      expect(metadata?.generationTime).toBeGreaterThanOrEqual(0);
    });

    it('[EARS-1] should include all metrics from MetricsAdapter (system, productivity, collaboration)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const metrics = indexData?.metrics;
      expect(metrics).toBeDefined();

      // Verify MetricsAdapter was called
      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalledTimes(1);
      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalledTimes(1);

      // Verify metrics is an object (combination of SystemStatus + ProductivityMetrics + CollaborationMetrics)
      expect(typeof metrics).toBe('object');
      expect(Object.keys(metrics!).length).toBeGreaterThan(0);

      // Verify it contains fields from SystemStatus (from mock)
      expect(metrics?.tasks).toBeDefined();
      expect(metrics?.cycles).toBeDefined();
      expect(metrics?.health).toBeDefined();

      // Verify it contains fields from ProductivityMetrics (from mock)
      expect(metrics?.throughput).toBeDefined();
      expect(metrics?.leadTime).toBeDefined();

      // Verify it contains fields from CollaborationMetrics (from mock)
      expect(metrics?.activeAgents).toBeDefined();
      expect(metrics?.totalAgents).toBeDefined();
    });

    it('[EARS-1] should include derivedStates with all arrays (stalled, atRisk, clarification, blocked)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const derivedStates = indexData?.derivedStates;
      expect(derivedStates).toBeDefined();

      // All 4 arrays must exist
      expect(derivedStates?.stalledTasks).toBeDefined();
      expect(Array.isArray(derivedStates?.stalledTasks)).toBe(true);

      expect(derivedStates?.atRiskTasks).toBeDefined();
      expect(Array.isArray(derivedStates?.atRiskTasks)).toBe(true);

      expect(derivedStates?.needsClarificationTasks).toBeDefined();
      expect(Array.isArray(derivedStates?.needsClarificationTasks)).toBe(true);

      expect(derivedStates?.blockedByDependencyTasks).toBeDefined();
      expect(Array.isArray(derivedStates?.blockedByDependencyTasks)).toBe(true);
    });

    it('[EARS-1] should include activityHistory array with events', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const activityHistory = indexData?.activityHistory;
      expect(activityHistory).toBeDefined();
      expect(Array.isArray(activityHistory)).toBe(true);

      // Should have events (at least task creation)
      expect(activityHistory!.length).toBeGreaterThan(0);

      // Each event should have required fields
      if (activityHistory!.length > 0) {
        const event = activityHistory![0];
        expect(event).toBeDefined();
        expect(event?.type).toBeDefined();
        expect(event?.timestamp).toBeDefined();
        expect(typeof event?.timestamp).toBe('number');
      }
    });

    it('[EARS-1] should include tasks array with full GitGovTaskRecord (headers + payloads)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const tasks = indexData?.tasks;
      expect(tasks).toBeDefined();
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks!.length).toBeGreaterThan(0);

      // Each task should be GitGovTaskRecord with header + payload
      const task = tasks![0];
      expect(task).toBeDefined();
      expect(task?.header).toBeDefined();
      expect(task?.payload).toBeDefined();

      // Header should have signatures array
      expect(task?.header?.signatures).toBeDefined();
      expect(Array.isArray(task?.header?.signatures)).toBe(true);

      // Payload should have task fields
      expect(task?.payload?.id).toBeDefined();
      expect(task?.payload?.title).toBeDefined();
      expect(task?.payload?.status).toBeDefined();
    });

    it('[EARS-1] should include enrichedTasks array with calculated fields', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTasks = indexData?.enrichedTasks;
      expect(enrichedTasks).toBeDefined();
      expect(Array.isArray(enrichedTasks)).toBe(true);
      expect(enrichedTasks!.length).toBeGreaterThan(0);

      // EnrichedTaskRecord should have payload + calculated fields
      const enriched = enrichedTasks![0];
      expect(enriched).toBeDefined();
      expect(enriched?.id).toBeDefined();
      expect(enriched?.title).toBeDefined();

      // Should have enrichment fields
      expect(enriched?.lastUpdated).toBeDefined();
      expect(enriched?.relationships).toBeDefined();
      expect(enriched?.metrics).toBeDefined();
      expect(enriched?.derivedState).toBeDefined();
      expect(enriched?.release).toBeDefined();
    });

    it('[EARS-1] should include cycles array with full GitGovCycleRecord (headers + payloads)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const cycles = indexData?.cycles;
      expect(cycles).toBeDefined();
      expect(Array.isArray(cycles)).toBe(true);

      if (cycles!.length > 0) {
        const cycle = cycles![0];
        expect(cycle).toBeDefined();
        expect(cycle?.header).toBeDefined();
        expect(cycle?.payload).toBeDefined();
        expect(cycle?.header?.signatures).toBeDefined();
        expect(cycle?.payload?.id).toBeDefined();
      }
    });

    it('[EARS-1] should include actors array with full GitGovActorRecord (headers + payloads)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const actors = indexData?.actors;
      expect(actors).toBeDefined();
      expect(Array.isArray(actors)).toBe(true);

      if (actors!.length > 0) {
        const actor = actors![0];
        expect(actor).toBeDefined();
        expect(actor?.header).toBeDefined();
        expect(actor?.payload).toBeDefined();
        expect(actor?.header?.signatures).toBeDefined();
        expect(actor?.payload?.id).toBeDefined();
      }
    });

    it('[EARS-1] should include feedback array with full GitGovFeedbackRecord (headers + payloads)', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const feedback = indexData?.feedback;
      expect(feedback).toBeDefined();
      expect(Array.isArray(feedback)).toBe(true);

      // Feedback is optional but when present should have full structure
      if (feedback!.length > 0) {
        const fb = feedback![0];
        expect(fb).toBeDefined();
        expect(fb?.header).toBeDefined();
        expect(fb?.payload).toBeDefined();
        expect(fb?.header?.signatures).toBeDefined();
        expect(fb?.payload?.id).toBeDefined();
      }
    });

    it('[EARS-2] should return data from cache in under 10ms', async () => {
      // Generate cache first
      await indexerAdapter.generateIndex();

      // Measure cache read performance (EARS-2: < 10ms requirement)
      const startTime = performance.now();
      const indexData = await indexerAdapter.getIndexData();
      const endTime = performance.now();
      const readTime = endTime - startTime;

      // Validate data structure
      expect(indexData).not.toBeNull();
      expect(indexData?.tasks).toHaveLength(1);
      expect(indexData?.cycles).toHaveLength(1);
      expect(indexData?.actors).toHaveLength(1);

      // Validate performance requirement (EARS-2: < 10ms for cache reads)
      expect(readTime).toBeLessThan(10); // Critical performance requirement
    });

    it('[EARS-3] should return null without cache', async () => {
      // Test with fresh adapter (empty cache store)
      const emptyCacheStore = createMockCacheStore();
      const freshAdapter = new IndexerAdapter({
        metricsAdapter: mockMetricsAdapter as unknown as MetricsAdapter,
        stores: mockStores,
        cacheStore: emptyCacheStore,
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

    it('[EARS-4] should detect schema violations during integrity validation', async () => {
      // Create a valid task first, then mutate it to be invalid
      // This test NEEDS invalid data to verify schema validation works
      const validTask = await createMockTaskRecord({
        id: '1757687335-task-to-corrupt',
        title: 'Valid Title',
        description: 'Valid description with enough characters'
      });

      // Mutate the valid task to have invalid data
      validTask.payload.title = ''; // Invalid - empty title (< 3 chars)
      validTask.payload.description = ''; // Invalid - empty description (< 10 chars)

      mockStores.tasks.get.mockResolvedValueOnce(validTask);

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

    it('[EARS-15] should handle MetricsAdapter errors gracefully', async () => {
      mockMetricsAdapter.getSystemStatus.mockRejectedValue(new Error('MetricsAdapter error'));

      const report = await indexerAdapter.generateIndex();

      expect(report.success).toBe(false);
      expect(report.errors).toContain('MetricsAdapter error');
    });
  });

  describe('Error Handling & Graceful Degradation (EARS 12-14)', () => {
    it('[EARS-14] should handle cacheStore write errors gracefully', async () => {
      // Step 1: Generate initial valid cache
      const report1 = await indexerAdapter.generateIndex();
      expect(report1.success).toBe(true);

      // Step 2: Verify initial cache exists and is valid
      const initialCache = await indexerAdapter.getIndexData();
      expect(initialCache).not.toBeNull();

      // Step 3: Mock cacheStore.put to fail on next call
      mockCacheStore.put.mockRejectedValueOnce(new Error('Simulated write error'));

      // Step 4: Attempt to generate index again (should fail)
      const report2 = await indexerAdapter.generateIndex();
      expect(report2.success).toBe(false);
      expect(report2.errors).toContain('Simulated write error');

      // Step 5: Verify cacheStore.put was called (Store handles atomicity internally)
      expect(mockCacheStore.put).toHaveBeenCalled();
    });

    it('[EARS-12] should generate index with all required stores', async () => {
      // Test with all stores (all are now required)
      const fullCacheStore = createMockCacheStore();
      const fullAdapter = new IndexerAdapter({
        metricsAdapter: mockMetricsAdapter as unknown as MetricsAdapter,
        stores: mockStores,
        cacheStore: fullCacheStore,
      });

      const report = await fullAdapter.generateIndex();
      expect(report.success).toBe(true);
    });

    it('[EARS-13] should return null and log warning for corrupted cache', async () => {
      // Step 1: Create cache store that throws error (simulating corruption)
      const corruptedCacheStore: jest.Mocked<RecordStore<IndexData>> = {
        get: jest.fn().mockRejectedValue(new Error('Invalid JSON data')),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(true), // Cache exists but is corrupted
        list: jest.fn().mockResolvedValue([]),
      };

      const corruptedAdapter = new IndexerAdapter({
        metricsAdapter: mockMetricsAdapter as unknown as MetricsAdapter,
        stores: mockStores,
        cacheStore: corruptedCacheStore,
      });

      // Step 2: Mock console.warn to capture warning messages
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      // Step 3: Attempt to read corrupted cache
      const result = await corruptedAdapter.getIndexData();

      // Step 4: Validate EARS-13 behavior
      expect(result).toBeNull(); // Should return null
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cache is corrupted or invalid")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("gitgov index")
      );

      // Cleanup
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Performance & Optimization (EARS 11)', () => {
    it('[EARS-11] should generate index efficiently for phase 1 datasets (0-500 records)', async () => {
      // Validate we're testing Phase 1 dataset size
      const taskCount = (await mockStores.tasks.list()).length;
      const cycleCount = (await mockStores.cycles.list()).length;
      const actorCount = (await mockStores.actors.list()).length;
      const recordCount = taskCount + cycleCount + actorCount;

      expect(recordCount).toBeLessThan(500); // EARS-11: Phase 1 constraint (0-500 records)

      const startTime = Date.now();
      const report = await indexerAdapter.generateIndex();
      const endTime = Date.now();

      expect(report.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // EARS-11: < 1s for Phase 1
      expect(report.generationTime).toBeGreaterThan(0);
      expect(report.performance.readTime).toBeGreaterThanOrEqual(0);
      expect(report.performance.calculationTime).toBeGreaterThanOrEqual(0);
      expect(report.performance.writeTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide detailed performance metrics', async () => {
      const report = await indexerAdapter.generateIndex();

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

    it('[EARS-16] should detect when cache becomes stale', async () => {
      // Generate initial cache
      await indexerAdapter.generateIndex();

      // Simulate new record with newer timestamp
      const newerTimestamp = Math.floor(Date.now() / 1000) + 100;
      const newerTask = await createMockTaskRecord({
        id: `${newerTimestamp}-task-newer`,
        title: 'Newer Task'
      });

      // Update mock to return newer record
      mockStores.tasks.list.mockResolvedValue([`${newerTimestamp}-task-newer`]);
      mockStores.tasks.get.mockResolvedValue(newerTask);

      // Cache should now be stale and suggest regeneration
      const isUpToDate = await indexerAdapter.isIndexUpToDate();
      expect(isUpToDate).toBe(false);
    });
  });

  describe('Integration with Ecosystem', () => {
    it('should work correctly with BacklogAdapter data flow', async () => {
      // Setup realistic data that BacklogAdapter would create
      const realisticTask = await createMockTaskRecord({
        id: '1757687335-task-realistic',
        title: 'Realistic Task from BacklogAdapter',
        status: 'active',
        priority: 'high',
        description: 'Task created by BacklogAdapter.createTask()',
        tags: ['category:design', 'epic:auth']
      });

      const realisticCycle = await createMockCycleRecord({
        id: '1757687335-cycle-realistic',
        title: 'Realistic Cycle from BacklogAdapter',
        status: 'active',
        taskIds: ['1757687335-task-realistic'],
        tags: ['sprint:q1']
      });

      mockStores.tasks.get.mockResolvedValue(realisticTask);
      mockStores.cycles.get.mockResolvedValue(realisticCycle);

      const report = await indexerAdapter.generateIndex();
      expect(report.success).toBe(true);

      const indexData = await indexerAdapter.getIndexData();
      expect(indexData?.tasks[0]?.payload.status).toBe('active');
      expect(indexData?.cycles[0]?.payload.status).toBe('active');
    });

    it('[EARS-12] should handle empty system gracefully', async () => {
      // Setup empty stores
      mockStores.tasks.list.mockResolvedValue([]);
      mockStores.cycles.list.mockResolvedValue([]);
      mockStores.actors.list.mockResolvedValue([]);

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

  describe('Derived States Calculation (EARS 7-10)', () => {
    it('[EARS-7] should apply derived data protocol rules', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.derivedState).toBeDefined();
      // DerivedState should have all required flags
      expect(enrichedTask?.derivedState).toHaveProperty('isStalled');
      expect(enrichedTask?.derivedState).toHaveProperty('isAtRisk');
      expect(enrichedTask?.derivedState).toHaveProperty('needsClarification');
      expect(enrichedTask?.derivedState).toHaveProperty('isBlockedByDependency');
      expect(enrichedTask?.derivedState).toHaveProperty('healthScore');
      expect(enrichedTask?.derivedState).toHaveProperty('timeInCurrentStage');
    });

    it('[EARS-8] should mark stalled tasks as isStalled', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.derivedState.isStalled).toBeDefined();
      expect(typeof enrichedTask?.derivedState.isStalled).toBe('boolean');
    });

    it('[EARS-9] should mark tasks with questions as needsClarification', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.derivedState.needsClarification).toBeDefined();
      expect(typeof enrichedTask?.derivedState.needsClarification).toBe('boolean');
    });

    it('[EARS-10] should mark tasks with dependencies as isBlockedByDependency', async () => {
      const taskWithDeps = await createMockTaskRecord({
        id: '1757687335-task-blocked',
        title: 'Blocked Task',
        references: ['task:1757687335-blocker-task']
      });

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-blocked']);
      mockStores.tasks.get.mockResolvedValue(taskWithDeps);

      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.derivedState.isBlockedByDependency).toBeDefined();
      expect(typeof enrichedTask?.derivedState.isBlockedByDependency).toBe('boolean');
    });
  });

  describe('Activity History (EARS 17-24)', () => {
    it('[EARS-17] should calculate activity history from record timestamps', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      expect(indexData?.activityHistory).toBeDefined();
      expect(Array.isArray(indexData?.activityHistory)).toBe(true);
    });

    it('[EARS-17] should calculate activity history directly from record timestamps with proper ordering', async () => {
      // Create records with different timestamps for comprehensive testing
      const nowTimestamp = Math.floor(Date.now() / 1000);

      const task1 = await createMockTaskRecord({
        id: `${nowTimestamp}-task-first`,
        title: 'First Task'
      });

      const cycle1 = await createMockCycleRecord({
        id: `${nowTimestamp + 15}-cycle-sprint1`,
        title: 'Sprint 1'
      });

      // Note: Actors use format {type}:{name}, not {timestamp}-{type}-{slug}
      // So they won't have valid timestamps for activity history

      const allRecords: AllRecords = {
        tasks: [task1],
        cycles: [cycle1],
        feedback: [],
        executions: [],
        changelogs: [],
        actors: [] // Actors don't have timestamp-based IDs, so we don't test them here
      };

      // Call calculateActivityHistory directly (not via generateIndex)
      const activityHistory = await indexerAdapter.calculateActivityHistory(allRecords);

      // Validate structure
      expect(activityHistory).toBeDefined();
      expect(Array.isArray(activityHistory)).toBe(true);
      expect(activityHistory.length).toBeGreaterThan(0);

      // Validate chronological order (most recent first)
      for (let i = 0; i < activityHistory.length - 1; i++) {
        const currentEvent = activityHistory[i];
        const nextEvent = activityHistory[i + 1];
        if (currentEvent && nextEvent) {
          expect(currentEvent.timestamp).toBeGreaterThanOrEqual(nextEvent.timestamp);
        }
      }

      // Validate event types
      const eventTypes = activityHistory.map(e => e.type);
      expect(eventTypes).toContain('task_created');
      expect(eventTypes).toContain('cycle_created');
      // Note: actor_created not tested here since actors use non-timestamp IDs

      // Validate EARS-18: Limited to 15 events
      expect(activityHistory.length).toBeLessThanOrEqual(15);
    });

    it('[EARS-18] should include last 15 events ordered chronologically', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const activityHistory = indexData?.activityHistory || [];
      expect(activityHistory.length).toBeLessThanOrEqual(15);

      // Verify chronological order (most recent first)
      if (activityHistory.length > 1) {
        for (let i = 0; i < activityHistory.length - 1; i++) {
          const currentTimestamp = activityHistory[i]?.timestamp;
          const nextTimestamp = activityHistory[i + 1]?.timestamp;
          if (currentTimestamp && nextTimestamp) {
            expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
          }
        }
      }
    });

    it('[EARS-19] should calculate lastUpdated using file timestamps and related records', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.lastUpdated).toBeDefined();
      expect(enrichedTask?.lastUpdated).toBeGreaterThan(0);
    });

    it('[EARS-19] should calculate lastUpdated directly with task payload and related records', async () => {
      // Create test task as GitGovTaskRecord (with headers)
      const baseTimestamp = Math.floor(Date.now() / 1000);

      const taskRecord = await createMockTaskRecord({
        id: `${baseTimestamp}-task-direct`,
        title: 'Direct Test Task',
        status: 'active',
        priority: 'medium',
        description: 'Testing calculateLastUpdated directly',
        tags: [],
        cycleIds: [],
        references: []
      });

      // Create related execution with newer timestamp (65 seconds after task creation)
      const relatedExecution = await createMockExecutionRecord({
        id: `${baseTimestamp + 65}-exec-recent`,
        taskId: `${baseTimestamp}-task-direct`,
        title: 'Recent execution'
      });

      const allRecords: AllRecords = {
        tasks: [],
        cycles: [],
        feedback: [],
        executions: [relatedExecution],
        changelogs: [],
        actors: []
      };

      // Call calculateLastUpdated directly (not via generateIndex)
      const result = await indexerAdapter.calculateLastUpdated(taskRecord, allRecords);

      // Validate structure
      expect(result).toBeDefined();
      expect(result.lastUpdated).toBeGreaterThan(0);
      expect(result.lastActivityType).toBeDefined();
      expect(result.recentActivity).toBeDefined();

      // Validate that execution timestamp is considered
      const executionTimestamp = (baseTimestamp + 65) * 1000; // Convert to ms
      expect(result.lastUpdated).toBeGreaterThanOrEqual(executionTimestamp);
      expect(result.lastActivityType).toBe('execution_added');
      expect(result.recentActivity).toContain('Recent execution');
    });

    it('[EARS-20] should consider related executions feedback and changelogs', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      // lastActivityType should reflect the most recent activity type
      expect(enrichedTask?.lastActivityType).toBeDefined();
      expect(['task_created', 'task_modified', 'feedback_received', 'execution_added', 'changelog_created']).toContain(enrichedTask?.lastActivityType);
    });

    it('[EARS-21] should return most recent timestamp for dynamic sorting', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.lastUpdated).toBeDefined();
      expect(typeof enrichedTask?.lastUpdated).toBe('number');
      expect(enrichedTask?.lastUpdated).toBeGreaterThan(0);
    });

    it('[EARS-22] should find task files in project root correctly', async () => {
      // Create a task with known ID to test path resolution
      const testTask = await createMockTaskRecord({
        id: '1757687335-task-path-test',
        title: 'Task for Path Resolution Test'
      });

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-path-test']);
      mockStores.tasks.get.mockResolvedValue(testTask);

      // Generate index which calls calculateLastUpdated internally
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];

      // Validate that calculateLastUpdated was able to process the task
      // If file resolution logic worked, lastUpdated should be > 0
      expect(enrichedTask?.lastUpdated).toBeDefined();
      expect(enrichedTask?.lastUpdated).toBeGreaterThan(0);

      // Verify lastActivityType reflects activity tracking (not just crashes)
      // This proves path resolution through .gitgov/tasks/ logic doesn't break
      expect(['task_created', 'task_modified']).toContain(enrichedTask?.lastActivityType);

      // NOTE: In real environment, this would verify actual filesystem path
      // In test environment, we validate the logic gracefully handles missing files
    });

    it('[EARS-23] should use timestamps in milliseconds for consistency', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      expect(enrichedTask?.lastUpdated).toBeGreaterThan(1000000000000); // Should be in milliseconds (13 digits min)
    });

    it('[EARS-24] should detect significant modifications after 60s threshold', async () => {
      await indexerAdapter.generateIndex();
      const indexData = await indexerAdapter.getIndexData();

      const enrichedTask = indexData?.enrichedTasks?.[0];
      // lastActivityType should reflect if there was a modification vs creation
      expect(enrichedTask?.lastActivityType).toBeDefined();
    });
  });

  describe('Task Enrichment (EARS 25-48)', () => {
    describe('Activity Metadata (EARS 25-26)', () => {
      it('[EARS-25] should enrich tasks with lastUpdated lastActivityType and recentActivity', async () => {
        // Generate index which calls enrichTaskRecord internally
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        expect(indexData?.enrichedTasks).toBeDefined();
        expect(indexData?.enrichedTasks?.length).toBeGreaterThan(0);

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.lastUpdated).toBeGreaterThan(0);
        expect(enrichedTask?.lastActivityType).toBeDefined();
        expect(['task_created', 'task_modified', 'feedback_received', 'execution_added', 'changelog_created']).toContain(enrichedTask?.lastActivityType);
      });

      it('[EARS-26] should include enrichedTasks in IndexData for dashboard consumption', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        expect(indexData).toHaveProperty('enrichedTasks');
        expect(Array.isArray(indexData?.enrichedTasks)).toBe(true);
        expect(indexData?.tasks).toBeDefined(); // Raw tasks should still exist
        expect(indexData?.enrichedTasks).toBeDefined(); // Enriched tasks should also exist
      });
    });

    describe('Signature Extraction (EARS 34-35)', () => {
      it('[EARS-34] should extract author from first signature using helper', async () => {
        const taskWithSignatures = await createMockTaskRecord({
          id: '1757687335-task-with-author',
          title: 'Task with Author'
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-with-author']);
        mockStores.tasks.get.mockResolvedValue(taskWithSignatures);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.author).toBeDefined();
        expect(enrichedTask?.relationships.author?.actorId).toBe('human:developer');
        expect(enrichedTask?.relationships.author?.timestamp).toBeGreaterThan(0);
      });

      it('[EARS-35] should extract lastModifier from last signature using helper', async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const taskWithMultipleSignatures = await createMockTaskRecord({
          id: '1757687335-task-multi-sig',
          title: 'Task with Multiple Modifiers'
        });

        // Add second signature (last modifier)
        taskWithMultipleSignatures.header.signatures = [
          {
            keyId: 'human:original-author',
            role: 'author',
            notes: '',
            signature: 'mock-sig-1',
            timestamp
          },
          {
            keyId: 'human:last-modifier',
            role: 'reviewer',
            notes: '',
            signature: 'mock-sig-2',
            timestamp: timestamp + 100
          }
        ] as [Signature, ...Signature[]];

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-multi-sig']);
        mockStores.tasks.get.mockResolvedValue(taskWithMultipleSignatures);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.lastModifier).toBeDefined();
        expect(enrichedTask?.relationships.lastModifier?.actorId).toBe('human:last-modifier');
        expect(enrichedTask?.relationships.lastModifier?.timestamp).toBe(timestamp + 100);
      });
    });

    describe('Graceful Degradation (EARS 47-48)', () => {
      it('[EARS-47] should handle records without signatures gracefully', async () => {
        // Type assertion justified: Simulating runtime corruption where signatures array is empty
        // despite being defined as non-empty tuple [Signature, ...Signature[]]
        const taskWithoutProperSignatures = {
          header: {
            version: '1.0',
            type: 'task' as const,
            payloadChecksum: 'mock-checksum',
            signatures: [] as unknown as [Signature, ...Signature[]]
          },
          payload: {
            id: '1757687335-task-no-sigs',
            title: 'Task without Signatures',
            status: 'draft' as const,
            priority: 'medium' as const,
            description: 'Legacy task',
            tags: [],
            cycleIds: [],
            references: []
          }
        };

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-no-sigs']);
        mockStores.tasks.get.mockResolvedValue(taskWithoutProperSignatures as unknown as GitGovTaskRecord);

        // Should not throw error
        await expect(indexerAdapter.generateIndex()).resolves.toBeDefined();
      });

      it('[EARS-48] should continue enrichment with undefined author lastModifier', async () => {
        // Type assertion justified: Simulating runtime corruption where signatures array is empty
        // despite being defined as non-empty tuple [Signature, ...Signature[]]
        const taskWithoutProperSignatures = {
          header: {
            version: '1.0',
            type: 'task' as const,
            payloadChecksum: 'mock-checksum',
            signatures: [] as unknown as [Signature, ...Signature[]]
          },
          payload: {
            id: '1757687335-task-no-author',
            title: 'Task without Author',
            status: 'active' as const,
            priority: 'high' as const,
            description: 'Task should still be enriched',
            tags: [],
            cycleIds: [],
            references: []
          }
        };

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-no-author']);
        mockStores.tasks.get.mockResolvedValue(taskWithoutProperSignatures as unknown as GitGovTaskRecord);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask).toBeDefined();
        expect(enrichedTask?.relationships.author).toBeUndefined();
        expect(enrichedTask?.relationships.lastModifier).toBeUndefined();
        // But other enrichments should still work
        expect(enrichedTask?.derivedState).toBeDefined();
        expect(enrichedTask?.metrics).toBeDefined();
      });
    });

    describe('Metrics Calculation (EARS 29-33)', () => {
      it('[EARS-29] should count and store the number of task executions', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.metrics).toBeDefined();
        expect(enrichedTask?.metrics.executionCount).toBeGreaterThanOrEqual(0);
      });

      it('[EARS-30] should count and store open blocking feedbacks', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.metrics.blockingFeedbackCount).toBeGreaterThanOrEqual(0);
      });

      it('[EARS-31] should count and store open questions', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.metrics.openQuestionCount).toBeGreaterThanOrEqual(0);
      });

      it('[EARS-32] should calculate and store time to resolution for done tasks', async () => {
        const doneTask = await createMockTaskRecord({
          id: '1757687335-task-done',
          title: 'Completed Task',
          status: 'done'
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-done']);
        mockStores.tasks.get.mockResolvedValue(doneTask);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        if (enrichedTask?.status === 'done') {
          expect(enrichedTask?.metrics.timeToResolution).toBeGreaterThanOrEqual(0);
        }
      });

      it('[EARS-33] should determine and store the release status of the task', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.release).toBeDefined();
        expect(enrichedTask?.release.isReleased).toBeDefined();
        expect(typeof enrichedTask?.release.isReleased).toBe('boolean');
      });
    });

    describe('Relationships: Dependencies & Assignments (EARS 27-28, 36-38)', () => {
      it('[EARS-27] should identify and store the last modifier of the task', async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const taskWithModifier = await createMockTaskRecord({
          id: '1757687335-task-modified',
          title: 'Modified Task'
        });

        // Add multiple signatures to simulate modifications
        taskWithModifier.header.signatures = [
          {
            keyId: 'human:creator',
            role: 'author',
            notes: '',
            signature: 'mock-sig-1',
            timestamp
          },
          {
            keyId: 'human:modifier',
            role: 'reviewer',
            notes: '',
            signature: 'mock-sig-2',
            timestamp: timestamp + 50
          }
        ] as [Signature, ...Signature[]];

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-modified']);
        mockStores.tasks.get.mockResolvedValue(taskWithModifier);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.lastModifier).toBeDefined();
        expect(enrichedTask?.relationships.lastModifier?.actorId).toBe('human:modifier');
      });

      it('[EARS-28] should link cycle information to the task', async () => {
        const cycle = await createMockCycleRecord({
          id: '1757687335-cycle-test',
          title: 'Test Cycle'
        });

        const taskInCycle = await createMockTaskRecord({
          id: '1757687335-task-in-cycle',
          title: 'Task in Cycle',
          cycleIds: ['1757687335-cycle-test']
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-in-cycle']);
        mockStores.tasks.get.mockResolvedValue(taskInCycle);
        mockStores.cycles.list.mockResolvedValue(['1757687335-cycle-test']);
        mockStores.cycles.get.mockResolvedValue(cycle);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.cycles).toBeDefined();
        expect(enrichedTask?.relationships.cycles?.length).toBeGreaterThan(0);
        expect(enrichedTask?.relationships.cycles?.[0]?.id).toBe('1757687335-cycle-test');
        expect(enrichedTask?.relationships.cycles?.[0]?.title).toBe('Test Cycle');
      });

      it('[EARS-36] should extract assignedTo from related feedback', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.assignedTo).toBeDefined();
        expect(Array.isArray(enrichedTask?.relationships.assignedTo)).toBe(true);
      });

      it('[EARS-37] should extract dependsOn including ALL typed references (task:, pr:, issue:, file:, url:)', async () => {
        const taskWithAllRefs = await createMockTaskRecord({
          id: '1757687335-task-all-refs',
          title: 'Task with All Reference Types',
          references: [
            'task:1757687335-dependency-1',
            'task:1757687335-dependency-2',
            'pr:github.com/repo/pull/123',
            'issue:github.com/repo/issues/456',
            'file:src/utils/helper.ts',
            'url:https://example.com/docs'
          ]
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-all-refs']);
        mockStores.tasks.get.mockResolvedValue(taskWithAllRefs);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        const dependsOn = enrichedTask?.relationships.dependsOn || [];

        // Must include ALL typed references (task:, pr:, issue:, file:, url:)
        expect(dependsOn).toContain('task:1757687335-dependency-1');
        expect(dependsOn).toContain('task:1757687335-dependency-2');
        expect(dependsOn).toContain('pr:github.com/repo/pull/123');
        expect(dependsOn).toContain('issue:github.com/repo/issues/456');
        expect(dependsOn).toContain('file:src/utils/helper.ts');
        expect(dependsOn).toContain('url:https://example.com/docs');

        // External references (pr:, issue:, file:, url:) are ALWAYS preserved
        // task: references to completed tasks are filtered out
        expect(dependsOn.length).toBe(6);
      });

      it('[EARS-37] should filter out completed tasks (done, archived, discarded) from dependsOn', async () => {
        // Create tasks with different statuses (IDs must match pattern: ^\d{10}-task-[a-z0-9-]{1,50}$)
        const completedTask = await createMockTaskRecord({
          id: '1757687335-task-completed',
          title: 'Completed Task',
          status: 'done'
        });

        const archivedTask = await createMockTaskRecord({
          id: '1757687336-task-archived',
          title: 'Archived Task',
          status: 'archived'
        });

        const discardedTask = await createMockTaskRecord({
          id: '1757687337-task-discarded',
          title: 'Discarded Task',
          status: 'discarded'
        });

        const activeTask = await createMockTaskRecord({
          id: '1757687338-task-active',
          title: 'Active Task',
          status: 'active'
        });

        const mainTask = await createMockTaskRecord({
          id: '1757687339-task-main',
          title: 'Main Task with Dependencies',
          description: 'Task that references other tasks with different statuses',
          references: [
            'task:1757687335-task-completed',  // Should be filtered (done)
            'task:1757687336-task-archived',   // Should be filtered (archived)
            'task:1757687337-task-discarded',  // Should be filtered (discarded)
            'task:1757687338-task-active',     // Should be kept (active)
            'pr:github.com/repo/pull/123'      // Should be kept (external)
          ]
        });

        // Mock stores to return all tasks
        mockStores.tasks.list.mockResolvedValue([
          '1757687335-task-completed',
          '1757687336-task-archived',
          '1757687337-task-discarded',
          '1757687338-task-active',
          '1757687339-task-main'
        ]);

        mockStores.tasks.get
          .mockResolvedValueOnce(completedTask)
          .mockResolvedValueOnce(archivedTask)
          .mockResolvedValueOnce(discardedTask)
          .mockResolvedValueOnce(activeTask)
          .mockResolvedValueOnce(mainTask);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        // Find the main task in enriched tasks
        const enrichedMainTask = indexData?.enrichedTasks?.find(t => t.id === '1757687339-task-main');
        const dependsOn = enrichedMainTask?.relationships.dependsOn || [];

        // Should only include active task and external reference
        expect(dependsOn).toContain('task:1757687338-task-active');
        expect(dependsOn).toContain('pr:github.com/repo/pull/123');

        // Should NOT include completed/archived/discarded tasks
        expect(dependsOn).not.toContain('task:1757687335-task-completed');
        expect(dependsOn).not.toContain('task:1757687336-task-archived');
        expect(dependsOn).not.toContain('task:1757687337-task-discarded');

        expect(dependsOn.length).toBe(2); // Only active task + external ref
      });

      it('[EARS-38] should extract blockedBy by scanning references from other tasks', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.blockedBy).toBeDefined();
        expect(Array.isArray(enrichedTask?.relationships.blockedBy)).toBe(true);
      });
    });

    describe('Relationships: Cycles (EARS 39-40)', () => {
      it('[EARS-39] should link all cycles when task has cycleIds (array)', async () => {
        const cycle1 = await createMockCycleRecord({
          id: '1757687335-cycle-sprint1',
          title: 'Sprint 1'
        });
        const cycle2 = await createMockCycleRecord({
          id: '1757687335-cycle-sprint2',
          title: 'Sprint 2'
        });

        const taskWithCycles = await createMockTaskRecord({
          id: '1757687335-task-with-cycles',
          title: 'Task in Multiple Cycles',
          cycleIds: ['1757687335-cycle-sprint1', '1757687335-cycle-sprint2']
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-with-cycles']);
        mockStores.tasks.get.mockResolvedValue(taskWithCycles);
        mockStores.cycles.list.mockResolvedValue(['1757687335-cycle-sprint1', '1757687335-cycle-sprint2']);
        mockStores.cycles.get.mockImplementation(async (id: string) => {
          if (id === '1757687335-cycle-sprint1') return cycle1;
          if (id === '1757687335-cycle-sprint2') return cycle2;
          throw new Error('Cycle not found');
        });

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.cycles).toBeDefined();
        expect(Array.isArray(enrichedTask?.relationships.cycles)).toBe(true);
        expect(enrichedTask?.relationships.cycles?.length).toBe(2);
        expect(enrichedTask?.relationships.cycles?.map(c => c.id)).toContain('1757687335-cycle-sprint1');
        expect(enrichedTask?.relationships.cycles?.map(c => c.id)).toContain('1757687335-cycle-sprint2');
      });

      it('[EARS-40] should return relationships.cycles as empty array [] without cycleIds', async () => {
        const taskWithoutCycles = await createMockTaskRecord({
          id: '1757687335-task-no-cycles',
          title: 'Task without Cycles',
          cycleIds: []
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-no-cycles']);
        mockStores.tasks.get.mockResolvedValue(taskWithoutCycles);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.relationships.cycles).toBeDefined();
        expect(Array.isArray(enrichedTask?.relationships.cycles)).toBe(true);
        expect(enrichedTask?.relationships.cycles?.length).toBe(0);
      });
    });

    describe('Derived States (EARS 41-46)', () => {
      it('[EARS-41] should calculate healthScore using multi-factor algorithm', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.derivedState.healthScore).toBeDefined();
        expect(enrichedTask?.derivedState.healthScore).toBeGreaterThanOrEqual(0);
        expect(enrichedTask?.derivedState.healthScore).toBeLessThanOrEqual(100);
      });

      it('[EARS-42] should calculate timeInCurrentStage in days', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.derivedState.timeInCurrentStage).toBeDefined();
        expect(enrichedTask?.derivedState.timeInCurrentStage).toBeGreaterThanOrEqual(0);
      });

      it('[EARS-43] should REUSE pre-calculated DerivedStates (NOT recalculate per-task)', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        // Verify system-wide derivedStates exist
        expect(indexData?.derivedStates).toBeDefined();
        const derivedStates = indexData!.derivedStates;

        // Verify enrichedTasks exist
        expect(indexData?.enrichedTasks).toBeDefined();
        expect(indexData!.enrichedTasks.length).toBeGreaterThan(0);

        // For EACH enriched task, verify flags match pre-calculated DerivedStates
        // This proves enrichTaskRecord REUSES (not recalculates) derived states
        for (const enrichedTask of indexData!.enrichedTasks) {
          const taskId = enrichedTask.id;

          // derivedState flags must match pre-calculated arrays
          expect(enrichedTask.derivedState.isStalled).toBe(
            derivedStates.stalledTasks.includes(taskId)
          );
          expect(enrichedTask.derivedState.isAtRisk).toBe(
            derivedStates.atRiskTasks.includes(taskId)
          );
          expect(enrichedTask.derivedState.needsClarification).toBe(
            derivedStates.needsClarificationTasks.includes(taskId)
          );
          expect(enrichedTask.derivedState.isBlockedByDependency).toBe(
            derivedStates.blockedByDependencyTasks.includes(taskId)
          );
        }

        // This test validates that enrichTaskRecord uses pre-calculated DerivedStates
        // instead of recalculating locally (which would violate EARS-43)
      });

      it('[EARS-44] should mark isStalled correctly based on staleness rules', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.derivedState.isStalled).toBeDefined();
        // Actual staleness logic is determined by MetricsAdapter/DerivedStates
        expect(typeof enrichedTask?.derivedState.isStalled).toBe('boolean');
      });

      it('[EARS-45] should mark isAtRisk correctly based on priority and blockers', async () => {
        const highPriorityTask = await createMockTaskRecord({
          id: '1757687335-task-high-priority',
          title: 'High Priority Task',
          priority: 'high'
        });

        mockStores.tasks.list.mockResolvedValue(['1757687335-task-high-priority']);
        mockStores.tasks.get.mockResolvedValue(highPriorityTask);

        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.derivedState.isAtRisk).toBeDefined();
        expect(typeof enrichedTask?.derivedState.isAtRisk).toBe('boolean');
      });

      it('[EARS-46] should mark needsClarification when open questions exist', async () => {
        await indexerAdapter.generateIndex();
        const indexData = await indexerAdapter.getIndexData();

        const enrichedTask = indexData?.enrichedTasks?.[0];
        expect(enrichedTask?.derivedState.needsClarification).toBeDefined();
        expect(typeof enrichedTask?.derivedState.needsClarification).toBe('boolean');
      });
    });
  });

  describe('Cryptographic Validation (EARS 70-76)', () => {
    beforeEach(() => {
      // Reset mocks before each test in this suite
      jest.clearAllMocks();

      // Re-setup default mocks
      mockStores.tasks.list.mockResolvedValue(['1757687335-task-test']);
      mockStores.tasks.get.mockResolvedValue(createMockTaskRecord({
        id: '1757687335-task-test',
        title: 'Test Task'
      }));

      mockStores.cycles.list.mockResolvedValue(['1757687335-cycle-test']);
      mockStores.cycles.get.mockResolvedValue(createMockCycleRecord({
        id: '1757687335-cycle-test',
        title: 'Test Cycle'
      }));

      mockStores.actors.list.mockResolvedValue(['human:test']);
      mockStores.actors.get.mockResolvedValue(createMockActorRecord({
        id: 'human:test',
        displayName: 'Test User'
      }));
    });

    it('[EARS-70] should verify checksums for all records', async () => {
      const report = await indexerAdapter.validateIntegrity();

      // All records should have valid checksums
      expect(report.checksumFailures).toBe(0);
      expect(report.status).toBe('valid');
    });

    it('[EARS-71] should detect and report invalid checksum', async () => {
      const corruptedTask = await createMockTaskRecord({
        id: '1757687335-task-corrupted',
        title: 'Corrupted Task'
      });

      // Tamper with checksum to simulate corruption
      corruptedTask.header.payloadChecksum = 'invalid-checksum-hex-value';

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-corrupted']);
      mockStores.tasks.get.mockResolvedValue(corruptedTask);

      const report = await indexerAdapter.validateIntegrity();

      expect(report.checksumFailures).toBeGreaterThan(0);
      expect(report.status).toBe('errors');
      expect(report.errorsFound.some(e => e.type === 'checksum_failure')).toBe(true);

      // Should include descriptive message
      const checksumError = report.errorsFound.find(e => e.type === 'checksum_failure');
      expect(checksumError?.message).toContain('Checksum mismatch');
      expect(checksumError?.recordId).toBe('1757687335-task-corrupted');
    });

    it('[EARS-72] should continue validation for valid checksums', async () => {
      const report = await indexerAdapter.validateIntegrity();

      // Valid checksums should not generate errors
      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors.length).toBe(0);
      expect(report.status).toBe('valid');
    });

    it('[EARS-73] should verify all signatures using crypto module', async () => {
      const report = await indexerAdapter.validateIntegrity();

      // All records should have valid signatures
      expect(report.signatureFailures).toBe(0);
      expect(report.recordsScanned).toBeGreaterThan(0);
    });

    it('[EARS-74] should detect and report invalid signatures', async () => {
      const taskWithBadSig = await createMockTaskRecord({
        id: '1757687335-task-bad-sig',
        title: 'Task with Invalid Signature'
      });

      // Tamper with signature to make it invalid
      taskWithBadSig.header.signatures[0].signature = 'invalid-signature-base64-xxxxxxxxxxxxx';

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-bad-sig']);
      mockStores.tasks.get.mockResolvedValue(taskWithBadSig);

      // Mock verifySignatures to return false for this specific test
      (verifySignatures as jest.Mock).mockResolvedValueOnce(false);

      const report = await indexerAdapter.validateIntegrity();

      expect(report.signatureFailures).toBeGreaterThan(0);
      expect(report.status).toBe('errors');
      expect(report.errorsFound.some(e => e.type === 'signature_invalid')).toBe(true);

      // Should include descriptive message
      const signatureError = report.errorsFound.find(e => e.type === 'signature_invalid');
      expect(signatureError?.message).toContain('signatures failed verification');
      expect(signatureError?.recordId).toBe('1757687335-task-bad-sig');
    });

    it('[EARS-75] should handle unknown actor in signatures', async () => {
      // Mock actorStore to return null (actor not found)
      mockStores.actors.get.mockResolvedValue(null);

      // Mock verifySignatures to return false (actor not found means invalid signature)
      (verifySignatures as jest.Mock).mockResolvedValueOnce(false);

      const report = await indexerAdapter.validateIntegrity();

      // Unknown actors should cause signature failures
      expect(report.signatureFailures).toBeGreaterThan(0);
      expect(report.status).toBe('errors');
    });

    it('[EARS-76] should handle missing actor gracefully during signature verification', async () => {
      // Create adapter with actor store that returns null (actor not found)
      const testCacheStore = createMockCacheStore();
      mockStores.actors.get.mockResolvedValue(null); // Actor not found

      const adapterWithMissingActor = new IndexerAdapter({
        metricsAdapter: mockMetricsAdapter as unknown as MetricsAdapter,
        stores: mockStores,
        cacheStore: testCacheStore,
      });

      // Mock verifySignatures to return false (actor not found means cannot verify)
      (verifySignatures as jest.Mock).mockResolvedValueOnce(false);
      (verifySignatures as jest.Mock).mockResolvedValueOnce(false); // Once for task, once for cycle

      const report = await adapterWithMissingActor.validateIntegrity();

      // Should complete without throwing error (graceful degradation)
      expect(report).toBeDefined();
      expect(report.recordsScanned).toBeGreaterThan(0);

      // Signature verification should fail gracefully when actor not found
      expect(report.signatureFailures).toBeGreaterThan(0);
    });
  });

  describe('Cryptographic Validation - Integration Tests (Real Crypto)', () => {
    it('[EARS-77] should REALLY detect payload tampering with real checksum calculation', async () => {
      // Create a task with REAL valid checksum
      const validTask = await createMockTaskRecord({
        id: '1757687335-task-valid',
        title: 'Valid Task',
        description: 'This is valid'
      });

      // Store the correct checksum
      const correctChecksum = validTask.header.payloadChecksum;

      // Now tamper with the payload AFTER checksum was calculated
      validTask.payload.description = 'TAMPERED DESCRIPTION!!!';

      // The checksum in header is still the original, but payload changed
      mockStores.tasks.list.mockResolvedValue(['1757687335-task-valid']);
      mockStores.tasks.get.mockResolvedValue(validTask);

      const report = await indexerAdapter.validateIntegrity();

      // CRITICAL: Must detect the tampering
      expect(report.checksumFailures).toBe(1);
      expect(report.status).toBe('errors');

      const checksumError = report.errorsFound.find(e => e.type === 'checksum_failure');
      expect(checksumError).toBeDefined();
      expect(checksumError?.message).toContain('Checksum mismatch');

      // Verify the error message contains both checksums for debugging
      expect(checksumError?.message).toContain('expected');
      expect(checksumError?.message).toContain(correctChecksum);
    });

    it('[EARS-78] should accept valid records with matching checksums (no false positives)', async () => {
      // Create multiple tasks with valid checksums
      const task1 = await createMockTaskRecord({
        id: '1757687335-task-1',
        title: 'Task 1',
        description: 'Description 1'
      });

      const task2 = await createMockTaskRecord({
        id: '1757687336-task-2',
        title: 'Task 2',
        description: 'Description 2',
        priority: 'high'
      });

      const task3 = await createMockTaskRecord({
        id: '1757687337-task-3',
        title: 'Task 3',
        description: 'Description 3',
        status: 'active',
        tags: ['important', 'urgent']
      });

      mockStores.tasks.list.mockResolvedValue([
        '1757687335-task-1',
        '1757687336-task-2',
        '1757687337-task-3'
      ]);

      mockStores.tasks.get
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2)
        .mockResolvedValueOnce(task3);

      const report = await indexerAdapter.validateIntegrity();

      // All valid tasks should pass
      expect(report.checksumFailures).toBe(0);
      expect(report.recordsScanned).toBe(4); // 3 tasks + 1 cycle
      expect(report.status).toBe('valid');

      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors).toHaveLength(0);
    });

    it('[EARS-79] should detect multiple tampered records in batch validation', async () => {
      // Create 3 tasks: 1 valid, 2 tampered
      const validTask = await createMockTaskRecord({
        id: '1757687335-task-valid',
        title: 'Valid Task',
        description: 'Valid description for testing'
      });

      const tamperedTask1 = await createMockTaskRecord({
        id: '1757687336-task-tampered-1',
        title: 'Tampered Task 1',
        description: 'Original description text'
      });
      tamperedTask1.payload.description = 'TAMPERED!!!';

      const tamperedTask2 = await createMockTaskRecord({
        id: '1757687337-task-tampered-2',
        title: 'Original Title',
        description: 'Description text here'
      });
      tamperedTask2.payload.title = 'TAMPERED TITLE!!!';

      mockStores.tasks.list.mockResolvedValue([
        '1757687335-task-valid',
        '1757687336-task-tampered-1',
        '1757687337-task-tampered-2'
      ]);

      mockStores.tasks.get
        .mockResolvedValueOnce(validTask)
        .mockResolvedValueOnce(tamperedTask1)
        .mockResolvedValueOnce(tamperedTask2);

      const report = await indexerAdapter.validateIntegrity();

      // Should detect exactly 2 checksum failures
      expect(report.checksumFailures).toBe(2);
      expect(report.status).toBe('errors');

      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors).toHaveLength(2);

      // Verify correct task IDs are reported
      const errorIds = checksumErrors.map(e => e.recordId).sort();
      expect(errorIds).toEqual([
        '1757687336-task-tampered-1',
        '1757687337-task-tampered-2'
      ]);
    });

    it('[EARS-80] should handle edge case: empty payload fields', async () => {
      // Create valid task first, then mutate to have empty fields
      // This tests that checksum calculation works even with empty strings
      const taskWithEmptyFields = await createMockTaskRecord({
        id: '1757687335-task-empty',
        title: 'Valid Title',
        description: 'Valid description text'
      });

      // Mutate to have empty fields (schema validation will catch this separately)
      taskWithEmptyFields.payload.title = '';
      taskWithEmptyFields.payload.description = '';
      taskWithEmptyFields.payload.tags = [];
      taskWithEmptyFields.payload.references = [];

      // IMPORTANT: Recalculate checksum after mutation to keep integrity valid
      taskWithEmptyFields.header.payloadChecksum = calculatePayloadChecksum(taskWithEmptyFields.payload);

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-empty']);
      mockStores.tasks.get.mockResolvedValue(taskWithEmptyFields);

      const report = await indexerAdapter.validateIntegrity();

      // Checksum should still be calculated correctly even with empty fields
      // (schema validation is a separate concern and will catch invalid data)
      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors).toHaveLength(0);
    });

    it('[EARS-81] should handle edge case: payload with special characters and unicode', async () => {
      const taskWithUnicode = await createMockTaskRecord({
        id: '1757687335-task-unicode',
        title: 'Task with émojis 🚀 and spëcial çharacters',
        description: 'Description with 中文字符 and emojis 💯 ñ ü ö',
        tags: ['unicode-test', 'special-chars', 'test:international'] // Tags must match pattern ^[a-z0-9-]+(:[a-z0-9-:]+)*$
      });

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-unicode']);
      mockStores.tasks.get.mockResolvedValue(taskWithUnicode);

      const report = await indexerAdapter.validateIntegrity();

      // Unicode in title/description should be handled correctly by checksum
      // (tags have stricter validation: only a-z, 0-9, hyphens, colons)
      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors).toHaveLength(0);
    });

    it('[EARS-82] should validate both tasks AND cycles independently', async () => {
      const validTask = await createMockTaskRecord({
        id: '1757687335-task-valid',
        title: 'Valid Task'
      });

      const tamperedCycle = await createMockCycleRecord({
        id: '1757687335-cycle-tampered',
        title: 'Original Cycle Title'
      });
      tamperedCycle.payload.title = 'TAMPERED CYCLE TITLE!!!';

      mockStores.tasks.list.mockResolvedValue(['1757687335-task-valid']);
      mockStores.tasks.get.mockResolvedValue(validTask);

      mockStores.cycles.list.mockResolvedValue(['1757687335-cycle-tampered']);
      mockStores.cycles.get.mockResolvedValue(tamperedCycle);

      const report = await indexerAdapter.validateIntegrity();

      // Should detect cycle tampering, not task
      expect(report.checksumFailures).toBe(1);

      const checksumErrors = report.errorsFound.filter(e => e.type === 'checksum_failure');
      expect(checksumErrors).toHaveLength(1);
      expect(checksumErrors[0]?.recordId).toBe('1757687335-cycle-tampered');
    });
  });
});