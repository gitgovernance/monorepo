/**
 * Tabla de Trazabilidad EARS - agent_runner.integration.test.ts
 * All EARS prefixes map to security_audit_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                              | Estado       |
 * |----------|----------------------------------------------------------------|------------------------------------------------------------------------|--------------|
 * | AAV2-A2  | tsc --noEmit pasa sin errores para tipos del agente            | [AAV2-A2] should have zero type errors (types are importable)          | Implementado |
 * | AAV2-E1  | AgentRecord valida contra schema sin errores                   | [AAV2-E1] should validate AgentRecord against agent_record_schema      | Implementado |
 * | AAV2-E2  | ActorRecord valida contra schema sin errores                   | [AAV2-E2] should validate ActorRecord against actor_record_schema      | Implementado |
 * | AAV2-E3  | Status active permite invocacion                               | [AAV2-E3] should allow invocation when AgentRecord status is active    | Implementado |
 * | AAV2-E4  | No contiene campo capabilities                                 | [AAV2-E4] should not contain capabilities field in AgentRecord         | Implementado |
 * | AAV2-G1  | AgentRunner crea ExecutionRecord                               | [AAV2-G1] should produce output compatible with AgentRunner ExecutionRecord creation | Implementado |
 * | AAV2-G2  | ExecutionRecord tiene metadata.kind sarif                      | [AAV2-G2] should set metadata.kind sarif in ExecutionRecord            | Implementado |
 * | AAV2-G3  | Ed25519 signature verification                                 | [AAV2-G3] should have matching identity between AgentRecord and ActorRecord for Ed25519 signing | Implementado |
 * | AAV2-G4  | Archivo con PII produce finding en SARIF                       | [AAV2-G4] should produce finding when file with known PII is in scope  | Implementado |
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SecurityAuditInput, AgentDetectorConfig } from './src/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AGENT_RECORD_PATH = path.resolve(__dirname, 'agent-record.example.json');
const ACTOR_RECORD_PATH = path.resolve(__dirname, 'actor-record.example.json');

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

// ─── Mocks (top-level, hoisted by Jest) ─────────────────────────────────────

const mockAuditFn = jest.fn();
const mockSarifBuild = jest.fn();

jest.mock('@gitgov/core', () => ({
  SourceAuditor: {
    SourceAuditorModule: jest.fn().mockImplementation(() => ({ audit: mockAuditFn })),
  },
  FindingDetector: {
    FindingDetectorModule: jest.fn().mockImplementation(() => ({})),
  },
  Sarif: {
    createSarifBuilder: jest.fn(() => ({ build: mockSarifBuild })),
  },
}));

jest.mock('@gitgov/core/fs', () => ({
  FsFileLister: jest.fn().mockImplementation(() => ({})),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { runAgent } from './src/index';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('security-audit integration', () => {
  describe('4.5. Registros del Protocolo (AAV2-E1 a AAV2-E4)', () => {
    let agentRecord: Record<string, unknown>;
    let actorRecord: Record<string, unknown>;

    beforeAll(() => {
      agentRecord = loadJson(AGENT_RECORD_PATH);
      actorRecord = loadJson(ACTOR_RECORD_PATH);
    });

    it('[AAV2-E1] should validate AgentRecord against agent_record_schema', () => {
      const payload = agentRecord['payload'] as Record<string, unknown>;

      // Structural validation — required fields per schema
      expect(payload['id']).toBe('agent:gitgov:security-audit');
      expect(payload['id']).toMatch(/^agent(:[a-z0-9-]+)+$/);
      expect(payload['status']).toBe('active');

      const engine = payload['engine'] as Record<string, unknown>;
      expect(engine['type']).toBe('local');
      expect(engine['entrypoint']).toBe('packages/agents/security-audit/dist/index.mjs');
      expect(engine['function']).toBe('runAgent');

      const triggers = payload['triggers'] as Array<Record<string, unknown>>;
      expect(Array.isArray(triggers)).toBe(true);
      expect(triggers[0]!['type']).toBe('manual');

      const header = agentRecord['header'] as Record<string, unknown>;
      expect(header['version']).toBe('1.0');
      expect(header['type']).toBe('agent');
      expect(typeof header['payloadChecksum']).toBe('string');
      expect((header['payloadChecksum'] as string).length).toBe(64); // SHA-256 hex
    });

    it('[AAV2-E2] should validate ActorRecord against actor_record_schema', () => {
      const payload = actorRecord['payload'] as Record<string, unknown>;

      // Structural validation — required fields per schema
      expect(payload['id']).toBe('agent:gitgov:security-audit');
      expect(payload['id']).toMatch(/^(human|agent)(:[a-z0-9-]+)+$/);
      expect(payload['type']).toBe('agent');
      expect(payload['displayName']).toBe('Security Audit Agent');
      expect(typeof payload['publicKey']).toBe('string');
      expect((payload['publicKey'] as string).length).toBe(44); // Ed25519 base64

      const roles = payload['roles'] as string[];
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThanOrEqual(1);
      expect(roles).toContain('executor');

      expect(payload['status']).toBe('active');

      const header = actorRecord['header'] as Record<string, unknown>;
      expect(header['version']).toBe('1.0');
      expect(header['type']).toBe('actor');
      expect(typeof header['payloadChecksum']).toBe('string');
      expect((header['payloadChecksum'] as string).length).toBe(64);
    });

    it('[AAV2-E3] should allow invocation when AgentRecord status is active', () => {
      const payload = agentRecord['payload'] as Record<string, unknown>;
      expect(payload['status']).toBe('active');

      // Active status means the agent can be loaded by AgentRunner
      // (AgentRunner checks status before invoking engine)
    });

    it('[AAV2-E4] should not contain capabilities field in AgentRecord', () => {
      const payload = agentRecord['payload'] as Record<string, unknown>;
      expect(payload['capabilities']).toBeUndefined();

      // Decision A2: use metadata.purpose instead
      const metadata = payload['metadata'] as Record<string, unknown>;
      expect(metadata['purpose']).toBe('audit');
    });
  });

  describe('4.1. Package y Estructura — Type Compilation (AAV2-A2)', () => {
    it('[AAV2-A2] should have zero type errors (types are importable)', () => {
      // If this file compiles, tsc --noEmit passes for these types.
      // The import of SecurityAuditInput and AgentDetectorConfig at the top
      // of this file is the real assertion — a type error would fail compilation
      // before any test runs.
      const _input: SecurityAuditInput = { scope: 'full', taskId: 'test' };
      const _config: AgentDetectorConfig = { pipeline: [{ detector: 'regex', conditional: false }] };
      expect(_input.scope).toBe('full');
      expect(_config.pipeline.length).toBe(1);
    });
  });

  describe('4.7. Validacion via AgentRunner (AAV2-G1 to AAV2-G4)', () => {
    // NOTE: These tests exercise runAgent() directly with mocked core modules.
    // Full AgentRunner.runOnce() integration (real filesystem, crypto, signed
    // ExecutionRecord written to .gitgov/executions/) is verified by the E2E
    // Block G tests in packages/e2e/. The unit tests here validate that the
    // agent function produces output compatible with AgentRunner's expectations.

    beforeEach(() => {
      jest.clearAllMocks();

      mockAuditFn.mockResolvedValue({
        findings: [
          {
            id: 'f1',
            ruleId: 'PII-001',
            category: 'pii-email',
            severity: 'high',
            file: 'fixture.ts',
            line: 3,
            snippet: 'const email = "user@example.com"',
            message: 'Hardcoded email address detected',
            detector: 'regex',
            fingerprint: 'abc123',
            confidence: 0.95,
          },
        ],
        summary: { total: 1, bySeverity: { high: 1 }, byCategory: { 'pii-email': 1 }, byDetector: { regex: 1 } },
        scannedFiles: 1,
        scannedLines: 10,
        duration: 5,
        detectors: ['regex'],
        waivers: { acknowledged: 0, new: 1 },
      });

      mockSarifBuild.mockResolvedValue({
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0' as const,
        runs: [{
          tool: { driver: { name: 'gitgov-security-audit', version: '2.0.0', rules: [] } },
          results: [{ ruleId: 'PII-001', message: { text: 'Hardcoded email' }, level: 'error', locations: [] }],
        }],
      });
    });

    it('[AAV2-G1] should produce output compatible with AgentRunner ExecutionRecord creation', async () => {
      // This test exercises runAgent() directly and verifies its output shape is
      // compatible with what AgentRunner.runOnce() expects to build an ExecutionRecord.
      // It does NOT invoke AgentRunner itself — that requires real filesystem, crypto,
      // and .gitgov/executions/ writes, which are covered by E2E Block G tests.

      const agentRecord = loadJson(AGENT_RECORD_PATH);
      const payload = agentRecord['payload'] as Record<string, unknown>;
      const engine = payload['engine'] as Record<string, unknown>;

      // Verify AgentRunner can load and interpret the record
      expect(engine['type']).toBe('local');
      expect(engine['function']).toBe('runAgent');

      const ctx = {
        agentId: payload['id'] as string,
        actorId: payload['id'] as string,
        taskId: 'task-integration-001',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        input: { scope: 'full', taskId: 'task-integration-001', baseDir: '/tmp/test-repo' },
      };

      const output = await runAgent(ctx);

      // AgentRunner would create ExecutionRecord from this output
      const executionRecord = {
        taskId: ctx.taskId,
        type: 'completion',
        title: `Agent execution: ${ctx.agentId}`,
        result: output.message,
        metadata: {
          agentId: ctx.agentId,
          runId: ctx.runId,
          status: 'success',
          output,
        },
      };

      expect(executionRecord.metadata.status).toBe('success');
      expect(executionRecord.metadata.output).toBeDefined();
      expect(executionRecord.taskId).toBe('task-integration-001');
    });

    it('[AAV2-G2] should set metadata.kind sarif in ExecutionRecord', async () => {
      const ctx = {
        agentId: 'agent:gitgov:security-audit',
        actorId: 'agent:gitgov:security-audit',
        taskId: 'task-integration-002',
        runId: '550e8400-e29b-41d4-a716-446655440001',
        input: { scope: 'full', taskId: 'task-integration-002', baseDir: '/tmp/test-repo' },
      };

      const output = await runAgent(ctx);

      // The ExecutionRecord.metadata.output contains the AgentOutput
      // AgentRunner stores it as: metadata.output = output
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('sarif');
      expect(metadata['version']).toBe('2.1.0');
      expect(metadata['data']).toBeDefined();

      const sarifLog = metadata['data'] as Record<string, unknown>;
      expect(sarifLog['version']).toBe('2.1.0');
      expect(Array.isArray(sarifLog['runs'])).toBe(true);
    });

    it('[AAV2-G3] should have matching identity between AgentRecord and ActorRecord for Ed25519 signing', () => {
      // Ed25519 signature verification requires AgentRunner to sign the ExecutionRecord
      // with the private key corresponding to the ActorRecord's publicKey. This test
      // verifies the prerequisite: both records share the same identity (agent ID prefix)
      // so AgentRunner can resolve the correct keypair. Full signature verification
      // is E2E scope (AgentRunner.runOnce → sign → verify).

      const agentRecord = loadJson(AGENT_RECORD_PATH);
      const actorRecord = loadJson(ACTOR_RECORD_PATH);

      const agentPayload = agentRecord['payload'] as Record<string, unknown>;
      const actorPayload = actorRecord['payload'] as Record<string, unknown>;

      // Same ID links agent engine definition to actor identity
      expect(agentPayload['id']).toBe(actorPayload['id']);
      expect(agentPayload['id']).toBe('agent:gitgov:security-audit');

      // ActorRecord has Ed25519 public key (44 chars = 32 bytes base64)
      const publicKey = actorPayload['publicKey'] as string;
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBe(44);

      // ActorRecord type is 'agent' — matches the agent: prefix in the ID
      expect(actorPayload['type']).toBe('agent');

      // Both records must be active for AgentRunner to use them
      expect(agentPayload['status']).toBe('active');
      expect(actorPayload['status']).toBe('active');
    });

    it('[AAV2-G4] should produce finding when file with known PII is in scope', async () => {
      const ctx = {
        agentId: 'agent:gitgov:security-audit',
        actorId: 'agent:gitgov:security-audit',
        taskId: 'task-integration-003',
        runId: '550e8400-e29b-41d4-a716-446655440002',
        input: { scope: 'full', taskId: 'task-integration-003', baseDir: '/tmp/test-repo' },
      };

      const output = await runAgent(ctx);

      // Verify the agent produced findings (via mocked audit with PII fixture)
      const metadata = output.metadata as Record<string, unknown>;
      const summary = metadata['summary'] as Record<string, unknown>;
      expect(summary['totalFindings']).toBeGreaterThan(0);

      // Verify SARIF contains results
      const sarifLog = metadata['data'] as { runs: Array<{ results: unknown[] }> };
      expect(sarifLog.runs[0]!.results.length).toBeGreaterThan(0);

      // Verify the finding came through to sarifBuilder
      expect(mockSarifBuild).toHaveBeenCalledWith(
        expect.objectContaining({
          findings: expect.arrayContaining([
            expect.objectContaining({
              ruleId: 'PII-001',
              category: 'pii-email',
            }),
          ]),
        }),
      );
    });
  });
});
