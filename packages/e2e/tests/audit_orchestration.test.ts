/**
 * Block G: Audit Orchestration Pipeline (CG1 to CG8)
 *
 * Integration tests for the complete audit pipeline:
 *   AuditOrchestrator -> AgentRunner (mock calling real modules) -> SARIF -> Waivers -> Policy
 *
 * Real modules: SourceAuditorModule, FindingDetectorModule, SarifBuilder, PolicyEvaluator
 * Mocked: IAgentRunner (wraps real detection pipeline), IWaiverReader (for CG4/CG5)
 *
 * IMPORTANT: All imports use @gitgov/core public API where available.
 * AuditOrchestrator/PolicyEvaluator use relative imports because they are not yet
 * exported from the main @gitgov/core entry point (added in this epic).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// === @gitgov/core public API ===
import {
  SourceAuditor,
  FindingDetector,
  Sarif,
} from '@gitgov/core';
import { MemoryRecordStore } from '@gitgov/core/memory';
import { FsFileLister } from '@gitgov/core/fs';
import type { IAgentRunner, RunOptions, AgentResponse, GitGovAgentRecord } from '@gitgov/core';

// === Modules not yet in @gitgov/core public API (added in audit_orchestration epic) ===
import { createAuditOrchestrator } from '../../core/src/audit_orchestrator';
import { createPolicyEvaluator } from '../../core/src/policy_evaluator';
import type {
  AuditOrchestrationResult,
} from '../../core/src/audit_orchestrator';
import type { IWaiverReader, ActiveWaiver } from '../../core/src/source_auditor/types';

// ============================================================================
// Fixture setup
// ============================================================================

const FIXTURE_LOGIN_TS = `// src/auth/login.ts — authentication handler
import { db } from '../config/database';

const adminEmail = "admin@company.com";
const supportEmail = "support@company.com";

export async function login(username: string, password: string) {
  const user = await db.query('SELECT * FROM users WHERE email = $1', [username]);
  if (!user) {
    console.log('Login failed for', username);
    return { success: false };
  }
  return { success: true, token: 'jwt-token' };
}
`;

const FIXTURE_DATABASE_TS = `// src/config/database.ts — database configuration
const dbHost = 'localhost';
const dbPort = 5432;
const dbPassword = "supersecret123";
const api_key = "sk-1234567890abcdefghijklmnopqrstuvwxyz";

export const dbConfig = {
  host: dbHost,
  port: dbPort,
  password: dbPassword,
};
`;

/**
 * Creates a temp directory with PII fixture files.
 */
function createFixtureDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-audit-'));

  const authDir = path.join(tempDir, 'src', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'login.ts'), FIXTURE_LOGIN_TS);

  const configDir = path.join(tempDir, 'src', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'database.ts'), FIXTURE_DATABASE_TS);

  return tempDir;
}

/**
 * Creates a GitGovAgentRecord for the security-audit agent.
 */
function makeAgentRecord(): GitGovAgentRecord {
  return {
    header: {
      version: '1.0',
      type: 'agent',
      payloadChecksum: 'e2e-test-checksum',
      signatures: [
        {
          keyId: 'agent:gitgov:security-audit',
          role: 'author',
          notes: 'E2E test fixture',
          signature: 'dGVzdA=='.padEnd(88, '='),
          timestamp: Date.now(),
        },
      ],
    },
    payload: {
      id: 'agent:gitgov:security-audit',
      status: 'active',
      engine: {
        type: 'local' as const,
        entrypoint: 'packages/agents/security-audit/dist/index.mjs',
        function: 'runAgent',
      },
      metadata: {
        purpose: 'audit',
        audit: {
          target: 'code',
          outputFormat: 'sarif',
          supportedScopes: ['diff', 'full', 'baseline'],
        },
      },
    },
  };
}

type SarifLog = Sarif.SarifLog;

/**
 * Creates a mock IAgentRunner that internally runs real detection modules.
 *
 * Instead of spawning a process, this runner:
 * 1. Creates a real FindingDetectorModule (regex-only)
 * 2. Creates a real SourceAuditorModule with FsFileLister
 * 3. Runs the audit on the fixture directory
 * 4. Builds real SARIF via SarifBuilder
 * 5. Returns the result in AgentResponse format
 */
