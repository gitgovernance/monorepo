import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { feedbackCreateTool } from './feedback_create_tool.js';
import { feedbackListTool } from './feedback_list_tool.js';
import { feedbackResolveTool } from './feedback_resolve_tool.js';
import { registerAllTools } from '../index.js';
import { McpServer } from '../../server/mcp_server.js';

/**
 * Feedback Tools tests — Block H continuation (MSRV-H3 to MSRV-H7)
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    feedbackAdapter: {
      create: vi.fn().mockResolvedValue({
        id: 'fb-1',
        entityType: 'task',
        entityId: 'task-1',
        type: 'suggestion',
        status: 'open',
        content: 'Test feedback',
      }),
      getFeedback: vi.fn().mockResolvedValue(null),
      getFeedbackByEntity: vi.fn().mockResolvedValue([]),
      getAllFeedback: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue({
        id: 'fb-1',
        status: 'resolved',
      }),
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', displayName: 'Test', type: 'human' }),
    },
    ...overrides,
  };

  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Feedback Tools', () => {
  describe('4.4. Feedback (MSRV-H3 to MSRV-H7)', () => {
    it('[MSRV-H3] should create a FeedbackRecord linked to an entity', async () => {
      const di = createMockDi();
      const result = await feedbackCreateTool.handler(
        {
          entityType: 'task',
          entityId: 'task-1',
          type: 'suggestion',
          content: 'Consider refactoring this',
        },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('fb-1');
      expect(data.entityType).toBe('task');
      expect(data.entityId).toBe('task-1');
      expect(data.type).toBe('suggestion');
      expect(data.status).toBe('open');

      const container = (di as any)._container;
      expect(container.feedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'task',
          entityId: 'task-1',
          type: 'suggestion',
          content: 'Consider refactoring this',
        }),
        'actor-1',
      );
    });

    it('[MSRV-H4] should filter feedbacks by entityId', async () => {
      const di = createMockDi();
      const container = (di as any)._container;
      container.feedbackAdapter.getFeedbackByEntity.mockResolvedValue([
        { id: 'fb-1', entityType: 'task', entityId: 'task-1', type: 'suggestion', status: 'open', content: 'A' },
        { id: 'fb-2', entityType: 'task', entityId: 'task-1', type: 'blocking', status: 'open', content: 'B' },
      ]);

      const result = await feedbackListTool.handler({ entityId: 'task-1' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(2);
      expect(data.feedbacks).toHaveLength(2);
      expect(container.feedbackAdapter.getFeedbackByEntity).toHaveBeenCalledWith('task-1');
    });

    it('[MSRV-H5] should resolve a pending feedback', async () => {
      const di = createMockDi();
      const container = (di as any)._container;
      container.feedbackAdapter.getFeedback.mockResolvedValue({
        id: 'fb-1', status: 'open', type: 'suggestion',
      });

      const result = await feedbackResolveTool.handler(
        { feedbackId: 'fb-1', content: 'Done' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('fb-1');
      expect(data.status).toBe('resolved');
      expect(data.previousStatus).toBe('open');
    });

    it('[MSRV-H6] should return error when resolving already-resolved feedback', async () => {
      const di = createMockDi();
      const container = (di as any)._container;
      container.feedbackAdapter.getFeedback.mockResolvedValue({
        id: 'fb-1', status: 'resolved', type: 'suggestion',
      });

      const result = await feedbackResolveTool.handler({ feedbackId: 'fb-1' }, di);

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('ALREADY_RESOLVED');
    });

    it('[MSRV-H7] should include at least 19 tools (9 read + 7 task + 3 feedback)', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAllTools(server);

      // At minimum 19 tools from Cycles 1+2, plus any from later cycles
      expect(server.getToolCount()).toBeGreaterThanOrEqual(19);
    });
  });
});
