import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { actorListTool } from './actor_list_tool.js';
import { actorShowTool } from './actor_show_tool.js';

/**
 * Identity Tools tests — Block E identity (ICOMP-E5 to ICOMP-E7)
 * Blueprint: mcp_tools_identity.md §4.1
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

const mockActors = [
  { id: 'human:alice', type: 'human', displayName: 'Alice', roles: ['dev:frontend'], status: 'active', publicKey: 'key-alice', metadata: {} },
  { id: 'agent:scribe', type: 'agent', displayName: 'Scribe', roles: ['agent:scribe'], status: 'active', publicKey: 'key-scribe', metadata: {} },
  { id: 'human:bob', type: 'human', displayName: 'Bob', roles: ['dev:backend'], status: 'revoked', publicKey: 'key-bob', supersededBy: 'human:bob-v2', metadata: {} },
];

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    identityAdapter: {
      listActors: vi.fn().mockResolvedValue([...mockActors]),
      getActor: vi.fn().mockImplementation((id: string) => {
        const actor = mockActors.find((a) => a.id === id);
        return Promise.resolve(actor ?? null);
      }),
    },
    ...overrides,
  };

  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Identity Tools', () => {
  describe('4.1. Actor List & Show (ICOMP-E5 to ICOMP-E7)', () => {
    it('[ICOMP-E5] should list all actors', async () => {
      const di = createMockDi();
      const result = await actorListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.actors).toHaveLength(3);
      expect(data.total).toBe(3);
      expect(data.actors[0].id).toBe('human:alice');
      expect(data.actors[1].id).toBe('agent:scribe');
    });

    it('[ICOMP-E6] should filter actors by type', async () => {
      const di = createMockDi();
      const result = await actorListTool.handler({ type: 'human' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.actors).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.actors.every((a: { type: string }) => a.type === 'human')).toBe(true);
    });

    it('[ICOMP-E7] should show actor detail or error when not found', async () => {
      const di = createMockDi();

      // Success case
      const result = await actorShowTool.handler({ actorId: 'human:alice' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('human:alice');
      expect(data.type).toBe('human');
      expect(data.displayName).toBe('Alice');
      expect(data.roles).toEqual(['dev:frontend']);
      expect(data.publicKey).toBe('key-alice');

      // Not found case
      const notFound = await actorShowTool.handler({ actorId: 'human:unknown' }, di);
      expect(notFound.isError).toBe(true);
      const errData = parseResult(notFound);
      expect(errData.code).toBe('ACTOR_NOT_FOUND');
    });
  });
});
