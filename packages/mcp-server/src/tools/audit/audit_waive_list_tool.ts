import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AuditWaiveListInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_audit_waive_list [MSRV-L4] */
export const auditWaiveListTool: McpToolDefinition<AuditWaiveListInput> = {
  name: 'gitgov_audit_waive_list',
  description: 'List all active waivers for audit findings.',
  inputSchema: {
    type: 'object',
    properties: {
      activeOnly: { type: 'boolean', description: 'Only show active (resolved) waivers (default: true).' },
    },
    additionalProperties: false,
  },
  handler: async (input: AuditWaiveListInput, di: McpDependencyInjectionService) => {
    try {
      const { feedbackAdapter } = await di.getContainer();
      const allFeedback = await feedbackAdapter.getAllFeedback();

      // Waivers are feedback records with type 'approval' and entityType 'execution'
      let waivers = allFeedback.filter(
        (f) => f.type === 'approval' && f.entityType === 'execution',
      );

      if (input.activeOnly !== false) {
        waivers = waivers.filter((f) => f.status === 'resolved');
      }

      const items = waivers.map((f) => ({
        id: f.id,
        fingerprint: f.entityId,
        justification: f.content,
        status: f.status,
      }));

      return successResult({ total: items.length, waivers: items });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list waivers: ${message}`, 'AUDIT_WAIVE_LIST_ERROR');
    }
  },
};
