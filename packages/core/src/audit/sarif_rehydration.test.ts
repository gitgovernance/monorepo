/**
 * SARIF rehydration tests — one way back from a SARIF result to a Finding.
 *
 * Spec: audit_record_types_module.md §4.14 (AUDIT-N1, N2, N3)
 */

import { createHash } from 'node:crypto';
import { computeFingerprint, SARIF_FINGERPRINT_KEY } from './fingerprint';
import {
  identifySarifResult,
  transportedSnippetHash,
  rehydrateSarifResult,
  describeSarifDiscard,
} from './sarif_rehydration';
import type { TransportedSarifResult } from './sarif_rehydration';
import { REDACTED_SNIPPET } from './types';
import type { SarifResult } from '../sarif/sarif.types';

function result(overrides: {
  fingerprint?: string;
  file?: string;
  snippet?: string;
  category?: string;
  snippetHash?: string;
  detector?: string;
  level?: string;
  column?: number;
}): TransportedSarifResult {
  const properties: Record<string, unknown> = {};
  if (overrides.category !== undefined) properties['gitgov/category'] = overrides.category;
  if (overrides.snippetHash !== undefined) properties['gitgov/snippetHash'] = overrides.snippetHash;
  if (overrides.detector !== undefined) properties['gitgov/detector'] = overrides.detector;
  return {
    ruleId: 'SEC-001',
    ...(overrides.level !== undefined ? { level: overrides.level } : {}),
    message: { text: 'Hardcoded secret' },
    locations: overrides.file === undefined ? [] : [
      {
        physicalLocation: {
          artifactLocation: { uri: overrides.file },
          region: {
            startLine: 7,
            ...(overrides.column !== undefined ? { startColumn: overrides.column } : {}),
            ...(overrides.snippet !== undefined ? { snippet: { text: overrides.snippet } } : {}),
          },
        },
      },
    ],
    ...(overrides.fingerprint !== undefined ? { fingerprints: { [SARIF_FINGERPRINT_KEY]: overrides.fingerprint } } : {}),
    properties,
  };
}

