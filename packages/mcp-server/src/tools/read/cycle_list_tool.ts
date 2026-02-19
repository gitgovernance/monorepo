import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { CycleListInput } from './read_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/**
 * gitgov_cycle_list — Returns all cycles with optional filters.
 * [MSRV-E1]
 */
export const cycleListTool: McpToolDefinition<CycleListInput> = {
  name: 'gitgov_cycle_list',
  description:
    'List all cycles (sprints/iterations) with status and metadata. Supports filtering by status and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['planning', 'active', 'completed', 'archived'],
        description: 'Filter by cycle status.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (match any).',
      },
      limit: {
        type: 'number',
        description: 'Max number of cycles to return.',
      },
    },
    additionalProperties: false,
  },
  handler: async (input: CycleListInput, di: McpDependencyInjectionService) => {
    try {
      const container = await di.getContainer();
      const { stores } = container;

      const cycleIds = await stores.cycles.list();
      const allCycles: Array<{ id: string; payload: Record<string, unknown> }> = [];

      for (const id of cycleIds) {
        const record = await stores.cycles.get(id);
        if (!record) continue;
        allCycles.push({ id, payload: record.payload as unknown as Record<string, unknown> });
      }

      let filtered = allCycles;

      if (input.status) {
        filtered = filtered.filter((c) => c.payload.status === input.status);
      }

      if (input.tags && input.tags.length > 0) {
        const tagSet = new Set(input.tags);
        filtered = filtered.filter((c) => {
          const cycleTags = c.payload.tags as string[] | undefined;
          return cycleTags && cycleTags.some((tag) => tagSet.has(tag));
        });
      }

      if (input.limit && input.limit > 0) {
        filtered = filtered.slice(0, input.limit);
      }

      const cycles = filtered.map((c) => ({
        id: c.id,
        title: (c.payload.title as string) ?? c.id,
        status: (c.payload.status as string) ?? 'unknown',
        taskIds: (c.payload.taskIds as string[]) ?? [],
        tags: (c.payload.tags as string[]) ?? [],
      }));

      return successResult({
        total: filtered.length,
        cycles,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to list cycles: ${message}`, 'CYCLE_LIST_ERROR');
    }
  },
};
