import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';
import { planSprintPrompt, reviewMyTasksPrompt, preparePrSummaryPrompt, getAllPrompts } from './mcp_prompts.js';
import { McpServer } from '../server/mcp_server.js';

/**
 * MCP Prompts tests — Block O (MSRV-O1 to MSRV-O3) + Block P (MSRV-P3)
 */

function createMockDi() {
  const mockContainer = {
    stores: {
      tasks: {
        list: vi.fn().mockResolvedValue(['task-1', 'task-2']),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'task-1') return { header: { id: 'task-1', createdBy: 'actor-1' }, payload: { title: 'Fix bug', status: 'active', priority: 'high' } };
          if (id === 'task-2') return { header: { id: 'task-2', createdBy: 'actor-2' }, payload: { title: 'Add tests', status: 'done', priority: 'medium', description: 'Unit tests for module X' } };
          return null;
        }),
      },
      cycles: {
        list: vi.fn().mockResolvedValue(['cycle-1']),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'cycle-1') return { header: { id: 'cycle-1' }, payload: { title: 'Sprint 1', status: 'active', taskIds: ['task-1', 'task-2'] } };
          return null;
        }),
      },
      actors: {
        list: vi.fn().mockResolvedValue(['actor-1']),
        get: vi.fn().mockResolvedValue({ header: { id: 'actor-1' }, payload: { displayName: 'Alice', type: 'human' } }),
      },
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', displayName: 'Alice', type: 'human' }),
    },
  };
  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('MCP Prompts', () => {
  describe('4.2. Prompts (MSRV-O1 to MSRV-O3)', () => {
    it('[MSRV-O1] should return all available prompt templates via getAllPrompts', () => {
      const prompts = getAllPrompts();
      expect(prompts).toHaveLength(3);

      const names = prompts.map((p) => p.name);
      expect(names).toContain('plan-sprint');
      expect(names).toContain('review-my-tasks');
      expect(names).toContain('prepare-pr-summary');

      // Each should have description and arguments
      for (const prompt of prompts) {
        expect(prompt.description).toBeDefined();
        expect(prompt.handler).toBeTypeOf('function');
      }
    });

    it('[MSRV-O2] should return filled sprint planning prompt with cycle context', async () => {
      const di = createMockDi();
      const result = await planSprintPrompt.handler({}, di);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');

      const text = result.messages[0].content.text;
      expect(text).toContain('Sprint Planning');
      expect(text).toContain('Sprint 1');
      expect(text).toContain('Fix bug');
      expect(text).toContain('[active]');
    });

    it('[MSRV-O3] should return tasks assigned to current actor for review-my-tasks', async () => {
      const di = createMockDi();
      const result = await reviewMyTasksPrompt.handler({}, di);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');

      const text = result.messages[0].content.text;
      expect(text).toContain('My Tasks');
      expect(text).toContain('Alice');
      // task-1 was created by actor-1
      expect(text).toContain('Fix bug');
    });

    it('should generate PR summary for a given cycle', async () => {
      const di = createMockDi();
      const result = await preparePrSummaryPrompt.handler({ cycleId: 'cycle-1' }, di);

      expect(result.messages).toHaveLength(1);
      const text = result.messages[0].content.text;
      expect(text).toContain('PR Summary');
      expect(text).toContain('Sprint 1');
      expect(text).toContain('Add tests'); // done task
    });

    it('should handle missing cycle in PR summary', async () => {
      const di = createMockDi();
      const result = await preparePrSummaryPrompt.handler({ cycleId: 'nonexistent' }, di);

      const text = result.messages[0].content.text;
      expect(text).toContain('Cycle not found');
    });
  });

  describe('4.3. Transport parity (MSRV-P3)', () => {
    it('[MSRV-P3] should register prompts on the server with same count as getAllPrompts', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const prompts = getAllPrompts();
      for (const prompt of prompts) {
        server.registerPrompt(prompt);
      }
      expect(server.getPromptCount()).toBe(3);
    });
  });
});