describe('4.14. SARIF rehydration (AUDIT-N1 to N3)', () => {
  describe('AUDIT-N1 — identity', () => {
    it('[AUDIT-N1] should keep a transported fingerprint and derive a missing one from the snippet', () => {
      expect(identifySarifResult(result({ fingerprint: 'f'.repeat(64), file: 'src/a.ts', snippet: 'sk_live_x' })))
        .toEqual({ fingerprint: 'f'.repeat(64) });

      const derived = identifySarifResult(result({ file: 'src/a.ts', snippet: 'sk_live_x', category: 'hardcoded-secret' }));
      expect(derived).toEqual({
        fingerprint: computeFingerprint({ file: 'src/a.ts', category: 'hardcoded-secret', anchor: 'sk_live_x' }),
      });

      // An empty key is a missing key, not an identity every such result would share.
      expect(identifySarifResult(result({ fingerprint: '', file: 'src/a.ts', snippet: 'sk_live_x', category: 'hardcoded-secret' })))
        .toEqual(derived);

      // A result that declares no category is `unknown-risk` for every consumer.
      expect(identifySarifResult(result({ file: 'src/a.ts', snippet: 'sk_live_x' }))).toEqual({
        fingerprint: computeFingerprint({ file: 'src/a.ts', category: 'unknown-risk', anchor: 'sk_live_x' }),
      });
    });

    it('[AUDIT-N1] should discard a result without the key whose snippet is redacted, empty or a placeholder', () => {
      expect(identifySarifResult(result({ file: 'src/a.ts', snippet: REDACTED_SNIPPET }))).toEqual({ discarded: 'redacted-snippet' });
      expect(identifySarifResult(result({ file: 'src/a.ts', snippet: '' }))).toEqual({ discarded: 'no-anchor-text' });
      expect(identifySarifResult(result({ file: 'src/a.ts' }))).toEqual({ discarded: 'no-anchor-text' });
      expect(identifySarifResult(result({ file: 'src/a.ts', snippet: 'requires login' }))).toEqual({ discarded: 'no-anchor-text' });
      expect(identifySarifResult(result({ snippet: 'sk_live_x' }))).toEqual({ discarded: 'no-location' });
      expect(describeSarifDiscard('redacted-snippet')).toBe('no fingerprint key and a redacted snippet');

      // Negative control — anchoring on the redacted text, as the SaaS projection did: two
      // different L1 secrets of one file and category get one identity, and neither matches
      // a waiver written over the L2 value.
      const onSentinel = (file: string) => computeFingerprint({ file, category: 'hardcoded-secret', anchor: REDACTED_SNIPPET });
      expect(onSentinel('src/a.ts')).toBe(onSentinel('src/a.ts'));
      expect(onSentinel('src/a.ts')).not.toBe(computeFingerprint({ file: 'src/a.ts', category: 'hardcoded-secret', anchor: 'sk_live_x' }));
    });
  });

  describe('AUDIT-N2 — transported snippetHash', () => {
    it('[AUDIT-N2] should read the transported snippetHash and never hash the redacted snippet', () => {
      const l2Hash = createHash('sha256').update('const k = "sk_live_x"').digest('hex');
      const l1 = result({ fingerprint: 'f'.repeat(64), file: 'src/a.ts', snippet: REDACTED_SNIPPET, snippetHash: l2Hash });

      expect(transportedSnippetHash(l1)).toBe(l2Hash);
      expect(transportedSnippetHash(result({ file: 'src/a.ts', snippetHash: '' }))).toBeUndefined();

      const rehydrated = rehydrateSarifResult(l1, { executionId: 'exec-1', reportedBy: ['agent:a'] });
      expect('finding' in rehydrated && rehydrated.finding.snippetHash).toBe(l2Hash);

      // Negative control — without the transported value, the hash of the sentinel is what a
      // rehydration lands on, and the L1↔L2 bridge (RLDX-F2) breaks.
      const withoutHash = rehydrateSarifResult(
        result({ fingerprint: 'f'.repeat(64), file: 'src/a.ts', snippet: REDACTED_SNIPPET }),
        { executionId: 'exec-1', reportedBy: [] },
      );
      expect('finding' in withoutHash && withoutHash.finding.snippetHash).toBe(
        createHash('sha256').update(REDACTED_SNIPPET).digest('hex'),
      );
    });
  });

  describe('AUDIT-N3 — the Finding', () => {
    it('[AUDIT-N3] should rebuild the Finding fields from the result and the context', () => {
      const rehydrated = rehydrateSarifResult(
        result({ fingerprint: 'f'.repeat(64), file: 'src/a.ts', snippet: 'sk', category: 'hardcoded-secret', detector: 'heuristic', level: 'warning', column: 3 }),
        { executionId: 'exec-9', reportedBy: ['agent:a'] },
      );
      if (!('finding' in rehydrated)) throw new Error('expected a finding');
      expect(rehydrated.finding).toMatchObject({
        fingerprint: 'f'.repeat(64),
        ruleId: 'SEC-001',
        file: 'src/a.ts',
        line: 7,
        column: 3,
        snippet: 'sk',
        category: 'hardcoded-secret',
        severity: 'high',
        detector: 'heuristic',
        confidence: 1,
        executionId: 'exec-9',
        reportedBy: ['agent:a'],
        isWaived: false,
      });

      // A detector outside the domain is not carried as if it were one.
      const external = rehydrateSarifResult(
        result({ fingerprint: 'e'.repeat(64), file: 'src/a.ts', detector: 'semgrep' }),
        { executionId: 'exec-9', reportedBy: [] },
      );
      expect('finding' in external && external.finding.detector).toBe('regex');

      expect(rehydrateSarifResult(result({ file: 'src/a.ts', snippet: '' }), { executionId: 'x', reportedBy: [] }))
        .toEqual({ discarded: 'no-anchor-text' });
    });

    it('[AUDIT-N3] should accept a SarifResult as it is typed by the sarif module', () => {
      // Compile-time: the structural input admits the sarif module's type without a cast.
      const typed: SarifResult = {
        ruleId: 'SEC-001',
        level: 'error',
        message: { text: 'm' },
        locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.ts' }, region: { startLine: 1, snippet: { text: 'sk' } } } }],
        fingerprints: { [SARIF_FINGERPRINT_KEY]: 'd'.repeat(64) },
      };
      expect(identifySarifResult(typed)).toEqual({ fingerprint: 'd'.repeat(64) });
    });
  });
});
