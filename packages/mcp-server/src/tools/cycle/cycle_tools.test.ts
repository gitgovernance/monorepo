import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { cycleNewTool } from './cycle_new_tool.js';
import { cycleActivateTool } from './cycle_activate_tool.js';
import { cycleCompleteTool } from './cycle_complete_tool.js';
import { cycleEditTool } from './cycle_edit_tool.js';
import { cycleAddTaskTool } from './cycle_add_task_tool.js';
import { cycleRemoveTaskTool } from './cycle_remove_task_tool.js';
import { cycleMoveTaskTool } from './cycle_move_task_tool.js';
import { cycleAddChildTool } from './cycle_add_child_tool.js';

/**
 * Cycle Tools tests — Blocks I, J (MSRV-I1 to MSRV-J5)
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    backlogAdapter: {
      createCycle: vi.fn().mockResolvedValue({ id: 'cycle-new', title: 'Sprint 1', status: 'planning' }),
      getCycle: vi.fn().mockResolvedValue(null),
      updateCycle: vi.fn().mockResolvedValue({ id: 'cycle-1', title: 'Sprint 1', status: 'active' }),
      addTaskToCycle: vi.fn().mockResolvedValue(undefined),
      removeTasksFromCycle: vi.fn().mockResolvedValue(undefined),
      moveTasksBetweenCycles: vi.fn().mockResolvedValue(undefined),
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', displayName: 'Test', type: 'human' }),
    },
    ...overrides,
  };
  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Cycle Tools', () => {
  describe('4.1. Cycle Lifecycle (MSRV-I1 to MSRV-I5)', () => {
    it('[MSRV-I1] should create a cycle with status planning', async () => {
      const di = createMockDi();
      const result = await cycleNewTool.handler({ title: 'Sprint 1' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('planning');
      expect(data.title).toBe('Sprint 1');
    });

    it('[MSRV-I2] should activate a planning cycle', async () => {
      const di = createMockDi();
      const result = await cycleActivateTool.handler({ cycleId: 'cycle-1' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('active');
      expect(data.previousStatus).toBe('planning');
    });

    it('[MSRV-I3] should complete an active cycle', async () => {
      const di = createMockDi();
      const c = di._container;
      c.backlogAdapter.updateCycle.mockResolvedValue({ id: 'cycle-1', title: 'Sprint 1', status: 'completed' });
      const result = await cycleCompleteTool.handler({ cycleId: 'cycle-1' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('completed');
    });

    it('[MSRV-I4] should edit only specified fields', async () => {
      const di = createMockDi();
      const c = di._container;
      c.backlogAdapter.updateCycle.mockResolvedValue({ id: 'cycle-1', title: 'New Title', status: 'active' });
      const result = await cycleEditTool.handler({ cycleId: 'cycle-1', title: 'New Title' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.title).toBe('New Title');
      expect(c.backlogAdapter.updateCycle).toHaveBeenCalledWith('cycle-1', { title: 'New Title' }, 'actor-1');
    });

    it('[MSRV-I5] should return error on invalid cycle transition', async () => {
      const di = createMockDi();
      const c = di._container;
      c.backlogAdapter.updateCycle.mockRejectedValue(new Error('Invalid state transition'));
      const result = await cycleActivateTool.handler({ cycleId: 'cycle-1' }, di);
      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('4.2. Cycle-Task Linking (MSRV-J1 to MSRV-J5)', () => {
    it('[MSRV-J1] should link task to cycle bidirectionally', async () => {
      const di = createMockDi();
      const result = await cycleAddTaskTool.handler({ cycleId: 'cycle-1', taskId: 'task-1' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.linked).toBe(true);
      expect(di._container.backlogAdapter.addTaskToCycle).toHaveBeenCalledWith('cycle-1', 'task-1');
    });

    it('[MSRV-J2] should unlink task from cycle', async () => {
      const di = createMockDi();
      const result = await cycleRemoveTaskTool.handler({ cycleId: 'cycle-1', taskId: 'task-1' }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.unlinked).toBe(true);
      expect(di._container.backlogAdapter.removeTasksFromCycle).toHaveBeenCalledWith('cycle-1', ['task-1']);
    });

    it('[MSRV-J3] should move task between cycles atomically', async () => {
      const di = createMockDi();
      const result = await cycleMoveTaskTool.handler({
        taskId: 'task-1', fromCycleId: 'cycle-1', toCycleId: 'cycle-2',
      }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.moved).toBe(true);
      expect(di._container.backlogAdapter.moveTasksBetweenCycles)
        .toHaveBeenCalledWith('cycle-2', ['task-1'], 'cycle-1');
    });

    it('[MSRV-J4] should add child cycle to parent', async () => {
      const di = createMockDi();
      const c = di._container;
      c.backlogAdapter.getCycle
        .mockResolvedValueOnce({ id: 'parent', title: 'Parent', status: 'active', childCycleIds: [] })
        .mockResolvedValueOnce({ id: 'child', title: 'Child', status: 'planning' });
      const result = await cycleAddChildTool.handler({
        parentCycleId: 'parent', childCycleId: 'child',
      }, di);
      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.linked).toBe(true);
      expect(c.backlogAdapter.updateCycle).toHaveBeenCalledWith(
        'parent', { childCycleIds: ['child'] }, 'actor-1',
      );
    });

    it('[MSRV-J5] should return error when moving task with unknown cycle', async () => {
      const di = createMockDi();
      const c = di._container;
      c.backlogAdapter.moveTasksBetweenCycles.mockRejectedValue(new Error('Cycle not found: unknown-cycle'));
      const result = await cycleMoveTaskTool.handler({
        taskId: 'task-1', fromCycleId: 'unknown-cycle', toCycleId: 'cycle-2',
      }, di);
      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.error).toContain('Cycle not found');
    });
  });
});