function createIntegrationAgentRunner(fixtureDir: string): IAgentRunner {
  return {
    async runOnce(opts: RunOptions): Promise<AgentResponse> {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();

      const input = opts.input as {
        scope: 'diff' | 'full' | 'baseline';
        include?: string[];
        exclude?: string[];
        taskId: string;
      };

      // Real modules — same wiring as the security-audit agent
      const findingDetector = new FindingDetector.FindingDetectorModule({
        regex: { enabled: true },
      });

      const fileLister = new FsFileLister({ cwd: fixtureDir });

      const noOpWaiverReader: SourceAuditor.IWaiverReader = {
        loadActiveWaivers: async () => [],
        hasActiveWaiver: async () => false,
      };

      const sourceAuditor = new SourceAuditor.SourceAuditorModule({
        findingDetector,
        waiverReader: noOpWaiverReader,
        fileLister,
      });

      const include = input.include ?? ['**/*'];
      const exclude = input.exclude ?? [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
      ];

      const auditResult = await sourceAuditor.audit({
        baseDir: fixtureDir,
        scope: { include, exclude },
      });

      // Build SARIF with real SarifBuilder
      const sarifBuilder = Sarif.createSarifBuilder();
      const sarifLog: SarifLog = await sarifBuilder.build({
        toolName: 'gitgov-security-audit',
        toolVersion: '1.0.0',
        informationUri: 'https://gitgovernance.com/agents/security-audit',
        findings: auditResult.findings,
        taskId: input.taskId,
        agentId: opts.agentId,
        scanScope: input.scope,
        scannedFiles: auditResult.scannedFiles,
        scannedLines: auditResult.scannedLines,
      });

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const executionRecordId = `exec-e2e-${Date.now()}`;

      return {
        runId: `run-e2e-${Date.now()}`,
        agentId: opts.agentId,
        status: 'success',
        output: {
          message: `Security audit completed: ${auditResult.findings.length} finding(s) in ${auditResult.scannedFiles} files`,
          metadata: {
            kind: 'sarif',
            version: '2.1.0',
            data: sarifLog,
          },
        },
        executionRecordId,
        startedAt,
        completedAt,
        durationMs,
      };
    },
  };
}

/**
 * Creates a no-op IWaiverReader (no waivers).
 */
