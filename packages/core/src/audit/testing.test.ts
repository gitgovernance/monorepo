/**
 * Tests for audit test builders
 *
 * Spec: audit_record_types_module.md §4.9 (AUDIT-I1 to I3)
 */
import { makeTestFinding, makeTestFix, makeTestWaiver, makeTestScan } from './testing';
import { verifySnippet } from './types';

describe('Audit Test Builders', () => {
  describe('4.9. Test Builders (AUDIT-I1 to I3)', () => {
    it('[AUDIT-I1] should return valid Finding with defaults and accept overrides', () => {
      const finding = makeTestFinding();
      expect(finding.fingerprint).toBe('sha256:test-default-fingerprint');
      expect(finding.ruleId).toBe('SEC-001');
      expect(finding.snippetHash).toMatch(/^[a-f0-9]{64}$/);
      expect(verifySnippet(finding.snippet, finding.snippetHash)).toBe('verified');

      const custom = makeTestFinding({ severity: 'critical', file: 'custom.ts' });
      expect(custom.severity).toBe('critical');
      expect(custom.file).toBe('custom.ts');
      expect(custom.ruleId).toBe('SEC-001');
    });

    it('[AUDIT-I2] should return valid Waiver Scan and Fix with defaults', () => {
      const fix = makeTestFix();
      expect(fix.description).toBe('Move to environment variables');

      const fixCustom = makeTestFix({ source: 'agent:review-advisor', regulation: 'PCI-DSS 3.4' });
      expect(fixCustom.source).toBe('agent:review-advisor');

      const waiver = makeTestWaiver();
      expect(waiver.fingerprint).toBe('sha256:test-default-fingerprint');
      expect(waiver.ruleId).toBe('SEC-001');
      expect(waiver.feedback.header.version).toBe('1.1');
      expect(waiver.feedback.payload.type).toBe('approval');

      const scan = makeTestScan();
      expect(scan.scope).toBe('full');
      expect(scan.triggeredBy).toBe('user');
      expect(scan.summary).toBeDefined();
      expect(scan.summary.total).toBe(0);

      const scanWithFindings = makeTestScan({
        findings: [makeTestFinding({ severity: 'critical' }), makeTestFinding({ severity: 'high', fingerprint: 'fp2', snippet: 'other' })],
      });
      expect(scanWithFindings.summary.critical).toBe(1);
      expect(scanWithFindings.summary.high).toBe(1);
      expect(scanWithFindings.summary.total).toBe(2);
    });

    it('[AUDIT-I3] should not export test builders from main audit entry', async () => {
      const auditIndex = await import('./index');
      expect('makeTestFinding' in auditIndex).toBe(false);
      expect('makeTestWaiver' in auditIndex).toBe(false);
      expect('makeTestScan' in auditIndex).toBe(false);
    });
  });
});
