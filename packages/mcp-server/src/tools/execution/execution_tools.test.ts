import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { executionCreateTool } from './execution_create_tool.js';
import { executionListTool } from './execution_list_tool.js';
import { executionShowTool } from './execution_show_tool.js';

/**
 * Execution Tools tests — Block B (ICOMP-B1 to ICOMP-B7)
 * Blueprint: mcp_tools_execution.md §4
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    executionAdapter: {
      create: vi.fn().mockResolvedValue({
        id: 'exec-1',
        taskId: 'task-1',
        type: 'progress',
        title: 'Work done',
        result: 'Implemented feature X',
        notes: null,
        references: [],
      }),
      getExecution: vi.fn().mockResolvedValue(null),
      getExecutionsByTask: vi.fn().mockResolvedValue([]),
      getAllExecutions: vi.fn().mockResolvedValue([]),
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

describe('Execution Tools', () => {
  describe('4.1. Execution Create (ICOMP-B1 to ICOMP-B3)', () => {
    it('[ICOMP-B1] should create an ExecutionRecord linked to a task', async () => {
      const di = createMockDi();
      const result = await executionCreateTool.handler(
        {
          taskId: 'task-1',
          result: 'Implemented feature X',
          type: 'progress',
          title: 'Work done',
        },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('exec-1');
      expect(data.taskId).toBe('task-1');
      expect(data.type).toBe('progress');
      expect(data.title).toBe('Work done');
      expect(data.result).toBe('Implemented feature X');

      const container = di._container;
      expect(container.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          result: 'Implemented feature X',
          type: 'progress',
          title: 'Work done',
        }),
        'actor-1',
      );
    });

    it('[ICOMP-B2] should default to type progress when not specified', async () => {
      const di = createMockDi();
      const result = await executionCreateTool.handler(
        {
          taskId: 'task-1',
          result: 'Some work',
        },
        di,
      );

      expect(result.isError).toBeUndefined();

      const container = di._container;
      expect(container.executionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
        }),
        'actor-1',
      );
    });

    it('[ICOMP-B3] should return error when taskId does not exist', async () => {
      const di = createMockDi();
      const container = di._container;
      container.executionAdapter.create.mockRejectedValue(new Error('Task not found: task-nonexistent'));

      const result = await executionCreateTool.handler(
        {
          taskId: 'task-nonexistent',
          result: 'Some work',
        },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('EXECUTION_CREATE_ERROR');
      expect(data.error).toContain('Task not found');
    });
  });

  describe('4.2. Execution List (ICOMP-B4 to ICOMP-B5)', () => {
    it('[ICOMP-B4] should filter executions by taskId', async () => {
      const di = createMockDi();
      const container = di._container;
      container.executionAdapter.getExecutionsByTask.mockResolvedValue([
        { id: 'exec-1', taskId: 'task-1', type: 'progress', title: 'Work 1', result: 'Done 1' },
        { id: 'exec-2', taskId: 'task-1', type: 'blocker', title: 'Blocked', result: 'API down' },
      ]);

      const result = await executionListTool.handler({ taskId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(2);
      expect(data.executions).toHaveLength(2);
      expect(container.executionAdapter.getExecutionsByTask).toHaveBeenCalledWith('task-1');
    });

    it('[ICOMP-B5] should return all executions when no filters given', async () => {
      const di = createMockDi();
      const container = di._container;
      container.executionAdapter.getAllExecutions.mockResolvedValue([
        { id: 'exec-1', taskId: 'task-1', type: 'progress', title: 'Work 1', result: 'Done 1' },
      ]);

      const result = await executionListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(1);
      expect(container.executionAdapter.getAllExecutions).toHaveBeenCalled();
    });
  });

  describe('4.3. Execution Show (ICOMP-B6 to ICOMP-B7)', () => {
    it('[ICOMP-B6] should return full execution details', async () => {
      const di = createMockDi();
      const container = di._container;
      container.executionAdapter.getExecution.mockResolvedValue({
        id: 'exec-1',
        taskId: 'task-1',
        type: 'progress',
        title: 'Work done',
        result: 'Implemented feature X',
        notes: 'Used pattern Y',
        references: ['commit:abc123'],
      });

      const result = await executionShowTool.handler({ executionId: 'exec-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('exec-1');
      expect(data.taskId).toBe('task-1');
      expect(data.type).toBe('progress');
      expect(data.result).toBe('Implemented feature X');
      expect(data.notes).toBe('Used pattern Y');
      expect(data.references).toEqual(['commit:abc123']);
    });

    it('[ICOMP-B7] should return NOT_FOUND error for non-existent execution', async () => {
      const di = createMockDi();
      // Default mock returns null for getExecution

      const result = await executionShowTool.handler({ executionId: 'exec-nonexistent' }, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('NOT_FOUND');
      expect(data.error).toContain('exec-nonexistent');
    });
  });
});
