/**
 * The written form of a finding identity — how a fingerprint says which formula produced it.
 *
 * Spec: audit_record_types_module.md §4.11 (AUDIT-K8)
 *
 * A fingerprint is stored and transported as `<scheme>:<digest>`: the scheme tag that also opens
 * the hashed preimage, a colon, and 64 lowercase hex chars. The version travels inside the value,
 * so every copy of it — a Finding row, a signed waiver, a SARIF result — says which formula made
 * it, and a waiver written under an earlier formula can be told apart from one whose finding is
 * gone. There is no separate version field to keep in step with the value.
 *
 * No imports: the web client reads fingerprints too, and this file must not pull a Node builtin.
 */

/** [AUDIT-K2] Scheme of an identity anchored on content. */
export const FINGERPRINT_SCHEME = 'gitgov-fp/2';

/** [AUDIT-K7] Scheme of the degraded identity anchored on rule and position. */
export const REGION_FINGERPRINT_SCHEME = 'gitgov-fp/2+pos';

/**
 * [AUDIT-K8] The schemes the current code produces. A fingerprint under any other scheme was
 * produced by an earlier formula and can never equal one computed today.
 */
export const CURRENT_FINGERPRINT_SCHEMES = [FINGERPRINT_SCHEME, REGION_FINGERPRINT_SCHEME] as const;
export type FingerprintScheme = (typeof CURRENT_FINGERPRINT_SCHEMES)[number];

/**
 * [SARIF-N1] The SARIF `fingerprints` key the identity travels under. It names the slot, not the
 * formula: the value carries its own scheme (AUDIT-K8), so the key does not change when the
 * formula does.
 */
export const SARIF_FINGERPRINT_KEY = 'gitgov/v2';

const SEPARATOR = ':';
const DIGEST = /^[a-f0-9]{64}$/;

/** [AUDIT-K8] The written form of a fingerprint: `<scheme>:<digest>`. */
export function formatFingerprint(scheme: FingerprintScheme, digest: string): string {
  return `${scheme}${SEPARATOR}${digest}`;
}

/**
 * [AUDIT-K8] Scheme and digest of a written fingerprint, or `undefined` when the value is not in
 * that form — a value written before fingerprints carried their scheme, or not a fingerprint.
 */
export function parseFingerprint(value: string): { scheme: string; digest: string } | undefined {
  const at = value.indexOf(SEPARATOR);
  if (at <= 0) return undefined;
  const digest = value.slice(at + 1);
  return DIGEST.test(digest) ? { scheme: value.slice(0, at), digest } : undefined;
}

/** [AUDIT-K8] Whether a fingerprint was produced by a scheme the current code produces. */
export function isCurrentFingerprint(value: string): boolean {
  const parsed = parseFingerprint(value);
  return parsed !== undefined && (CURRENT_FINGERPRINT_SCHEMES as readonly string[]).includes(parsed.scheme);
}

/**
 * [AUDIT-K8] The part of a fingerprint a person reads and types: its digest, or the whole value
 * when it has no scheme. Short forms shown to users are prefixes of this, never of the scheme.
 */
export function fingerprintDigest(value: string): string {
  return parseFingerprint(value)?.digest ?? value;
}
