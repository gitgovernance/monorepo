import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { FeedbackListInput } from './feedback_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_feedback_list — Lists feedbacks with optional filters.
 * [MSRV-H4]
 */
export const feedbackListTool: McpToolDefinition<FeedbackListInput> = {
  name: 'gitgov_feedback_list',
  description:
    'List feedback records with optional filters by entity, type, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      entityId: { type: 'string', description: 'Filter by entity ID.' },
      type: {
        type: 'string',
        enum: ['blocking', 'suggestion', 'question', 'approval', 'clarification', 'assignment'],
        description: 'Filter by feedback type.',
      },
      status: {
        type: 'string',
        enum: ['open', 'acknowledged', 'resolved', 'wontfix'],
        description: 'Filter by feedback status.',
      },
      limit: { type: 'number', description: 'Max number of feedbacks to return.' },
    },
    additionalProperties: false,
  },
  handler: async (input: FeedbackListInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { feedbackAdapter } = container;

      // Get feedbacks — if entityId provided, use entity filter
      let feedbacks: Array<Record<string, unknown>>;
      if (input.entityId) {
        feedbacks = await feedbackAdapter.getFeedbackByEntity(input.entityId);
      } else {
        feedbacks = await feedbackAdapter.getAllFeedback();
      }

      // Apply additional filters
      let filtered = feedbacks;

      if (input.type) {
        filtered = filtered.filter((f) => f.type === input.type);
      }

      if (input.status) {
        filtered = filtered.filter((f) => f.status === input.status);
      }

      if (input.limit && input.limit > 0) {
        filtered = filtered.slice(0, input.limit);
      }

      const items = filtered.map((f) => ({
        id: f.id,
        entityType: f.entityType,
        entityId: f.entityId,
        type: f.type,
        status: f.status,
        content: f.content,
        assignee: f.assignee ?? null,
      }));

      return successResult({
        total: items.length,
        feedbacks: items,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list feedbacks: ${message}`, 'FEEDBACK_LIST_ERROR');
    }
  },
};
