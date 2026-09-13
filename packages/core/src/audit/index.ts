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
export { createFinding, rehydrateFinding, verifySnippet, countUnmatchedWaivers, createFix, createWaiver, createScan } from "./types";
// [AUDIT-K1] [AUDIT-K2] [AUDIT-K3] The identity, exported as VALUES and not only as types:
// audit_orchestrator and policy_evaluator CALL computeFingerprint for their fallback, and
// the saas-api backfill imports it across the package boundary. FINGERPRINT_SCHEME goes with
// them for the same reason as the enums of AUDIT-J1 — a bare literal type has no runtime
// representation, so every consumer would retype "gitgov-fp/2" by hand with no compiler
// watching the copies, and the scheme tag is precisely the thing that must never drift.
export { FINGERPRINT_SCHEME, normalizeAnchor, computeFingerprint } from "./fingerprint";
// [AUDIT-J1] Closed-domain enums are exported as a VALUE (the constant), not only as a
// type: without this the consumer cannot iterate them and re-enumerates them by hand.
export { FINDING_SEVERITIES, FINDING_STATUSES } from "./types";

export type {
  // Enums
  BaseFindingCategory,
  FindingCategory,
  FindingSeverity,
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
