/**
 * Finding identity — the one place it is computed.
 *
 * Spec: audit_record_types_module.md §4.11 (AUDIT-K2, K3, K4)
 *
 * `fingerprint` answers "which finding is this", and nothing else does. `ruleId`,
 * `detector`, `line` and `column` describe the DETECTION and stay out of the preimage:
 * two agents matching the same text in the same file and category are one finding, and
 * the same secret at a different line is the same finding.
 *
 * Only `createFinding` calls into here (AUDIT-K1). Consumers transport the value with
 * `rehydrateFinding` and compare by equality — they never recompute, because by then the
 * anchor is gone and the snippet may be truncated or redacted.
 */

import { createHash } from 'node:crypto';
import type { FindingCategory } from './types';

/**
 * [AUDIT-K2] Version tag hashed INSIDE the preimage, deliberately not a column.
 *
 * Identities of different natures coexist under one formula — code, devices, tokens whose
 * anchor arrives pre-hashed — with no runtime branching. If the formula ever changes, the
 * tag changes with it and every stored value is recomputed in one backfill: there is no
 * dual-lookup and no `fingerprintVersion` to carry forever (input #19 §0.4 S4/S5).
 */
export const FINGERPRINT_SCHEME = 'gitgov-fp/2';

/** Separator between the preimage parts. */
const SEPARATOR = '|';

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
  const preimage = [
    FINGERPRINT_SCHEME,
    input.file,
    input.category,
    normalizeAnchor(input.anchor),
  ].join(SEPARATOR);

  return createHash('sha256').update(preimage).digest('hex');
}
