import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskTransitionInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_activate — Transitions ready → active.
 * [MSRV-G3]
 */
export const taskActivateTool: McpToolDefinition<TaskTransitionInput> = {
  name: 'gitgov_task_activate',
  description: 'Activate a ready task. Transitions the task to active status so work can begin.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to activate.' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const task = await backlogAdapter.activateTask(input.taskId, actor.id);

      return successResult({
        id: task.id,
        title: task.title,
        status: task.status,
        previousStatus: 'ready',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to activate task: ${message}`, 'TASK_ACTIVATE_ERROR');
    }
  },
};
