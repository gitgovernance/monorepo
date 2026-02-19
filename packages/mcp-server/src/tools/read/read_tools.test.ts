import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { McpDiContainer } from '../../di/mcp_di.types.js';
import { statusTool } from './status_tool.js';
import { contextTool } from './context_tool.js';
import { lintTool } from './lint_tool.js';
import { taskListTool } from './task_list_tool.js';
import { taskShowTool } from './task_show_tool.js';
import { cycleListTool } from './cycle_list_tool.js';
import { cycleShowTool } from './cycle_show_tool.js';
import { agentListTool } from './agent_list_tool.js';
import { agentShowTool } from './agent_show_tool.js';
import { registerAllTools } from '../index.js';
import { McpServer } from '../../server/mcp_server.js';

/**
 * Read Tools tests — Blocks C, D, E (MSRV-C1 to MSRV-E5)
 */

// Helpers to parse ToolResult content
function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

// Mock store factory
function createMockStore(records: ReadonlyMap<string, unknown> = new Map()) {
  return {
    list: vi.fn().mockResolvedValue(Array.from(records.keys())),
    get: vi.fn().mockImplementation(async (id: string) => records.get(id) ?? null),
    put: vi.fn(),
    putMany: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn().mockImplementation(async (id: string) => records.has(id)),
  };
}

// Mock container factory
function createMockContainer(overrides: Partial<McpDiContainer> = {}): McpDiContainer {
  return {
    stores: {
      tasks: createMockStore(),
      cycles: createMockStore(),
      feedbacks: createMockStore(),
      executions: createMockStore(),
      changelogs: createMockStore(),
      actors: createMockStore(),
      agents: createMockStore(),
    },
    backlogAdapter: {},
    feedbackAdapter: {},
    executionAdapter: {},
    identityAdapter: {} as McpDiContainer['identityAdapter'],
    lintModule: {
      lint: vi.fn(),
      lintFile: vi.fn(),
      fix: vi.fn(),
    } as unknown as McpDiContainer['lintModule'],
    syncModule: {} as McpDiContainer['syncModule'],
    sourceAuditorModule: {},
    agentRunner: {} as McpDiContainer['agentRunner'],
    projector: {
      computeProjection: vi.fn(),
      generateReport: vi.fn(),
    } as unknown as McpDiContainer['projector'],
    configManager: {
      loadConfig: vi.fn(),
      getRootCycle: vi.fn(),
      getProjectInfo: vi.fn(),
    } as unknown as McpDiContainer['configManager'],
    sessionManager: {
      loadSession: vi.fn(),
      detectActorFromKeyFiles: vi.fn(),
      getActorState: vi.fn(),
    } as unknown as McpDiContainer['sessionManager'],
    ...overrides,
  } as McpDiContainer;
}

function createMockDi(container: McpDiContainer): McpDependencyInjectionService {
  return {
    getContainer: vi.fn().mockResolvedValue(container),
  } as unknown as McpDependencyInjectionService;
}

