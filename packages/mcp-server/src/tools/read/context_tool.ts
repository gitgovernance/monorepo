import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ContextResponse } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_context — Returns current config, session and actor info.
 * [MSRV-C2]
 */
export const contextTool: McpToolDefinition = {
  name: 'gitgov_context',
  description:
    'Get the current GitGovernance context: project config, active session, and current actor identity. Useful to understand who you are operating as.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: Record<string, unknown>, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { configManager, sessionManager, stores } = container;

      const config = await configManager.loadConfig();
      const session = await sessionManager.loadSession();

      // Build actor info from session
      let actor: ContextResponse['actor'] = null;
      const activeActorId = session?.lastSession?.actorId ?? null;

      if (activeActorId) {
        const actorRecord = await stores.actors.get(activeActorId);
        if (actorRecord) {
          const payload = actorRecord.payload;
          actor = {
            id: activeActorId,
            name: payload.displayName ?? activeActorId,
            type: payload.type ?? 'human',
          };
        }
      }

      const response: ContextResponse = {
        config: {
          projectName: config?.projectName ?? 'unknown',
          version: config?.protocolVersion ?? '0.0.0',
          gitgovRoot: '.gitgov',
        },
        session: {
          currentActor: activeActorId,
          sessionId: session?.lastSession?.timestamp ?? 'none',
        },
        actor,
      };

      return successResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to get context: ${message}`, 'CONTEXT_ERROR');
    }
  },
};
