import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ActorListInput } from './identity_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_actor_list — Lists all actors, with optional type filter.
 * [ICOMP-E5], [ICOMP-E6]
 */
export const actorListTool: McpToolDefinition<ActorListInput> = {
  name: 'gitgov_actor_list',
  description:
    'List all actors in the project. Optionally filter by type (human, agent, system).',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['human', 'agent'],
        description: 'Filter actors by type.',
      },
    },
    required: [],
    additionalProperties: false,
  },
  handler: async (input: ActorListInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { identityAdapter } = container;

      // [ICOMP-E5] List all actors
      let actors = await identityAdapter.listActors();

      // [ICOMP-E6] Filter by type if specified
      if (input.type) {
        actors = actors.filter((a) => a.type === input.type);
      }

      return successResult({
        actors: actors.map((a) => ({
          id: a.id,
          type: a.type,
          status: a.status,
        })),
        total: actors.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list actors: ${message}`, 'INTERNAL_ERROR');
    }
  },
};
