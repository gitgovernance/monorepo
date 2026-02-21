import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { agentNewTool } from './agent_new_tool.js';

/**
 * Agent Tools tests — Block D (ICOMP-D1 to ICOMP-D3)
 * Blueprint: mcp_tools_agent.md §4
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi(overrides: Record<string, unknown> = {}) {
  const mockContainer = {
    agentAdapter: {
      createAgentRecord: vi.fn().mockResolvedValue({
        id: 'agent:scribe',
        status: 'active',
        engine: { type: 'local' },
      }),
      getAgentRecord: vi.fn().mockResolvedValue(null),
    },
    identityAdapter: {
      getActor: vi.fn().mockResolvedValue({
        id: 'agent:scribe',
        type: 'agent',
        displayName: 'Scribe',
        publicKey: 'test-key',
        roles: ['contributor'],
      }),
    },
    ...overrides,
  };

  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Agent Tools', () => {
  describe('4.1. Agent New (ICOMP-D1 to ICOMP-D3)', () => {
    it('[ICOMP-D1] should create AgentRecord via adapter', async () => {
      const di = createMockDi();
      const result = await agentNewTool.handler(
        { actorId: 'agent:scribe', engineType: 'local' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('agent:scribe');
      expect(data.engine).toEqual({ type: 'local' });

      const container = di._container;
      expect(container.agentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:scribe',
          engine: { type: 'local' },
        }),
      );
    });

    it('[ICOMP-D2] should return INVALID_ACTOR when actor not found or not agent type', async () => {
      const di = createMockDi();
      const container = di._container;
      container.identityAdapter.getActor.mockResolvedValue(null);

      const result = await agentNewTool.handler(
        { actorId: 'agent:nonexistent', engineType: 'mcp' },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('INVALID_ACTOR');
      expect(data.error).toContain('not found');
    });

    it('[ICOMP-D3] should return DUPLICATE_AGENT when AgentRecord already exists', async () => {
      const di = createMockDi();
      const container = di._container;
      container.agentAdapter.getAgentRecord.mockResolvedValue({
        id: 'agent:scribe',
        status: 'active',
        engine: { type: 'local' },
      });

      const result = await agentNewTool.handler(
        { actorId: 'agent:scribe', engineType: 'local' },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('DUPLICATE_AGENT');
      expect(data.error).toContain('already exists');
    });
  });
});
