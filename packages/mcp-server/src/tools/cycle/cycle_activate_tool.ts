import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleTransitionInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_activate [MSRV-I2] */
export const cycleActivateTool: McpToolDefinition<CycleTransitionInput> = {
  name: 'gitgov_cycle_activate',
  description: 'Activate a planning cycle. Transitions it to active status.',
  inputSchema: {
    type: 'object',
    properties: { cycleId: { type: 'string', description: 'Cycle ID to activate.' } },
    required: ['cycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleTransitionInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter } = await di.getContainer();
      const cycle = await backlogAdapter.updateCycle(input.cycleId, { status: 'active' });
      return successResult({ id: cycle.id, title: cycle.title, status: cycle.status, previousStatus: 'planning' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('state') || message.toLowerCase().includes('transition')) {
        return errorResult(message, 'INVALID_TRANSITION');
      }
      return errorResult(`Failed to activate cycle: ${message}`, 'CYCLE_ACTIVATE_ERROR');
    }
  },
};
