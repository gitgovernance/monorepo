import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleAddChildInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_add_child [MSRV-J4] */
export const cycleAddChildTool: McpToolDefinition<CycleAddChildInput> = {
  name: 'gitgov_cycle_add_child',
  description: 'Add a child cycle to a parent cycle for hierarchy management.',
  inputSchema: {
    type: 'object',
    properties: {
      parentCycleId: { type: 'string', description: 'Parent cycle ID.' },
      childCycleId: { type: 'string', description: 'Child cycle ID to add.' },
    },
    required: ['parentCycleId', 'childCycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleAddChildInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();

      // Get parent cycle, add child to childCycleIds
      const parent = await backlogAdapter.getCycle(input.parentCycleId);
      if (!parent) {
        return errorResult(`Parent cycle not found: ${input.parentCycleId}`, 'NOT_FOUND');
      }

      const child = await backlogAdapter.getCycle(input.childCycleId);
      if (!child) {
        return errorResult(`Child cycle not found: ${input.childCycleId}`, 'NOT_FOUND');
      }

      const existingChildren = parent.childCycleIds ?? [];
      if (!existingChildren.includes(input.childCycleId)) {
        await backlogAdapter.updateCycle(
          input.parentCycleId,
          { childCycleIds: [...existingChildren, input.childCycleId] },
          actor.id,
        );
      }

      return successResult({
        linked: true,
        parentCycleId: input.parentCycleId,
        childCycleId: input.childCycleId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to add child cycle: ${message}`, 'CYCLE_ADD_CHILD_ERROR');
    }
  },
};