describe('Read Tools', () => {
  describe('4.1. Status, Context and Lint (MSRV-C1 to MSRV-C5)', () => {
    it('[MSRV-C1] should return project health, active cycles and recent tasks via gitgov_status', async () => {
      const container = createMockContainer();

      // Mock computeProjection to return IndexData
      (container.projector.computeProjection as ReturnType<typeof vi.fn>).mockResolvedValue({
        cycles: [
          {
            header: {},
            payload: { id: 'cycle-1', title: 'Sprint 1', status: 'active' },
          },
          {
            header: {},
            payload: { id: 'cycle-2', title: 'Sprint 2', status: 'completed' },
          },
        ],
        enrichedTasks: [
          { id: 'task-1', title: 'Fix bug', status: 'active', priority: 'high', cycleIds: ['cycle-1'] },
          { id: 'task-2', title: 'Add feature', status: 'done', priority: 'medium', cycleIds: ['cycle-1'] },
        ],
        metrics: {
          health: { overallScore: 85 },
        },
        derivedStates: {
          stalledTasks: ['task-3'],
          atRiskTasks: [],
        },
      });

      // Mock config
      (container.configManager.loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        projectName: 'TestProject',
      });

      const di = createMockDi(container);
      const result = await statusTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.projectName).toBe('TestProject');
      expect(data.activeCycles).toHaveLength(1);
      expect(data.activeCycles[0].id).toBe('cycle-1');
      expect(data.activeCycles[0].taskCount).toBe(2);
      expect(data.recentTasks).toHaveLength(2);
      expect(data.health.score).toBe(85);
      expect(data.health.stalledTasks).toBe(1);
    });

    it('[MSRV-C2] should return config, session and actor via gitgov_context', async () => {
      const actorRecords = new Map([
        ['alice', {
          header: {},
          payload: { id: 'alice', type: 'human', displayName: 'Alice Smith', publicKey: 'pk', roles: ['admin'] },
        }],
      ]);

      const container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          actors: createMockStore(actorRecords),
        },
      });

      (container.configManager.loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        projectName: 'MyProject',
        protocolVersion: '2.0.0',
      });

      (container.sessionManager.loadSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        lastSession: { actorId: 'alice', timestamp: '2024-01-01T00:00:00Z' },
      });

      const di = createMockDi(container);
      const result = await contextTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.config.projectName).toBe('MyProject');
      expect(data.config.version).toBe('2.0.0');
      expect(data.session.currentActor).toBe('alice');
      expect(data.actor.name).toBe('Alice Smith');
      expect(data.actor.type).toBe('human');
    });

    it('[MSRV-C3] should return lint violations via gitgov_lint', async () => {
      const container = createMockContainer();

      (container.lintModule.lint as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [
          {
            level: 'error',
            filePath: 'tasks/task-1.json',
            validator: 'schema',
            message: 'Missing required field: title',
            entity: { type: 'task', id: 'task-1' },
            fixable: true,
          },
          {
            level: 'warning',
            filePath: 'cycles/cycle-1.json',
            validator: 'referential',
            message: 'Referenced task not found',
            entity: { type: 'cycle', id: 'cycle-1' },
            fixable: false,
          },
        ],
        summary: {
          filesChecked: 10,
          errors: 1,
          warnings: 1,
          fixable: 1,
          executionTime: 50,
        },
      });

      const di = createMockDi(container);
      const result = await lintTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.action).toBe('lint');
      expect(data.totalViolations).toBe(2);
      expect(data.errors).toBe(1);
      expect(data.warnings).toBe(1);
      expect(data.violations).toHaveLength(2);
      expect(data.violations[0].rule).toBe('schema');
      expect(data.violations[0].fixable).toBe(true);
      expect(data.violations[1].severity).toBe('warning');
    });

    it('[MSRV-C4] should return isError: true when a read tool fails', async () => {
      const container = createMockContainer();

      // Make projector throw
      (container.projector.computeProjection as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Store corrupted'),
      );

      (container.configManager.loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        projectName: 'Test',
      });

      const di = createMockDi(container);
      const result = await statusTool.handler({}, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.error).toContain('Store corrupted');
    });

    it('[MSRV-C5] should be idempotent — repeated calls return equivalent results', async () => {
      const container = createMockContainer();

      (container.projector.computeProjection as ReturnType<typeof vi.fn>).mockResolvedValue({
        cycles: [],
        enrichedTasks: [],
        metrics: { health: { overallScore: 100 } },
        derivedStates: { stalledTasks: [], atRiskTasks: [] },
      });

      (container.configManager.loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        projectName: 'Idempotent',
      });

      const di = createMockDi(container);
      const result1 = await statusTool.handler({}, di);
      const result2 = await statusTool.handler({}, di);

      expect(parseResult(result1)).toEqual(parseResult(result2));
    });
  });

  describe('4.2. Task List and Show (MSRV-D1 to MSRV-D5)', () => {
    let taskRecords: ReadonlyMap<string, unknown>;
    let container: McpDiContainer;

    beforeEach(() => {
      taskRecords = new Map([
        ['task-1', {
          header: {},
          payload: { id: 'task-1', title: 'Bug fix', status: 'active', priority: 'high', cycleIds: ['cycle-1'], tags: ['bug'] },
        }],
        ['task-2', {
          header: {},
          payload: { id: 'task-2', title: 'Feature', status: 'done', priority: 'medium', cycleIds: ['cycle-2'], tags: ['feature'] },
        }],
        ['task-3', {
          header: {},
          payload: { id: 'task-3', title: 'Refactor', status: 'active', priority: 'low', cycleIds: ['cycle-1'], tags: ['refactor'] },
        }],
      ]);

      container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          tasks: createMockStore(taskRecords),
        },
      });
    });

    it('[MSRV-D1] should return all tasks when no filters are passed', async () => {
      const di = createMockDi(container);
      const result = await taskListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(3);
      expect(data.tasks).toHaveLength(3);
    });

    it('[MSRV-D2] should filter tasks by status', async () => {
      const di = createMockDi(container);
      const result = await taskListTool.handler({ status: 'active' }, di);
      const data = parseResult(result);

      expect(data.total).toBe(2);
      expect(data.tasks.every((t: { status: string }) => t.status === 'active')).toBe(true);
    });

    it('[MSRV-D3] should return full task detail by ID', async () => {
      const di = createMockDi(container);
      const result = await taskShowTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('task-1');
      expect(data.title).toBe('Bug fix');
      expect(data.status).toBe('active');
      expect(data.priority).toBe('high');
    });

    it('[MSRV-D4] should return NOT_FOUND error for unknown taskId', async () => {
      const di = createMockDi(container);
      const result = await taskShowTool.handler({ taskId: 'nonexistent' }, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('NOT_FOUND');
    });

    it('[MSRV-D5] should filter tasks by cycleIds', async () => {
      const di = createMockDi(container);
      const result = await taskListTool.handler({ cycleIds: ['cycle-1'] }, di);
      const data = parseResult(result);

      expect(data.total).toBe(2);
      expect(data.tasks.every((t: { cycleIds: string[] }) => t.cycleIds.includes('cycle-1'))).toBe(true);
    });
  });

  describe('4.3. Cycle, Agent List and Show (MSRV-E1 to MSRV-E5)', () => {
    it('[MSRV-E1] should return all cycles with status and metadata', async () => {
      const cycleRecords = new Map([
        ['cycle-1', {
          header: {},
          payload: { id: 'cycle-1', title: 'Sprint 1', status: 'active', taskIds: ['t1', 't2'], tags: ['v1'] },
        }],
        ['cycle-2', {
          header: {},
          payload: { id: 'cycle-2', title: 'Sprint 2', status: 'completed', taskIds: [], tags: [] },
        }],
      ]);

      const container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          cycles: createMockStore(cycleRecords),
        },
      });

      const di = createMockDi(container);
      const result = await cycleListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(2);
      expect(data.cycles[0].title).toBe('Sprint 1');
      expect(data.cycles[0].status).toBe('active');
      expect(data.cycles[0].taskIds).toEqual(['t1', 't2']);
    });

    it('[MSRV-E2] should return cycle with its task hierarchy', async () => {
      const cycleRecords = new Map([
        ['cycle-1', {
          header: {},
          payload: { id: 'cycle-1', title: 'Sprint 1', status: 'active' },
        }],
      ]);

      const taskRecords = new Map([
        ['task-1', {
          header: {},
          payload: { id: 'task-1', title: 'Task A', status: 'active', priority: 'high', cycleIds: ['cycle-1'] },
        }],
        ['task-2', {
          header: {},
          payload: { id: 'task-2', title: 'Task B', status: 'done', priority: 'low', cycleIds: ['cycle-2'] },
        }],
      ]);

      const container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          cycles: createMockStore(cycleRecords),
          tasks: createMockStore(taskRecords),
        },
      });

      const di = createMockDi(container);
      const result = await cycleShowTool.handler({ cycleId: 'cycle-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('cycle-1');
      expect(data.title).toBe('Sprint 1');
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].id).toBe('task-1');
      expect(data.taskCount).toBe(1);
    });

    it('[MSRV-E3] should return all registered agents', async () => {
      const agentRecords = new Map([
        ['auto-reviewer', {
          header: {},
          payload: {
            id: 'auto-reviewer',
            engine: { type: 'local', runtime: 'node' },
            status: 'active',
            triggers: [{ type: 'webhook' }],
          },
        }],
      ]);

      const container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          agents: createMockStore(agentRecords),
        },
      });

      const di = createMockDi(container);
      const result = await agentListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(1);
      expect(data.agents[0].id).toBe('auto-reviewer');
      expect(data.agents[0].engine.type).toBe('local');
      expect(data.agents[0].status).toBe('active');
    });

    it('[MSRV-E4] should return full agent definition by ID', async () => {
      const agentRecords = new Map([
        ['linter-bot', {
          header: {},
          payload: {
            id: 'linter-bot',
            engine: { type: 'api', url: 'https://example.com' },
            status: 'active',
          },
        }],
      ]);

      const container = createMockContainer({
        stores: {
          ...createMockContainer().stores,
          agents: createMockStore(agentRecords),
        },
      });

      const di = createMockDi(container);
      const result = await agentShowTool.handler({ agentId: 'linter-bot' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('linter-bot');
      expect(data.engine.type).toBe('api');
      expect(data.engine.url).toBe('https://example.com');
    });

    it('[MSRV-E5] should include all 9 read tools in the registered set', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAllTools(server);

      // Verify total includes at least the 9 read tools (plus any write tools from later cycles)
      expect(server.getToolCount()).toBeGreaterThanOrEqual(9);
    });
  });
});
