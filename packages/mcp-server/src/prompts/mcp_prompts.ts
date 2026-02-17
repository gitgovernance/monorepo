import type { McpPromptDefinition, McpPromptResult } from '../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';

/** Helper to load all records from a store (list IDs → get each) */
async function loadAll<T>(store: { list: () => Promise<string[]>; get: (id: string) => Promise<T | null> }): Promise<Array<{ id: string; record: T }>> {
  const ids = await store.list();
  const results: Array<{ id: string; record: T }> = [];
  for (const id of ids) {
    const record = await store.get(id);
    if (record) results.push({ id, record });
  }
  return results;
}

/** plan-sprint: Returns current active cycles with their tasks for sprint planning */
export const planSprintPrompt: McpPromptDefinition = {
  name: 'plan-sprint',
  description: 'Generate a sprint planning summary with active cycles, task statuses, and suggested next actions.',
  arguments: [
    { name: 'cycleId', description: 'Optional: specific cycle ID to plan for. If omitted, uses all active cycles.', required: false },
  ],
  handler: async (args: Record<string, string>, di: McpDependencyInjectionService): Promise<McpPromptResult> => {
    const { stores } = await di.getContainer();

    const allCycles = await loadAll(stores.cycles);
    const activeCycles = allCycles.filter((c) => {
      const payload = c.record.payload as unknown as Record<string, unknown>;
      if (args.cycleId) return c.id === args.cycleId;
      return payload.status === 'active';
    });

    const allTasks = await loadAll(stores.tasks);

    const cycleDetails = activeCycles.map((cycle) => {
      const payload = cycle.record.payload as unknown as Record<string, unknown>;
      const taskIds = (payload.taskIds ?? []) as string[];
      const linkedTasks = allTasks.filter((t) => taskIds.includes(t.id));
      const taskSummary = linkedTasks.map((t) => {
        const tp = t.record.payload as unknown as Record<string, unknown>;
        return `  - [${tp.status}] ${tp.title} (${tp.priority ?? 'medium'})`;
      }).join('\n');
      return `Cycle: ${payload.title} (${cycle.id})\nStatus: ${payload.status}\nTasks (${linkedTasks.length}):\n${taskSummary || '  (no tasks linked)'}`;
    });

    const text = cycleDetails.length > 0
      ? `# Sprint Planning\n\n${cycleDetails.join('\n\n')}\n\nPlease review the tasks above and suggest priorities, blockers, and next actions for this sprint.`
      : '# Sprint Planning\n\nNo active cycles found. Consider creating a new cycle with `gitgov_cycle_new` and adding tasks to it.';

    return {
      description: 'Sprint planning context based on active cycles and their tasks.',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  },
};

/** review-my-tasks: Returns tasks assigned to or created by the current actor */
export const reviewMyTasksPrompt: McpPromptDefinition = {
  name: 'review-my-tasks',
  description: 'List all tasks relevant to the current actor for review.',
  arguments: [
    { name: 'status', description: 'Optional: filter by status (draft, review, ready, active, done).', required: false },
  ],
  handler: async (args: Record<string, string>, di: McpDependencyInjectionService): Promise<McpPromptResult> => {
    const { stores, identityAdapter } = await di.getContainer();

    const actor = await identityAdapter.getCurrentActor();
    const allTasks = await loadAll(stores.tasks);

    let myTasks = allTasks.filter((t) => {
      const header = (t.record as Record<string, unknown>).header as Record<string, unknown> | undefined;
      return header?.createdBy === actor.id || header?.actorId === actor.id;
    });

    if (args.status) {
      myTasks = myTasks.filter((t) => {
        const payload = t.record.payload as unknown as Record<string, unknown>;
        return payload.status === args.status;
      });
    }

    const taskLines = myTasks.map((t) => {
      const tp = t.record.payload as unknown as Record<string, unknown>;
      return `- [${tp.status}] ${tp.title} (priority: ${tp.priority ?? 'medium'}, id: ${t.id})`;
    });

    const text = taskLines.length > 0
      ? `# My Tasks (${actor.displayName})\n\n${taskLines.join('\n')}\n\nReview these tasks and let me know which ones need attention, are blocked, or can be completed.`
      : `# My Tasks (${actor.displayName})\n\nNo tasks found${args.status ? ` with status "${args.status}"` : ''}. Use \`gitgov_task_list\` for a full listing.`;

    return {
      description: `Tasks for actor ${actor.displayName}.`,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  },
};

/** prepare-pr-summary: Generates a PR summary from recently completed tasks */
export const preparePrSummaryPrompt: McpPromptDefinition = {
  name: 'prepare-pr-summary',
  description: 'Generate a pull request summary from recently completed tasks in a cycle.',
  arguments: [
    { name: 'cycleId', description: 'Cycle ID to summarize completed tasks from.', required: true },
  ],
  handler: async (args: Record<string, string>, di: McpDependencyInjectionService): Promise<McpPromptResult> => {
    const { stores } = await di.getContainer();

    const cycle = await stores.cycles.get(args.cycleId);
    if (!cycle) {
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: `Cycle not found: ${args.cycleId}. Use \`gitgov_cycle_list\` to see available cycles.` },
        }],
      };
    }

    const payload = cycle.payload as unknown as Record<string, unknown>;
    const taskIds = (payload.taskIds ?? []) as string[];
    const allTasks = await loadAll(stores.tasks);
    const cycleTasks = allTasks.filter((t) => taskIds.includes(t.id));
    const doneTasks = cycleTasks.filter((t) => {
      const tp = t.record.payload as unknown as Record<string, unknown>;
      return tp.status === 'done';
    });

    const taskLines = doneTasks.map((t) => {
      const tp = t.record.payload as unknown as Record<string, unknown>;
      return `- ${tp.title}${tp.description ? `: ${tp.description}` : ''}`;
    });

    const text = `# PR Summary for Cycle: ${payload.title}\n\n## Completed Tasks (${doneTasks.length}/${cycleTasks.length})\n\n${taskLines.length > 0 ? taskLines.join('\n') : '(no completed tasks)'}\n\nPlease draft a concise PR description based on the completed tasks above.`;

    return {
      description: `PR summary for cycle ${payload.title}.`,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  },
};

/** Returns all prompt definitions for registration */
export function getAllPrompts(): McpPromptDefinition[] {
  return [planSprintPrompt, reviewMyTasksPrompt, preparePrSummaryPrompt];
}
