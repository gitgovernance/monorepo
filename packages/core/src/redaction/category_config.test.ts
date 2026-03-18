/**
 * category_config.test.ts — CategoryConfig tests
 *
 * Trazabilidad EARS:
 * | EARS ID  | Test Case                                                                     |
 * |----------|------------------------------------------------------------------------------|
 * | RLDX-C1  | should include pii-email in sensitiveCategories                               |
 * | RLDX-C2  | should include hardcoded-secret in sensitiveCategories                        |
 * | RLDX-C3  | should include logging-pii in safeCategories                                  |
 * | RLDX-C4  | should include unknown-risk in safeCategories                                 |
 * | RLDX-C5  | should return new config with merged categories without mutating base         |
 */

import { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './category_config';

describe('CategoryConfig', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 4.3. CategoryConfig (RLDX-C1 a C5)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.3. CategoryConfig (RLDX-C1 a C5)', () => {
    it('[RLDX-C1] should include pii-email in sensitiveCategories', () => {
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toContain('pii-email');
    });

    it('[RLDX-C2] should include hardcoded-secret in sensitiveCategories', () => {
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toContain('hardcoded-secret');
    });

    it('[RLDX-C3] should include logging-pii in safeCategories', () => {
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toContain('logging-pii');
    });

    it('[RLDX-C4] should include unknown-risk in safeCategories', () => {
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toContain('unknown-risk');
    });

    it('[RLDX-C5] should return new config with merged categories without mutating base', () => {
      const originalSensitiveLength = DEFAULT_REDACTION_CONFIG.sensitiveCategories.length;
      const originalSafeLength = DEFAULT_REDACTION_CONFIG.safeCategories.length;

      const merged = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {
        sensitiveCategories: ['custom-sensitive'],
      });

      // Base not mutated
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toHaveLength(originalSensitiveLength);
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toHaveLength(originalSafeLength);

      // New category in result
      expect(merged.sensitiveCategories).toContain('custom-sensitive');
      // Original categories preserved
      expect(merged.sensitiveCategories).toContain('pii-email');
      // Length includes new addition
      expect(merged.sensitiveCategories).toHaveLength(originalSensitiveLength + 1);
      // defaultBehavior preserved from base
      expect(merged.defaultBehavior).toBe('redact');
    });
  });
});
