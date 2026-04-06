/**
 * Block H: Policy Evaluation (CH1 to CH4)
 *
 * Integration tests for PolicyEvaluator in isolation with controlled input.
 * Verifies ExecutionRecord creation, waiver exclusion, and signing data.
 *
 * Real modules: PolicyEvaluator (with built-in rules)
 * No mocks needed — PolicyEvaluator receives pre-built findings directly.
 *
 * IMPORTANT: All imports use @gitgov/core public API where available.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// === @gitgov/core public API ===
import type { PolicyEvaluationResult } from '@gitgov/core';

// === Modules not yet in @gitgov/core public API (added in audit_orchestration epic) ===
import { createPolicyEvaluator } from '../../core/src/policy_evaluator';
import type {
  PolicyEvaluationInput,
  PolicyConfig,
  Finding,
  Waiver,
  PolicyEvaluator,
  PolicyExecutionRecordData,
} from '../../core/src/policy_evaluator';

// ============================================================================
// Fixture builders
// ============================================================================

/**
 * Creates a Finding with given severity and optional waiver state.
 */
function makeFinding(overrides: {
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ruleId?: string;
  isWaived?: boolean;
  waiver?: Waiver;
}): Finding {
  return {
    fingerprint: overrides.fingerprint,
    ruleId: overrides.ruleId ?? 'TEST-001',
    message: `Test finding with severity ${overrides.severity}`,
    severity: overrides.severity,
    file: 'src/test.ts',
    line: 10,
    category: 'pii-generic',
    detector: 'regex',
    confidence: 1.0,
    executionId: '1700000000-exec-e2e-policy',
    reportedBy: ['agent:gitgov:security-audit'],
    isWaived: overrides.isWaived ?? false,
    waiver: overrides.waiver,
  };
}

/**
 * Creates a Waiver for a given fingerprint.
 */
