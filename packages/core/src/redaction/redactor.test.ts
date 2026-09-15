/**
 * redactor.test.ts — FindingRedactor tests
 *
 * Trazabilidad EARS:
 * | EARS ID  | Test Case                                                                                      |
 * |----------|-----------------------------------------------------------------------------------------------|
 * | RLDX-A2  | should include exactly the 24 sensitive categories in DEFAULT_REDACTION_CONFIG                  |
 * | RLDX-A3  | should include exactly the 14 safe categories in DEFAULT_REDACTION_CONFIG                       |
 * | RLDX-A4  | should have defaultBehavior equal to redact in DEFAULT_REDACTION_CONFIG                         |
 * | RLDX-A5  | should carry all finding fields plus redactionLevel hasFullSnippet and snippetHash              |
 * | RLDX-A6  | should classify every built-in finding category in exactly one list                             |
 * | RLDX-B1  | should return all original fields with redactionLevel l2 when level is l2                      |
 * | RLDX-B2  | should replace snippet with [REDACTED] and set hasFullSnippet false for sensitive category at l1|
 * | RLDX-B3  | should carry the incoming snippetHash unchanged at every level and never recompute it           |
 * | RLDX-B4  | should genericize message and omit the fixes key for sensitive category                         |
 * | RLDX-B4  | should not introduce a fixes key on a finding that never had one                                |
 * | RLDX-B5  | should return all original fields with hasFullSnippet true for safe category at l1              |
 * | RLDX-B6  | should apply full redaction for unregistered category when defaultBehavior is redact            |
 * | RLDX-B7  | should return original fields intact for unregistered category when defaultBehavior is keep     |
 * | RLDX-B8  | should redact snippet.text in SARIF for sensitive categories at l1                              |
 * | RLDX-B9  | should store snippetHash in SARIF properties for all results with snippets                     |
 * | RLDX-B9  | should keep a transported snippetHash instead of recomputing it                                |
 * | RLDX-B10 | should preserve snippet and add snippetHash for l2                                              |
 * | RLDX-B11 | should not mutate the original SarifLog                                                        |
 */

import { FindingRedactor } from './redactor';
import { DEFAULT_REDACTION_CONFIG } from './category_config';
import { sha256 } from '../crypto';
import { BASE_FINDING_CATEGORIES } from '../audit/types';
import type { Finding, FindingCategory } from '../audit/types';
import type { RedactionConfig } from './redactor.types';
import type { SarifLog } from '../sarif/sarif.types';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every fixture carries a snippetHash that is deliberately NOT sha256(snippet). RLDX-B3 says
 * the redactor TRANSPORTS the hash createFinding computed (AUDIT-K6) and never recomputes it;
 * with a fixture whose hash equalled sha256(snippet), "carried" and "recomputed" would be
 * indistinguishable and the test could not fail.
 */
const SENTINEL_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

const sensitiveFinding: Finding = {
  fingerprint: 'abc123fingerprint',
  file: 'src/auth/config.ts',
  line: 12,
  ruleId: 'SEC-001',
  category: 'hardcoded-secret',
  severity: 'critical',
  snippet: "const apiKey = 'sk-1234567890abcdef'",
  snippetHash: SENTINEL_HASH,
  message: 'Hardcoded API key detected at line 12',
  fixes: [{ description: 'Move to environment variable API_KEY' }],
  detector: 'regex',
  confidence: 0.95,
  executionId: '',
  reportedBy: [],
  isWaived: false,
};

const safeFinding: Finding = {
  fingerprint: 'def456fingerprint',
  file: 'src/analytics/tracker.ts',
  line: 5,
  ruleId: 'TRK-001',
  category: 'tracking-cookie',
  severity: 'low',
  snippet: "document.cookie = '_ga=' + gaId",
  snippetHash: SENTINEL_HASH,
  message: 'Analytics tracking cookie set',
  fixes: [{ description: 'Ensure cookie consent is obtained' }],
  detector: 'regex',
  confidence: 0.8,
  executionId: '',
  reportedBy: [],
  isWaived: false,
};

const consolidatedFinding: Finding = {
  fingerprint: 'cons-001',
  ruleId: 'PII-001',
  message: 'PII email detected in user service',
  severity: 'high',
  category: 'pii-email',
  file: 'src/user/service.ts',
  line: 42,
  detector: 'regex',
  confidence: 1.0,
  executionId: '',
  reportedBy: ['agent-a', 'agent-b'],
  snippet: "const email = user.email; // john@example.com",
  snippetHash: SENTINEL_HASH,
  isWaived: false,
};

