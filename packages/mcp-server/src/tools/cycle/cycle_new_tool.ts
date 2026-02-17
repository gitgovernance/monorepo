import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleNewInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_new [MSRV-I1] */
export const cycleNewTool: McpToolDefinition<CycleNewInput> = {
  name: 'gitgov_cycle_new',
  description: 'Create a new cycle (sprint/iteration) in planning status.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Cycle title.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags.' },
      notes: { type: 'string', description: 'Notes.' },
    },
    required: ['title'],
    additionalProperties: false,
  },
  handler: async (input: CycleNewInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const cycle = await backlogAdapter.createCycle(
        { title: input.title, tags: input.tags, notes: input.notes },
        actor.id,
      );
      return successResult({ id: cycle.id, title: cycle.title, status: cycle.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create cycle: ${message}`, 'CYCLE_NEW_ERROR');
    }
  },
};
