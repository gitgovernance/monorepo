import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AuditWaiveInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_audit_waive [MSRV-L3] */
export const auditWaiveTool: McpToolDefinition<AuditWaiveInput> = {
  name: 'gitgov_audit_waive',
  description: 'Create a waiver for a specific audit finding by fingerprint and justification.',
  inputSchema: {
    type: 'object',
    properties: {
      fingerprint: { type: 'string', description: 'Finding fingerprint to waive.' },
      justification: { type: 'string', description: 'Reason for the waiver.' },
    },
    required: ['fingerprint', 'justification'],
    additionalProperties: false,
  },
  handler: async (input: AuditWaiveInput, di: McpDependencyInjectionService) => {
    try {
      const { feedbackAdapter, identityAdapter } = await di.getContainer();
      const actor = await identityAdapter.getCurrentActor();
      const waiver = await feedbackAdapter.create(
        {
          entityType: 'execution',
          entityId: input.fingerprint,
          type: 'approval',
          content: input.justification,
          status: 'resolved',
        },
        actor.id,
      );
      return successResult({
        waiverId: waiver.id,
        fingerprint: input.fingerprint,
        justification: input.justification,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create waiver: ${message}`, 'AUDIT_WAIVE_ERROR');
    }
  },
};
