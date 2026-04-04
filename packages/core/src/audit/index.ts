/**
 * @gitgov/core/audit — Canonical Audit product types
 *
 * Central definition. All modules import from here.
 *
 * Import: `import type { Finding, Waiver, Scan, PolicyDecision } from '@gitgov/core/audit'`
 * Also:   `import type { Finding, Waiver, Scan, PolicyDecision } from '@gitgov/core'`
 */
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
