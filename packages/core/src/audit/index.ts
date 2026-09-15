/**
 * @gitgov/core/audit — Canonical Audit product types + formatter
 *
 * Central definition. All modules import from here.
 *
 * Import: `import type { Finding, Waiver, Scan, PolicyDecision } from '@gitgov/core/audit'`
 * Also:   `import type { Finding, Waiver, Scan, PolicyDecision } from '@gitgov/core'`
 * Also:   `import { formatAuditResult, severityBadge } from '@gitgov/core/audit'`
 */
export { formatAuditResult, severityBadge } from "./formatter";
export {
  createFinding,
  rehydrateFinding,
  verifySnippet,
  countUnmatchedWaivers,
  countOutdatedWaivers,
  waiversForFiles,
  countBySeverity,
  isScanScope,
  isDetectorName,
  isAnchorText,
  createFix,
  createWaiver,
  createScan,
  REDACTED_SNIPPET,
} from "./types";
// [AUDIT-K1] [AUDIT-K2] [AUDIT-K3] [AUDIT-K7] The identity, exported as VALUES and not only as
// types. The scheme tags go with them for the same reason as the enums of AUDIT-J1 — a bare
// literal type has no runtime representation, so every consumer would retype "gitgov-fp/2" by
// hand with no compiler watching the copies, and a scheme tag must never drift.
export {
  FINGERPRINT_SCHEME,
  REGION_FINGERPRINT_SCHEME,
  CURRENT_FINGERPRINT_SCHEMES,
  SARIF_FINGERPRINT_KEY,
  normalizeAnchor,
  computeFingerprint,
  computeRegionFingerprint,
  formatFingerprint,
  parseFingerprint,
  isCurrentFingerprint,
  fingerprintDigest,
} from "./fingerprint";
export type { FingerprintScheme } from "./fingerprint";
// [AUDIT-N1] [AUDIT-N2] [AUDIT-N3] One way back from a SARIF result, for core and for the SaaS
// projection alike.
export {
  identifySarifResult,
  transportedSnippetHash,
  rehydrateSarifResult,
  describeSarifDiscard,
} from "./sarif_rehydration";
export type {
  TransportedSarifResult,
  SarifIdentity,
  SarifRehydration,
  SarifDiscardReason,
} from "./sarif_rehydration";
// [AUDIT-J1] Closed-domain enums are exported as a VALUE (the constant), not only as a
// type: without this the consumer cannot iterate them and re-enumerates them by hand.
export { FINDING_SEVERITIES, FINDING_STATUSES, SCAN_SCOPES, BASE_FINDING_CATEGORIES, DETECTOR_NAMES } from "./types";

export type {
  // Enums
  BaseFindingCategory,
  FindingCategory,
  FindingSeverity,
  SeverityCounts,
  DetectorName,
  // Status enums
  WaiverStatus,
  FindingStatus,
  ScanDisplayStatus,
  PolicyStatus,
  ScanScope,
  // Lifecycle events
  FindingHistoryEvent,
  WaiverLifecycleEvent,
  // Metadata types (for record generics)
  SarifExecutionMetadata,
  PolicyExecutionMetadata,
  GitHubActorMetadata,
  // Finding
  Finding,
  // Waiver
  Waiver,
  WaiverMetadata,
  // Policy
  PolicyDecision,
  PolicyRuleResult,
  // Orchestration
  AuditOrchestrationOptions,
  AuditOrchestrationResult,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
  // Scan
  Scan,
  // Fix
  Fix,
} from "./types";
