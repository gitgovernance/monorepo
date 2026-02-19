import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { FeedbackCreateInput } from './feedback_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_feedback_create — Creates a FeedbackRecord.
 * [MSRV-H3]
 */
export const feedbackCreateTool: McpToolDefinition<FeedbackCreateInput> = {
  name: 'gitgov_feedback_create',
  description:
    'Create a feedback record linked to an entity (task, cycle, execution, etc.). Specify type (blocking, suggestion, question, etc.) and content.',
  inputSchema: {
    type: 'object',
    properties: {
      entityType: {
        type: 'string',
        enum: ['task', 'execution', 'changelog', 'feedback', 'cycle'],
        description: 'The type of entity this feedback is about.',
      },
      entityId: { type: 'string', description: 'The ID of the entity.' },
      type: {
        type: 'string',
        enum: ['blocking', 'suggestion', 'question', 'approval', 'clarification', 'assignment'],
        description: 'The feedback type.',
      },
      content: { type: 'string', description: 'Feedback content/message.' },
      assignee: { type: 'string', description: 'Optional actor ID for assignment feedback.' },
    },
    required: ['entityType', 'entityId', 'type', 'content'],
    additionalProperties: false,
  },
  handler: async (input: FeedbackCreateInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { feedbackAdapter, identityAdapter } = container;

      const actor = await identityAdapter.getCurrentActor();
      const feedback = await feedbackAdapter.create(
        {
          entityType: input.entityType,
          entityId: input.entityId,
          type: input.type,
          content: input.content,
          assignee: input.assignee,
        },
        actor.id,
      );

      return successResult({
        id: feedback.id,
        entityType: feedback.entityType,
        entityId: feedback.entityId,
        type: feedback.type,
        status: feedback.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to create feedback: ${message}`, 'FEEDBACK_CREATE_ERROR');
    }
  },
};