function createNoOpWaiverReader(): IWaiverReader {
  return {
    loadActiveWaivers: async () => [],
    hasActiveWaiver: async () => false,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe('Block G: Audit Orchestration Pipeline (CG1 to CG8)', () => {
  let tempDir: string;
  let agentStore: MemoryRecordStore<GitGovAgentRecord>;

  beforeAll(async () => {
    tempDir = createFixtureDir();

    agentStore = new MemoryRecordStore<GitGovAgentRecord>();
    const agentRecord = makeAgentRecord();
    await agentStore.put('agent:gitgov:security-audit', agentRecord);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper: creates orchestrator with default deps.
   */
  function createOrchestrator(overrides?: {
    waiverReader?: IWaiverReader;
  }) {
    const agentRunner = createIntegrationAgentRunner(tempDir);
    const policyEvaluator = createPolicyEvaluator();
    const waiverReader = overrides?.waiverReader ?? createNoOpWaiverReader();

    return createAuditOrchestrator({
      recordStore: agentStore,
      agentRunner,
      waiverReader,
      policyEvaluator,
    });
  }

  // ==========================================================================
  // 4.1. Pipeline Completo (CG1 to CG3)
  // ==========================================================================

  describe('4.1. Pipeline Completo (CG1 to CG3)', () => {
    let result: AuditOrchestrationResult;

    beforeAll(async () => {
      const orchestrator = createOrchestrator();
      result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-pipeline',
      });
    });

    it('[CG1] should return findings matching PII in fixture files', () => {
      // The fixtures contain emails (PII-001) and hardcoded api_key (SEC-001)
      expect(result.findings.length).toBeGreaterThanOrEqual(2);

      // Verify email findings exist
      const emailFindings = result.findings.filter(
        (f) => f.ruleId === 'PII-001',
      );
      expect(emailFindings.length).toBeGreaterThanOrEqual(1);

      // Verify at least one finding comes from the fixture files
      const fixtureFiles = result.findings.map((f) => f.file);
      const hasLoginFile = fixtureFiles.some((f) => f.includes('login.ts'));
      const hasDatabaseFile = fixtureFiles.some((f) => f.includes('database.ts'));
      expect(hasLoginFile || hasDatabaseFile).toBe(true);
    });

    it('[CG2] should produce findings with valid fingerprints', () => {
      // Each finding must have a non-empty fingerprint
      for (const finding of result.findings) {
        expect(finding.fingerprint).toBeTruthy();
        expect(typeof finding.fingerprint).toBe('string');
        expect(finding.fingerprint.length).toBeGreaterThan(0);
      }

      // Fingerprints should be unique across findings (dedup already applied)
      const fingerprints = result.findings.map((f) => f.fingerprint);
      const uniqueFingerprints = new Set(fingerprints);
      expect(uniqueFingerprints.size).toBe(fingerprints.length);
    });

    it('[CG3] should include agentResults with status success and valid SarifLog', () => {
      expect(result.agentResults).toHaveLength(1);

      const agentResult = result.agentResults[0]!;
      expect(agentResult.status).toBe('success');
      expect(agentResult.agentId).toBe('agent:gitgov:security-audit');
      expect(agentResult.executionId).toBeTruthy();
      expect(agentResult.durationMs).toBeGreaterThanOrEqual(0);

      // Validate SARIF structure
      const sarif = agentResult.sarif;
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toContain('sarif-schema-2.1.0');
      expect(sarif.runs).toHaveLength(1);

      const run = sarif.runs[0]!;
      expect(run.tool.driver.name).toBe('gitgov-security-audit');
      expect(run.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 4.2. Waiver Integration (CG4 to CG5)
  // ==========================================================================

  describe('4.2. Waiver Integration (CG4 to CG5)', () => {
    let baselineResult: AuditOrchestrationResult;

    beforeAll(async () => {
      const orchestrator = createOrchestrator();
      baselineResult = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-baseline',
      });
    });

    it('[CG4] should mark finding as isWaived when active waiver matches fingerprint', async () => {
      expect(baselineResult.findings.length).toBeGreaterThanOrEqual(1);
      const targetFinding = baselineResult.findings[0]!;

      const waiver: ActiveWaiver = {
        fingerprint: targetFinding.fingerprint,
        ruleId: targetFinding.ruleId ?? 'UNKNOWN',
        feedback: {
          id: '1234567890-feedback-waiver-e2e',
          entityType: 'execution',
          entityId: 'exec-e2e-previous',
          type: 'approval',
          status: 'acknowledged',
          content: 'Risk accepted for E2E test',
          metadata: {
            fingerprint: targetFinding.fingerprint,
            ruleId: targetFinding.ruleId ?? 'UNKNOWN',
            file: targetFinding.file,
            line: targetFinding.line,
          },
        },
      };

      const mockWaiverReader: IWaiverReader = {
        loadActiveWaivers: async () => [waiver],
        hasActiveWaiver: async (fp: string) => fp === targetFinding.fingerprint,
      };

      const orchestrator = createOrchestrator({ waiverReader: mockWaiverReader });
      const result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-waiver',
      });

      // The waived finding should be marked
      const waivedFinding = result.findings.find(
        (f) => f.fingerprint === targetFinding.fingerprint,
      );
      expect(waivedFinding).toBeDefined();
      expect(waivedFinding!.isWaived).toBe(true);
      expect(waivedFinding!.waiver).toBeDefined();
      expect(waivedFinding!.waiver!.fingerprint).toBe(targetFinding.fingerprint);

      // Other findings should NOT be waived
      const nonWaivedFindings = result.findings.filter(
        (f) => f.fingerprint !== targetFinding.fingerprint,
      );
      for (const f of nonWaivedFindings) {
        expect(f.isWaived).toBe(false);
      }
    });

    it('[CG5] should not count waived finding toward failOn threshold', async () => {
      // Verify baseline has high-severity findings
      const highFinding = baselineResult.findings.find(
        (f) => f.severity === 'critical' || f.severity === 'high',
      );
      expect(highFinding).toBeDefined();

      // Waive ALL findings so nothing is active
      const waivers: ActiveWaiver[] = baselineResult.findings.map((f) => ({
        fingerprint: f.fingerprint,
        ruleId: f.ruleId ?? 'UNKNOWN',
        feedback: {
          id: `1234567890-feedback-waiver-${f.fingerprint.slice(0, 8)}`,
          entityType: 'execution' as const,
          entityId: 'exec-e2e-previous',
          type: 'approval' as const,
          status: 'acknowledged' as const,
          content: 'Risk accepted for E2E test',
          metadata: {
            fingerprint: f.fingerprint,
            ruleId: f.ruleId ?? 'UNKNOWN',
            file: f.file,
            line: f.line,
          },
        },
      }));

      const mockWaiverReader: IWaiverReader = {
        loadActiveWaivers: async () => waivers,
        hasActiveWaiver: async (fp: string) =>
          waivers.some((w) => w.fingerprint === fp),
      };

      const orchestrator = createOrchestrator({ waiverReader: mockWaiverReader });
      const result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-waiver-policy',
        failOn: 'low',
      });

      // All findings should be waived
      for (const f of result.findings) {
        expect(f.isWaived).toBe(true);
      }

      // Policy should PASS because waived findings are excluded from threshold
      expect(result.policyDecision.decision).toBe('pass');
    });
  });

  // ==========================================================================
  // 4.3. Policy Evaluation (CG6 to CG8)
  // ==========================================================================

  describe('4.3. Policy Evaluation (CG6 to CG8)', () => {
    it('[CG6] should return policyDecision block when findings above failOn severity', async () => {
      const orchestrator = createOrchestrator();
      const result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-policy-block',
        failOn: 'low',
      });

      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.policyDecision.decision).toBe('block');
      expect(result.policyDecision.reason).toBeTruthy();
    });

    it('[CG7] should return policyDecision pass when no findings above failOn severity', async () => {
      // First get baseline findings, then waive them all
      const baseOrchestrator = createOrchestrator();
      const baseResult = await baseOrchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-baseline-for-pass',
      });

      const waivers: ActiveWaiver[] = baseResult.findings.map((f) => ({
        fingerprint: f.fingerprint,
        ruleId: f.ruleId ?? 'UNKNOWN',
        feedback: {
          id: `1234567890-feedback-waiver-${f.fingerprint.slice(0, 8)}`,
          entityType: 'execution' as const,
          entityId: 'exec-e2e-previous',
          type: 'approval' as const,
          status: 'acknowledged' as const,
          content: 'All waived for pass test',
          metadata: {
            fingerprint: f.fingerprint,
            ruleId: f.ruleId ?? 'UNKNOWN',
            file: f.file,
            line: f.line,
          },
        },
      }));

      const mockWaiverReader: IWaiverReader = {
        loadActiveWaivers: async () => waivers,
        hasActiveWaiver: async (fp: string) =>
          waivers.some((w) => w.fingerprint === fp),
      };

      const orchestrator = createOrchestrator({ waiverReader: mockWaiverReader });
      const result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-policy-pass',
        failOn: 'critical',
      });

      expect(result.policyDecision.decision).toBe('pass');
    });

    it('[CG8] should return summary with accurate counts by severity', async () => {
      const orchestrator = createOrchestrator();
      const result = await orchestrator.run({
        scope: 'full',
        taskId: '1234567890-task-e2e-summary',
      });

      const { summary, findings } = result;

      // Summary.total should equal findings count
      expect(summary.total).toBe(findings.length);

      // Manually count severities from findings (no waivers in this test)
      const active = findings.filter((f) => !f.isWaived);
      const expectedCritical = active.filter((f) => f.severity === 'critical').length;
      const expectedHigh = active.filter((f) => f.severity === 'high').length;
      const expectedMedium = active.filter((f) => f.severity === 'medium').length;
      const expectedLow = active.filter((f) => f.severity === 'low').length;
      const expectedSuppressed = findings.filter((f) => f.isWaived).length;

      expect(summary.critical).toBe(expectedCritical);
      expect(summary.high).toBe(expectedHigh);
      expect(summary.medium).toBe(expectedMedium);
      expect(summary.low).toBe(expectedLow);
      expect(summary.suppressed).toBe(expectedSuppressed);

      // Verify agents ran
      expect(summary.agentsRun).toBe(1);
      expect(summary.agentsFailed).toBe(0);

      // Severity counts should sum to total (no waivers = no suppressed)
      expect(
        summary.critical + summary.high + summary.medium + summary.low + summary.suppressed,
      ).toBe(summary.total);
    });
  });
});
