import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { TaskAssignInput } from './task_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_task_assign — Assigns an actor to a task via feedback record.
 * [MSRV-H1, MSRV-H2]
 */
export const taskAssignTool: McpToolDefinition<TaskAssignInput> = {
  name: 'gitgov_task_assign',
  description:
    'Assign an actor to a task. Creates an assignment feedback record linking the actor to the task.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to assign.' },
      actorId: { type: 'string', description: 'The actor ID to assign to the task.' },
    },
    required: ['taskId', 'actorId'],
    additionalProperties: false,
  },
  handler: async (input: TaskAssignInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { backlogAdapter, identityAdapter, feedbackAdapter, stores } = container;

      // Verify task exists
      const task = await backlogAdapter.getTask(input.taskId);
      if (!task) {
        return errorResult(`Task not found: ${input.taskId}`, 'NOT_FOUND');
      }

      // Verify actor exists
      const actorRecord = await stores.actors.get(input.actorId);
      if (!actorRecord) {
        return errorResult(`Actor not found: ${input.actorId}`, 'ACTOR_NOT_FOUND');
      }

      // Create assignment via feedback record
      const actor = await identityAdapter.getCurrentActor();
      const feedback = await feedbackAdapter.create(
        {
          entityType: 'task',
          entityId: input.taskId,
          type: 'assignment',
          content: `Assigned to ${actorRecord.payload.displayName}`,
          assignee: input.actorId,
          status: 'resolved',
        },
        actor.id,
      );

      return successResult({
        taskId: input.taskId,
        actorId: input.actorId,
        feedbackId: feedback.id,
        assigned: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to assign task: ${message}`, 'TASK_ASSIGN_ERROR');
    }
  },
};
