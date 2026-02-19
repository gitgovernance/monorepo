import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleTaskLinkInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_add_task [MSRV-J1] */
export const cycleAddTaskTool: McpToolDefinition<CycleTaskLinkInput> = {
  name: 'gitgov_cycle_add_task',
  description: 'Link a task to a cycle. Updates both task.cycleIds and cycle.taskIds.',
  inputSchema: {
    type: 'object',
    properties: {
      cycleId: { type: 'string', description: 'Cycle ID.' },
      taskId: { type: 'string', description: 'Task ID to add.' },
    },
    required: ['cycleId', 'taskId'],
    additionalProperties: false,
  },
  handler: async (input: CycleTaskLinkInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter } = await di.getContainer();
      await backlogAdapter.addTaskToCycle(input.cycleId, input.taskId);
      return successResult({ linked: true, cycleId: input.cycleId, taskId: input.taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to add task to cycle: ${message}`, 'CYCLE_ADD_TASK_ERROR');
    }
  },
};
