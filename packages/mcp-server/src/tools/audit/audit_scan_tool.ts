import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AuditScanInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_audit_scan [MSRV-L1, MSRV-L2, MSRV-L5] */
export const auditScanTool: McpToolDefinition<AuditScanInput> = {
  name: 'gitgov_audit_scan',
  description: 'Scan the repository for security/governance findings. Supports target, scope, and detector configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['code', 'jira', 'gitgov'], description: 'Scan target (default: code).' },
      scope: { type: 'string', enum: ['diff', 'full', 'baseline'], description: 'Scan scope (default: full).' },
      detector: { type: 'string', enum: ['regex', 'heuristic', 'llm'], description: 'Detection engine (default: regex).' },
    },
    additionalProperties: false,
  },
  handler: async (input: AuditScanInput, di: McpDependencyInjectionService) => {
    try {
      const { sourceAuditorModule } = await di.getContainer();
      const result = await sourceAuditorModule.audit({
        target: input.target ?? 'code',
        scope: input.scope ?? 'full',
        detector: input.detector ?? 'regex',
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to scan: ${message}`, 'AUDIT_SCAN_ERROR');
    }
  },
};
