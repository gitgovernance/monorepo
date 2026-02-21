import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ExecutionListInput } from './execution_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_execution_list — Lists executions with optional filters.
 * [ICOMP-B4], [ICOMP-B5]
 */
export const executionListTool: McpToolDefinition<ExecutionListInput> = {
  name: 'gitgov_execution_list',
  description:
    'List execution records, optionally filtered by task ID and execution type.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Filter by task ID. If omitted, returns all executions.',
      },
      type: {
        type: 'string',
        enum: ['analysis', 'progress', 'blocker', 'completion', 'info', 'correction'],
        description: 'Filter by execution type.',
      },
      limit: {
        type: 'number',
        description: 'Max number of executions to return.',
      },
    },
    additionalProperties: false,
  },
  handler: async (input: ExecutionListInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { executionAdapter } = container;

      // [ICOMP-B4] + [ICOMP-B5]
      let executions = input.taskId
        ? await executionAdapter.getExecutionsByTask(input.taskId)
        : await executionAdapter.getAllExecutions();

      // Apply type filter
      if (input.type) {
        executions = executions.filter((e) => e.type === input.type);
      }

      // Apply limit
      if (input.limit && input.limit > 0) {
        executions = executions.slice(0, input.limit);
      }

      const items = executions.map((e) => ({
        id: e.id,
        taskId: e.taskId,
        type: e.type,
        title: e.title,
        result: e.result,
      }));

      return successResult({
        total: items.length,
        executions: items,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list executions: ${message}`, 'EXECUTION_LIST_ERROR');
    }
  },
};
