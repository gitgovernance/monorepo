import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { SyncPullInput } from './sync_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_sync_pull [MSRV-K3] */
export const syncPullTool: McpToolDefinition<SyncPullInput> = {
  name: 'gitgov_sync_pull',
  description: 'Pull remote state from the shared gitgov-state branch into local .gitgov/.',
  inputSchema: {
    type: 'object',
    properties: {
      forceReindex: { type: 'boolean', description: 'Force re-indexing even if no changes.' },
      force: { type: 'boolean', description: 'Force pull even if local changes would be overwritten.' },
    },
    additionalProperties: false,
  },
  handler: async (input: SyncPullInput, di: McpDependencyInjectionService) => {
    try {
      const { syncModule } = await di.getContainer();
      const result = await syncModule.pullState({
        forceReindex: input.forceReindex,
        force: input.force,
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to pull state: ${message}`, 'SYNC_PULL_ERROR');
    }
  },
};
