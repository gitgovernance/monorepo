import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FsRecordProjection } from './fs_record_projection';
import type { IndexData, ProjectionContext } from '../record_projection.types';

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
    executions: [],
    agents: [],
    ...overrides,
  } as IndexData;
}

describe('FsRecordProjection', () => {
  let tmpDir: string;
  let sink: FsRecordProjection;
  const context: ProjectionContext = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-sink-test-'));
    sink = new FsRecordProjection({ basePath: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('4.1. Core IRecordProjection Operations (EARS-A1 a A5)', () => {
    it('[EARS-A1] should write IndexData as JSON atomically', async () => {
      const data = createMockIndexData();

      await sink.persist(data, context);

      // Verify file exists and contains valid JSON
      const indexPath = path.join(tmpDir, 'index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.metadata.lastCommitHash).toBe('abc123');
      expect(parsed.metadata.integrityStatus).toBe('valid');

      // Verify 2-space indent (JSON.stringify(data, null, 2))
      expect(content).toContain('  "metadata"');
    });

    it('[EARS-A1] should not leave temp file after successful persist', async () => {
      const data = createMockIndexData();

      await sink.persist(data, context);

      const tmpPath = path.join(tmpDir, 'index.json.tmp');
      await expect(fs.access(tmpPath)).rejects.toThrow();
    });

    it('[EARS-A2] should create directory recursively if missing', async () => {
      const nestedDir = path.join(tmpDir, 'deep', 'nested', '.gitgov');
      const nestedSink = new FsRecordProjection({ basePath: nestedDir });
      const data = createMockIndexData();

      await nestedSink.persist(data, context);

      const indexPath = path.join(nestedDir, 'index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.metadata.lastCommitHash).toBe('abc123');
    });

    it('[EARS-A3] should read and parse IndexData from file', async () => {
      const data = createMockIndexData({ metadata: { ...createMockIndexData().metadata, lastCommitHash: 'xyz789' } });

      await sink.persist(data, context);
      const result = await sink.read(context);

      expect(result).not.toBeNull();
      expect(result!.metadata.lastCommitHash).toBe('xyz789');
      expect(result!.derivedStates.stalledTasks).toEqual([]);
      expect(result!.enrichedTasks).toEqual([]);
    });

    it('[EARS-A4] should return null when file does not exist', async () => {
      const result = await sink.read(context);
      expect(result).toBeNull();
    });

    it('[EARS-A5] should delete index.json file', async () => {
      const data = createMockIndexData();
      await sink.persist(data, context);

      expect(await sink.exists(context)).toBe(true);

      await sink.clear(context);

      expect(await sink.exists(context)).toBe(false);
      expect(await sink.read(context)).toBeNull();
    });
  });

  describe('4.3. Projection Schema V2 — Backward Compatibility (PSV2-A10 a A12)', () => {
    it('[PSV2-A10] should persist and read back executions from index.json', async () => {
      const data = createMockIndexData({
        executions: [{
          header: { version: '1.0' as const, type: 'execution' as const, payloadChecksum: 'chk1', signatures: [] },
          payload: { id: 'exec-1', taskId: 'task-1', type: 'progress', title: 'Work', result: 'Done' },
        }] as unknown as IndexData['executions'],
      });

      await sink.persist(data, context);
      const result = await sink.read(context);

      expect(result).not.toBeNull();
      expect(result!.executions).toHaveLength(1);
      expect(result!.executions[0]!.payload.id).toBe('exec-1');
    });

    it('[PSV2-A11] should persist and read back agents from index.json', async () => {
      const data = createMockIndexData({
        agents: [{
          header: { version: '1.0' as const, type: 'agent' as const, payloadChecksum: 'chk2', signatures: [] },
          payload: { id: 'agent-1', engine: { type: 'local' as const }, status: 'active' as const },
        }] as unknown as IndexData['agents'],
      });

      await sink.persist(data, context);
      const result = await sink.read(context);

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(1);
      expect(result!.agents[0]!.payload.id).toBe('agent-1');
    });

    it('[PSV2-A12] should return executions: [] and agents: [] when reading legacy index.json', async () => {
      // Write JSON without executions or agents field (simulates legacy format)
      const indexPath = path.join(tmpDir, 'index.json');
      await fs.mkdir(tmpDir, { recursive: true });
      const oldData = {
        metadata: { generatedAt: new Date().toISOString(), lastCommitHash: 'old', integrityStatus: 'valid', recordCounts: {}, generationTime: 50 },
        metrics: {},
        derivedStates: { stalledTasks: [], atRiskTasks: [], needsClarificationTasks: [], blockedByDependencyTasks: [] },
        activityHistory: [],
        tasks: [],
        enrichedTasks: [],
        cycles: [],
        actors: [],
        feedback: [],
        // NOTE: no executions or agents field — legacy format
      };
      await fs.writeFile(indexPath, JSON.stringify(oldData, null, 2), 'utf-8');

      const result = await sink.read(context);

      expect(result).not.toBeNull();
      expect(result!.executions).toEqual([]);
      expect(result!.agents).toEqual([]);
    });
  });

  describe('4.2. FsRecordProjection-Specific Behavior (EARS-B1 a B3)', () => {
    it('[EARS-B1] should return true when index.json exists', async () => {
      const data = createMockIndexData();
      await sink.persist(data, context);

      expect(await sink.exists(context)).toBe(true);
    });

    it('[EARS-B2] should return false when index.json does not exist', async () => {
      expect(await sink.exists(context)).toBe(false);
    });

    it('[EARS-B3] should not throw when clearing non-existing file', async () => {
      // Should complete without error even if file doesn't exist
      await expect(sink.clear(context)).resolves.toBeUndefined();
    });
  });
});
