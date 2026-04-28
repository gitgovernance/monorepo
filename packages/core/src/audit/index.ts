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

export type {
  // Enums
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
  AuditOrchestrationResult,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
  // Scan
  Scan,
} from "./types";
