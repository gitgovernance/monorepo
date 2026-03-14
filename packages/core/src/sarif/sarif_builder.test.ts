// All EARS prefixes map to sarif_module.md
import { createSarifBuilder, toSarifWaiver } from './sarif_builder';
import type { Finding } from '../finding_detector/types';
import type { SarifBuilderOptions, SarifActiveWaiver, SarifLog } from './sarif.types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const baseFindings: Finding[] = [
  {
    id: 'finding-001',
    ruleId: 'PII-001',
    category: 'pii-email',
    severity: 'high',
    file: 'src/auth/login.ts',
    line: 42,
    column: 5,
    snippet: 'const email = user.email;',
    message: 'PII email detected in source code',
    suggestion: 'Remove email from source',
    legalReference: 'GDPR Art. 5(1)(f)',
    detector: 'regex',
    fingerprint: 'abc123def456',
    confidence: 0.95,
  },
];

const baseOptions: SarifBuilderOptions = {
  toolName: 'gitgov-audit',
  toolVersion: '2.8.0',
  informationUri: 'https://gitgovernance.com/audit',
  findings: baseFindings,
};

/** Helper to get the first run from a SarifLog safely */
function firstRun(sarif: SarifLog) {
  const run = sarif.runs[0];
  if (!run) throw new Error('No runs in SarifLog');
  return run;
}