/** Sensitive fixture with the two optional fields present, so "all fields" includes them. */
const sensitiveFindingFull: Finding = {
  ...sensitiveFinding,
  column: 7,
  legalReference: 'PCI-DSS 3.4',
};

/** A copy of `source` without the keys the redactor OWNS — what "all original fields" means. */
function withoutRedactionKeys(source: object): Record<string, unknown> {
  const { redactionLevel: _l, hasFullSnippet: _h, ...rest } = source as Record<string, unknown>;
  return rest;
}

/**
 * Several results in ONE SarifLog. `buildSarifLog` below always yields a single result, and
 * every `redactSarif` test used it with a sensitive category — so "for each sensitive result"
 * (B8) and "for every result" (B9) were never exercised against a second result or a safe one.
 * Measured: dropping the category decision, or replacing the loop with `results?.[0]`, kept
 * the whole suite green.
 */
function buildMultiResultSarifLog(
  results: Array<{ category: FindingCategory; snippetText: string }>,
): SarifLog {
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'gitgov-audit',
            version: '2.15.0',
            informationUri: 'https://gitgovernance.com',
          },
        },
        results: results.map((r, i) => ({
          ruleId: `SEC-00${i + 1}`,
          level: 'error' as const,
          message: { text: 'Sensitive data found' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: `src/file${i}.ts` },
                region: {
                  startLine: 12,
                  snippet: { text: r.snippetText },
                },
              },
            },
          ],
          properties: {
            'gitgov/category': r.category,
            'gitgov/detector': 'regex' as const,
            'gitgov/confidence': 0.95,
          },
        })),
      },
    ],
  };
}

