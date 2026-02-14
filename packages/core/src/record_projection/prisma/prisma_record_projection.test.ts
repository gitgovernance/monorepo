import { PrismaRecordProjection } from './prisma_record_projection';
import type { IndexData, ProjectionContext } from '../record_projection.types';
import type { ProjectionClient } from './prisma_record_projection.types';

function createMockClient(): ProjectionClient {
  return {
    projection: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

function createMockIndexData(overrides: Partial<IndexData> = {}): IndexData {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      lastCommitHash: 'abc123',
      integrityStatus: 'valid',
      recordCounts: { tasks: 1 },
      generationTime: 100,
    },
    metrics: {
      tasks: { total: 1, byStatus: {}, byPriority: {} },
      cycles: { total: 0, active: 0, completed: 0 },
      health: { overallScore: 80, blockedTasks: 0, staleTasks: 0 },
      throughput: 0,
      leadTime: 0,
      cycleTime: 0,
      tasksCompleted7d: 0,
      averageCompletionTime: 0,
      activeAgents: 0,
      totalAgents: 0,
      agentUtilization: 0,
      humanAgentRatio: 0,
      collaborationIndex: 0,
    },
    derivedStates: {
      stalledTasks: [],
      atRiskTasks: [],
      needsClarificationTasks: [],
      blockedByDependencyTasks: [],
    },
    activityHistory: [],
    tasks: [],
    enrichedTasks: [],
    cycles: [],
    actors: [],
    feedback: [],
    ...overrides,
  } as IndexData;
}

describe('PrismaRecordProjection', () => {
  let sink: PrismaRecordProjection;
  let mockClient: ReturnType<typeof createMockClient>;
  const repoId = 'repo-123';
  const projectionType = 'index';

  beforeEach(() => {
    mockClient = createMockClient();
    sink = new PrismaRecordProjection({ client: mockClient, repoId });
  });

  describe('4.1. Core IRecordProjection Operations (EARS-A1 a A5)', () => {
    it('[EARS-A1] should upsert IndexData as JSON by repoId and projectionType', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = { lastCommitHash: 'sha-1' };

      await sink.persist(data, context);

      expect(mockClient.projection.upsert).toHaveBeenCalledWith({
        where: {
          repoId_projectionType: { repoId, projectionType },
        },
        create: {
          repoId,
          projectionType,
          data: JSON.parse(JSON.stringify(data)),
          lastCommitHash: 'sha-1',
        },
        update: {
          data: JSON.parse(JSON.stringify(data)),
          lastCommitHash: 'sha-1',
        },
      });
    });

    it('[EARS-A2] should return stored IndexData from JSON column', async () => {
      const data = createMockIndexData();
      (mockClient.projection.findUnique as jest.Mock).mockResolvedValue({
        id: 'proj-1',
        repoId,
        projectionType,
        data: JSON.parse(JSON.stringify(data)),
        lastCommitHash: 'abc123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await sink.read({});

      expect(result).not.toBeNull();
      expect(result!.metadata.lastCommitHash).toBe('abc123');
      expect(mockClient.projection.findUnique).toHaveBeenCalledWith({
        where: {
          repoId_projectionType: { repoId, projectionType },
        },
      });
    });

    it('[EARS-A3] should return null when no row exists', async () => {
      (mockClient.projection.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await sink.read({});

      expect(result).toBeNull();
    });

    it('[EARS-A4] should delete row using deleteMany', async () => {
      await sink.clear({});

      expect(mockClient.projection.deleteMany).toHaveBeenCalledWith({
        where: { repoId, projectionType },
      });
    });

    it('[EARS-A5] should store lastCommitHash from context', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = { lastCommitHash: 'commit-sha-abc' };

      await sink.persist(data, context);

      const call = (mockClient.projection.upsert as jest.Mock).mock.calls[0]![0];
      expect(call.create.lastCommitHash).toBe('commit-sha-abc');
      expect(call.update.lastCommitHash).toBe('commit-sha-abc');
    });
  });

  describe('4.2. PrismaRecordProjection-Specific (EARS-B1 a B2)', () => {
    it('[EARS-B1] should return true when projection row exists', async () => {
      (mockClient.projection.findUnique as jest.Mock).mockResolvedValue({
        id: 'proj-1',
      });

      const result = await sink.exists({});

      expect(result).toBe(true);
      expect(mockClient.projection.findUnique).toHaveBeenCalledWith({
        where: {
          repoId_projectionType: { repoId, projectionType },
        },
        select: { id: true },
      });
    });

    it('[EARS-B2] should return false when no projection row exists', async () => {
      (mockClient.projection.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await sink.exists({});

      expect(result).toBe(false);
    });
  });
});
