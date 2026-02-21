import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ActorShowInput } from './identity_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_actor_show — Returns detailed info about a single actor.
 * [ICOMP-E7]
 */
export const actorShowTool: McpToolDefinition<ActorShowInput> = {
  name: 'gitgov_actor_show',
  description:
    'Show detailed information about a single actor by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      actorId: {
        type: 'string',
        description: 'Actor ID to look up (e.g., human:alice, agent:scribe).',
      },
    },
    required: ['actorId'],
    additionalProperties: false,
  },
  handler: async (input: ActorShowInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { identityAdapter } = container;

      // [ICOMP-E7] Get actor
      const actor = await identityAdapter.getActor(input.actorId);
      if (!actor) {
        return errorResult(`Actor not found: ${input.actorId}`, 'ACTOR_NOT_FOUND');
      }

      return successResult({
        id: actor.id,
        type: actor.type,
        displayName: actor.displayName,
        roles: actor.roles,
        status: actor.status,
        publicKey: actor.publicKey,
        supersededBy: actor.supersededBy,
        metadata: actor.metadata,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to show actor: ${message}`, 'INTERNAL_ERROR');
    }
  },
};
