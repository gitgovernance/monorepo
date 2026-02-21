import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AgentNewInput } from './agent_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_agent_new — Creates an AgentRecord for an existing actor of type agent.
 * [ICOMP-D1], [ICOMP-D2], [ICOMP-D3]
 */
export const agentNewTool: McpToolDefinition<AgentNewInput> = {
  name: 'gitgov_agent_new',
  description:
    'Create a new AgentRecord linked to an existing actor of type agent. Requires the actor to exist first (via gitgov_actor_new with type=agent).',
  inputSchema: {
    type: 'object',
    properties: {
      actorId: {
        type: 'string',
        description: 'Actor ID of type agent (e.g., agent:scribe).',
      },
      engineType: {
        type: 'string',
        enum: ['local', 'api', 'mcp', 'custom'],
        description: 'Execution engine type.',
      },
    },
    required: ['actorId', 'engineType'],
    additionalProperties: false,
  },
  handler: async (input: AgentNewInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { agentAdapter, identityAdapter } = container;

      // [ICOMP-D2] Validate actor exists and is type agent
      const actor = await identityAdapter.getActor(input.actorId);
      if (!actor) {
        return errorResult(`Actor not found: ${input.actorId}`, 'INVALID_ACTOR');
      }
      if (actor.type !== 'agent') {
        return errorResult(`Actor ${input.actorId} is type '${actor.type}', expected 'agent'`, 'INVALID_ACTOR');
      }

      // [ICOMP-D3] Check for duplicate
      const existing = await agentAdapter.getAgentRecord(input.actorId);
      if (existing) {
        return errorResult(`AgentRecord already exists: ${input.actorId}`, 'DUPLICATE_AGENT');
      }

      // [ICOMP-D1] Create AgentRecord
      // Engine is a discriminated union — adapter validates required fields per type
      const agent = await agentAdapter.createAgentRecord({
        id: input.actorId,
        engine: { type: input.engineType } as import('@gitgov/core').AgentRecord['engine'],
      });

      return successResult({
        id: agent.id,
        actorId: agent.id,
        engine: agent.engine,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create agent: ${message}`, 'AGENT_NEW_ERROR');
    }
  },
};
