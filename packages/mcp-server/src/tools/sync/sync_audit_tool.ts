import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { SyncAuditInput } from './sync_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_sync_audit [MSRV-K5 related] */
export const syncAuditTool: McpToolDefinition<SyncAuditInput> = {
  name: 'gitgov_sync_audit',
  description: 'Audit the gitgov-state branch for integrity: signatures, checksums, structure.',
  inputSchema: {
    type: 'object',
    properties: {
      verifySignatures: { type: 'boolean', description: 'Verify record signatures (default: true).' },
      verifyChecksums: { type: 'boolean', description: 'Verify record checksums (default: true).' },
    },
    additionalProperties: false,
  },
  handler: async (input: SyncAuditInput, di: McpDependencyInjectionService) => {
    try {
      const { syncModule } = await di.getContainer();
      const report = await syncModule.auditState({
        verifySignatures: input.verifySignatures,
        verifyChecksums: input.verifyChecksums,
      });
      return successResult(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to audit state: ${message}`, 'SYNC_AUDIT_ERROR');
    }
  },
};
