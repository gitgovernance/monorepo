/**
 * Tabla de Trazabilidad EARS - index.test.ts
 * All EARS prefixes map to security_audit_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                    | Estado    |
 * |----------|----------------------------------------------------------------|--------------------------------------------------------------|-----------|
 * | AAV2-A1  | Package exporta runAgent como named export                     | [AAV2-A1] should export runAgent as named export             | Implementado |
 * | AAV2-A3  | Scope enforced as compile-time union literal                   | [AAV2-A3] should process all valid scope values (diff, full, baseline) without error | Implementado |
 * | AAV2-A4  | Output incluye metadata.kind sarif y version 2.1.0             | [AAV2-A4] should return metadata.kind sarif and version 2.1.0| Implementado |
 * | AAV2-D1  | runAgent retorna Promise<AgentOutput> resuelto                 | [AAV2-D1] should return AgentOutput with sarif kind          | Implementado |
 * | AAV2-D2  | ctx.input se castea y propaga a SecurityAuditAgent             | [AAV2-D2] should pass input to agent after casting           | Implementado |
 * | AAV2-D3  | Errores se propagan al AgentRunner                             | [AAV2-D3] should propagate errors from SecurityAuditAgent    | Implementado |
 * | AAV2-D4  | runAgent es named export (no default)                          | [AAV2-D4] should export runAgent as named export             | Implementado |
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockAuditFn = jest.fn().mockResolvedValue({
  findings: [],
  summary: { total: 0, bySeverity: {}, byCategory: {}, byDetector: {} },
  scannedFiles: 5,
  scannedLines: 200,
  duration: 42,
  detectors: ['regex'],
  waivers: { acknowledged: 0, new: 0 },
});

jest.mock('@gitgov/core', () => ({
  SourceAuditor: {
    SourceAuditorModule: jest.fn().mockImplementation(() => ({
      audit: mockAuditFn,
    })),
  },
  FindingDetector: {
    FindingDetectorModule: jest.fn().mockImplementation(() => ({})),
  },
  Sarif: {
    createSarifBuilder: jest.fn(() => ({
      build: jest.fn().mockResolvedValue({
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [{
          tool: {
            driver: {
              name: 'gitgov-security-audit',
              version: '2.0.0',
              informationUri: 'https://github.com/gitgovernance/monorepo/tree/main/packages/agents/security-audit',
              rules: [],
            },
          },
          results: [],
        }],
      }),
    })),
  },
}));

jest.mock('@gitgov/core/fs', () => ({
  FsFileLister: jest.fn().mockImplementation(() => ({})),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import * as mod from './src/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(input: unknown) {
  return {
    agentId: 'agent:gitgov:security-audit',
    actorId: 'agent:gitgov:security-audit',
    taskId: 'task-001',
    runId: '550e8400-e29b-41d4-a716-446655440000',
    input,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('security-audit entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('4.1. Package y Estructura (AAV2-A1 a AAV2-A4)', () => {
    it('[AAV2-A1] should export runAgent as named export from src/index.ts', () => {
      expect(typeof mod.runAgent).toBe('function');
    });

    it('[AAV2-A3] should process all valid scope values (diff, full, baseline) without error', async () => {
      // scope enforcement is compile-time via TypeScript union literal (AAV2-A3).
      // This test verifies the agent accepts and correctly propagates each valid scope.
      for (const scope of ['diff', 'full', 'baseline'] as const) {
        const ctx = makeCtx({ scope, taskId: 'task-scope', baseDir: '/tmp/repo' });
        const output = await mod.runAgent(ctx);
        const metadata = output.metadata as Record<string, unknown>;
        const summary = metadata['summary'] as Record<string, unknown>;
        expect(summary['scopeType']).toBe(scope);
      }
    });

    it('[AAV2-A4] should return metadata.kind sarif and metadata.version 2.1.0', async () => {
      const ctx = makeCtx({ scope: 'full', taskId: 'task-001', baseDir: '/tmp/repo' });
      const output = await mod.runAgent(ctx);

      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('sarif');
      expect(metadata['version']).toBe('2.1.0');
    });
  });

  describe('4.4. Entry Point (AAV2-D1 a AAV2-D4)', () => {
    it('[AAV2-D1] should return AgentOutput with sarif kind', async () => {
      const ctx = makeCtx({ scope: 'full', taskId: 'task-001', baseDir: '/tmp/repo' });
      const output = await mod.runAgent(ctx);

      expect(output).toBeDefined();
      expect(output.message).toContain('Scan completed');
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('sarif');
      expect(metadata['data']).toBeDefined();
    });

    it('[AAV2-D2] should pass input to agent after casting', async () => {
      const ctx = makeCtx({ scope: 'diff', taskId: 'task-002', baseDir: '/tmp/repo' });
      const output = await mod.runAgent(ctx);

      const metadata = output.metadata as Record<string, unknown>;
      const summary = metadata['summary'] as Record<string, unknown>;
      expect(summary['scopeType']).toBe('diff');
    });

    it('[AAV2-D3] should propagate errors from SecurityAuditAgent', async () => {
      mockAuditFn.mockRejectedValueOnce(new Error('audit failed'));

      const ctx = makeCtx({ scope: 'full', taskId: 'task-003', baseDir: '/tmp/repo' });

      await expect(mod.runAgent(ctx)).rejects.toThrow('audit failed');
    });

    it('[AAV2-D4] should export runAgent as named export', () => {
      expect(typeof mod.runAgent).toBe('function');
      expect((mod as Record<string, unknown>)['default']).toBeUndefined();
    });
  });
});
