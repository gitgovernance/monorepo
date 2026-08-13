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
export { createFinding, verifySnippet, createFix, createWaiver, createScan } from "./types";
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
