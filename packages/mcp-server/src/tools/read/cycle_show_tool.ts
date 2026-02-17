import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleShowInput } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_cycle_show — Returns cycle detail with its task hierarchy.
 * [MSRV-E2]
 */
export const cycleShowTool: McpToolDefinition<CycleShowInput> = {
  name: 'gitgov_cycle_show',
  description:
    'Show detailed information for a specific cycle including its linked tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      cycleId: {
        type: 'string',
        description: 'The cycle ID to retrieve.',
      },
    },
    required: ['cycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleShowInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const record = await stores.cycles.get(input.cycleId);

      if (!record) {
        return errorResult(`Cycle not found: ${input.cycleId}`, 'NOT_FOUND');
      }

      const payload = record.payload as unknown as Record<string, unknown>;

      // Find tasks linked to this cycle
      const taskIds = await stores.tasks.list();
      const linkedTasks: Array<Record<string, unknown>> = [];

      for (const taskId of taskIds) {
        const taskRecord = await stores.tasks.get(taskId);
        if (!taskRecord) continue;
        const taskPayload = taskRecord.payload as unknown as Record<string, unknown>;
        const taskCycleIds = taskPayload.cycleIds as string[] | undefined;
        if (taskCycleIds && taskCycleIds.includes(input.cycleId)) {
          linkedTasks.push({
            id: taskId,
            title: (taskPayload.title as string) ?? taskId,
            status: (taskPayload.status as string) ?? 'unknown',
            priority: (taskPayload.priority as string) ?? 'medium',
          });
        }
      }

      return successResult({
        id: input.cycleId,
        ...payload,
        tasks: linkedTasks,
        taskCount: linkedTasks.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to show cycle: ${message}`, 'CYCLE_SHOW_ERROR');
    }
  },
};
