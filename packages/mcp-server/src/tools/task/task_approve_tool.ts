import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskTransitionInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_approve — Transitions review → ready (with signature).
 * [MSRV-G2]
 */
export const taskApproveTool: McpToolDefinition<TaskTransitionInput> = {
  name: 'gitgov_task_approve',
  description: 'Approve a task in review. Signs the task and transitions it to ready status.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to approve.' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const task = await backlogAdapter.approveTask(input.taskId, actor.id);

      return successResult({
        id: task.id,
        title: task.title,
        status: task.status,
        previousStatus: 'review',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to approve task: ${message}`, 'TASK_APPROVE_ERROR');
    }
  },
};