function buildSarifLog(category: FindingCategory, snippetText: string): SarifLog {
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'gitgov-audit',
            version: '2.15.0',
            informationUri: 'https://gitgovernance.com',
          },
        },
        results: [
          {
            ruleId: 'SEC-001',
            level: 'error',
            message: { text: 'Sensitive data found' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/auth/config.ts' },
                  region: {
                    startLine: 12,
                    snippet: { text: snippetText },
                  },
                },
              },
            ],
            properties: {
              'gitgov/category': category,
              'gitgov/detector': 'regex',
              'gitgov/confidence': 0.95,
            },
          },
        ],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FindingRedactor', () => {
  const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);

  // ────────────────────────────────────────────────────────────────────────
  // 4.1. Types y Configuracion (RLDX-A1 a A5)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.1. Types y Configuracion (RLDX-A1 a A5)', () => {
    // RLDX-A1 is retired. Its test built a typed literal and asserted it against
    // itself; RedactionConfig arrives via `import type` and is erased, so at runtime it was
    // expect(['pii-email']).toEqual(['pii-email']) — nothing under src/redaction/ could turn it
    // red. The shape of a type is tsc's job; the real config's three fields are A2/A3/A4.

    // A2/A3 compare by VALUE, not by length. Measured by mutation: swapping 'pci-cvv' for a
    // second 'pci-pan' kept the length at 23 and every test green while pci-cvv silently fell
    // to defaultBehavior.
    it('[RLDX-A2] should include exactly the 24 sensitive categories in DEFAULT_REDACTION_CONFIG', () => {
      expect([...DEFAULT_REDACTION_CONFIG.sensitiveCategories].sort()).toEqual(
        [
          'pii-email', 'pii-phone', 'pii-financial', 'pii-health', 'pii-generic', 'hardcoded-secret',
          'pci-pan', 'pci-cvv', 'pci-track', 'pci-logging', 'pci-token-misuse', 'pci-last4',
          'pii-dob', 'pii-address', 'pii-national-id', 'pii-passport', 'pii-bank-account', 'pii-biometric',
          'storage-pii', 'storage-pci', 'crypto-weak', 'crypto-key', 'crypto-tls',
          'security-vulnerability',
        ].sort(),
      );
    });

    it('[RLDX-A3] should include exactly the 14 safe categories in DEFAULT_REDACTION_CONFIG', () => {
      expect([...DEFAULT_REDACTION_CONFIG.safeCategories].sort()).toEqual(
        [
          'logging-pii', 'tracking-cookie', 'tracking-analytics-id',
          'unencrypted-storage', 'third-party-transfer', 'unknown-risk',
          'logging-auth', 'logging-error', 'logging-debug', 'logging-trace',
          'data-transfer', 'privacy-consent', 'privacy-retention',
          'code-quality',
        ].sort(),
      );
    });

    it('[RLDX-A4] should have defaultBehavior equal to redact in DEFAULT_REDACTION_CONFIG', () => {
      expect(DEFAULT_REDACTION_CONFIG.defaultBehavior).toBe('redact');
    });

    it('[RLDX-A5] should carry all finding fields plus redactionLevel hasFullSnippet and snippetHash', () => {
      // "All fields" is checked structurally: the result minus the two keys the redactor owns
      // must equal the source with the fields L1 redaction rewrites. Field-by-field, the
      // previous test pinned 6 of 14 required fields and none of the optional ones — a build()
      // that dropped detector, confidence, executionId or flipped isWaived stayed green.
      const redactedFinding = redactor.redact(sensitiveFindingFull, 'l1');
      const { fixes: _fixes, ...sourceWithoutFixes } = sensitiveFindingFull;
      expect(withoutRedactionKeys(redactedFinding)).toEqual({
        ...sourceWithoutFixes,
        snippet: '[REDACTED]',
        message: 'Sensitive finding (hardcoded-secret)',
      });
      // The three redaction-owned values, by VALUE — `toBeDefined()` passed for
      // hasFullSnippet: true on a redacted finding, the exact inversion this module prevents.
      expect(redactedFinding.redactionLevel).toBe('l1');
      expect(redactedFinding.hasFullSnippet).toBe(false);
      expect(redactedFinding.snippetHash).toBe(SENTINEL_HASH);

      // A finding with no `fixes` (and a multi-agent reportedBy) comes back whole as well.
      const redactedConsolidated = redactor.redact(consolidatedFinding, 'l1');
      expect(withoutRedactionKeys(redactedConsolidated)).toEqual({
        ...consolidatedFinding,
        snippet: '[REDACTED]',
        message: 'Sensitive finding (pii-email)',
      });
    });

    it('[RLDX-A6] should classify every built-in finding category in exactly one list', () => {
      const sensitive = new Set(DEFAULT_REDACTION_CONFIG.sensitiveCategories);
      const safe = new Set(DEFAULT_REDACTION_CONFIG.safeCategories);

      const unclassified = BASE_FINDING_CATEGORIES.filter((c) => !sensitive.has(c) && !safe.has(c));
      const inBoth = BASE_FINDING_CATEGORIES.filter((c) => sensitive.has(c) && safe.has(c));

      // Named, so the failure says WHICH category was added to core without a policy.
      expect(unclassified).toEqual([]);
      expect(inBoth).toEqual([]);
      // ANTI-VACUITY: the domain really was iterated (38 built-ins, two lists that partition it).
      expect(sensitive.size + safe.size).toBe(BASE_FINDING_CATEGORIES.length);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4.2. FindingRedactor Logic (RLDX-B1 a B11)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.2. FindingRedactor Logic (RLDX-B1 a B11)', () => {
    it('[RLDX-B1] should return all original fields with redactionLevel l2 when level is l2', () => {
      const result = redactor.redact(sensitiveFindingFull, 'l2');

      // "All original fields intact", structurally — including snippetHash, the field this
      // module exists to carry (an L2 path that destroyed it broke RLDX-F4/G1 with the L2 unit
      // test green), and reportedBy.
      expect(withoutRedactionKeys(result)).toEqual(sensitiveFindingFull);
      expect(result.fixes).toBe(sensitiveFindingFull.fixes);
      expect(result.redactionLevel).toBe('l2');
      expect(result.hasFullSnippet).toBe(true);
    });

    it('[RLDX-B2] should replace snippet with [REDACTED] and set hasFullSnippet false for sensitive category at l1', () => {
      const result = redactor.redact(sensitiveFinding, 'l1');

      expect(result.snippet).toBe('[REDACTED]');
      expect(result.hasFullSnippet).toBe(false);
      expect(result.redactionLevel).toBe('l1');
    });

    it('[RLDX-B3] should carry the incoming snippetHash unchanged at every level and never recompute it', () => {
      // The identity rule (AUDIT-K5/K6): createFinding computes snippetHash once, everyone
      // else transports it. The fixture's hash is a sentinel, so a redactor that recomputed
      // sha256(snippet) turns this red.
      expect(sha256(sensitiveFinding.snippet)).not.toBe(SENTINEL_HASH);

      expect(redactor.redact(sensitiveFinding, 'l1').snippetHash).toBe(SENTINEL_HASH); // sensitive, redacted
      expect(redactor.redact(safeFinding, 'l1').snippetHash).toBe(SENTINEL_HASH); // safe, kept
      expect(redactor.redact(sensitiveFinding, 'l2').snippetHash).toBe(SENTINEL_HASH); // l2, kept
    });

    it('[RLDX-B4] should genericize message and omit the fixes key for sensitive category', () => {
      expect('fixes' in sensitiveFinding).toBe(true);

      const result = redactor.redact(sensitiveFinding, 'l1');

      expect(result.message).toContain('hardcoded-secret');
      expect(result.message).not.toBe(sensitiveFinding.message);
      // Omitted, not `undefined`: `Finding.fixes?: Fix[]` does not admit an explicit undefined
      // under exactOptionalPropertyTypes, and only the `in` check can tell the two apart.
      expect('fixes' in result).toBe(false);
    });

    it('[RLDX-B4] should not introduce a fixes key on a finding that never had one', () => {
      // Under `exactOptionalPropertyTypes`, assigning `undefined` to an absent optional key
      // ADDS the key, so a finding with no `fixes` would come back carrying
      // `fixes: undefined`. The key is deleted from the copy instead, which is a no-op when
      // it was never there.
      const withoutFixes: Finding = { ...sensitiveFinding };
      delete withoutFixes.fixes;
      expect('fixes' in withoutFixes).toBe(false);

      const result = redactor.redact(withoutFixes, 'l1');

      // `toBeUndefined()` is NOT the discriminating assertion here — it passes whether the key
      // is absent or present-with-undefined. Only the `in` check separates the two.
      expect('fixes' in result).toBe(false);

      // ANTI-VACUITY: the redaction really ran, so this is not passing because nothing happened.
      expect(result.snippet).toBe('[REDACTED]');
    });

    it('[RLDX-B5] should return all original fields with hasFullSnippet true for safe category at l1', () => {
      const result = redactor.redact(safeFinding, 'l1');

      expect(withoutRedactionKeys(result)).toEqual(safeFinding);
      expect(result.fixes).toBe(safeFinding.fixes);
      expect(result.hasFullSnippet).toBe(true);
      expect(result.redactionLevel).toBe('l1');
    });

    it('[RLDX-B6] should apply full redaction for unregistered category when defaultBehavior is redact', () => {
      const unregisteredFinding: Finding = {
        ...sensitiveFinding,
        category: 'custom-unknown-category',
      };

      const result = redactor.redact(unregisteredFinding, 'l1');

      // "Full redaction" is B2 + B3 + B4 together. Asserting only the snippet let a mutation
      // that genericized the message and dropped fixes ONLY for explicitly-listed categories
      // ship the original message and fixes of an unregistered one to Git with every test
      // green. This is the path a brand-new category takes on its
      // first scan — the highest-risk path in the module.
      expect(result.snippet).toBe('[REDACTED]');
      expect(result.hasFullSnippet).toBe(false);
      expect(result.message).toBe('Sensitive finding (custom-unknown-category)');
      expect('fixes' in result).toBe(false);
      expect(result.snippetHash).toBe(SENTINEL_HASH);
    });

    it('[RLDX-B7] should return original fields intact for unregistered category when defaultBehavior is keep', () => {
      const keepConfig: RedactionConfig = { ...DEFAULT_REDACTION_CONFIG, defaultBehavior: 'keep' };
      const keepRedactor = new FindingRedactor(keepConfig);
      const unregisteredFinding: Finding = {
        ...safeFinding,
        category: 'new-unknown-category',
      };

      const result = keepRedactor.redact(unregisteredFinding, 'l1');

      expect(withoutRedactionKeys(result)).toEqual(unregisteredFinding);
      expect(result.hasFullSnippet).toBe(true);
    });

    it('[RLDX-B8] should redact snippet.text in SARIF for sensitive categories at l1', () => {
      // One sensitive and one safe result in the SAME SarifLog. The word "sensitive" in the
      // requirement is only exercised when a non-sensitive result sits next to it: with a
      // single sensitive result, redacting every L1 snippet unconditionally passed.
      const secret = "const secret = 'my-secret-key'";
      const cookie = "document.cookie = 'session=abc'";
      const sarif = buildMultiResultSarifLog([
        { category: 'hardcoded-secret', snippetText: secret },
        { category: 'tracking-cookie', snippetText: cookie },
      ]);

      const result = redactor.redactSarif(sarif, 'l1');
      const [sensitive, safe] = result.runs[0]!.results;

      expect(sensitive!.locations[0]!.physicalLocation.region.snippet?.text).toBe('[REDACTED]');
      // The other half of the L1 contract: a safe category keeps its snippet in Git.
      expect(safe!.locations[0]!.physicalLocation.region.snippet?.text).toBe(cookie);
    });

    it('[RLDX-B9] should store snippetHash in SARIF properties for all results with snippets', () => {
      // "For every result" and "for any level". The previous fixture had one result and ran
      // l1 only, so replacing the loop with `results?.[0]` left every SARIF test green — and a
      // multi-result SARIF is the normal production shape. Two results, both levels, and the
      // VALUE of each hash asserted against its own snippet.
      const secret = "const secret = 'my-secret-key'";
      const cookie = "document.cookie = 'session=abc'";

      for (const level of ['l1', 'l2'] as const) {
        const sarif = buildMultiResultSarifLog([
          { category: 'hardcoded-secret', snippetText: secret },
          { category: 'tracking-cookie', snippetText: cookie },
        ]);
        const result = redactor.redactSarif(sarif, level);
        const [first, second] = result.runs[0]!.results;

        expect(first!.properties?.['gitgov/snippetHash']).toBe(sha256(secret));
        expect(second!.properties?.['gitgov/snippetHash']).toBe(sha256(cookie));
      }
    });

    it('[RLDX-B9] should keep a transported snippetHash instead of recomputing it', () => {
      // SarifBuilder already writes finding.snippetHash (computed once by createFinding) into
      // gitgov/snippetHash. Overwriting it with sha256(text) would be a second computation of
      // a transported value, the class AUDIT-K5 closed for fingerprint.
      // Sentinel ≠ sha256(text), so a recompute turns this red. Both levels.
      const secret = "const secret = 'my-secret-key'";
      expect(sha256(secret)).not.toBe(SENTINEL_HASH);

      for (const level of ['l1', 'l2'] as const) {
        const sarif = buildMultiResultSarifLog([{ category: 'hardcoded-secret', snippetText: secret }]);
        sarif.runs[0]!.results[0]!.properties!['gitgov/snippetHash'] = SENTINEL_HASH;

        const result = redactor.redactSarif(sarif, level);

        expect(result.runs[0]!.results[0]!.properties?.['gitgov/snippetHash']).toBe(SENTINEL_HASH);
      }
    });

    it('[RLDX-B10] should preserve snippet and add snippetHash for l2', () => {
      const originalSnippet = "const secret = 'my-secret-key'";
      const sarif = buildSarifLog('hardcoded-secret', originalSnippet);
      const result = redactor.redactSarif(sarif, 'l2');

      const sarifResult = result.runs[0]!.results[0]!;
      const snippetText = sarifResult.locations[0]!.physicalLocation.region.snippet?.text;
      // Snippet preserved (NOT redacted) for L2
      expect(snippetText).toBe(originalSnippet);
      // The VALUE of the hash, not its shape. `toMatch(/^[a-f0-9]{64}$/)` accepted
      // sha256('[REDACTED]') — also 64 hex chars — so an L2 path hashing the wrong input stayed
      // green. Downstream that is not cosmetic: audit_projection reads this hash into
      // GitgovFinding.snippetHash, and a wrong one flips every RLDX-F4 verification to
      // `unverified` with no test failing anywhere.
      expect(sarifResult.properties?.['gitgov/snippetHash']).toBe(sha256(originalSnippet));
    });

    it('[RLDX-B11] should not mutate the original SarifLog', () => {
      // redactSarif writes two things: snippet.text (l1 only) and properties['gitgov/snippetHash']
      // (both levels). Reading back only the snippet after an l1 call let a deep copy that ALSO
      // stamped the hash on the original pass. Whole-object snapshot, both levels.
      const originalSnippet = "const secret = 'my-secret-key'";
      const sarif = buildSarifLog('hardcoded-secret', originalSnippet);
      const snapshot = JSON.parse(JSON.stringify(sarif));

      for (const level of ['l1', 'l2'] as const) {
        const result = redactor.redactSarif(sarif, level);

        expect(sarif).toEqual(snapshot);
        // ANTI-VACUITY: the copy really was written, so equality above is not "nothing ran".
        expect(result.runs[0]!.results[0]!.properties?.['gitgov/snippetHash']).toBe(sha256(originalSnippet));
        expect(result).not.toBe(sarif);
      }
    });
  });
});
