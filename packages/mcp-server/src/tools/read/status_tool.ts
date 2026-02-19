import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { StatusResponse } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_status — Returns project health, active cycles and recent tasks.
 * [MSRV-C1]
 */
export const statusTool: McpToolDefinition = {
  name: 'gitgov_status',
  description:
    'Get the current project status including health metrics, active cycles and recent tasks. Use this as your first call to understand the project state.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: Record<string, unknown>, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { projector, configManager } = container;

      // Use computeProjection for fresh data
      const index = await projector.computeProjection();

      // Get project name from config
      const config = await configManager.loadConfig();
      const projectName = config?.projectName ?? 'unknown';

      // Build active cycles from index data (cycles are EmbeddedMetadataRecord)
      const activeCycles: StatusResponse['activeCycles'] = [];
      for (const cycle of index.cycles) {
        const p = cycle.payload;
        if (p.status === 'active' || p.status === 'planning') {
          // Count tasks linked to this cycle
          const taskCount = index.enrichedTasks.filter(
            (t) => t.cycleIds?.includes(p.id),
          ).length;
          activeCycles.push({
            id: p.id,
            title: p.title,
            status: p.status,
            taskCount,
          });
        }
      }

      // Recent tasks from enrichedTasks (EnrichedTaskRecord extends TaskRecord)
      const recentTasks = index.enrichedTasks.slice(0, 10).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      }));

      // Health from metrics (SystemStatus & ProductivityMetrics & CollaborationMetrics)
      const health = {
        score: index.metrics?.health?.overallScore ?? 0,
        stalledTasks: index.derivedStates?.stalledTasks?.length ?? 0,
        atRiskTasks: index.derivedStates?.atRiskTasks?.length ?? 0,
      };

      const response: StatusResponse = {
        projectName,
        activeCycles,
        recentTasks,
        health,
      };

      return successResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to get project status: ${message}`, 'STATUS_ERROR');
    }
  },
};
