import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { SyncResolveInput } from './sync_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_sync_resolve [MSRV-K4] */
export const syncResolveTool: McpToolDefinition<SyncResolveInput> = {
  name: 'gitgov_sync_resolve',
  description: 'Resolve a sync conflict with a reason. Records the resolution and continues the rebase.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Reason for the conflict resolution.' },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  handler: async (input: SyncResolveInput, di: McpDependencyInjectionService) => {
    try {
      const { syncModule, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const result = await syncModule.resolveConflict({
        reason: input.reason,
        actorId: actor.id,
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to resolve conflict: ${message}`, 'SYNC_RESOLVE_ERROR');
    }
  },
};
