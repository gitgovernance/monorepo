import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ActorNewInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_actor_new [MSRV-M3, MSRV-M4] */
export const actorNewTool: McpToolDefinition<ActorNewInput> = {
  name: 'gitgov_actor_new',
  description: 'Create a new actor (human or agent) in the GitGovernance project.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique actor ID.' },
      type: { type: 'string', enum: ['human', 'agent'], description: 'Actor type.' },
      displayName: { type: 'string', description: 'Display name.' },
      roles: { type: 'array', items: { type: 'string' }, description: 'Actor roles.' },
    },
    required: ['id', 'type', 'displayName'],
    additionalProperties: false,
  },
  handler: async (input: ActorNewInput, di: McpDependencyInjectionService) => {
    try {
      const { identityAdapter, stores } = await di.getContainer();

      // Check for duplicate
      const existing = await stores.actors.get(input.id);
      if (existing) {
        return errorResult(`Actor already exists: ${input.id}`, 'DUPLICATE_ACTOR');
      }

      const currentActor = await identityAdapter.getCurrentActor();
      const actor = await identityAdapter.createActor(
        {
          id: input.id,
          type: input.type,
          displayName: input.displayName,
          publicKey: '',
          roles: (input.roles && input.roles.length > 0 ? input.roles : ['contributor']) as [string, ...string[]],
        },
        currentActor.id,
      );

      return successResult({
        id: actor.id,
        type: actor.type,
        displayName: actor.displayName,
        roles: actor.roles,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create actor: ${message}`, 'ACTOR_NEW_ERROR');
    }
  },
};
