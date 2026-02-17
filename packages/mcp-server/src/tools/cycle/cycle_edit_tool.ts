import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleEditInput } from './cycle_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_cycle_edit [MSRV-I4] */
export const cycleEditTool: McpToolDefinition<CycleEditInput> = {
  name: 'gitgov_cycle_edit',
  description: 'Edit editable fields of a cycle (title, tags, notes).',
  inputSchema: {
    type: 'object',
    properties: {
      cycleId: { type: 'string', description: 'Cycle ID to edit.' },
      title: { type: 'string', description: 'New title.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags.' },
      notes: { type: 'string', description: 'New notes.' },
    },
    required: ['cycleId'],
    additionalProperties: false,
  },
  handler: async (input: CycleEditInput, di: McpDependencyInjectionService) => {
    try {
      const { backlogAdapter, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.tags !== undefined) updates.tags = input.tags;
      if (input.notes !== undefined) updates.notes = input.notes;
      const cycle = await backlogAdapter.updateCycle(input.cycleId, updates, actor.id);
      return successResult({ id: cycle.id, title: cycle.title, status: cycle.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to edit cycle: ${message}`, 'CYCLE_EDIT_ERROR');
    }
  },
};
