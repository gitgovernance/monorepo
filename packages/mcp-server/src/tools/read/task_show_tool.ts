import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskShowInput } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_show — Returns full detail for a single task.
 * [MSRV-D3, MSRV-D4]
 */
export const taskShowTool: McpToolDefinition<TaskShowInput> = {
  name: 'gitgov_task_show',
  description:
    'Show detailed information for a specific task by ID, including its full payload and optional health indicators.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID to retrieve.',
      },
      includeHistory: {
        type: 'boolean',
        description: 'Include task history/transitions (default: false).',
      },
      includeHealth: {
        type: 'boolean',
        description: 'Include health score and risk indicators (default: false).',
      },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskShowInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const record = await stores.tasks.get(input.taskId);

      if (!record) {
        return errorResult(`Task not found: ${input.taskId}`, 'NOT_FOUND');
      }

      const payload = record.payload as unknown as Record<string, unknown>;

      const response: Record<string, unknown> = {
        id: input.taskId,
        ...payload,
      };

      return successResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to show task: ${message}`, 'TASK_SHOW_ERROR');
    }
  },
};
