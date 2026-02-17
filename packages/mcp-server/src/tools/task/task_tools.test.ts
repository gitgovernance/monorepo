import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { taskNewTool } from './task_new_tool.js';
import { taskDeleteTool } from './task_delete_tool.js';
import { taskSubmitTool } from './task_submit_tool.js';
import { taskApproveTool } from './task_approve_tool.js';
import { taskActivateTool } from './task_activate_tool.js';
import { taskCompleteTool } from './task_complete_tool.js';
import { taskAssignTool } from './task_assign_tool.js';

/**
 * Task Tools tests — Blocks F, G, H (MSRV-F1 to MSRV-H2)
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    backlogAdapter: {
      createTask: vi.fn().mockResolvedValue({
        id: 'task-new-1',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'A test task',
        cycleIds: [],
      }),
      getTask: vi.fn().mockResolvedValue(null),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      submitTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Task 1', status: 'review',
      }),
      approveTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Task 1', status: 'ready',
      }),
      activateTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Task 1', status: 'active',
      }),
      completeTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Task 1', status: 'done',
      }),
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', displayName: 'Test Actor', type: 'human' }),
    },
    feedbackAdapter: {
      create: vi.fn().mockResolvedValue({ id: 'fb-1' }),
    },
    stores: {
      actors: {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        put: vi.fn(),
        putMany: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn().mockResolvedValue(false),
      },
    },
    ...overrides,
  };

  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Task Tools', () => {
  describe('4.1. Task Create and Delete (MSRV-F1 to MSRV-F5)', () => {
    it('[MSRV-F1] should create a task with status draft via gitgov_task_new', async () => {
      const di = createMockDi();
      const result = await taskNewTool.handler(
        { title: 'Fix bug', description: 'Fix the login bug' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('draft');
      expect(data.title).toBe('Test Task');
      expect(data.id).toBe('task-new-1');
    });

    it('[MSRV-F2] should link task to cycleIds when provided', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.createTask.mockResolvedValue({
        id: 'task-2',
        title: 'Feature',
        status: 'draft',
        priority: 'high',
        cycleIds: ['cycle-1', 'cycle-2'],
      });

      const result = await taskNewTool.handler(
        { title: 'Feature', description: 'Add feature', cycleIds: ['cycle-1', 'cycle-2'] },
        di,
      );
      const data = parseResult(result);

      expect(data.cycleIds).toEqual(['cycle-1', 'cycle-2']);
      expect(container.backlogAdapter.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ cycleIds: ['cycle-1', 'cycle-2'] }),
        'actor-1',
      );
    });

    it('[MSRV-F3] should delete a draft task', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.getTask.mockResolvedValue({
        id: 'task-1', status: 'draft', title: 'Draft task',
      });

      const result = await taskDeleteTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.deleted).toBe(true);
      expect(container.backlogAdapter.deleteTask).toHaveBeenCalledWith('task-1', 'actor-1');
    });

    it('[MSRV-F4] should reject deletion of non-draft tasks', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.getTask.mockResolvedValue({
        id: 'task-1', status: 'active', title: 'Active task',
      });

      const result = await taskDeleteTool.handler({ taskId: 'task-1' }, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('INVALID_STATE');
      expect(data.details.currentStatus).toBe('active');
    });

    it('[MSRV-F5] should assign a unique ID to every created task', async () => {
      const di = createMockDi();
      const result = await taskNewTool.handler(
        { title: 'Unique', description: 'Should have unique ID' },
        di,
      );
      const data = parseResult(result);

      expect(data.id).toBeDefined();
      expect(typeof data.id).toBe('string');
      expect(data.id.length).toBeGreaterThan(0);
    });
  });

  describe('4.2. Task State Transitions (MSRV-G1 to MSRV-G5)', () => {
    it('[MSRV-G1] should transition draft → review via gitgov_task_submit', async () => {
      const di = createMockDi();
      const result = await taskSubmitTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('review');
      expect(data.previousStatus).toBe('draft');
    });

    it('[MSRV-G2] should transition review → ready via gitgov_task_approve', async () => {
      const di = createMockDi();
      const result = await taskApproveTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('ready');
      expect(data.previousStatus).toBe('review');
    });

    it('[MSRV-G3] should transition ready → active via gitgov_task_activate', async () => {
      const di = createMockDi();
      const result = await taskActivateTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('active');
      expect(data.previousStatus).toBe('ready');
    });

    it('[MSRV-G4] should transition active → done via gitgov_task_complete', async () => {
      const di = createMockDi();
      const result = await taskCompleteTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('done');
      expect(data.previousStatus).toBe('active');
    });

    it('[MSRV-G5] should return isError when transition is invalid', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.submitTask.mockRejectedValue(
        new Error('Invalid state transition: cannot submit task in active state'),
      );

      const result = await taskSubmitTool.handler({ taskId: 'task-1' }, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('4.3. Task Assign (MSRV-H1 to MSRV-H2)', () => {
    it('[MSRV-H1] should assign actor to task when both exist', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.getTask.mockResolvedValue({
        id: 'task-1', status: 'active', title: 'Active task',
      });
      container.stores.actors.get.mockResolvedValue({
        header: {},
        payload: { id: 'alice', displayName: 'Alice', type: 'human' },
      });

      const result = await taskAssignTool.handler(
        { taskId: 'task-1', actorId: 'alice' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.assigned).toBe(true);
      expect(data.taskId).toBe('task-1');
      expect(data.actorId).toBe('alice');
    });

    it('[MSRV-H2] should return error when actor does not exist', async () => {
      const di = createMockDi();
      const container = di._container;
      container.backlogAdapter.getTask.mockResolvedValue({
        id: 'task-1', status: 'active', title: 'Active task',
      });
      // Actor not found (default mock returns null)

      const result = await taskAssignTool.handler(
        { taskId: 'task-1', actorId: 'nonexistent' },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('ACTOR_NOT_FOUND');
    });
  });
});
