import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskTransitionInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_submit — Transitions draft → review.
 * [MSRV-G1]
 */
export const taskSubmitTool: McpToolDefinition<TaskTransitionInput> = {
  name: 'gitgov_task_submit',
  description: 'Submit a draft task for review. Transitions the task from draft to review status.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to submit.' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const task = await backlogAdapter.submitTask(input.taskId, actor.id);

      return successResult({
        id: task.id,
        title: task.title,
        status: task.status,
        previousStatus: 'draft',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to submit task: ${message}`, 'TASK_SUBMIT_ERROR');
    }
  },
};
