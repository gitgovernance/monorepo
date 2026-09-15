import { describe, it, expect, vi } from 'vitest';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { SourceAuditor } from '@gitgov/core';
import { createFinding, countBySeverity } from '@gitgov/core';
import { auditScanTool } from './audit_scan_tool.js';
import { auditWaiveTool } from './audit_waive_tool.js';
import { auditWaiveListTool } from './audit_waive_list_tool.js';
import { agentRunTool } from './agent_run_tool.js';
import { actorNewTool } from './actor_new_tool.js';
import { registerAllTools } from '../index.js';
import { McpServer } from '../../server/mcp_server.js';

/**
 * Audit + Agent + Actor Tools tests — Blocks L & M (MSRV-L1 to MSRV-M5)
 */

function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

/**
 * Typed against the real `SourceAuditor.AuditResult`. `vi.fn().mockResolvedValue` is untyped,
 * so an untyped stub — flat severity keys, required Finding fields missing — lets the MSRV-L*
 * tests assert against a shape this module cannot produce.
 */
function makeAuditResult(): SourceAuditor.AuditResult {
  const finding = createFinding({
    ruleId: 'SEC-001', category: 'hardcoded-secret', severity: 'high',
    file: 'src/foo.ts', line: 42, message: 'Hardcoded secret',
    snippet: "const apiKey = 'sk-test'", detector: 'regex', confidence: 0.95,
    executionId: 'exec-1', reportedBy: ['agent:security-audit'], isWaived: false,
  });
  return {
    findings: [finding],
    summary: {
      total: 1,
      bySeverity: countBySeverity([finding]),
      byCategory: { 'hardcoded-secret': 1 },
      byDetector: { regex: 1, heuristic: 0, llm: 0, sast: 0 },
    },
    scannedFiles: 1,
    scannedLines: 10,
    duration: 5,
    detectors: ['regex'],
    waivers: { acknowledged: 0, new: 1, unmatched: 0, outdated: 0 },
  };
}

function createMockDi() {
  const mockContainer = {
    sourceAuditorModule: {
      audit: vi.fn<(options: SourceAuditor.AuditOptions) => Promise<SourceAuditor.AuditResult>>().mockResolvedValue(makeAuditResult()),
    },
    feedbackAdapter: {
      create: vi.fn().mockResolvedValue({ id: 'waiver-1', type: 'approval', entityType: 'execution', status: 'resolved' }),
      getAllFeedback: vi.fn().mockResolvedValue([
        { header: { version: '1.0', type: 'feedback', payloadChecksum: '', signatures: [] }, payload: { id: 'w1', type: 'approval', entityType: 'execution', status: 'resolved', entityId: 'fp1', content: 'False positive' } },
        { header: { version: '1.0', type: 'feedback', payloadChecksum: '', signatures: [] }, payload: { id: 'w2', type: 'approval', entityType: 'execution', status: 'resolved', entityId: 'fp2', content: 'Accepted risk' } },
        { header: { version: '1.0', type: 'feedback', payloadChecksum: '', signatures: [] }, payload: { id: 'w3', type: 'comment', entityType: 'task', status: 'open', entityId: 't1', content: 'Note' } },
      ]),
    },
    agentRunner: {
      runOnce: vi.fn().mockResolvedValue({ status: 'success', output: 'Agent completed' }),
    },
    stores: {
      agents: {
        get: vi.fn().mockResolvedValue({ header: { id: 'my-agent' }, payload: { engine: { type: 'shell' } } }),
      },
      actors: {
        get: vi.fn().mockResolvedValue(null),
      },
    },
    identityModule: {
      createActor: vi.fn().mockResolvedValue({ id: 'new-actor', type: 'agent', displayName: 'Bot', roles: ['contributor'] }),
    },
    getCurrentActor: vi.fn().mockResolvedValue({ id: 'actor-1', type: 'human', displayName: 'Test', publicKey: 'pk', roles: ['author'], status: 'active' }),
  };
  return {
    getContainer: vi.fn().mockResolvedValue(mockContainer),
    _container: mockContainer,
  } as unknown as McpDependencyInjectionService & { _container: typeof mockContainer };
}

