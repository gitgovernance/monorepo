/**
 * category_config.test.ts — CategoryConfig tests
 *
 * Trazabilidad EARS:
 * | EARS ID  | Test Case                                                                     |
 * |----------|------------------------------------------------------------------------------|
 * | RLDX-C1  | should classify pii-email as sensitive and redact it at l1                    |
 * | RLDX-C2  | should classify hardcoded-secret as sensitive and redact it at l1             |
 * | RLDX-C3  | should classify logging-pii as safe and keep its snippet at l1                |
 * | RLDX-C4  | should classify unknown-risk as safe and keep its snippet at l1               |
 * | RLDX-C5  | should return new config with merged categories without mutating base         |
 */

import { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './category_config';
import { FindingRedactor } from './redactor';
import type { Finding } from '../audit/types';

// A finding whose category is the only thing each C test changes. "Classify" is verified
// as BEHAVIOUR — the category goes through redact() — and not as list membership alone:
// the membership assertions were the only link between these four categories and what the
// module does with them, so a config that listed pii-email under safe
// AND under sensitive, or a redactor that ignored the list, was invisible to them.
function findingWith(category: Finding['category']): Finding {
  return {
    fingerprint: `fp-${category}`,
    file: 'src/user/service.ts',
    line: 42,
    ruleId: 'RULE-001',
    category,
    severity: 'high',
    snippet: 'const email = "john@example.com"',
    snippetHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    message: 'Original message',
    detector: 'regex',
    confidence: 1.0,
    executionId: '',
    reportedBy: [],
    isWaived: false,
  };
}

describe('CategoryConfig', () => {
  const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);

  // ────────────────────────────────────────────────────────────────────────
  // 4.3. CategoryConfig (RLDX-C1 a C5)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.3. CategoryConfig (RLDX-C1 a C5)', () => {
    it('[RLDX-C1] should classify pii-email as sensitive and redact it at l1', () => {
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toContain('pii-email');
      expect(redactor.isSensitiveCategory('pii-email')).toBe(true);
      expect(redactor.redact(findingWith('pii-email'), 'l1').snippet).toBe('[REDACTED]');
    });

    it('[RLDX-C2] should classify hardcoded-secret as sensitive and redact it at l1', () => {
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toContain('hardcoded-secret');
      expect(redactor.isSensitiveCategory('hardcoded-secret')).toBe(true);
      expect(redactor.redact(findingWith('hardcoded-secret'), 'l1').snippet).toBe('[REDACTED]');
    });

    it('[RLDX-C3] should classify logging-pii as safe and keep its snippet at l1', () => {
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toContain('logging-pii');
      expect(redactor.isSensitiveCategory('logging-pii')).toBe(false);
      const source = findingWith('logging-pii');
      expect(redactor.redact(source, 'l1').snippet).toBe(source.snippet);
    });

    it('[RLDX-C4] should classify unknown-risk as safe and keep its snippet at l1', () => {
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toContain('unknown-risk');
      expect(redactor.isSensitiveCategory('unknown-risk')).toBe(false);
      const source = findingWith('unknown-risk');
      expect(redactor.redact(source, 'l1').snippet).toBe(source.snippet);
    });

    it('[RLDX-C5] should return new config with merged categories without mutating base', () => {
      // Snapshot by VALUE, not by length: an in-place rewrite of equal length passes a
      // length check.
      const baseSnapshot = JSON.parse(JSON.stringify(DEFAULT_REDACTION_CONFIG));

      // All three fields overridden. Passing sensitiveCategories only lets a merge that
      // discarded safeCategories and defaultBehavior stay green —
      // and defaultBehavior: 'keep' is the only way to turn safe-by-default off.
      const merged = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {
        sensitiveCategories: ['custom-sensitive'],
        safeCategories: ['custom-safe'],
        defaultBehavior: 'keep',
      });

      expect(DEFAULT_REDACTION_CONFIG).toEqual(baseSnapshot);

      expect(merged.sensitiveCategories).toEqual([...baseSnapshot.sensitiveCategories, 'custom-sensitive']);
      expect(merged.safeCategories).toEqual([...baseSnapshot.safeCategories, 'custom-safe']);
      expect(merged.defaultBehavior).toBe('keep');

      // The merged config is a working policy, not just a shape: the new safe category is kept
      // by a redactor built from it, and the base default ('redact') no longer applies.
      const mergedRedactor = new FindingRedactor(merged);
      expect(mergedRedactor.isSensitiveCategory('custom-safe')).toBe(false);
      expect(mergedRedactor.isSensitiveCategory('never-registered')).toBe(false);
      expect(mergedRedactor.isSensitiveCategory('custom-sensitive')).toBe(true);
    });
  });
});
