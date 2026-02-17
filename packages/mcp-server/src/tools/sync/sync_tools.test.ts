import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import { syncPushTool } from './sync_push_tool.js';
import { syncPullTool } from './sync_pull_tool.js';
import { syncResolveTool } from './sync_resolve_tool.js';
import { syncAuditTool } from './sync_audit_tool.js';
import { registerAllTools } from '../index.js';
import { McpServer } from '../../server/mcp_server.js';

/**
 * Sync Tools tests — Block K (MSRV-K1 to MSRV-K5)
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

function createMockDi() {
  const mockContainer = {
    syncModule: {
      pushState: vi.fn().mockResolvedValue({ success: true, dryRun: false, filesChanged: 5 }),
      pullState: vi.fn().mockResolvedValue({ success: true, hasChanges: true, filesUpdated: 3 }),
      resolveConflict: vi.fn().mockResolvedValue({ success: true, resolved: true }),
      auditState: vi.fn().mockResolvedValue({ valid: true, violations: [], filesAudited: 20 }),
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', displayName: 'Test', type: 'human' }),
    },
  };
  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Sync Tools', () => {
  describe('4.3. Sync (MSRV-K1 to MSRV-K5)', () => {
    it('[MSRV-K1] should dry-run push without modifying state', async () => {
      const di = createMockDi();
      const c = di._container;
      c.syncModule.pushState.mockResolvedValue({ success: true, dryRun: true, filesChanged: 0, preview: ['file1.json', 'file2.json'] });

      const result = await syncPushTool.handler({ dryRun: true }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.dryRun).toBe(true);
      expect(c.syncModule.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, actorId: 'actor-1' }),
      );
    });

    it('[MSRV-K2] should push state to gitgov-state', async () => {
      const di = createMockDi();
      const result = await syncPushTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.success).toBe(true);
      expect(di._container.syncModule.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'actor-1' }),
      );
    });

    it('[MSRV-K3] should pull remote state', async () => {
      const di = createMockDi();
      const result = await syncPullTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.success).toBe(true);
      expect(data.hasChanges).toBe(true);
    });

    it('[MSRV-K4] should resolve conflict with reason', async () => {
      const di = createMockDi();
      const result = await syncResolveTool.handler({ reason: 'Manual merge preferred' }, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.resolved).toBe(true);
      expect(di._container.syncModule.resolveConflict).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Manual merge preferred', actorId: 'actor-1' }),
      );
    });

    it('[MSRV-K5] should expose at least 31 tools after Cycle 3', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAllTools(server);
      // 9 read + 7 task + 3 feedback + 8 cycle + 4 sync = 31 (minimum)
      expect(server.getToolCount()).toBeGreaterThanOrEqual(31);
    });
  });
});
