import { MemoryProjectionSink } from './memory_projection_sink';
import type { IndexData, ProjectionContext } from '../record_projector.types';

/**
 * Creates a minimal valid IndexData for testing.
 */
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

describe('MemoryProjectionSink', () => {
  let sink: MemoryProjectionSink;

  beforeEach(() => {
    sink = new MemoryProjectionSink();
  });

  describe('4.1. Core IProjectionSink Operations (EARS-A1 a A4)', () => {
    it('[EARS-A1] should store IndexData in Map by repoIdentifier', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = { repoIdentifier: 'repo-1' };

      await sink.persist(data, context);

      const stored = await sink.read(context);
      expect(stored).not.toBeNull();
      expect(stored!.metadata.lastCommitHash).toBe('abc123');
    });

    it('[EARS-A1] should use __default__ key when repoIdentifier is undefined', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = {};

      await sink.persist(data, context);

      const stored = await sink.read({});
      expect(stored).not.toBeNull();
      expect(stored!.metadata.lastCommitHash).toBe('abc123');
    });

    it('[EARS-A2] should return stored IndexData for existing context', async () => {
      const data = createMockIndexData({ metadata: { ...createMockIndexData().metadata, lastCommitHash: 'def456' } });
      const context: ProjectionContext = { repoIdentifier: 'my-repo' };

      await sink.persist(data, context);
      const result = await sink.read(context);

      expect(result).not.toBeNull();
      expect(result!.metadata.lastCommitHash).toBe('def456');
      expect(result!.metadata.integrityStatus).toBe('valid');
    });

    it('[EARS-A3] should return null for non-existing context', async () => {
      const result = await sink.read({ repoIdentifier: 'non-existing' });
      expect(result).toBeNull();
    });

    it('[EARS-A3] should return null for empty sink with default context', async () => {
      const result = await sink.read({});
      expect(result).toBeNull();
    });

    it('[EARS-A4] should clear Map entry for context', async () => {
      const data = createMockIndexData();
      const context: ProjectionContext = { repoIdentifier: 'repo-to-clear' };

      await sink.persist(data, context);
      expect(await sink.exists(context)).toBe(true);

      await sink.clear(context);
      expect(await sink.exists(context)).toBe(false);
      expect(await sink.read(context)).toBeNull();
    });

    it('[EARS-A4] should only clear the specified context, not others', async () => {
      const data1 = createMockIndexData();
      const data2 = createMockIndexData({ metadata: { ...createMockIndexData().metadata, lastCommitHash: 'other' } });

      await sink.persist(data1, { repoIdentifier: 'repo-1' });
      await sink.persist(data2, { repoIdentifier: 'repo-2' });

      await sink.clear({ repoIdentifier: 'repo-1' });

      expect(await sink.read({ repoIdentifier: 'repo-1' })).toBeNull();
      expect(await sink.read({ repoIdentifier: 'repo-2' })).not.toBeNull();
    });
  });

  describe('4.2. MemoryProjectionSink-Specific Behavior (EARS-B1 a B2)', () => {
    it('[EARS-B1] should return true when data exists for context', async () => {
      const data = createMockIndexData();
      await sink.persist(data, { repoIdentifier: 'exists-repo' });

      expect(await sink.exists({ repoIdentifier: 'exists-repo' })).toBe(true);
    });

    it('[EARS-B2] should return false when no data exists for context', async () => {
      expect(await sink.exists({ repoIdentifier: 'missing-repo' })).toBe(false);
    });

    it('[EARS-B2] should return false for default context on empty sink', async () => {
      expect(await sink.exists({})).toBe(false);
    });
  });
});
