import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { workflowTransitionsTool } from './workflow_transitions_tool.js';

/**
 * Workflow Tools tests — Block E workflow (ICOMP-E1 to ICOMP-E2)
 * Blueprint: mcp_tools_workflow.md §4.1
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    workflowAdapter: {
      getAvailableTransitions: vi.fn().mockResolvedValue([
        { to: 'review', conditions: undefined },
        { to: 'discarded', conditions: undefined },
      ]),
    },
    ...overrides,
  };

  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Workflow Tools', () => {
  describe('4.1. Workflow Transitions (ICOMP-E1 to ICOMP-E2)', () => {
    it('[ICOMP-E1] should return transitions for valid status', async () => {
      const di = createMockDi();
      const result = await workflowTransitionsTool.handler(
        { from: 'draft' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.from).toBe('draft');
      expect(data.transitions).toHaveLength(2);
      expect(data.transitions[0].to).toBe('review');
      // Verify undefined → null mapping per blueprint §3.3
      expect(data.transitions[0].conditions).toBeNull();
      expect(data.transitions[1].conditions).toBeNull();

      expect(di._container.workflowAdapter.getAvailableTransitions).toHaveBeenCalledWith('draft');
    });

    it('[ICOMP-E2] should return empty transitions for terminal status', async () => {
      const di = createMockDi();
      // Core returns [] for terminal statuses — tool delegates, does not validate
      di._container.workflowAdapter.getAvailableTransitions.mockResolvedValue([]);

      const result = await workflowTransitionsTool.handler(
        { from: 'archived' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.from).toBe('archived');
      expect(data.transitions).toHaveLength(0);

      expect(di._container.workflowAdapter.getAvailableTransitions).toHaveBeenCalledWith('archived');
    });
  });
});
