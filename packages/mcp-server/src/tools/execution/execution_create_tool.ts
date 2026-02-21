import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ExecutionCreateInput } from './execution_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_execution_create — Creates an ExecutionRecord.
 * [ICOMP-B1], [ICOMP-B2], [ICOMP-B3]
 */
export const executionCreateTool: McpToolDefinition<ExecutionCreateInput> = {
  name: 'gitgov_execution_create',
  description:
    'Create an execution record linked to a task. Records proof of work with type (analysis, progress, blocker, completion, info, correction), result, and optional references.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the task this execution belongs to.',
      },
      result: {
        type: 'string',
        description: 'The tangible, verifiable output of the execution.',
      },
      type: {
        type: 'string',
        enum: ['analysis', 'progress', 'blocker', 'completion', 'info', 'correction'],
        description: "Semantic classification of the execution event. Defaults to 'progress'.",
      },
      title: {
        type: 'string',
        description: 'Human-readable title for the execution.',
      },
      notes: {
        type: 'string',
        description: 'Context, decisions, and rationale behind the result.',
      },
      references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Typed references (commit:abc, pr:123, file:path, url:...).',
      },
    },
    required: ['taskId', 'result'],
    additionalProperties: false,
  },
  handler: async (input: ExecutionCreateInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { executionAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const execution = await executionAdapter.create(
        {
          taskId: input.taskId,
          result: input.result,
          type: input.type || 'progress', // [ICOMP-B2] default progress
          title: input.title || '',
          notes: input.notes,
          references: input.references,
        },
        actor.id,
      );

      return successResult({
        id: execution.id,
        taskId: execution.taskId,
        type: execution.type,
        title: execution.title,
        result: execution.result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create execution: ${message}`, 'EXECUTION_CREATE_ERROR');
    }
  },
};
