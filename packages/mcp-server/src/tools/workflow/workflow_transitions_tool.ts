import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { WorkflowTransitionsInput } from './workflow_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_workflow_transitions — Returns available task status transitions.
 * Delegates entirely to WorkflowAdapter.getAvailableTransitions(from).
 * [ICOMP-E1], [ICOMP-E2]
 */
export const workflowTransitionsTool: McpToolDefinition<WorkflowTransitionsInput> = {
  name: 'gitgov_workflow_transitions',
  description:
    'Get available task status transitions from a given status. Returns the list of valid target states and their conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        enum: ['draft', 'review', 'ready', 'active', 'done', 'archived', 'paused', 'discarded'],
        description: 'Current task status to query transitions from.',
      },
    },
    required: ['from'],
    additionalProperties: false,
  },
  handler: async (input: WorkflowTransitionsInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { workflowAdapter } = container;

      // [ICOMP-E1] Delegate to core — adapter returns [] for terminal/unknown statuses
      const transitions = await workflowAdapter.getAvailableTransitions(input.from);

      return successResult({
        from: input.from,
        transitions: transitions.map((t) => ({
          to: t.to,
          conditions: t.conditions ?? null,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to get transitions: ${message}`, 'INTERNAL_ERROR');
    }
  },
};
