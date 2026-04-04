/**
 * @module audit/types
 *
 * Canonical types for the Audit product — CENTRAL DEFINITION.
 *
 * All modules in core (finding_detector, audit_orchestrator, source_auditor,
 * policy_evaluator) IMPORT from here. This is the single source of truth.
 *
 * Protocol grounding:
 *   - Finding      ← extracted from ExecutionRecord.metadata (SARIF results)
 *   - Waiver       ← materialized from FeedbackRecord(type:"approval")
 *   - PolicyDecision ← extracted from ExecutionRecord(type:"decision").metadata
 *   - Scan         ← groups ExecutionRecords from one audit run
 *
 * Projection contract:
 *   - FS/Prisma projections MUST extend these types with `&` or `extends`
 *   - Never rename fields, never remove fields
 *
 * Import paths:
 *   - `@gitgov/core/audit` (specific)
 *   - `@gitgov/core` (main barrel, re-exports everything)
 */

import type { GitGovFeedbackRecord } from "../record_types";
import type { SarifLog } from "../sarif/sarif.types";

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * Finding categories detectable by the Audit product.
 */
export type FindingCategory =
  | "pii-email"
  | "pii-phone"
  | "pii-financial"
  | "pii-health"
  | "pii-generic"
  | "hardcoded-secret"
  | "logging-pii"
  | "tracking-cookie"
  | "tracking-analytics-id"
  | "unencrypted-storage"
  | "third-party-transfer"
  | "unknown-risk";

/**
 * Severity levels for governance prioritization.
 * No "info" — every Finding has a governance action (fix, waive, or block).
 */
export type FindingSeverity = "critical" | "high" | "medium" | "low";

/**
 * Identifier of the detector that generated the finding.
 */
export type DetectorName = "regex" | "heuristic" | "llm";

// ─── Status enums (product-level) ────────────────────────────────────────────

/**
 * Waiver lifecycle status.
 */
export type WaiverStatus = "active" | "expired" | "revoked";

/**
 * Derived finding status (not stored in DB — computed from tracking fields).
 */
export type FindingStatus = "new" | "in_progress" | "waived" | "resolved";

/**
 * Scan display status (derived from PolicyDecision).
 */
export type ScanDisplayStatus = "success" | "partial" | "blocked";

/**
 * Scan scope — what files to audit.
 */
export type ScanScope = "full" | "diff";

// ─── Lifecycle events ─────────────────────────────────────────────────────────

/**
 * A single event in a finding's detection timeline.
 * Used to reconstruct the history of a finding across scans and waivers.
 *
 * Convention: `timestamp` is epoch number (consistent with BaseEvent in event_bus).
 * Type names follow `{domain}.{action}` pattern.
 */
export type FindingHistoryEvent =
  | { type: "finding.detected"; timestamp: number; scanNumber: number; branch: string; commitSha: string; commitAuthor?: string }
  | { type: "finding.waived"; timestamp: number; approvedBy: string; justification: string }
  | { type: "finding.waiver_revoked"; timestamp: number }
  | { type: "finding.task_created"; timestamp: number; taskTitle: string; taskRef: string }
  | { type: "finding.first_introduced"; timestamp: number; commitSha: string; branch: string; commitAuthor?: string; commitMessage?: string };

/**
 * A single event in a waiver's lifecycle timeline.
 *
 * Convention: `timestamp` is epoch number. Type names follow `{domain}.{action}` pattern.
 */
export type WaiverLifecycleEvent =
  | { type: "waiver.created"; timestamp: number }
  | { type: "waiver.approved"; timestamp: number; approvedBy: string }
  | { type: "waiver.revoked"; timestamp: number; revokedBy?: string }
  | { type: "waiver.expired"; timestamp: number };

/**
 * Policy decision outcome.
 */
export type PolicyStatus = "pass" | "block";

// ─── Metadata types (for ExecutionRecord<T>, ActorRecord<T>) ──────────────────

/**
 * Metadata shape for SARIF execution records.
 * Used as: ExecutionRecord<SarifExecutionMetadata>
 */
export type SarifExecutionMetadata = {
  kind: "sarif";
  version: "2.1.0";
  data: import("../sarif/sarif.types").SarifLog;
};

