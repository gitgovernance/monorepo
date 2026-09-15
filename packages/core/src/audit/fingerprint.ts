/**
 * Finding identity — the one place it is computed.
 *
 * Spec: audit_record_types_module.md §4.11 (AUDIT-K2, K3, K4, K7, K8)
 *
 * `fingerprint` answers "which finding is this", and nothing else does. `ruleId`,
 * `detector`, `line` and `column` describe the DETECTION and stay out of the preimage:
 * two agents matching the same text in the same file and category are one finding, and
 * the same secret at a different line is the same finding.
 *
 * Producers reach here through `createFinding` (AUDIT-K1). Consumers transport the value
 * with `rehydrateFinding` and compare by equality; only a SARIF result that arrives without
 * the key is derived again, through `identifySarifResult` (AUDIT-N1).
 *
 * [AUDIT-K8] Every value is written `<scheme>:<digest>` (fingerprint_format.ts). The scheme tag
 * opens the preimage too, so two schemes can never produce the same digest, and it prefixes the
 * value, so any stored copy says which formula produced it. Changing the formula means a new
 * scheme tag: values under the old one stop matching and are recognizable as older, never
 * silently confused with a finding that disappeared.
 */

import { createHash } from 'node:crypto';
import type { FindingCategory } from './types';
import { FINGERPRINT_SCHEME, REGION_FINGERPRINT_SCHEME, formatFingerprint } from './fingerprint_format';
import type { FingerprintScheme } from './fingerprint_format';

export {
  FINGERPRINT_SCHEME,
  REGION_FINGERPRINT_SCHEME,
  CURRENT_FINGERPRINT_SCHEMES,
  SARIF_FINGERPRINT_KEY,
  formatFingerprint,
  parseFingerprint,
  isCurrentFingerprint,
  fingerprintDigest,
} from './fingerprint_format';
export type { FingerprintScheme } from './fingerprint_format';

/**
 * [AUDIT-K2] [AUDIT-K8] The preimage is the JSON encoding of its parts, not a join, opened by the
 * scheme tag. `file` is a URI and `category` is open (AUDIT-E2), so either can contain any
 * separator a join would use, and moving it between two parts would give two findings one
 * identity. A JSON array decodes to exactly one list of parts.
 */
function hashPreimage(scheme: FingerprintScheme, parts: ReadonlyArray<string | number | null>): string {
  const digest = createHash('sha256').update(JSON.stringify([scheme, ...parts])).digest('hex');
  return formatFingerprint(scheme, digest);
}

/**
 * [AUDIT-K3] Trim and collapse runs of whitespace to a single space.
 *
 * Deliberately NOT applied: lowercase, because case is semantic in a secret and folding it
 * would merge two distinct credentials under one waiver; and comment stripping, because it
 * is language-dependent and `//` inside a string literal is not a comment. Both would
 * create collisions between values that are genuinely different.
 *
 * No-op over hex and HMAC strings, so an anchor that arrives already hashed passes through
 * unchanged.
 */
export function normalizeAnchor(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * [AUDIT-K2] [AUDIT-K4] Compute the identity of a finding.
 *
 * `file` is the artifact URI exactly as the detector emitted it, synthetic schemes included
 * (`device://…`, `platform://…`). `category` is the FindingCategory as emitted, hyphenated —
 * the projection maps it later (AUDIT-E4) and never recomputes from the mapped value.
 * `anchor` is the text the detector matched; it survives a reformat that splits the line,
 * where the line itself does not.
 *
 * [AUDIT-K4] The input type admits these three fields and no others: detection metadata
 * cannot reach the preimage even by accident.
 */
export function computeFingerprint(input: {
  file: string;
  category: FindingCategory;
  anchor: string;
}): string {
  return hashPreimage(FINGERPRINT_SCHEME, [input.file, input.category, normalizeAnchor(input.anchor)]);
}

/**
 * [AUDIT-K7] The identity of a finding that carries no text to anchor on: an empty match, an
 * empty snippet, or a tool placeholder standing where the matched lines should be.
 *
 * Hashing the empty anchor instead gave every such finding of a file and category ONE
 * identity, so the consolidation kept the first and dropped the rest from the report and the
 * policy. Coordinates do not survive an inserted line, which is why this is the degraded path
 * and never the normal one. `ruleId` is part of it on purpose, unlike AUDIT-K4: with no text
 * there is no cross-agent merge to preserve, and without it two rules at one position collapse.
 * Its own scheme tag keeps any text anchor from reproducing a region identity.
 */
export function computeRegionFingerprint(input: {
  file: string;
  category: FindingCategory;
  ruleId: string;
  line: number;
  column?: number;
}): string {
  return hashPreimage(REGION_FINGERPRINT_SCHEME, [
    input.file,
    input.category,
    input.ruleId,
    input.line,
    input.column ?? null,
  ]);
}
