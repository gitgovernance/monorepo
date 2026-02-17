import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { LintInput, LintViolation } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_lint — Validates record integrity and returns violations.
 * [MSRV-C3]
 */
export const lintTool: McpToolDefinition<LintInput> = {
  name: 'gitgov_lint',
  description:
    'Run structural and referential integrity checks on all GitGovernance records. Returns violations with severity and fixability. Pass fix=true to auto-fix repairable issues.',
  inputSchema: {
    type: 'object',
    properties: {
      fix: {
        type: 'boolean',
        description: 'If true, attempt to auto-fix repairable violations.',
      },
    },
    additionalProperties: false,
  },
  handler: async (input: LintInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { lintModule } = container;

      // Always lint first
      const lintReport = await lintModule.lint({});

      const violations: LintViolation[] = lintReport.results.map((r) => ({
        recordType: r.filePath.split('/')[0] ?? 'unknown',
        recordId: r.filePath,
        rule: r.validator,
        message: r.message,
        severity: r.level === 'error' ? 'error' as const : 'warning' as const,
        fixable: r.fixable ?? false,
      }));

      if (input.fix) {
        const fixReport = await lintModule.fix(lintReport);

        return successResult({
          action: 'fix',
          fixed: fixReport.summary.fixed,
          failed: fixReport.summary.failed,
          remaining: violations.length - fixReport.summary.fixed,
          violations,
        });
      }

      return successResult({
        action: 'lint',
        totalViolations: lintReport.summary.errors + lintReport.summary.warnings,
        errors: lintReport.summary.errors,
        warnings: lintReport.summary.warnings,
        violations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to run lint: ${message}`, 'LINT_ERROR');
    }
  },
};