/**
 * Metadata shape for policy decision execution records.
 * Used as: ExecutionRecord<PolicyExecutionMetadata>
 */
export type PolicyExecutionMetadata = {
  kind: "policy-decision";
  version: "1.0.0";
  data: PolicyDecision;
};

/**
 * Metadata shape for actors linked to a GitHub account.
 * Used as: ActorRecord<GitHubActorMetadata>
 * Enables: actorId → actor.metadata.github.login → User lookup
 */
export type GitHubActorMetadata = {
  github: {
    login: string;
    id: number;
  };
};

// ─── Finding ──────────────────────────────────────────────────────────────────

/**
 * Canonical Finding type for the Audit product.
 *
 * Protocol grounding: Extracted from ExecutionRecord.metadata (SARIF results).
 *
 * This is THE Finding type. There is no "raw" vs "consolidated" vs "enriched".
 * Detectors produce it, the orchestrator fills enrichment fields (reportedBy,
 * isWaived, waiver), projections extend it. One type everywhere.
 *
 * Primary identity: `fingerprint` (content-based hash for dedup across agents/scans).
 */
export interface Finding {
  // ── Identity ──
  /** Content-based fingerprint for dedup across agents and scans */
  fingerprint: string;
  /** Rule ID that detected it (e.g., "PII-001", "SEC-002") */
  ruleId: string;

  // ── Location ──
  /** Relative file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (optional, 1-based) */
  column?: number;

  // ── Description ──
  /** Problem description */
  message: string;
  /** Source code snippet (optional — may be redacted in L1, absent in some detectors) */
  snippet?: string;
  /** Semantic category */
  category: FindingCategory;
  /** Severity for governance prioritization */
  severity: FindingSeverity;

  // ── Detection metadata ──
  /** Detector that generated the finding */
  detector: DetectorName;
  /** Confidence level 0.0-1.0 */
  confidence: number;

  // ── Remediation ──
  /** Proposed fixes — SARIF §3.55.4 standard */
  fixes?: Array<{ description: string }>;
  /** Legal reference (e.g., "GDPR Art. 5(1)(f)") */
  legalReference?: string;

  // ── Protocol traceability ──
  /** ExecutionRecord ID where this finding was detected */
  executionId: string;

  // ── Multi-agent enrichment (filled post-orchestration) ──
  /** Agent IDs that reported this finding (dedup when multiple agents detect same fingerprint) */
  reportedBy: string[];
  /** Whether this finding is suppressed by an active waiver */
  isWaived: boolean;
  /** Waiver details if suppressed */
  waiver?: Waiver;
}

// ─── Waiver ───────────────────────────────────────────────────────────────────

/**
 * Metadata stored in FeedbackRecord.metadata for waivers.
 *
 * Protocol grounding: FeedbackRecord(type: "approval", metadata: WaiverMetadata)
 */
export type WaiverMetadata = {
  /** SHA256 fingerprint for matching with Finding.fingerprint */
  fingerprint: string;
  /** Rule ID (e.g., "PII-001", "SEC-002") */
  ruleId: string;
  /** File path of the original finding */
  file: string;
  /** Line number of the original finding */
  line: number;
  /** Optional expiration date (ISO string). undefined = permanent */
  expiresAt?: string;
  /** Optional related TaskRecord ID */
  relatedTaskId?: string;
};

/**
 * Waiver loaded from a FeedbackRecord.
 * Bridges protocol layer (FeedbackRecord) to product layer (Finding.waiver).
 *
 * Protocol grounding: Materialized from FeedbackRecord<WaiverMetadata> where type="approval".
 */
export type Waiver = {
  /** Fingerprint for matching with Finding.fingerprint */
  fingerprint: string;
  /** Original rule ID */
  ruleId: string;
  /** Expiration date (undefined = permanent). Converted from ISO string to Date. */
  expiresAt?: Date;
  /** Original FeedbackRecord with full metadata — protocol link */
  /** Full record with header (Ed25519 signatures) + payload */
  feedback: GitGovFeedbackRecord;
};

// ─── Policy ───────────────────────────────────────────────────────────────────

