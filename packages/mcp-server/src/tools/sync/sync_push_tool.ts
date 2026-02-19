import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { SyncPushInput } from './sync_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_sync_push [MSRV-K1, MSRV-K2] */
export const syncPushTool: McpToolDefinition<SyncPushInput> = {
  name: 'gitgov_sync_push',
  description: 'Push local .gitgov/ state to the shared gitgov-state branch. Use dryRun to preview changes.',
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: { type: 'boolean', description: 'Preview changes without publishing.' },
      force: { type: 'boolean', description: 'Force push even with conflicts.' },
    },
    additionalProperties: false,
  },
  handler: async (input: SyncPushInput, di: McpDependencyInjectionService) => {
    try {
      const { syncModule, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const result = await syncModule.pushState({
        actorId: actor.id,
        dryRun: input.dryRun,
        force: input.force,
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to push state: ${message}`, 'SYNC_PUSH_ERROR');
    }
  },
};
