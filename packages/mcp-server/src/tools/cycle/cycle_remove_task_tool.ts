import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleTaskLinkInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_remove_task [MSRV-J2] */
export const cycleRemoveTaskTool: McpToolDefinition<CycleTaskLinkInput> = {
  name: 'gitgov_cycle_remove_task',
  description: 'Unlink a task from a cycle. Removes the link from both task and cycle.',
  inputSchema: {
    type: 'object',
    properties: {
      cycleId: { type: 'string', description: 'Cycle ID.' },
      taskId: { type: 'string', description: 'Task ID to remove.' },
    },
    required: ['cycleId', 'taskId'],
    additionalProperties: false,
  },
  handler: async (input: CycleTaskLinkInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter } = await di.getContainer();
      await backlogAdapter.removeTasksFromCycle(input.cycleId, [input.taskId]);
      return successResult({ unlinked: true, cycleId: input.cycleId, taskId: input.taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to remove task from cycle: ${message}`, 'CYCLE_REMOVE_TASK_ERROR');
    }
  },
};
