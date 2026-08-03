/**
 * [AUDIT-I1] [AUDIT-I2] [AUDIT-I3] Test builders for audit entities.
 *
 * Wrappers with sensible defaults around production factories.
 * Export from @gitgov/core/audit/testing — NOT from main API.
 *
 * Usage in tests:
 *   import { makeTestFinding, makeTestWaiver, makeTestScan, makeTestFix } from '@gitgov/core/audit/testing';
 */

import { createFinding, createFix, createWaiver, createScan } from './types';
import type { Finding, Fix, Waiver, Scan, PolicyDecision, FindingSeverity } from './types';
import type { GitGovFeedbackRecord } from '../record_types';

// [AUDIT-I1] makeTestFinding — valid Finding with sensible defaults
export function makeTestFinding(overrides: Partial<Omit<Finding, 'snippetHash'>> = {}): Finding {
  return createFinding({
    fingerprint: 'sha256:test-default-fingerprint',
    ruleId: 'SEC-001',
    category: 'hardcoded-secret',
    severity: 'high' as FindingSeverity,
    file: 'src/config.ts',
    line: 42,
    column: 1,
    message: 'Hardcoded secret detected',
    snippet: 'API_KEY = "sk_test_default_key"',
    detector: 'regex',
    confidence: 1.0,
    executionId: 'exec-test-001',
    reportedBy: ['agent:security-audit'],
    isWaived: false,
    ...overrides,
  });
}

// [AUDIT-I2] makeTestFix — valid Fix with defaults
export function makeTestFix(overrides: Partial<Fix> = {}): Fix {
  return createFix({
    description: 'Move to environment variables',
    ...overrides,
  });
}

// [AUDIT-I2] makeTestWaiver — valid Waiver with defaults
export function makeTestWaiver(overrides: Partial<{
  fingerprint: string;
  ruleId: string;
  expiresAt?: Date;
  feedback: GitGovFeedbackRecord;
}> = {}): Waiver {
  const defaultFeedback = {
    header: {
      version: '1.1',
      type: 'feedback',
      payloadChecksum: 'sha256:test',
      signatures: [{ keyId: 'human:test-user', role: 'author', notes: 'test waiver', signature: 'test-sig', timestamp: Math.floor(Date.now() / 1000) }],
    },
    payload: {
      id: `${Math.floor(Date.now() / 1000)}-feedback-test-waiver`,
      entityType: 'execution',
      entityId: 'exec-test-001',
      type: 'approval',
      status: 'open',
      content: 'Test waiver — not real credentials',
    },
  } as GitGovFeedbackRecord;

  return createWaiver({
    fingerprint: 'sha256:test-default-fingerprint',
    ruleId: 'SEC-001',
    feedback: overrides.feedback ?? defaultFeedback,
    ...overrides,
  });
}

// [AUDIT-I2] makeTestScan — valid Scan with computed summary
export function makeTestScan(overrides: Partial<{
  scope: 'full' | 'diff';
  triggeredBy: string;
  executionRecordIds: string[];
  findings: Finding[];
  policyDecision: PolicyDecision;
  policyExecutionId?: string;
}> = {}): Scan {
  const defaultPolicyDecision: PolicyDecision = {
    decision: 'pass', reason: 'No blocking findings', executionId: 'exec-policy-test',
    blockingFindings: [], waivedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    rulesEvaluated: [], evaluatedAt: new Date().toISOString(),
  };

  return createScan({
    scope: 'full',
    triggeredBy: 'user',
    executionRecordIds: ['exec-test-001'],
    findings: [],
    policyDecision: overrides.policyDecision ?? defaultPolicyDecision,
    ...overrides,
  });
}