describe('Audit + Agent + Actor Tools', () => {
  describe('4.1. Audit (MSRV-L1 to MSRV-L5)', () => {
    it('[MSRV-L1] should scan repository with default scope and return structured findings', async () => {
      const di = createMockDi();
      const result = await auditScanTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.findings).toHaveLength(1);
      expect(di._container.sourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({ scope: { include: ['**/*'], exclude: [] } }),
      );
      // Absent, not `undefined`: `ScopeConfig.changedSince?: string` admits no explicit
      // undefined under core's exactOptionalPropertyTypes. `toHaveBeenCalledWith` treats the
      // two as equal, so only the key check separates them.
      const scope = di._container.sourceAuditorModule.audit.mock.calls[0]![0].scope;
      expect('changedSince' in scope).toBe(false);
    });

    it('[MSRV-L2] should pass changedSince to core for incremental scanning', async () => {
      const di = createMockDi();
      const result = await auditScanTool.handler({ changedSince: 'abc123' }, di);

      expect(result.isError).toBeUndefined();
      expect(di._container.sourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({ scope: { include: ['**/*'], exclude: [], changedSince: 'abc123' } }),
      );
    });

    it('[MSRV-L3] should create a waiver record for a fingerprint with justification', async () => {
      const di = createMockDi();
      const result = await auditWaiveTool.handler(
        { fingerprint: 'abc123', justification: 'False positive confirmed' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.waiverId).toBe('waiver-1');
      expect(data.fingerprint).toBe('abc123');
      expect(di._container.feedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'approval',
          entityType: 'execution',
          entityId: 'abc123',
        }),
        'actor-1',
      );
    });

    it('[MSRV-L4] should return all active waivers', async () => {
      const di = createMockDi();
      const result = await auditWaiveListTool.handler({}, di);
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.total).toBe(2);
      expect(data.waivers).toHaveLength(2);
      // Should filter out the non-waiver feedback (type 'comment')
      expect(data.waivers.every((w: { fingerprint: string }) => w.fingerprint)).toBe(true);
    });

    it('[MSRV-L5] should include fingerprint, severity, file, and line in each finding', async () => {
      const di = createMockDi();
      const result = await auditScanTool.handler({}, di);
      const data = parseResult(result);

      const finding = data.findings[0];
      // The identity is the one createFinding computed (AUDIT-K1) and the tool passes it
      // through untouched; a hand-typed 'abc123' would only prove the stub round-trips.
      expect(finding).toHaveProperty('fingerprint', makeAuditResult().findings[0]!.fingerprint);
      expect(finding.fingerprint).toMatch(/^gitgov-fp\/2:[a-f0-9]{64}$/);
      expect(finding).toHaveProperty('severity', 'high');
      expect(finding).toHaveProperty('file', 'src/foo.ts');
      expect(finding).toHaveProperty('line', 42);
    });
  });

  describe('4.2. Agent Run + Actor New (MSRV-M1 to MSRV-M5)', () => {
    it('[MSRV-M1] should execute agent and return its output', async () => {
      const di = createMockDi();
      const result = await agentRunTool.handler(
        { agentName: 'my-agent', taskId: 'task-1' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe('success');
      expect(di._container.agentRunner.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'my-agent', taskId: 'task-1' }),
      );
    });

    it('[MSRV-M2] should return error when agent not found', async () => {
      const di = createMockDi();
      di._container.stores.agents.get.mockResolvedValue(null);

      const result = await agentRunTool.handler(
        { agentName: 'unknown-agent', taskId: 'task-1' },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('NOT_FOUND');
    });

    it('[MSRV-M3] should create a new actor record', async () => {
      const di = createMockDi();
      const result = await actorNewTool.handler(
        { id: 'new-actor', type: 'agent', displayName: 'Bot' },
        di,
      );
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe('new-actor');
      expect(data.type).toBe('agent');
      expect(di._container.identityModule.createActor).toHaveBeenCalled();
    });

    it('[MSRV-M4] should return error when actor already exists', async () => {
      const di = createMockDi();
      di._container.stores.actors.get.mockResolvedValue({ id: 'existing', displayName: 'Existing' });

      const result = await actorNewTool.handler(
        { id: 'existing', type: 'human', displayName: 'Existing' },
        di,
      );

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.code).toBe('DUPLICATE_ACTOR');
    });

    it('[MSRV-M5] should expose exactly 43 tools after Cycle 4 + interface_completeness', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAllTools(server);
      // 9 read + 7 task + 3 feedback + 8 cycle + 4 sync + 3 audit + 1 agent + 1 actor + 3 execution + 1 agent_new + 1 workflow + 2 identity = 43
      expect(server.getToolCount()).toBe(43);
    });
  });
});
