import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleMoveTaskInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_move_task [MSRV-J3, MSRV-J5] */
export const cycleMoveTaskTool: McpToolDefinition<CycleMoveTaskInput> = {
  name: 'gitgov_cycle_move_task',
  description: 'Move a task atomically from one cycle to another.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID to move.' },
      fromCycleId: { type: 'string', description: 'Source cycle ID.' },
      toCycleId: { type: 'string', description: 'Destination cycle ID.' },
    },
    required: ['taskId', 'fromCycleId', 'toCycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleMoveTaskInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter } = await di.getContainer();
      await backlogAdapter.moveTasksBetweenCycles(input.toCycleId, [input.taskId], input.fromCycleId);
      return successResult({
        moved: true,
        taskId: input.taskId,
        fromCycleId: input.fromCycleId,
        toCycleId: input.toCycleId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to move task: ${message}`, 'CYCLE_MOVE_TASK_ERROR');
    }
  },
};
