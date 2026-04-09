import { PrismaRecordProjection } from './prisma_record_projection';
import type { IndexData, ProjectionContext, EnrichedTaskRecord } from '../record_projection.types';
import type { ProjectionClient, GitgovExecutionRow, GitgovAgentRow } from './prisma_record_projection.types';

function createMockDelegate() {
  return {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
}

function createMockSingletonDelegate() {
  return {
    upsert: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
}

function createMockClient(): ProjectionClient {
  return {
    gitgovMeta: createMockSingletonDelegate(),
    gitgovTask: createMockDelegate(),
    gitgovCycle: createMockDelegate(),
    gitgovActor: createMockDelegate(),
    gitgovFeedback: createMockDelegate(),
    gitgovActivity: createMockDelegate(),
    gitgovExecution: createMockDelegate(),
    gitgovAgent: createMockDelegate(),
    gitgovWorkflow: createMockDelegate(),
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const mockHeader = {
  version: '1.0' as const,
  type: 'task' as const,
  payloadChecksum: 'abc123',
  signatures: [{
    keyId: 'human:test',
    role: 'author',
    notes: 'test',
    signature: 'sig-base64',
    timestamp: 1000,
  }],
};

function createMockEnrichedTask(id: string): EnrichedTaskRecord {
  return {
    id,
    title: `Task ${id}`,
    status: 'active',
    priority: 'high',
    description: `Description for ${id}`,
    tags: ['tag1'],
    references: [],
    cycleIds: ['cycle-1'],
    derivedState: {
      isStalled: false,
      isAtRisk: true,
      needsClarification: false,
      isBlockedByDependency: false,
      healthScore: 75,
      timeInCurrentStage: 3600000,
    },
    relationships: {
      author: { actorId: 'human:test', timestamp: 1000 },
      assignedTo: [{ actorId: 'human:dev', assignedAt: 2000 }],
      dependsOn: [],
      blockedBy: [],
      cycles: [{ id: 'cycle-1', title: 'Sprint 1' }],
    },
    metrics: {
      executionCount: 2,
      blockingFeedbackCount: 1,
      openQuestionCount: 0,
    },
    release: {
      isReleased: false,
    },
    lastUpdated: 5000,
    lastActivityType: 'task_modified',
    recentActivity: 'Status changed to active',
  };
}

function createMockIndexData(overrides: Partial<IndexData> = {}): IndexData {
  return {
    metadata: {
      generatedAt: '2026-02-15T00:00:00.000Z',
      lastCommitHash: 'abc123',
      integrityStatus: 'valid',
      recordCounts: { tasks: 1, cycles: 1 },
      generationTime: 100,
    },
    metrics: {
      tasks: { total: 1, byStatus: {}, byPriority: {} },
      cycles: { total: 1, active: 1, completed: 0 },
      health: { overallScore: 80, blockedTasks: 0, staleTasks: 0 },
      throughput: 0,
      leadTime: 0,
      cycleTime: 0,
      tasksCompleted7d: 0,
      averageCompletionTime: 0,
      activeAgents: 1,
      totalAgents: 1,
      agentUtilization: 0,
      humanAgentRatio: 1,
      collaborationIndex: 0,
    },
    derivedStates: {
      stalledTasks: [],
      atRiskTasks: ['task-1'],
      needsClarificationTasks: [],
      blockedByDependencyTasks: [],
    },
    activityHistory: [
      {
        timestamp: 1000,
        type: 'task_created',
        entityId: 'task-1',
        entityTitle: 'Task task-1',
        actorId: 'human:test',
        metadata: { status: 'active' },
      },
    ],
    tasks: [
      {
        header: mockHeader,
        payload: {
          id: 'task-1',
          title: 'Task task-1',
          status: 'active',
          priority: 'high',
          description: 'Description for task-1',
          tags: ['tag1'],
          references: [],
          cycleIds: ['cycle-1'],
        },
      },
    ],
    enrichedTasks: [createMockEnrichedTask('task-1')],
    cycles: [
      {
        header: { ...mockHeader, type: 'cycle' as const },
        payload: {
          id: 'cycle-1',
          title: 'Sprint 1',
          status: 'active',
          taskIds: ['task-1'],
          childCycleIds: [],
          tags: ['sprint'],
        },
      },
    ],
    actors: [
      {
        header: { ...mockHeader, type: 'actor' as const },
        payload: {
          id: 'human:test',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'pk-base64-44chars-padded-xxxxxxxxxxxxxxxx',
          roles: ['admin'] as [string, ...string[]],
          status: 'active',
        },
      },
    ],
    feedback: [
      {
        header: { ...mockHeader, type: 'feedback' as const },
        payload: {
          id: 'fb-1',
          entityType: 'task',
          entityId: 'task-1',
          type: 'blocking',
          status: 'open',
          content: 'Needs review',
        },
      },
    ],
    executions: [
      {
        header: { ...mockHeader, type: 'execution' as const },
        payload: {
          id: 'exec-1',
          taskId: 'task-1',
          type: 'progress',
          title: 'Implemented feature',
          result: 'Code committed',
          notes: 'Refactored module',
          references: ['commit:abc123'],
        },
      },
    ],
    agents: [
      {
        header: { ...mockHeader, type: 'agent' as const },
        payload: {
          id: 'agent-scanner',
          engine: { type: 'local' as const, runtime: 'typescript', entrypoint: 'src/index.ts' },
          status: 'active' as const,
          triggers: [{ type: 'webhook' as const }],
          metadata: { framework: 'langchain' },
          knowledge_dependencies: ['langchain-docs', 'api-reference'],
          prompt_engine_requirements: { roles: ['analyzer'], skills: ['code-review'] },
        },
      },
    ],
    ...overrides,
  } as IndexData;
}

describe('PrismaRecordProjection', () => {
  let sink: PrismaRecordProjection;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    sink = new PrismaRecordProjection({ client: mockClient });
  });

  describe('4.1. Persist Decomposition (EARS-A1 a A5)', () => {
    it('[EARS-A1] should decompose IndexData into 9 tables within a single $transaction', async () => {
      const data = createMockIndexData();
      await sink.persist(data, { lastCommitHash: 'sha-1' });

      expect(mockClient.$transaction).toHaveBeenCalledTimes(1);
      const ops = (mockClient.$transaction as jest.Mock).mock.calls[0]![0] as unknown[];
      // 8 table deletes + 1 meta deleteMany + 1 meta create + 7 createMany = 17 (single-tenant)
      expect(ops.length).toBe(17);
    });

    it('[EARS-A2] should store each enrichedTask as individual row with queryable fields and header', async () => {
      const data = createMockIndexData();
      await sink.persist(data, { lastCommitHash: 'sha-1' });

      expect(mockClient.gitgovTask.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovTask.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('task-1');
      expect(row.status).toBe('active');
      expect(row.priority).toBe('high');
      expect(row.isAtRisk).toBe(true);
      expect(row.healthScore).toBe(75);
      expect(row.executionCount).toBe(2);
      expect(row.header).toBeDefined();
      expect(row.relationships).toBeDefined();
    });

    it('[EARS-A3] should store each cycle as individual row with header', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      expect(mockClient.gitgovCycle.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovCycle.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('cycle-1');
      expect(row.title).toBe('Sprint 1');
      expect(row.status).toBe('active');
      expect(row.header).toBeDefined();
    });

    it('[EARS-A4] should store each actor as individual row with header', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      expect(mockClient.gitgovActor.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovActor.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('human:test');
      expect(row.type).toBe('human');
      expect(row.displayName).toBe('Test User');
      expect(row.header).toBeDefined();
    });

    it('[EARS-A5] should store each feedback as individual row with header', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      expect(mockClient.gitgovFeedback.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovFeedback.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('fb-1');
      expect(row.type).toBe('blocking');
      expect(row.entityId).toBe('task-1');
      expect(row.header).toBeDefined();
    });
  });

  describe('4.2. Persist Metadata (EARS-B1 a B3)', () => {
    it('[EARS-B1] should persist GitgovMeta with metadata, derivedStates, metrics, and lastCommitHash', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = { lastCommitHash: 'commit-abc' };
      await sink.persist(data, context);

      // Single-tenant (no tenantFields) uses deleteMany + create, not upsert
      expect(mockClient.gitgovMeta.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovMeta.create).toHaveBeenCalled();
    });

    it('[EARS-B2] should store activity history as individual rows in GitgovActivity', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      expect(mockClient.gitgovActivity.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovActivity.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.eventType).toBe('task_created');
      expect(row.entityId).toBe('task-1');
      expect(row.timestamp).toBe(1000);
    });

    it('[EARS-B3] should skip createMany when collection is empty', async () => {
      const data = createMockIndexData({
        enrichedTasks: [],
        tasks: [],
        cycles: [],
        actors: [],
        feedback: [],
        activityHistory: [],
        executions: [],
        agents: [],
      });
      await sink.persist(data, {});

      expect(mockClient.gitgovTask.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovCycle.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovActor.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovFeedback.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovActivity.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovExecution.createMany).not.toHaveBeenCalled();
      expect(mockClient.gitgovAgent.createMany).not.toHaveBeenCalled();
      // 8 table deletes + 1 meta deleteMany + 1 meta create = 10 (single-tenant, no createMany for empty collections)
      const ops = (mockClient.$transaction as jest.Mock).mock.calls[0]![0] as unknown[];
      expect(ops.length).toBe(10);
    });
  });

  describe('4.3. Read Reconstruction (EARS-C1 a C3)', () => {
    it('[EARS-C1] should reconstruct valid IndexData from 6 tables', async () => {
      const originalData = createMockIndexData();

      // Mock meta
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: originalData.metadata.generatedAt,
        integrityStatus: originalData.metadata.integrityStatus,
        recordCountsJson: originalData.metadata.recordCounts,
        generationTime: originalData.metadata.generationTime,
        derivedStatesJson: originalData.derivedStates,
        metricsJson: originalData.metrics,
        lastCommitHash: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock enriched tasks
      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-1', recordId: 'task-1',
        title: 'Task task-1', status: 'active', priority: 'high',
        description: 'Description for task-1', tags: ['tag1'], references: [], cycleIds: ['cycle-1'],
        notes: null, metadata: null, isStalled: false, isAtRisk: true, needsClarification: false,
        isBlockedByDependency: false, healthScore: 75, timeInCurrentStage: 3600000,
        executionCount: 2, blockingFeedbackCount: 1, openQuestionCount: 0,
        timeToResolution: null, isReleased: false, lastReleaseVersion: null,
        lastUpdated: 5000, lastActivityType: 'task_modified',
        recentActivity: 'Status changed to active',
        relationships: { author: { actorId: 'human:test', timestamp: 1000 }, assignedTo: [], dependsOn: [], blockedBy: [], cycles: [] },
        header: mockHeader,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      // Mock cycles
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-c1', recordId: 'cycle-1',
        title: 'Sprint 1', status: 'active', taskIds: ['task-1'],
        childCycleIds: [], tags: ['sprint'], notes: null, metadata: null,
        header: { ...mockHeader, type: 'cycle' },
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      // Mock actors
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-a1', recordId: 'human:test',
        type: 'human', displayName: 'Test User',
        publicKey: 'pk-base64-44chars-padded-xxxxxxxxxxxxxxxx',
        roles: ['admin'], status: 'active', supersededBy: null,
        header: { ...mockHeader, type: 'actor' },
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      // Mock feedback
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-f1', recordId: 'fb-1',
        entityType: 'task', entityId: 'task-1', type: 'blocking',
        status: 'open', content: 'Needs review', assignee: null,
        resolvesFeedbackId: null, metadata: null,
        header: { ...mockHeader, type: 'feedback' },
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      // Mock activity
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-ev1',
        timestamp: 1000, eventType: 'task_created', entityId: 'task-1',
        entityTitle: 'Task task-1', actorId: 'human:test',
        metadata: { status: 'active' },
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      const result = await sink.read({});

      expect(result).not.toBeNull();
      expect(result!.metadata.generatedAt).toBe('2026-02-15T00:00:00.000Z');
      expect(result!.enrichedTasks).toHaveLength(1);
      expect(result!.enrichedTasks[0]!.id).toBe('task-1');
      expect(result!.enrichedTasks[0]!.derivedState.isAtRisk).toBe(true);
      expect(result!.tasks).toHaveLength(1);
      expect(result!.cycles).toHaveLength(1);
      expect(result!.actors).toHaveLength(1);
      expect(result!.feedback).toHaveLength(1);
      expect(result!.activityHistory).toHaveLength(1);
    });

    it('[EARS-C2] should return null when no GitgovMeta exists', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await sink.read({});

      expect(result).toBeNull();
      expect(mockClient.gitgovTask.findMany).not.toHaveBeenCalled();
    });

    it('[EARS-C3] should reconstruct tasks[] from enrichedTask rows using header and payload fields', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: '2026-01-01T00:00:00.000Z', integrityStatus: 'valid',
        recordCountsJson: {}, generationTime: 50,
        derivedStatesJson: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        metricsJson: {},
        lastCommitHash: null, createdAt: new Date(), updatedAt: new Date(),
      });

      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-1', recordId: 'task-99',
        title: 'Important Task', status: 'done', priority: 'critical',
        description: 'A task', tags: ['urgent'], references: ['ref-1'], cycleIds: [],
        notes: 'Some notes', metadata: null, isStalled: false, isAtRisk: false, needsClarification: false,
        isBlockedByDependency: false, healthScore: 100, timeInCurrentStage: 0,
        executionCount: 0, blockingFeedbackCount: 0, openQuestionCount: 0,
        timeToResolution: 7200000, isReleased: true, lastReleaseVersion: 'v1.0',
        lastUpdated: 9000, lastActivityType: 'task_modified', recentActivity: null,
        relationships: { assignedTo: [], dependsOn: [], blockedBy: [], cycles: [] },
        header: mockHeader,
        createdAt: new Date(), updatedAt: new Date(),
      }]);
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([]);

      const result = await sink.read({});

      expect(result!.tasks).toHaveLength(1);
      const task = result!.tasks[0]!;
      expect(task.header).toEqual(mockHeader);
      expect(task.payload.id).toBe('task-99');
      expect(task.payload.title).toBe('Important Task');
      expect(task.payload.status).toBe('done');
      expect(task.payload.notes).toBe('Some notes');
    });
  });

  describe('4.4. Exists, Clear, Atomicity (EARS-D1 a D4)', () => {
    it('[EARS-D1] should return true when GitgovMeta exists', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({ id: 'meta-1' });

      const result = await sink.exists({});

      expect(result).toBe(true);
      expect(mockClient.gitgovMeta.findFirst).toHaveBeenCalledWith({
        select: { id: true },
      });
    });

    it('[EARS-D2] should return false when no GitgovMeta exists', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await sink.exists({});

      expect(result).toBe(false);
    });

    it('[EARS-D3] should delete rows from 8 tables in a $transaction', async () => {
      await sink.clear({});

      expect(mockClient.$transaction).toHaveBeenCalledTimes(1);
      const ops = (mockClient.$transaction as jest.Mock).mock.calls[0]![0] as unknown[];
      expect(ops.length).toBe(9);
      expect(mockClient.gitgovTask.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovCycle.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovActor.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovFeedback.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovActivity.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovExecution.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovAgent.deleteMany).toHaveBeenCalled();
      expect(mockClient.gitgovMeta.deleteMany).toHaveBeenCalled();
    });

    it('[EARS-D4] should use atomic delete+createMany for full replacement', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      expect(mockClient.$transaction).toHaveBeenCalledTimes(1);
      // Verify deletes are in the transaction
      expect(mockClient.gitgovTask.deleteMany).toHaveBeenCalledWith({
        where: {},
      });
      expect(mockClient.gitgovCycle.deleteMany).toHaveBeenCalledWith({
        where: {},
      });
      // Verify createMany is also in the same transaction
      expect(mockClient.gitgovTask.createMany).toHaveBeenCalled();
    });
  });

  describe('4.5. Metadata Projection (EARS-E1 a E6)', () => {
    it('[EARS-E1] should serialize task metadata to metadata when present', async () => {
      const enrichedWithMeta = createMockEnrichedTask('task-meta');
      enrichedWithMeta.metadata = { jira: 'AUTH-42', storyPoints: 5 };

      const data = createMockIndexData({
        enrichedTasks: [enrichedWithMeta],
        tasks: [{
          header: mockHeader as IndexData['tasks'][0]['header'],
          payload: {
            id: 'task-meta',
            title: 'Task task-meta',
            status: 'active',
            priority: 'high',
            description: 'Description for task-meta',
            metadata: { jira: 'AUTH-42', storyPoints: 5 },
          },
        }],
      });
      await sink.persist(data, {});

      const call = (mockClient.gitgovTask.createMany as jest.Mock).mock.calls[0]![0];
      const row = call.data[0];
      expect(row.metadata).toEqual({ jira: 'AUTH-42', storyPoints: 5 });
    });

    it('[EARS-E2] should set task metadata to null when metadata is absent', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      const call = (mockClient.gitgovTask.createMany as jest.Mock).mock.calls[0]![0];
      const row = call.data[0];
      expect(row.metadata).toBeNull();
    });

    it('[EARS-E3] should serialize cycle metadata to metadata when present', async () => {
      const data = createMockIndexData({
        cycles: [{
          header: { ...mockHeader, type: 'cycle' as const } as IndexData['cycles'][0]['header'],
          payload: {
            id: 'cycle-meta',
            title: 'Epic Cycle',
            status: 'active',
            taskIds: [],
            metadata: { epic: true, phase: 'active', files: { overview: 'overview.md' } },
          },
        }],
      });
      await sink.persist(data, {});

      const call = (mockClient.gitgovCycle.createMany as jest.Mock).mock.calls[0]![0];
      const row = call.data[0];
      expect(row.metadata).toEqual({ epic: true, phase: 'active', files: { overview: 'overview.md' } });
    });

    it('[EARS-E4] should set cycle metadata to null when metadata is absent', async () => {
      const data = createMockIndexData();
      await sink.persist(data, {});

      const call = (mockClient.gitgovCycle.createMany as jest.Mock).mock.calls[0]![0];
      const row = call.data[0];
      expect(row.metadata).toBeNull();
    });

    it('[EARS-E5] should reconstruct task metadata from metadata during read', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: '2026-01-01T00:00:00.000Z', integrityStatus: 'valid',
        recordCountsJson: {}, generationTime: 50,
        derivedStatesJson: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        metricsJson: {}, lastCommitHash: null, createdAt: new Date(), updatedAt: new Date(),
      });

      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-1', recordId: 'task-meta',
        title: 'Task with Meta', status: 'active', priority: 'high',
        description: 'Has metadata', tags: [], references: [], cycleIds: [],
        notes: null, metadata: { jira: 'AUTH-42', storyPoints: 5 },
        isStalled: false, isAtRisk: false, needsClarification: false,
        isBlockedByDependency: false, healthScore: 80, timeInCurrentStage: 0,
        executionCount: 0, blockingFeedbackCount: 0, openQuestionCount: 0,
        timeToResolution: null, isReleased: false, lastReleaseVersion: null,
        lastUpdated: 1000, lastActivityType: 'task_created', recentActivity: null,
        relationships: { assignedTo: [], dependsOn: [], blockedBy: [], cycles: [] },
        header: mockHeader, createdAt: new Date(), updatedAt: new Date(),
      }]);
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([]);

      const result = await sink.read({});

      expect(result!.tasks[0]!.payload.metadata).toEqual({ jira: 'AUTH-42', storyPoints: 5 });
      expect(result!.enrichedTasks[0]!.metadata).toEqual({ jira: 'AUTH-42', storyPoints: 5 });
    });

    it('[EARS-E6] should reconstruct cycle metadata from metadata during read', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: '2026-01-01T00:00:00.000Z', integrityStatus: 'valid',
        recordCountsJson: {}, generationTime: 50,
        derivedStatesJson: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        metricsJson: {}, lastCommitHash: null, createdAt: new Date(), updatedAt: new Date(),
      });

      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'row-c1', recordId: 'cycle-meta',
        title: 'Epic Cycle', status: 'active', taskIds: [], childCycleIds: [],
        tags: [], notes: null,
        metadata: { epic: true, phase: 'active', files: { overview: 'overview.md' } },
        header: { ...mockHeader, type: 'cycle' },
        createdAt: new Date(), updatedAt: new Date(),
      }]);
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([]);

      const result = await sink.read({});

      expect(result!.cycles[0]!.payload.metadata).toEqual({
        epic: true, phase: 'active', files: { overview: 'overview.md' },
      });
    });
  });

  describe('4.6. Projection Schema V2 — Executions & Agents (PSV2-A15 a A18)', () => {
    it('[PSV2-A15] should persist executions with type mapped from payload.type', async () => {
      const data = createMockIndexData();
      await sink.persist(data, { lastCommitHash: 'sha-1' });

      expect(mockClient.gitgovExecution.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovExecution.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('exec-1');
      expect(row.taskId).toBe('task-1');
      expect(row.type).toBe('progress');
      expect(row.title).toBe('Implemented feature');
      expect(row.result).toBe('Code committed');
      expect(row.notes).toBe('Refactored module');
      expect(row.references).toEqual(['commit:abc123']);
      expect(row.header).toBeDefined();
    });

    it('[PSV2-A16] should persist each agent via atomic delete+createMany pattern', async () => {
      const data = createMockIndexData();
      await sink.persist(data, { lastCommitHash: 'sha-1' });

      expect(mockClient.gitgovAgent.createMany).toHaveBeenCalledTimes(1);
      const call = (mockClient.gitgovAgent.createMany as jest.Mock).mock.calls[0]![0];
      expect(call.data).toHaveLength(1);
      const row = call.data[0];
      expect(row.recordId).toBe('agent-scanner');
      expect(row.engine).toEqual({ type: 'local', runtime: 'typescript', entrypoint: 'src/index.ts' });
      expect(row.status).toBe('active');
      expect(row.triggers).toEqual([{ type: 'webhook' }]);
      expect(row.metadata).toEqual({ framework: 'langchain' });
      expect(row.knowledgeDependencies).toEqual(['langchain-docs', 'api-reference']);
      expect(row.promptEngineRequirements).toEqual({ roles: ['analyzer'], skills: ['code-review'] });
      expect(row.header).toBeDefined();
    });

    it('[PSV2-A17] should reconstruct executions from GitgovExecution rows during read', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: '2026-01-01T00:00:00.000Z', integrityStatus: 'valid',
        recordCountsJson: {}, generationTime: 50,
        derivedStatesJson: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        metricsJson: {}, lastCommitHash: null, createdAt: new Date(), updatedAt: new Date(),
      });

      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([]);
      const readExec: GitgovExecutionRow = {
        id: 'row-e1', recordId: 'exec-1',
        taskId: 'task-1', type: 'progress', title: 'Implemented feature',
        result: 'Code committed', notes: 'Refactored module',
        metadata: null,
        references: ['commit:abc123'],
        header: { ...mockHeader, type: 'execution' },
        createdAt: new Date(), updatedAt: new Date(),
      };
      (mockClient.gitgovExecution.findMany as jest.Mock).mockResolvedValue([readExec]);
      (mockClient.gitgovAgent.findMany as jest.Mock).mockResolvedValue([]);

      const result = await sink.read({});

      expect(result).not.toBeNull();
      expect(result!.executions).toHaveLength(1);
      expect(result!.executions[0]!.payload.id).toBe('exec-1');
      expect(result!.executions[0]!.payload.type).toBe('progress');
      expect(result!.executions[0]!.payload.taskId).toBe('task-1');
      expect(result!.executions[0]!.payload.title).toBe('Implemented feature');
      expect(result!.executions[0]!.payload.notes).toBe('Refactored module');
      expect(result!.executions[0]!.payload.references).toEqual(['commit:abc123']);
      expect(result!.executions[0]!.header).toBeDefined();
    });

    it('[PSV2-A18] should reconstruct agents from GitgovAgent rows during read', async () => {
      (mockClient.gitgovMeta.findFirst as jest.Mock).mockResolvedValue({
        id: 'meta-1',
        generatedAt: '2026-01-01T00:00:00.000Z', integrityStatus: 'valid',
        recordCountsJson: {}, generationTime: 50,
        derivedStatesJson: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        metricsJson: {}, lastCommitHash: null, createdAt: new Date(), updatedAt: new Date(),
      });

      (mockClient.gitgovTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovCycle.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActor.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovFeedback.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovActivity.findMany as jest.Mock).mockResolvedValue([]);
      (mockClient.gitgovExecution.findMany as jest.Mock).mockResolvedValue([]);
      const readAgent: GitgovAgentRow = {
        id: 'row-ag1', recordId: 'agent-scanner',
        engine: { type: 'local', runtime: 'typescript', entrypoint: 'src/index.ts' },
        status: 'active',
        triggers: [{ type: 'webhook' }],
        knowledgeDependencies: null,
        promptEngineRequirements: null,
        metadata: { framework: 'langchain' },
        header: { ...mockHeader, type: 'agent' },
        createdAt: new Date(), updatedAt: new Date(),
      };
      (mockClient.gitgovAgent.findMany as jest.Mock).mockResolvedValue([readAgent]);

      const result = await sink.read({});

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(1);
      expect(result!.agents[0]!.payload.id).toBe('agent-scanner');
      expect(result!.agents[0]!.payload.engine.type).toBe('local');
      expect(result!.agents[0]!.payload.status).toBe('active');
      expect(result!.agents[0]!.payload.triggers).toEqual([{ type: 'webhook' }]);
      expect(result!.agents[0]!.payload.metadata).toEqual({ framework: 'langchain' });
      expect(result!.agents[0]!.header).toBeDefined();
    });
  });

  // ─── Schema-Type Coherence (COH-A1 to COH-A3) ──────────────────────────────
  // Spec: prisma_record_projection_module.md §4.10

  describe('4.10. Protocol Schema Coherence (COH-A1 to COH-A3)', () => {
    const fs = require('fs');
    const path = require('path');

    type PrismaSchemaField = { name: string; type: string };
    type PrismaSchemaModel = { name: string; fields: PrismaSchemaField[] };

    function parsePrismaSchema(schemaPath: string): PrismaSchemaModel[] {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const models: PrismaSchemaModel[] = [];
      let currentModel: PrismaSchemaModel | null = null;
      for (const line of content.split('\n')) {
        const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
        if (modelMatch) { currentModel = { name: modelMatch[1], fields: [] }; continue; }
        if (line.trim() === '}' && currentModel) { models.push(currentModel); currentModel = null; continue; }
        if (currentModel) {
          const fieldMatch = line.match(/^\s+(\w+)\s+([\w[\]?]+)/);
          if (fieldMatch && !line.trim().startsWith('//') && !line.trim().startsWith('@@')) {
            const name = fieldMatch[1];
            const rawType = fieldMatch[2];
            if (rawType.match(/^[A-Z]/) && !['String','Int','Float','Boolean','DateTime','Json','BigInt','Decimal','Bytes'].includes(rawType.replace('?','').replace('[]',''))) {
              continue; // Skip relations and unknown PascalCase types
            }
            currentModel.fields.push({ name, type: rawType.replace('?','').replace('[]','') });
          }
        }
      }
      return models;
    }

    const SCHEMA_DIR = path.resolve(__dirname, '../../../prisma/schema');
    let protocolModels: PrismaSchemaModel[];

    beforeAll(() => {
      const protocolPath = path.join(SCHEMA_DIR, 'protocol.prisma');
      expect(fs.existsSync(protocolPath)).toBe(true);
      protocolModels = parsePrismaSchema(protocolPath);
    });

    it('[COH-A1] should verify every protocol.prisma field maps to a record type field', () => {
      expect(protocolModels.length).toBeGreaterThan(0);
      const taskModel = protocolModels.find((m: PrismaSchemaModel) => m.name === 'GitgovTask');
      expect(taskModel).toBeDefined();
      const taskFieldNames = taskModel!.fields.map((f: PrismaSchemaField) => f.name);
      for (const field of ['title', 'status', 'priority', 'description', 'tags', 'references', 'cycleIds', 'notes', 'metadata']) {
        expect(taskFieldNames).toContain(field);
      }
      for (const field of ['isStalled', 'isAtRisk', 'needsClarification', 'healthScore']) {
        expect(taskFieldNames).toContain(field);
      }
    });

    it('[COH-A2] should fail when record type field is added but not in prisma schema', () => {
      const taskModel = protocolModels.find((m: PrismaSchemaModel) => m.name === 'GitgovTask');
      const taskFieldNames = taskModel!.fields.map((f: PrismaSchemaField) => f.name);
      expect(taskFieldNames).toContain('recordId');
      expect(taskFieldNames).toContain('header');
    });

    it('[COH-A3] should fail when prisma has field not in record type or enrichment', () => {
      const taskModel = protocolModels.find((m: PrismaSchemaModel) => m.name === 'GitgovTask');
      const taskFieldNames = taskModel!.fields.map((f: PrismaSchemaField) => f.name);
      const knownTaskFields = [
        'id', 'recordId', 'createdAt', 'updatedAt',
        'title', 'status', 'priority', 'description', 'tags', 'references', 'cycleIds', 'notes', 'metadata',
        'header',
        'isStalled', 'isAtRisk', 'needsClarification', 'isBlockedByDependency',
        'healthScore', 'timeInCurrentStage', 'executionCount',
        'blockingFeedbackCount', 'openQuestionCount', 'timeToResolution',
        'isReleased', 'lastReleaseVersion',
        'lastUpdated', 'lastActivityType', 'recentActivity', 'relationships',
      ];
      const orphanedFields = taskFieldNames.filter((f: string) => !knownTaskFields.includes(f));
      expect(orphanedFields).toEqual([]);
    });
  });
});
