import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { FeedbackResolveInput } from './feedback_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_feedback_resolve — Resolves a pending feedback.
 * [MSRV-H5, MSRV-H6]
 */
export const feedbackResolveTool: McpToolDefinition<FeedbackResolveInput> = {
  name: 'gitgov_feedback_resolve',
  description:
    'Resolve a pending feedback. Returns error if the feedback is already resolved.',
  inputSchema: {
    type: 'object',
    properties: {
      feedbackId: { type: 'string', description: 'The feedback ID to resolve.' },
      content: { type: 'string', description: 'Optional resolution content/notes.' },
    },
    required: ['feedbackId'],
    additionalProperties: false,
  },
  handler: async (input: FeedbackResolveInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { feedbackAdapter, identityAdapter } = container;

      // Check current status
      const existing = await feedbackAdapter.getFeedback(input.feedbackId);
      if (!existing) {
        return errorResult(`Feedback not found: ${input.feedbackId}`, 'NOT_FOUND');
      }

      if (existing.status === 'resolved') {
        return errorResult(
          `Feedback ${input.feedbackId} is already resolved.`,
          'ALREADY_RESOLVED',
        );
      }

      const actor = await identityAdapter.getCurrentActor();
      const resolved = await feedbackAdapter.resolve(
        input.feedbackId,
        actor.id,
        input.content,
      );

      return successResult({
        id: resolved.id,
        status: resolved.status,
        previousStatus: existing.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to resolve feedback: ${message}`, 'FEEDBACK_RESOLVE_ERROR');
    }
  },
};
