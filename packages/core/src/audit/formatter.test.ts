import { formatAuditResult, severityBadge } from './formatter';
import type {
  AuditOrchestrationResult,
  Finding,
  AuditSummary,
} from './types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'sha256:abc123',
    ruleId: 'SEC-001',
    file: 'src/config.ts',
    line: 3,
    message: 'Hardcoded secret detected',
    category: 'hardcoded-secret',
    severity: 'critical',
    detector: 'regex',
    confidence: 1.0,
    executionId: 'exec-001',
    reportedBy: ['agent:security-audit'],
    isWaived: false,
    ...overrides,
  };
}

function makeResult(overrides: {
  findings?: Finding[];
  decision?: 'pass' | 'block';
  reason?: string;
  summary?: Partial<AuditSummary>;
} = {}): AuditOrchestrationResult {
  const findings = overrides.findings ?? [makeFinding()];
  const decision = overrides.decision ?? 'block';
  return {
    findings,
    agentResults: [],
    policyDecision: {
      decision,
      reason: overrides.reason ?? 'critical findings present',
      executionId: 'exec-policy-001',
      blockingFindings: decision === 'block' ? findings.filter((f) => !f.isWaived) : [],
      waivedFindings: findings.filter((f) => f.isWaived),
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
      rulesEvaluated: [],
      evaluatedAt: '2026-04-26T00:00:00.000Z',
    },
    summary: {
      total: findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      suppressed: 0,
      agentsRun: 1,
      agentsFailed: 0,
      ...overrides.summary,
    },
    executionIds: { scans: ['exec-scan-001'], policy: 'exec-policy-001' },
  };
}

describe('AuditFormatter', () => {
  describe('4.1. Core Formatting (AFMT-A1 to A4)', () => {
    it('[AFMT-A1] should produce markdown table with severity badge, category, file, line, and message', () => {
      const result = makeResult({
        findings: [
          makeFinding({ severity: 'critical', category: 'hardcoded-secret', file: 'src/config.ts', line: 3, message: 'Stripe API key detected' }),
          makeFinding({ fingerprint: 'sha256:def456', severity: 'high', category: 'third-party-transfer', file: 'src/checkout.ts', line: 47, message: 'PII sent to analytics' }),
        ],
        summary: { critical: 1, high: 1 },
      });

      const md = formatAuditResult(result)!;

      expect(md).toContain('| # | Severity | Category | File | Line | Message |');
      expect(md).toContain('| 1 | 🔴 critical | hardcoded-secret | src/config.ts | 3 | Stripe API key detected |');
      expect(md).toContain('| 2 | 🟠 high | third-party-transfer | src/checkout.ts | 47 | PII sent to analytics |');
    });

    it('[AFMT-A2] should return null when all findings are waived', () => {
      const result = makeResult({
        findings: [
          makeFinding({ isWaived: true }),
          makeFinding({ fingerprint: 'sha256:def456', isWaived: true }),
        ],
        decision: 'pass',
        reason: 'all waived',
      });

      expect(formatAuditResult(result)).toBeNull();
    });

    it('[AFMT-A3] should exclude waived findings and only show active findings', () => {
      const result = makeResult({
        findings: [
          makeFinding({ message: 'active finding' }),
          makeFinding({ fingerprint: 'sha256:waived', message: 'waived finding', isWaived: true }),
        ],
      });

      const md = formatAuditResult(result)!;

      expect(md).toContain('active finding');
      expect(md).not.toContain('waived finding');
    });

    it('[AFMT-A4] should include header with finding count and policy status', () => {
      const result = makeResult({ decision: 'block' });
      const md = formatAuditResult(result)!;

      expect(md).toContain('## 🔴 GitGov Gate: 1 findings — blocked');
    });
  });

  describe('4.2. Policy & Metadata (AFMT-B1 to B4)', () => {
    it('[AFMT-B1] should include BLOCKED status with policy reason when decision is block', () => {
      const result = makeResult({ decision: 'block', reason: '1 finding(s) at or above critical threshold.' });
      const md = formatAuditResult(result)!;

      expect(md).toContain('**Policy:** BLOCKED — 1 finding(s) at or above critical threshold.');
    });

    it('[AFMT-B2] should include PASSED status with policy reason when decision is pass', () => {
      const result = makeResult({ decision: 'pass', reason: 'no blocking findings' });
      const md = formatAuditResult(result)!;

      expect(md).toContain('**Policy:** PASSED — no blocking findings');
    });

    it('[AFMT-B3] should include waiver tip with gitgov audit waive command', () => {
      const result = makeResult();
      const md = formatAuditResult(result)!;

      expect(md).toContain('> 💡 To waive: `gitgov audit waive <fingerprint> -j "reason"`');
    });

    it('[AFMT-B4] should include summary from AuditSummary counts', () => {
      const result = makeResult({
        summary: { critical: 1, high: 2, medium: 0, low: 3, suppressed: 1 },
      });
      const md = formatAuditResult(result)!;

      expect(md).toContain('**Summary:** 1 critical, 2 high, 0 medium, 3 low (1 suppressed)');
    });
  });

  describe('4.3. Severity Badges (AFMT-C1 to C4)', () => {
    it('[AFMT-C1] should return red circle emoji for critical severity', () => {
      expect(severityBadge('critical')).toBe('🔴');
    });

    it('[AFMT-C2] should return orange circle emoji for high severity', () => {
      expect(severityBadge('high')).toBe('🟠');
    });

    it('[AFMT-C3] should return yellow circle emoji for medium severity', () => {
      expect(severityBadge('medium')).toBe('🟡');
    });

    it('[AFMT-C4] should return blue circle emoji for low severity', () => {
      expect(severityBadge('low')).toBe('🔵');
    });
  });
});
