/**
 * Tabla de Trazabilidad EARS - agent.test.ts
 * All EARS prefixes map to security_audit_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                         | Estado    |
 * |----------|----------------------------------------------------------------|-------------------------------------------------------------------|-----------|
 * | AAV2-C1  | scope: 'full' invoca audit sin diff context                    | [AAV2-C1] should call sourceAuditor.audit with scope: full        | Implementado |
 * | AAV2-C2  | scope: 'diff' invoca audit con diff scope                      | [AAV2-C2] should call sourceAuditor.audit with scope: diff        | Implementado |
 * | AAV2-C3  | Pasa AuditResult a SarifBuilder con toolName correcto          | [AAV2-C3] should call sarifBuilder.build with toolName            | Implementado |
 * | AAV2-C4  | Retorna AgentOutput con kind sarif y data = SarifLog           | [AAV2-C4] should return AgentOutput with metadata.kind: sarif     | Implementado |
 * | AAV2-C5  | Incluye TODOS los findings sin filtrar waivers                 | [AAV2-C5] should include ALL findings without waiver filtering    | Implementado |
 * | AAV2-C6  | Stage condicional se salta si anterior = 0 findings            | [AAV2-C6] should skip conditional stage when prev = 0 findings    | Implementado |
 * | AAV2-A5  | Stage condicional se salta si anterior = 0 findings (package) | [AAV2-A5] should skip conditional stage when previous stage produced zero findings | Implementado |
 */

import { SecurityAuditAgent } from './src/agent';
import type { SecurityAuditAgentDeps } from './src/agent';
import type { SecurityAuditInput, AgentDetectorConfig } from './src/types';
import { DEFAULT_CONFIG } from './src/config';

function makeAuditResult(overrides: Record<string, unknown> = {}) {
  return {
    findings: [],
    summary: { total: 0, bySeverity: {}, byCategory: {}, byDetector: {} },
    scannedFiles: 10,
    scannedLines: 500,
    duration: 42,
    detectors: ['regex' as const],
    waivers: { acknowledged: 0, new: 0 },
    ...overrides,
  };
}

function makeSarifLog() {
  return {
    version: '2.1.0' as const,
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
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
  };
}

function makeDeps(overrides: Partial<SecurityAuditAgentDeps> = {}): SecurityAuditAgentDeps {
  return {
    sourceAuditor: {
      audit: jest.fn().mockResolvedValue(makeAuditResult()),
    },
    sarifBuilder: {
      build: jest.fn().mockResolvedValue(makeSarifLog()),
      validate: jest.fn(), // required by SarifBuilder interface, not called by agent
    },
    ...overrides,
  };
}

const baseInput: SecurityAuditInput = {
  scope: 'full',
  taskId: 'task-001',
  baseDir: '/tmp/test-repo',
};

describe('SecurityAuditAgent', () => {
  describe('4.1. Package y Estructura (AAV2-A5)', () => {
    it('[AAV2-A5] should skip conditional stage when previous stage produced zero findings', async () => {
      const auditMock = jest.fn().mockResolvedValue(makeAuditResult({ findings: [] }));
      const deps = makeDeps({
        sourceAuditor: { audit: auditMock },
      });
      const agent = new SecurityAuditAgent(deps);

      const config: AgentDetectorConfig = {
        pipeline: [
          { detector: 'regex', conditional: false },
          { detector: 'heuristic', conditional: true },
          { detector: 'llm', conditional: true },
        ],
      };

      await agent.run(baseInput, config);

      // regex runs (0 findings) → heuristic skipped → llm skipped
      expect(auditMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('4.3. Pipeline de Auditoria (AAV2-C1 a AAV2-C6)', () => {
    it('[AAV2-C1] should call sourceAuditor.audit with scope: full', async () => {
      const deps = makeDeps();
      const agent = new SecurityAuditAgent(deps);

      await agent.run(baseInput, DEFAULT_CONFIG);

      expect(deps.sourceAuditor.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          baseDir: '/tmp/test-repo',
          scope: expect.objectContaining({
            include: ['**/*'],
          }),
        }),
      );

      // scope: 'full' should NOT include changedSince
      const callArgs = (deps.sourceAuditor.audit as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
      const scope = callArgs['scope'] as Record<string, unknown>;
      expect(scope['changedSince']).toBeUndefined();
    });

    it('[AAV2-C2] should call sourceAuditor.audit with scope: diff', async () => {
      const deps = makeDeps();
      const agent = new SecurityAuditAgent(deps);

      await agent.run({ ...baseInput, scope: 'diff' }, DEFAULT_CONFIG);

      const callArgs = (deps.sourceAuditor.audit as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
      const scope = callArgs['scope'] as Record<string, unknown>;
      expect(scope['changedSince']).toBe('HEAD');
      expect(scope['include']).toEqual(['**/*']);
      expect(callArgs['baseDir']).toBe('/tmp/test-repo');
    });

    it('[AAV2-C3] should call sarifBuilder.build with toolName: gitgov-security-audit', async () => {
      const deps = makeDeps();
      const agent = new SecurityAuditAgent(deps);

      await agent.run(baseInput, DEFAULT_CONFIG);

      expect(deps.sarifBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'gitgov-security-audit',
          findings: expect.any(Array),
        }),
      );
    });

    it('[AAV2-C4] should return AgentOutput with metadata.kind: sarif', async () => {
      const deps = makeDeps();
      const agent = new SecurityAuditAgent(deps);

      const output = await agent.run(baseInput, DEFAULT_CONFIG);

      expect(output.metadata).toBeDefined();
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('sarif');
      expect(metadata['version']).toBe('2.1.0');
      expect(metadata['data']).toBeDefined();
    });

    it('[AAV2-C5] should include ALL findings in SARIF without waiver filtering', async () => {
      const findings = [
        { id: 'f1', ruleId: 'PII-001', severity: 'high', category: 'pii-email', file: 'a.ts', line: 1, snippet: '', message: '', detector: 'regex', fingerprint: 'abc', confidence: 0.9 },
        { id: 'f2', ruleId: 'SEC-001', severity: 'low', category: 'hardcoded-secret', file: 'b.ts', line: 2, snippet: '', message: '', detector: 'regex', fingerprint: 'def', confidence: 0.8 },
      ];
      const deps = makeDeps({
        sourceAuditor: {
          audit: jest.fn().mockResolvedValue(makeAuditResult({ findings, scannedFiles: 2 })),
        },
      });
      const agent = new SecurityAuditAgent(deps);

      await agent.run(baseInput, DEFAULT_CONFIG);

      // SarifBuilder must receive ALL findings without filtering
      expect(deps.sarifBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({ findings }),
      );
    });

    it('[AAV2-C6] should skip conditional stage when previous stage returned zero findings', async () => {
      const auditMock = jest.fn().mockResolvedValue(makeAuditResult({ findings: [] }));
      const deps = makeDeps({
        sourceAuditor: { audit: auditMock },
      });
      const agent = new SecurityAuditAgent(deps);

      // DEFAULT_CONFIG: [regex(non-conditional), heuristic(conditional)]
      // regex returns 0 findings → heuristic should be skipped
      await agent.run(baseInput, DEFAULT_CONFIG);

      // Only 1 call (regex stage), heuristic skipped because conditional + 0 findings
      expect(auditMock).toHaveBeenCalledTimes(1);
    });

  });
});
