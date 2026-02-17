import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskTransitionInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_complete — Transitions active → done (with signature).
 * [MSRV-G4]
 */
export const taskCompleteTool: McpToolDefinition<TaskTransitionInput> = {
  name: 'gitgov_task_complete',
  description: 'Complete an active task. Signs the task and transitions it to done status.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to complete.' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const task = await backlogAdapter.completeTask(input.taskId, actor.id);

      return successResult({
        id: task.id,
        title: task.title,
        status: task.status,
        previousStatus: 'active',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to complete task: ${message}`, 'TASK_COMPLETE_ERROR');
    }
  },
};
