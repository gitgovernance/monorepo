import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AuditScanInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_audit_scan [MSRV-L1, MSRV-L2, MSRV-L5] */
export const auditScanTool: McpToolDefinition<AuditScanInput> = {
  name: 'gitgov_audit_scan',
  description: 'Scan the repository for security/governance findings. Supports include/exclude glob patterns and incremental mode via changedSince.',
  inputSchema: {
    type: 'object',
    properties: {
      include: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to include (default: ["**/*"]).' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude (default: []).' },
      changedSince: { type: 'string', description: 'Commit SHA — only scan files changed since this commit.' },
    },
    additionalProperties: false,
  },
  handler: async (input: AuditScanInput, di: McpDependencyInjectionService) => {
    try {
      const { sourceAuditorModule } = await di.getContainer();
      const result = await sourceAuditorModule.audit({
        scope: {
          include: input.include ?? ['**/*'],
          exclude: input.exclude ?? [],
          changedSince: input.changedSince,
        },
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to scan: ${message}`, 'AUDIT_SCAN_ERROR');
    }
  },
};
