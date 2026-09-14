/**
 * Rebuilding findings from SARIF results — the consumer side of the identity.
 *
 * Spec: audit_record_types_module.md §4.14 (AUDIT-N1, N2, N3)
 *
 * Every consumer that turns a SARIF result back into a Finding goes through here: the
 * orchestrator's consolidation, the policy re-evaluation, and the SaaS projection. Each one
 * used to derive the identity of a result without the key on its own terms — different
 * default categories, one discarding results without a snippet and another anchoring on an
 * empty or redacted one — so the same result could get three identities.
 *
 * The input type is structural: `audit/` is the module the others import, so it does not
 * import the SARIF types; a `SarifResult` satisfies it as is.
 */

import { computeFingerprint, SARIF_FINGERPRINT_KEY } from './fingerprint';
import { isAnchorText, isDetectorName, isRedactedSnippet, rehydrateFinding } from './types';
import type { DetectorName, Finding, FindingCategory, FindingSeverity } from './types';

/** The fields of a SARIF result that a rehydration reads. */
export type TransportedSarifResult = {
  ruleId: string;
  level?: string;
  message: { text: string };
  locations?: ReadonlyArray<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number; startColumn?: number; snippet?: { text?: string } };
    };
  }>;
  fingerprints?: Readonly<Record<string, string>>;
  properties?: Readonly<Record<string, unknown>>;
};

/** Why a result without the identity key could not be given one. */
export type SarifDiscardReason = 'no-location' | 'redacted-snippet' | 'no-anchor-text';

export type SarifIdentity =
  | { readonly fingerprint: string }
  | { readonly discarded: SarifDiscardReason };

export type SarifRehydration =
  | { readonly finding: Finding }
  | { readonly discarded: SarifDiscardReason };

/** Category of a result that declares none. */
export const UNDECLARED_SARIF_CATEGORY: FindingCategory = 'unknown-risk';

const DISCARD_DESCRIPTIONS: Readonly<Record<SarifDiscardReason, string>> = {
  'no-location': 'no fingerprint key and no artifact location',
  'redacted-snippet': 'no fingerprint key and a redacted snippet',
  'no-anchor-text': 'no fingerprint key and no snippet text to anchor on',
};

/** [AUDIT-N1] The words a warning uses for a discard, the same in every consumer. */
export function describeSarifDiscard(reason: SarifDiscardReason): string {
  return DISCARD_DESCRIPTIONS[reason];
}

/** [AUDIT-N1] The category a result declares, or `unknown-risk` when it declares none. */
export function categoryOfSarifResult(result: TransportedSarifResult): FindingCategory {
  const category = result.properties?.['gitgov/category'];
  return typeof category === 'string' && category !== '' ? category : UNDECLARED_SARIF_CATEGORY;
}

/**
 * [AUDIT-N1] The identity of a SARIF result.
 *
 * Transported first, byte for byte (AUDIT-K5). Without the key — an external tool — it is
 * derived from the snippet with the function the detectors use, and never from a position.
 * No identity is fabricated from a snippet that carries no text: an empty one, a tool
 * placeholder, or the redaction sentinel would give every such result of a file and category
 * the same value, and a redacted result could never be matched by a waiver written over L2.
 */
export function identifySarifResult(result: TransportedSarifResult): SarifIdentity {
  const transported = result.fingerprints?.[SARIF_FINGERPRINT_KEY];
  if (transported !== undefined && transported !== '') {
    return { fingerprint: transported };
  }

  const location = result.locations?.[0]?.physicalLocation;
  const file = location?.artifactLocation?.uri;
  if (file === undefined || file === '') {
    return { discarded: 'no-location' };
  }

  const snippet = location?.region?.snippet?.text;
  if (snippet !== undefined && isRedactedSnippet(snippet)) {
    return { discarded: 'redacted-snippet' };
  }
  if (!isAnchorText(snippet)) {
    return { discarded: 'no-anchor-text' };
  }

  return { fingerprint: computeFingerprint({ file, category: categoryOfSarifResult(result), anchor: snippet }) };
}

/**
 * [AUDIT-N2] The `snippetHash` a result carries in `properties["gitgov/snippetHash"]`.
 *
 * Transported, never recomputed by a consumer: an L1 result's snippet is the redaction
 * sentinel, and its hash would break the L1↔L2 bridge (RLDX-F2).
 */
export function transportedSnippetHash(result: TransportedSarifResult): string | undefined {
  const hash = result.properties?.['gitgov/snippetHash'];
  return typeof hash === 'string' && hash !== '' ? hash : undefined;
}

/** [AUDIT-N3] SARIF `level` to severity: error → critical, warning → high, note → medium. */
export function severityOfSarifLevel(level: string | undefined): FindingSeverity {
  switch (level) {
    case 'error':
      return 'critical';
    case 'warning':
      return 'high';
    case 'note':
      return 'medium';
    default:
      return 'low';
  }
}

function detectorOfSarifResult(result: TransportedSarifResult): DetectorName {
  const detector = result.properties?.['gitgov/detector'];
  return typeof detector === 'string' && isDetectorName(detector) ? detector : 'regex';
}

/**
 * [AUDIT-N3] A Finding rebuilt from a SARIF result, or the reason it was discarded.
 *
 * Identity from AUDIT-N1, `snippetHash` from AUDIT-N2, and the transport constructor
 * (AUDIT-K5) for the rest. The caller decides what a discard means for it and says so.
 */
export function rehydrateSarifResult(
  result: TransportedSarifResult,
  context: { executionId: string; reportedBy: ReadonlyArray<string> },
): SarifRehydration {
  const identity = identifySarifResult(result);
  if ('discarded' in identity) {
    return identity;
  }

  const region = result.locations?.[0]?.physicalLocation?.region;
  const column = region?.startColumn;
  const confidence = result.properties?.['gitgov/confidence'];
  const snippetHash = transportedSnippetHash(result);

  return {
    finding: rehydrateFinding({
      fingerprint: identity.fingerprint,
      ruleId: result.ruleId,
      file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? '',
      line: region?.startLine ?? 0,
      ...(column !== undefined ? { column } : {}),
      message: result.message.text,
      snippet: region?.snippet?.text ?? '',
      category: categoryOfSarifResult(result),
      severity: severityOfSarifLevel(result.level),
      detector: detectorOfSarifResult(result),
      confidence: typeof confidence === 'number' ? confidence : 1.0,
      executionId: context.executionId,
      reportedBy: [...context.reportedBy],
      isWaived: false,
      ...(snippetHash !== undefined ? { snippetHash } : {}),
    }),
  };
}