/** Helper to get the first result from a SarifLog safely */
function firstResult(sarif: SarifLog) {
  const run = firstRun(sarif);
  const result = run.results[0];
  if (!result) throw new Error('No results in run');
  return result;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SarifBuilder', () => {
  const builder = createSarifBuilder();

  describe('4.1. Structure and severity mapping (SARIF-A1 to A3)', () => {

    it('[SARIF-A1] build: should return SarifLog with version 2.1.0 and correct $schema', async () => {
      const sarif = await builder.build(baseOptions);
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toContain('errata01');
    });

    it('[SARIF-A2] build: should return empty results array when findings is empty', async () => {
      const sarif = await builder.build({ ...baseOptions, findings: [] });
      expect(firstRun(sarif).results).toEqual([]);
    });

    it('[SARIF-A3] build: should map critical/high → error, medium → warning, low → note, info → none', async () => {
      const severities: Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
      const expected = ['error', 'error', 'warning', 'note', 'none'];

      for (let i = 0; i < severities.length; i++) {
        const sev = severities[i]!;
        const exp = expected[i]!;
        const finding: Finding = { ...baseFindings[0]!, id: `f-${i}`, severity: sev };
        const sarif = await builder.build({ ...baseOptions, findings: [finding] });
        expect(firstResult(sarif).level).toBe(exp);
      }
    });
  });

  describe('4.3. Build core (SARIF-C1 to C8)', () => {

    it('[SARIF-C1] build: should populate location with correct line and column', async () => {
      const sarif = await builder.build(baseOptions);
      const loc = firstResult(sarif).locations[0];
      expect(loc).toBeDefined();
      const region = loc!.physicalLocation.region;
      expect(region.startLine).toBe(42);
      expect(region.startColumn).toBe(5);
    });

    it('[SARIF-C2] build: findings with same ruleId should produce one rule entry', async () => {
      const dup: Finding = { ...baseFindings[0]!, id: 'finding-002', line: 50 };
      const sarif = await builder.build({ ...baseOptions, findings: [baseFindings[0]!, dup] });
      const rules = firstRun(sarif).tool.driver.rules ?? [];
      const pii001Count = rules.filter(r => r.id === 'PII-001').length;
      expect(pii001Count).toBe(1);
    });

    it('[SARIF-C3] build: rule with legalReference should include helpUri based on ruleId', async () => {
      const sarif = await builder.build(baseOptions);
      const rules = firstRun(sarif).tool.driver.rules ?? [];
      const rule = rules.find(r => r.id === 'PII-001');
      expect(rule).toBeDefined();
      expect(rule!.helpUri).toBe('https://gitgovernance.com/rules/PII-001');
    });

    it('[SARIF-C4] build: should populate partialFingerprints when getLineContent provided', async () => {
      const opts: SarifBuilderOptions = {
        ...baseOptions,
        getLineContent: async () => 'const email = user.email;',
      };
      const sarif = await builder.build(opts);
      const result = firstResult(sarif);
      expect(result.partialFingerprints).toBeDefined();
      expect(result.partialFingerprints!['primaryLocationLineHash/v1']).toMatch(/^[0-9a-f]{16}:1$/);
    });

    it('[SARIF-C5] build: should not include partialFingerprints when getLineContent not provided', async () => {
      const sarif = await builder.build(baseOptions);
      expect(firstResult(sarif).partialFingerprints).toBeUndefined();
    });

    it('[SARIF-C6] build: $schema should point to OASIS Errata 01 official URL', async () => {
      const sarif = await builder.build(baseOptions);
      expect(sarif.$schema).toBe(
        'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json'
      );
    });

    it('[SARIF-C7] build: finding with snippet should include snippet.text in region', async () => {
      const sarif = await builder.build(baseOptions);
      const loc = firstResult(sarif).locations[0];
      const snippet = loc!.physicalLocation.region.snippet;
      expect(snippet).toBeDefined();
      expect(snippet!.text).toBe('const email = user.email;');
    });

    it('[SARIF-C8] build: finding without snippet should not include snippet in region', async () => {
      const findingNoSnippet: Finding = { ...baseFindings[0]!, id: 'f-no-snippet', snippet: '' };
      const sarif = await builder.build({ ...baseOptions, findings: [findingNoSnippet] });
      const loc = firstResult(sarif).locations[0];
      // Empty string snippet should be omitted (falsy)
      expect(loc!.physicalLocation.region.snippet).toBeUndefined();
    });
  });

  describe('4.4. GitGov properties (SARIF-D1 to D5)', () => {

    it('[SARIF-D1] build: should include gitgov/executionId in result.properties when provided', async () => {
      const sarif = await builder.build({ ...baseOptions, executionId: 'exec-42' });
      expect(firstResult(sarif).properties?.['gitgov/executionId']).toBe('exec-42');
    });

    it('[SARIF-D2] build: should NOT include gitgov/executionId when not provided', async () => {
      const sarif = await builder.build(baseOptions);
      expect(firstResult(sarif).properties).not.toHaveProperty('gitgov/executionId');
    });

    it('[SARIF-D3] build: should include gitgov/category from finding.category', async () => {
      const sarif = await builder.build(baseOptions);
      expect(firstResult(sarif).properties?.['gitgov/category']).toBe('pii-email');
    });

    it('[SARIF-D4] build: should include gitgov/legalReference when finding has legalReference', async () => {
      const sarif = await builder.build(baseOptions);
      expect(firstResult(sarif).properties?.['gitgov/legalReference']).toBe('GDPR Art. 5(1)(f)');
    });

    it('[SARIF-D5] build: should include gitgov/policyDecision in run.properties when provided', async () => {
      const sarif = await builder.build({ ...baseOptions, policyDecision: 'block' });
      expect(firstRun(sarif).properties?.['gitgov/policyDecision']).toBe('block');
    });
  });

  describe('4.5. Invocations (SARIF-E1 to E4)', () => {

    it('[SARIF-E1] build: should set startTimeUtc in invocations when provided', async () => {
      const sarif = await builder.build({ ...baseOptions, startTimeUtc: '2026-03-03T10:00:00Z' });
      const inv = firstRun(sarif).invocations;
      expect(inv).toBeDefined();
      expect(inv![0]!.startTimeUtc).toBe('2026-03-03T10:00:00Z');
    });

    it('[SARIF-E2] build: should include gitgov/executionId in invocations.properties', async () => {
      const sarif = await builder.build({ ...baseOptions, executionId: 'exec-99', startTimeUtc: '2026-03-03T10:00:00Z' });
      const inv = firstRun(sarif).invocations;
      expect(inv![0]!.properties?.['gitgov/executionId']).toBe('exec-99');
    });

    it('[SARIF-E3] build: should NOT include invocations when no invocation fields provided', async () => {
      const sarif = await builder.build(baseOptions);
      expect(firstRun(sarif).invocations).toBeUndefined();
    });

    it('[SARIF-E4] build: executionSuccessful should default to true when not provided', async () => {
      const sarif = await builder.build({ ...baseOptions, startTimeUtc: '2026-03-03T10:00:00Z' });
      const inv = firstRun(sarif).invocations;
      expect(inv![0]!.executionSuccessful).toBe(true);
    });
  });

  describe('4.6. Suppressions (SARIF-F1 to F5)', () => {

    it('[SARIF-F1] build: matching waiver should produce suppression with kind inSource', async () => {
      const opts: SarifBuilderOptions = {
        ...baseOptions,
        getLineContent: async () => 'const email = user.email;',
        activeWaivers: [],
      };
      // Compute fingerprint first to build the waiver
      const sarifNoWaiver = await builder.build({ ...opts, activeWaivers: [] });
      const fp = firstResult(sarifNoWaiver).partialFingerprints?.['primaryLocationLineHash/v1'] ?? '';

      const waiver: SarifActiveWaiver = {
        fingerprint: fp,
        feedbackId: 'feedback-2026-001',
        content: 'Approved for test environment only',
        expiresAt: '2026-12-31T00:00:00Z',
        approvedBy: 'human:ciso',
      };

      const sarif = await builder.build({ ...opts, activeWaivers: [waiver] });
      const sup = firstResult(sarif).suppressions;
      expect(sup).toBeDefined();
      expect(sup![0]!.kind).toBe('inSource');
    });

    it('[SARIF-F2] build: matching waiver should produce suppression with status accepted', async () => {
      const opts: SarifBuilderOptions = {
        ...baseOptions,
        getLineContent: async () => 'const email = user.email;',
        activeWaivers: [],
      };
      const sarifNoWaiver = await builder.build(opts);
      const fp = firstResult(sarifNoWaiver).partialFingerprints?.['primaryLocationLineHash/v1'] ?? '';
      const waiver: SarifActiveWaiver = { fingerprint: fp, feedbackId: 'fb-1', content: 'ok' };
      const sarif = await builder.build({ ...opts, activeWaivers: [waiver] });
      const sup = firstResult(sarif).suppressions;
      expect(sup![0]!.status).toBe('accepted');
    });

    it('[SARIF-F3] build: suppression should include gitgov/feedbackId', async () => {
      const opts: SarifBuilderOptions = {
        ...baseOptions,
        getLineContent: async () => 'const email = user.email;',
        activeWaivers: [],
      };
      const sarifNoWaiver = await builder.build(opts);
      const fp = firstResult(sarifNoWaiver).partialFingerprints?.['primaryLocationLineHash/v1'] ?? '';
      const waiver: SarifActiveWaiver = { fingerprint: fp, feedbackId: 'feedback-xyz', content: 'ok' };
      const sarif = await builder.build({ ...opts, activeWaivers: [waiver] });
      const sup = firstResult(sarif).suppressions;
      expect(sup![0]!.properties?.['gitgov/feedbackId']).toBe('feedback-xyz');
    });

    it('[SARIF-F4] build: result without matching waiver should NOT have suppressions', async () => {
      const opts: SarifBuilderOptions = {
        ...baseOptions,
        getLineContent: async () => 'const email = user.email;',
        activeWaivers: [{ fingerprint: 'no-match', feedbackId: 'fb', content: 'ok' }],
      };
      const sarif = await builder.build(opts);
      expect(firstResult(sarif).suppressions).toBeUndefined();
    });

    it('[SARIF-F5] build: empty activeWaivers should produce no suppressions', async () => {
      const sarif = await builder.build({ ...baseOptions, activeWaivers: [] });
      expect(firstResult(sarif).suppressions).toBeUndefined();
    });
  });

  describe('4.7. Validation (SARIF-G1 to G3)', () => {

    it('[SARIF-G1] validate: output from build() should pass validation', async () => {
      const sarif = await builder.build(baseOptions);
      const result = builder.validate(sarif);
      expect(result.valid).toBe(true);
    });

    it('[SARIF-G2] validate: sarif missing version field should fail validation', () => {
      const invalid = { $schema: 'x', runs: [] } as unknown as SarifLog;
      const result = builder.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('[SARIF-G3] validate: result with invalid level value should fail validation', async () => {
      const sarif = await builder.build(baseOptions);
      // Inject invalid level
      (firstResult(sarif) as Record<string, unknown>)['level'] = 'critical';
      const result = builder.validate(sarif);
      expect(result.valid).toBe(false);
    });
  });

  describe('4.10. Redaction metadata tag (SARIF-J1)', () => {

    it('[SARIF-J1] build: should include gitgov/redactionLevel in run.properties when provided', async () => {
      const sarif = await builder.build({ ...baseOptions, redactionLevel: 'l1' });
      expect(firstRun(sarif).properties?.['gitgov/redactionLevel']).toBe('l1');
    });
  });

  describe('4.11. toSarifWaiver mapping (SARIF-K1 to K4)', () => {

    it('[SARIF-K1] toSarifWaiver: should map feedback.id to feedbackId', () => {
      const result = toSarifWaiver({
        fingerprint: 'abc123',
        feedback: { id: 'fb-001', content: 'Approved' },
      });
      expect(result.feedbackId).toBe('fb-001');
      expect(result.fingerprint).toBe('abc123');
    });

    it('[SARIF-K2] toSarifWaiver: should default content to empty string when feedback.content is undefined', () => {
      const result = toSarifWaiver({
        fingerprint: 'abc123',
        feedback: { id: 'fb-002' },
      });
      expect(result.content).toBe('');
    });

    it('[SARIF-K3] toSarifWaiver: should convert expiresAt Date to ISO string', () => {
      const date = new Date('2026-12-31T00:00:00Z');
      const result = toSarifWaiver({
        fingerprint: 'abc123',
        feedback: { id: 'fb-003', content: 'ok' },
        expiresAt: date,
      });
      expect(result.expiresAt).toBe('2026-12-31T00:00:00.000Z');
    });

    it('[SARIF-K4] toSarifWaiver: should propagate approvedBy when provided', () => {
      const result = toSarifWaiver({
        fingerprint: 'abc123',
        feedback: { id: 'fb-004', content: 'ok' },
        approvedBy: 'human:ciso',
      });
      expect(result.approvedBy).toBe('human:ciso');
    });
  });
});
