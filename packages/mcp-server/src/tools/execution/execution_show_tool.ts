import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ExecutionShowInput } from './execution_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_execution_show — Shows full details of an execution.
 * [ICOMP-B6], [ICOMP-B7]
 */
export const executionShowTool: McpToolDefinition<ExecutionShowInput> = {
  name: 'gitgov_execution_show',
  description:
    'Show full details of a specific execution record by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'The execution ID to show.',
      },
    },
    required: ['executionId'],
    additionalProperties: false,
  },
  handler: async (input: ExecutionShowInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { executionAdapter } = container;

      // [ICOMP-B6] + [ICOMP-B7]
      const execution = await executionAdapter.getExecution(input.executionId);

      if (!execution) {
        return errorResult(`Execution not found: ${input.executionId}`, 'NOT_FOUND');
      }

      return successResult({
        id: execution.id,
        taskId: execution.taskId,
        type: execution.type,
        title: execution.title,
        result: execution.result,
        notes: execution.notes ?? null,
        references: execution.references ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to show execution: ${message}`, 'EXECUTION_SHOW_ERROR');
    }
  },
};
