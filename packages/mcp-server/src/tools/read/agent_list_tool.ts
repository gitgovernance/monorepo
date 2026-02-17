import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_agent_list — Returns all registered agents.
 * [MSRV-E3]
 */
export const agentListTool: McpToolDefinition = {
  name: 'gitgov_agent_list',
  description:
    'List all registered agents (automated actors) in the GitGovernance project.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: Record<string, unknown>, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const agentIds = await stores.agents.list();
      const agents: Array<Record<string, unknown>> = [];

      for (const id of agentIds) {
        const record = await stores.agents.get(id);
        if (!record) continue;
        const payload = record.payload as unknown as Record<string, unknown>;
        agents.push({
          id,
          engine: payload.engine ?? null,
          status: (payload.status as string) ?? 'active',
          triggers: payload.triggers ?? [],
        });
      }

      return successResult({
        total: agents.length,
        agents,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list agents: ${message}`, 'AGENT_LIST_ERROR');
    }
  },
};
