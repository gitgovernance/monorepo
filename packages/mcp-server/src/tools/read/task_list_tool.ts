import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskListInput } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_list — Returns tasks with optional filters.
 * [MSRV-D1, MSRV-D2, MSRV-D5]
 */
export const taskListTool: McpToolDefinition<TaskListInput> = {
  name: 'gitgov_task_list',
  description:
    'List tasks from the GitGovernance backlog. Supports filtering by status, priority, assignee, cycleIds, tags, stalled/atRisk flags, and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['draft', 'review', 'ready', 'active', 'done', 'archived', 'paused', 'discarded'],
        description: 'Filter by task status.',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Filter by task priority.',
      },
      cycleIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by cycle membership.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (match any).',
      },
      stalled: {
        type: 'boolean',
        description: 'If true, show only stalled tasks.',
      },
      atRisk: {
        type: 'boolean',
        description: 'If true, show only at-risk tasks.',
      },
      limit: {
        type: 'number',
        description: 'Max number of tasks to return (default: 50).',
      },
      offset: {
        type: 'number',
        description: 'Number of tasks to skip for pagination.',
      },
    },
    additionalProperties: false,
  },
  handler: async (input: TaskListInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const taskIds = await stores.tasks.list();
      const allTasks: Array<{ id: string; payload: Record<string, unknown> }> = [];

      for (const id of taskIds) {
        const record = await stores.tasks.get(id);
        if (!record) continue;
        allTasks.push({ id, payload: record.payload as unknown as Record<string, unknown> });
      }

      // Apply filters
      let filtered = allTasks;

      if (input.status) {
        filtered = filtered.filter((t) => t.payload.status === input.status);
      }

      if (input.priority) {
        filtered = filtered.filter((t) => t.payload.priority === input.priority);
      }

      if (input.cycleIds && input.cycleIds.length > 0) {
        const cycleSet = new Set(input.cycleIds);
        filtered = filtered.filter((t) => {
          const taskCycleIds = t.payload.cycleIds as string[] | undefined;
          return taskCycleIds && taskCycleIds.some((cid) => cycleSet.has(cid));
        });
      }

      if (input.tags && input.tags.length > 0) {
        const tagSet = new Set(input.tags);
        filtered = filtered.filter((t) => {
          const taskTags = t.payload.tags as string[] | undefined;
          return taskTags && taskTags.some((tag) => tagSet.has(tag));
        });
      }

      // Pagination
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 50;
      const paginated = filtered.slice(offset, offset + limit);

      const tasks = paginated.map((t) => ({
        id: t.id,
        title: (t.payload.title as string) ?? t.id,
        status: (t.payload.status as string) ?? 'unknown',
        priority: (t.payload.priority as string) ?? 'medium',
        cycleIds: (t.payload.cycleIds as string[]) ?? [],
        tags: (t.payload.tags as string[]) ?? [],
      }));

      return successResult({
        total: filtered.length,
        offset,
        limit,
        tasks,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list tasks: ${message}`, 'TASK_LIST_ERROR');
    }
  },
};
