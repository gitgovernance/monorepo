import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskNewInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_new — Creates a task in draft status.
 * [MSRV-F1, MSRV-F2, MSRV-F5]
 */
export const taskNewTool: McpToolDefinition<TaskNewInput> = {
  name: 'gitgov_task_new',
  description:
    'Create a new task in draft status. Provide title, description, and optional priority, cycleIds, tags, and references.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title.' },
      description: { type: 'string', description: 'Task description.' },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Task priority (default: medium).',
      },
      cycleIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Cycle IDs to link the task to.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for the task.',
      },
      references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Reference URLs or IDs.',
      },
    },
    required: ['title', 'description'],
    additionalProperties: false,
  },
  handler: async (input: TaskNewInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const actorId = actor.id;

      const task = await backlogAdapter.createTask(
        {
          title: input.title,
          description: input.description,
          priority: input.priority ?? 'medium',
          cycleIds: input.cycleIds,
          tags: input.tags,
          references: input.references,
        },
        actorId,
      );

      return successResult({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        cycleIds: task.cycleIds ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create task: ${message}`, 'TASK_NEW_ERROR');
    }
  },
};
