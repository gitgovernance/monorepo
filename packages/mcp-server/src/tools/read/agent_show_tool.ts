import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AgentShowInput } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_agent_show — Returns full agent definition.
 * [MSRV-E4]
 */
export const agentShowTool: McpToolDefinition<AgentShowInput> = {
  name: 'gitgov_agent_show',
  description:
    'Show detailed information for a specific agent by ID, including its engine configuration and capabilities.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The agent ID to retrieve.',
      },
    },
    required: ['agentId'],
    additionalProperties: false,
  },
  handler: async (input: AgentShowInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const record = await stores.agents.get(input.agentId);

      if (!record) {
        return errorResult(`Agent not found: ${input.agentId}`, 'NOT_FOUND');
      }

      const payload = record.payload as unknown as Record<string, unknown>;
      return successResult({
        id: input.agentId,
        ...payload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to show agent: ${message}`, 'AGENT_SHOW_ERROR');
    }
  },
};
