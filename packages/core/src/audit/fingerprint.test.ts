/**
 * Finding identity tests — the preimage, the normalization, and what stays out of it.
 *
 * Spec: audit_record_types_module.md §4.11 (AUDIT-K2, K3, K4)
 *
 * The negative controls are the point of this file. Each one reproduces a defect that
 * production had on 2026-09-05 (input #19 §0.2): dropping `file` merges the same line
 * across two files (D-a), dropping `category` merges two findings on one line (D-b).
 * A test that only asserts the happy path cannot tell those apart from correct behaviour.
 */

import { createHash } from 'node:crypto';
import {
  FINGERPRINT_SCHEME,
  REGION_FINGERPRINT_SCHEME,
  normalizeAnchor,
  computeFingerprint,
  computeRegionFingerprint,
} from './fingerprint';

describe('4.11. Finding identity (AUDIT-K2 to K4, K7)', () => {
  const base = { file: 'src/config.ts', category: 'hardcoded-secret', anchor: 'sk_test_abc123' };

  describe('AUDIT-K2 — the preimage', () => {
    it('[AUDIT-K2] should hash the versioned preimage with sha256 to 64 hex chars', () => {
      const expected = createHash('sha256')
        .update(JSON.stringify([FINGERPRINT_SCHEME, base.file, base.category, base.anchor]))
        .digest('hex');

      const actual = computeFingerprint(base);

      expect(actual).toBe(expected);
      expect(actual).toMatch(/^[a-f0-9]{64}$/);
      expect(FINGERPRINT_SCHEME).toBe('gitgov-fp/2');
    });

    it('[AUDIT-K2] should keep the preimage injective when a part contains the old separator', () => {
      // `file` is a URI and `category` is open (AUDIT-E2): either can contain "|". Moving the
      // separator between two parts must not produce the same identity.
      const a = computeFingerprint({ file: 'src/a|hardcoded-secret', category: 'x', anchor: 'k' });
      const b = computeFingerprint({ file: 'src/a', category: 'hardcoded-secret|x', anchor: 'k' });

      expect(a).not.toBe(b);

      // Negative control — the preimage as it was written until 2026-09-14: the parts joined
      // with "|" and no escaping. The same two inputs collapse into one identity, so a waiver
      // on one would silence the other.
      const joined = (file: string, category: string, anchor: string) =>
        createHash('sha256').update([FINGERPRINT_SCHEME, file, category, anchor].join('|')).digest('hex');
      expect(joined('src/a|hardcoded-secret', 'x', 'k')).toBe(joined('src/a', 'hardcoded-secret|x', 'k'));
    });

    it('[AUDIT-K2] should produce the same fingerprint when only line differs', () => {
      // `line` is not an input of the formula at all — the only way to state "a different
      // line yields the same value" is that two identical inputs do, and that K4 keeps
      // positional data out. Both halves are asserted, here and below.
      expect(computeFingerprint(base)).toBe(computeFingerprint({ ...base }));
    });

    it('[AUDIT-K2] should produce different fingerprints for the same anchor in two files', () => {
      const a = computeFingerprint({ ...base, file: 'src/a.ts' });
      const b = computeFingerprint({ ...base, file: 'src/b.ts' });

      expect(a).not.toBe(b);

      // Negative control — reproduces D-a. The same inputs through a preimage that omits
      // `file` collapse the two files into one identity, which is what let a single waiver
      // silence the same secret everywhere. The control must COLLAPSE where the real
      // formula SEPARATES; asserting it equals itself would prove nothing.
      const withoutFile = (_file: string, category: string, anchor: string) =>
        createHash('sha256').update(JSON.stringify([FINGERPRINT_SCHEME, category, anchor])).digest('hex');
      expect(withoutFile('src/a.ts', base.category, base.anchor))
        .toBe(withoutFile('src/b.ts', base.category, base.anchor));
    });

    it('[AUDIT-K2] should produce different fingerprints for the same anchor with two categories', () => {
      const secret = computeFingerprint({ ...base, category: 'hardcoded-secret' });
      const pii = computeFingerprint({ ...base, category: 'pii-email' });

      expect(secret).not.toBe(pii);

      // Negative control — reproduces D-b: through a preimage that omits `category`, a
      // secret and a PII hit on the same text collapse into one identity, and the only
      // thing telling them apart in production was which rule happened to run first.
      const withoutCategory = (file: string, _category: string, anchor: string) =>
        createHash('sha256').update(JSON.stringify([FINGERPRINT_SCHEME, file, anchor])).digest('hex');
      expect(withoutCategory(base.file, 'hardcoded-secret', base.anchor))
        .toBe(withoutCategory(base.file, 'pii-email', base.anchor));
    });
  });

  describe('AUDIT-K3 — normalizeAnchor', () => {
    it('[AUDIT-K3] should collapse whitespace and trim without changing case', () => {
      expect(normalizeAnchor('a  b')).toBe('a b');
      expect(normalizeAnchor(' a b ')).toBe('a b');
      expect(normalizeAnchor('a\tb')).toBe('a b');
      expect(normalizeAnchor('a\n  b')).toBe('a b');

      // Case is semantic: two secrets differing only in case are two secrets.
      expect(normalizeAnchor('A b')).not.toBe(normalizeAnchor('a b'));

      // No comment stripping — language-dependent, and `//` inside a string literal is
      // not a comment. It survives verbatim.
      expect(normalizeAnchor('key = "a//b"')).toBe('key = "a//b"');

      // No-op over hex/HMAC, so a pre-hashed anchor (token_audit_agent) passes through.
      const hmac = 'a3f1'.repeat(16);
      expect(normalizeAnchor(hmac)).toBe(hmac);
    });

    it('[AUDIT-K3] should make the fingerprint survive whitespace-only reformatting', () => {
      const tight = computeFingerprint({ ...base, anchor: 'const k = "sk_test_abc123"' });
      const spread = computeFingerprint({ ...base, anchor: 'const   k  =  "sk_test_abc123"' });

      expect(tight).toBe(spread);
    });
  });

  describe('AUDIT-K4 — what stays out of the preimage', () => {
    it('[AUDIT-K4] should ignore ruleId detector line column and occurrence in the fingerprint', () => {
      // The formula's input type admits only file, category and anchor. Passing detection
      // metadata alongside cannot change the result, because it never reaches the preimage.
      const withDetectionMetadata = computeFingerprint({
        ...base,
        ...({ ruleId: 'SEC-001', detector: 'regex', line: 42, column: 7, occurrence: 2 } as object),
      });

      expect(withDetectionMetadata).toBe(computeFingerprint(base));
    });

    it('[AUDIT-K4] should yield one identity for two agents matching the same anchor', () => {
      // Cross-agent dedup falls out of the formula: `ruleId` is private to each agent,
      // `category` is the shared vocabulary. Same file, same category, same anchor → one
      // finding, with no rule mapping between agents (agent_platform Task 2.2).
      const regex = computeFingerprint({ file: 'src/a.ts', category: 'hardcoded-secret', anchor: 'sk_test_x' });
      const semgrep = computeFingerprint({ file: 'src/a.ts', category: 'hardcoded-secret', anchor: 'sk_test_x' });

      expect(regex).toBe(semgrep);
    });
  });

  describe('AUDIT-K7 — the region identity, when there is no text to anchor on', () => {
    it('[AUDIT-K7] should separate findings by rule line and column and never collide with a text anchor', () => {
      const region = { file: 'src/app.ts', category: 'security-vulnerability', ruleId: 'semgrep.rule', line: 10, column: 5 };

      const same = computeRegionFingerprint({ ...region });
      expect(same).toBe(
        createHash('sha256')
          .update(JSON.stringify([REGION_FINGERPRINT_SCHEME, region.file, region.category, region.ruleId, 10, 5]))
          .digest('hex'),
      );
      // The tag says which kind of identity a stored value is.
      expect(REGION_FINGERPRINT_SCHEME).toBe('gitgov-fp/2+pos');
      expect(REGION_FINGERPRINT_SCHEME).not.toBe(FINGERPRINT_SCHEME);

      // Three positions that the text path would merge (no text → one anchor) stay three.
      const others = [
        computeRegionFingerprint({ ...region, line: 11 }),
        computeRegionFingerprint({ ...region, column: 6 }),
        computeRegionFingerprint({ ...region, ruleId: 'semgrep.other' }),
      ];
      expect(new Set([same, ...others]).size).toBe(4);

      // A missing column is its own value, not column 0.
      const { column: _column, ...withoutColumn } = region;
      expect(computeRegionFingerprint(withoutColumn)).not.toBe(computeRegionFingerprint({ ...region, column: 0 }));
    });
  });
});