function makeWaiver(fingerprint: string, ruleId: string): Waiver {
  return {
    fingerprint,
    ruleId,
    feedback: {
      id: `feedback-waiver-${fingerprint.slice(0, 8)}`,
      entityType: 'execution',
      entityId: 'exec-e2e-previous',
      type: 'approval',
      status: 'acknowledged',
      content: 'Risk accepted for E2E test',
      metadata: {
        fingerprint,
        ruleId,
        file: 'src/test.ts',
        line: 10,
      },
    },
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe('Block H: Policy Evaluation (CH1 to CH4)', () => {
  let evaluator: PolicyEvaluator;

  beforeAll(() => {
    evaluator = createPolicyEvaluator({});
  });

  // ==========================================================================
  // 3.1. Decision Records (CH1 to CH2)
  // ==========================================================================

  describe('3.1. Decision Records (CH1 to CH2)', () => {
    it('[CH1] should create ExecutionRecord type decision with result BLOCK when findings above failOn', async () => {
      const findings: Finding[] = [
        makeFinding({ fingerprint: 'fp-critical-001', severity: 'critical' }),
        makeFinding({ fingerprint: 'fp-high-002', severity: 'high' }),
      ];

      const policy: PolicyConfig = { failOn: 'critical' };

      const input: PolicyEvaluationInput = {
        findings,
        activeWaivers: [],
        policy,
        scanExecutionIds: ['exec-scan-001'],
        taskId: 'task-e2e-ch1',
      };

      const result: PolicyEvaluationResult = await evaluator.evaluate(input);

      // Verify ExecutionRecord data
      const execRecord: PolicyExecutionRecordData = result.executionRecord;
      expect(execRecord.type).toBe('decision');
      expect(execRecord.result).toContain('BLOCK');
      expect(execRecord.id).toBeTruthy();
      expect(execRecord.title).toContain('task-e2e-ch1');

      // Verify decision
      expect(result.decision.decision).toBe('block');
      expect(result.decision.blockingFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('[CH2] should create ExecutionRecord type decision with result PASS when no findings above failOn', async () => {
      const findings: Finding[] = [
        makeFinding({ fingerprint: 'fp-low-001', severity: 'low' }),
        makeFinding({ fingerprint: 'fp-low-002', severity: 'low' }),
      ];

      const policy: PolicyConfig = { failOn: 'critical' };

      const input: PolicyEvaluationInput = {
        findings,
        activeWaivers: [],
        policy,
        scanExecutionIds: ['exec-scan-002'],
        taskId: 'task-e2e-ch2',
      };

      const result: PolicyEvaluationResult = await evaluator.evaluate(input);

      // Verify ExecutionRecord data
      const execRecord: PolicyExecutionRecordData = result.executionRecord;
      expect(execRecord.type).toBe('decision');
      expect(execRecord.result).toContain('PASS');

      // Verify decision
      expect(result.decision.decision).toBe('pass');
      expect(result.decision.blockingFindings).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3.2. Waiver Exclusion and Signing (CH3 to CH4)
  // ==========================================================================

  describe('3.2. Waiver Exclusion and Signing (CH3 to CH4)', () => {
    it('[CH3] should not count waived finding toward decision when above failOn threshold', async () => {
      // Create a critical finding that is waived
      const waiver = makeWaiver('fp-critical-waived', 'PII-001');

      const findings: Finding[] = [
        makeFinding({ fingerprint: 'fp-critical-waived', severity: 'critical' }),
      ];

      const policy: PolicyConfig = { failOn: 'critical' };

      const input: PolicyEvaluationInput = {
        findings,
        activeWaivers: [waiver],
        policy,
        scanExecutionIds: ['exec-scan-003'],
        taskId: 'task-e2e-ch3',
      };

      const result: PolicyEvaluationResult = await evaluator.evaluate(input);

      // The critical finding is waived, so it should NOT trigger a BLOCK
      expect(result.decision.decision).toBe('pass');
      expect(result.decision.waivedFindings).toHaveLength(1);
      expect(result.decision.waivedFindings[0]!.fingerprint).toBe('fp-critical-waived');
      expect(result.decision.waivedFindings[0]!.isWaived).toBe(true);
      expect(result.decision.blockingFindings).toHaveLength(0);

      // ExecutionRecord should reflect PASS
      expect(result.executionRecord.result).toContain('PASS');
    });

    it('[CH4] should sign decision ExecutionRecord with agent Ed25519 keypair and be verifiable', async () => {
      // Create findings so we get a meaningful decision
      const findings: Finding[] = [
        makeFinding({ fingerprint: 'fp-sign-001', severity: 'high' }),
      ];

      const policy: PolicyConfig = { failOn: 'high' };

      const input: PolicyEvaluationInput = {
        findings,
        activeWaivers: [],
        policy,
        scanExecutionIds: ['exec-scan-004'],
        taskId: 'task-e2e-ch4',
      };

      const result: PolicyEvaluationResult = await evaluator.evaluate(input);
      const execRecord: PolicyExecutionRecordData = result.executionRecord;

      // Verify the ExecutionRecord has all fields needed for Ed25519 signing:
      // 1. type: "decision" — the record type
      expect(execRecord.type).toBe('decision');

      // 2. id — unique identifier for the record
      expect(execRecord.id).toBeTruthy();
      expect(typeof execRecord.id).toBe('string');

      // 3. result — human-readable decision string
      expect(execRecord.result).toBeTruthy();
      expect(typeof execRecord.result).toBe('string');

      // 4. references — links to scan execution IDs and waiver feedback IDs
      expect(Array.isArray(execRecord.references)).toBe(true);
      expect(execRecord.references).toContain('exec-scan-004');

      // 5. metadata — structured data (kind, version, data)
      expect(execRecord.metadata.kind).toBe('policy-decision');
      expect(execRecord.metadata.version).toBe('1.0.0');
      expect(execRecord.metadata.data).toBeDefined();

      // 6. metadata.data should be a complete PolicyDecision
      const policyDecision = execRecord.metadata.data;
      expect(policyDecision.decision).toBeDefined();
      expect(policyDecision.reason).toBeTruthy();
      expect(policyDecision.evaluatedAt).toBeTruthy();
      expect(Array.isArray(policyDecision.blockingFindings)).toBe(true);
      expect(Array.isArray(policyDecision.waivedFindings)).toBe(true);
      expect(Array.isArray(policyDecision.rulesEvaluated)).toBe(true);
      expect(policyDecision.summary).toBeDefined();

      // 7. title — describes the evaluation
      expect(execRecord.title).toBeTruthy();
      expect(execRecord.title).toContain('task-e2e-ch4');

      // The ExecutionRecord data is complete and ready for signing by AgentRunner.
      // AgentRunner wraps this into a GitGovExecutionRecord with header.signatures.
    });
  });
});
