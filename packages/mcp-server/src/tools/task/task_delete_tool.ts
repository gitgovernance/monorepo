import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskDeleteInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_delete — Deletes tasks in draft status only.
 * [MSRV-F3, MSRV-F4]
 */
export const taskDeleteTool: McpToolDefinition<TaskDeleteInput> = {
  name: 'gitgov_task_delete',
  description:
    'Delete a task. Only tasks in draft status can be deleted. Tasks in other states will be rejected with an error.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to delete.' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: TaskDeleteInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter } = container;

      // Check current status before attempting delete
      const task = await backlogAdapter.getTask(input.taskId);
      if (!task) {
        return errorResult(`Task not found: ${input.taskId}`, 'NOT_FOUND');
      }

      if (task.status !== 'draft') {
        return errorResult(
          `Cannot delete task in '${task.status}' status. Only draft tasks can be deleted.`,
          'INVALID_STATE',
          { currentStatus: task.status, requiredStatus: 'draft' },
        );
      }

      const actor = await identityAdapter.getCurrentActor();
      await backlogAdapter.deleteTask(input.taskId, actor.id);

      return successResult({
        deleted: true,
        taskId: input.taskId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to delete task: ${message}`, 'TASK_DELETE_ERROR');
    }
  },
};