/**
 * Result of policy evaluation against findings.
 *
 * Protocol grounding: Stored in ExecutionRecord(type:"decision").metadata.data
 */
export type PolicyDecision = {
  /** pass or block */
  decision: "pass" | "block";
  /** Human-readable reason */
  reason: string;
  /** ExecutionRecord ID where this decision was persisted */
  executionId: string;
  /** Findings that caused the block (empty if pass) */
  blockingFindings: Finding[];
  /** Findings suppressed by waivers */
  waivedFindings: Finding[];
  /** Count by severity (active findings only) */
  summary: Record<FindingSeverity, number>;
  /** Per-rule evaluation results */
  rulesEvaluated: PolicyRuleResult[];
  /** ISO 8601 timestamp */
  evaluatedAt: string;
};

/**
 * Result of evaluating a single policy rule.
 */
export type PolicyRuleResult = {
  ruleName: string;
  passed: boolean;
  reason: string;
};

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Aggregated summary of an audit run.
 */
export type AuditSummary = {
  /** Total findings (including waived) */
  total: number;
  /** Active (non-waived) findings by severity */
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** Count of waived/suppressed findings */
  suppressed: number;
  /** Number of agents executed */
  agentsRun: number;
  /** Number of agents that failed */
  agentsFailed: number;
};

/**
 * Result from a single audit agent execution.
 */
export type AgentAuditResult = {
  /** Agent identifier */
  agentId: string;
  /** SARIF log produced by the agent */
  sarif: SarifLog;
  /** ExecutionRecord ID for this agent run */
  executionId: string;
  /** Whether the agent succeeded or failed */
  status: "success" | "error";
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if status is "error" */
  errorMessage?: string;
};

/**
 * Result from a single review agent execution.
 */
export type ReviewAgentResult = {
  /** Agent identifier */
  agentId: string;
  /** Whether the agent succeeded or failed */
  status: "success" | "error";
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if status is "error" */
  errorMessage?: string;
  /** FeedbackRecord ID created by AgentRunner */
  feedbackRecordId?: string;
};

/**
 * Complete result of AuditOrchestrator.run().
 *
 * This is the EXACT type that `gitgov audit --output json` serializes
 * via JSON.stringify(result, null, 2). No transformation.
 */
export type AuditOrchestrationResult = {
  /** Findings from all agents, deduplicated by fingerprint, with waiver status */
  findings: Finding[];
  /** Per-agent execution results (original, unredacted — for L2 persistence) */
  agentResults: AgentAuditResult[];
  /** Per-agent results with redacted SARIF for L1 (Git) persistence */
  l1AgentResults?: AgentAuditResult[];
  /** Policy evaluation decision */
  policyDecision: PolicyDecision;
  /** Aggregated summary */
  summary: AuditSummary;
  /** ExecutionRecord IDs created during this run */
  executionIds: {
    /** One per agent scan */
    scans: string[];
    /** Policy evaluation execution */
    policy: string;
  };
  /** Warning message (e.g. when no audit agents are found) */
  warning?: string;
  /** Review agent results (optional) */
  reviewResults?: ReviewAgentResult[];
};

// ─── Scan ─────────────────────────────────────────────────────────────────────

/**
 * Canonical type for a Scan in the Audit product.
 *
 * A Scan = 1 run of `gitgov audit`:
 *   1 scan → N agents → N ExecutionRecords → findings deduplicated → Finding[]
 *   1 scan → 1 PolicyDecision
 *
 * Projections extend:
 *   Prisma: Scan & { id, repoId, scanNumber, branch, commitSha, ... }
 *   FS: Scan & { indexedAt, recordPaths, ... }
 */
export type Scan = {
  /** Scan scope */
  scope: "full" | "diff";
  /** Who/what triggered the scan (actor ID or "ci") */
  triggeredBy: string;
  /** ExecutionRecord IDs from agent runs (1 per agent) */
  executionRecordIds: string[];
  /** Policy evaluation ExecutionRecord ID */
  policyExecutionId?: string;
  /** Deduplicated findings from all agents */
  findings: Finding[];
  /** Policy evaluation result */
  policyDecision: PolicyDecision;
  /** Aggregated summary counts */
  summary: AuditSummary;
};
