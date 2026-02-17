import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleTransitionInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_complete [MSRV-I3] */
export const cycleCompleteTool: McpToolDefinition<CycleTransitionInput> = {
  name: 'gitgov_cycle_complete',
  description: 'Complete an active cycle. Transitions it to completed status.',
  inputSchema: {
    type: 'object',
    properties: { cycleId: { type: 'string', description: 'Cycle ID to complete.' } },
    required: ['cycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const cycle = await backlogAdapter.updateCycle(input.cycleId, { status: 'completed' }, actor.id);
      return successResult({ id: cycle.id, title: cycle.title, status: cycle.status, previousStatus: 'active' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to complete cycle: ${message}`, 'CYCLE_COMPLETE_ERROR');
    }
  },
};
