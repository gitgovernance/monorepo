import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';
import { createResourceHandler, parseResourceUri } from './mcp_resources.js';

/**
 * MCP Resources tests — Block N (MSRV-N1 to MSRV-N3)
 * Blueprint: specs/resources/mcp_resources_prompts.md
 */

function createMockDi() {
  const mockContainer = {
    stores: {
      tasks: {
        list: vi.fn().mockResolvedValue(['task-1', 'task-2']),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'task-1') return { header: { id: 'task-1' }, payload: { title: 'Fix bug', status: 'active' } };
          if (id === 'task-2') return { header: { id: 'task-2' }, payload: { title: 'Add feature', status: 'draft' } };
          return null;
        }),
      },
      cycles: {
        list: vi.fn().mockResolvedValue(['cycle-1']),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'cycle-1') return { header: { id: 'cycle-1' }, payload: { title: 'Sprint 1', status: 'active', taskIds: ['task-1'] } };
          return null;
        }),
      },
      actors: {
        list: vi.fn().mockResolvedValue(['actor-1']),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'actor-1') return { header: { id: 'actor-1' }, payload: { displayName: 'Alice', type: 'human' } };
          return null;
        }),
      },
    },
  };
  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('MCP Resources', () => {
  describe('4.1. Resources (MSRV-N1 to MSRV-N3)', () => {
    it('[MSRV-N1] should return URIs for all tasks, cycles and actors', async () => {
      const handler = createResourceHandler();
      const di = createMockDi();
      const result = await handler.list(di);

      expect(result.resources).toHaveLength(4); // 2 tasks + 1 cycle + 1 actor
      const uris = result.resources.map((r) => r.uri);
      expect(uris).toContain('gitgov://tasks/task-1');
      expect(uris).toContain('gitgov://tasks/task-2');
      expect(uris).toContain('gitgov://cycles/cycle-1');
      expect(uris).toContain('gitgov://actors/actor-1');

      // All should have mimeType
      expect(result.resources.every((r) => r.mimeType === 'application/json')).toBe(true);
    });

    it('[MSRV-N2] should return full task record for gitgov://tasks/{id} URI', async () => {
      const handler = createResourceHandler();
      const di = createMockDi();
      const result = await handler.read('gitgov://tasks/task-1', di);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('gitgov://tasks/task-1');
      expect(result.contents[0].mimeType).toBe('application/json');

      const data = JSON.parse(result.contents[0].text!);
      expect(data.payload.title).toBe('Fix bug');
      expect(data.payload.status).toBe('active');
    });

    it('[MSRV-N3] should throw error for unknown URI', async () => {
      const handler = createResourceHandler();
      const di = createMockDi();

      // Unknown ID
      await expect(handler.read('gitgov://tasks/nonexistent', di)).rejects.toThrow('Resource not found');

      // Invalid prefix
      await expect(handler.read('invalid://foo/bar', di)).rejects.toThrow('Invalid resource URI');

      // Invalid category
      await expect(handler.read('gitgov://unknown/id', di)).rejects.toThrow('Invalid resource URI');
    });
  });

  describe('parseResourceUri', () => {
    it('should parse valid gitgov:// URIs', () => {
      expect(parseResourceUri('gitgov://tasks/abc')).toEqual({ category: 'tasks', id: 'abc' });
      expect(parseResourceUri('gitgov://cycles/cy-1')).toEqual({ category: 'cycles', id: 'cy-1' });
      expect(parseResourceUri('gitgov://actors/a-1')).toEqual({ category: 'actors', id: 'a-1' });
    });

    it('should return null for invalid URIs', () => {
      expect(parseResourceUri('http://tasks/abc')).toBeNull();
      expect(parseResourceUri('gitgov://invalid/abc')).toBeNull();
      expect(parseResourceUri('gitgov://tasks')).toBeNull();
      expect(parseResourceUri('gitgov://tasks/')).toBeNull();
    });
  });
});
