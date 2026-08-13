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
 * [AUDIT-E1] Base finding categories built into core. Agents get autocomplete for these
 * values while remaining free to use any string as a category.
 */
export type BaseFindingCategory =
  // Original 6 sensitive
  | "pii-email"
  | "pii-phone"
  | "pii-financial"
  | "pii-health"
  | "pii-generic"
  | "hardcoded-secret"
  // PCI (Group A) sensitive
  | "pci-pan"
  | "pci-cvv"
  | "pci-track"
  | "pci-logging"
  | "pci-token-misuse"
  | "pci-last4"
  // PII extended (Group B) sensitive
  | "pii-dob"
  | "pii-address"
  | "pii-national-id"
  | "pii-passport"
  | "pii-bank-account"
  | "pii-biometric"
  // Storage/Crypto (Group E) sensitive
  | "storage-pii"
  | "storage-pci"
  | "crypto-weak"
  | "crypto-key"
  | "crypto-tls"
  // Original 6 safe
  | "logging-pii"
  | "tracking-cookie"
  | "tracking-analytics-id"
  | "unencrypted-storage"
  | "third-party-transfer"
  | "unknown-risk"
  // Logging extended (Group C) safe
  | "logging-auth"
  | "logging-error"
  | "logging-debug"
  | "logging-trace"
  // Transfer/Consent (Group D) safe
  | "data-transfer"
  | "privacy-consent"
  | "privacy-retention"
  // SAST categories (semgrep, CodeQL, etc.)
  | "security-vulnerability"
  | "code-quality";

/**
 * [AUDIT-E2] Extensible finding category. Accepts any BaseFindingCategory with
 * autocomplete, plus any custom string from third-party agents
 * (e.g. "firewall-disabled", "ssh-root-login", "device-identity-mismatch").
 */
export type FindingCategory = BaseFindingCategory | (string & {});

/**
 * Severity levels for governance prioritization.
 * No "info" — every Finding has a governance action (fix, waive, or block).
 *
 * [AUDIT-J1] [AUDIT-J3] Constant first, type derived. A bare union has NO runtime
 * representation: every consumer that needs the VALUES re-enumerates them by hand, and
 * no compiler watches those copies. The `as const` is load-bearing — it produces a
 * non-empty readonly tuple, which is the shape `z.enum()` accepts without a cast.
 */
export const FINDING_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * Identifier of the detector that generated the finding.
 */
export type DetectorName = "regex" | "heuristic" | "llm" | "sast";

// ─── Status enums (product-level) ────────────────────────────────────────────

/**
 * Waiver lifecycle status.
 */
export type WaiverStatus = "pending" | "active" | "expired" | "revoked";

/**
 * Derived finding status (not stored in DB — computed from tracking fields).
 * This module declares the DOMAIN; the semantics of each value are defined by
 * `findings_module` (e.g. FIND-E3 for 'in_progress').
 *
 * [AUDIT-J1] [AUDIT-J2] Constant first, type derived — same reason as
 * FINDING_SEVERITIES. Until s78b-37 this type had NO spec vertex, and its enumeration
 * had been hand-propagated to three code sites plus a comment.
 */
export const FINDING_STATUSES = ["new", "in_progress", "waived", "resolved"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

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
  /** Source code snippet — evidence of the finding. Required: every detector MUST produce snippet. */
  snippet: string;
  /** SHA-256 hex digest of the original snippet, computed at detection time. Enables L1↔L2 integrity verification. */
  snippetHash: string;
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
  fixes?: Fix[];
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
  /** Per-agent results with redacted SARIF for L1 (Git) persistence — always present (redactor required) */
  l1AgentResults: AgentAuditResult[];
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

// ─── Orchestration Input ──────────────────────────────────────────────────────

/**
 * Options passed to AuditOrchestrator.run() — the public input contract.
 *
 * Consumers: CLI (audit-command.ts), SaaS (scan_orchestrator.service.ts).
 * Counterpart of AuditOrchestrationResult (output).
 */
export type AuditOrchestrationOptions = {
  /** Scan scope: diff (changed files), full (all files), baseline (full + save baseline) */
  scope: "diff" | "full" | "baseline";
  /** Optional: run only this specific agent */
  agentId?: string;
  /** Glob patterns to include in scan */
  include?: string[];
  /** Glob patterns to exclude from scan */
  exclude?: string[];
  /** TaskRecord ID for traceability */
  taskId: string;
  /** Minimum severity to block on (optional) */
  failOn?: FindingSeverity;
  /** Target commit/branch to scan. Passed to agents for SARIF versionControlProvenance. */
  ref?: string;
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

// ─── Finding Factory ─────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/**
 * [AUDIT-D1] Factory for creating Finding objects with guaranteed snippet↔snippetHash integrity.
 * snippetHash is ALWAYS computed from snippet — callers MUST NOT provide it.
 * [AUDIT-D2] This is the ONLY way to construct a Finding.
 */
export function createFinding(input: Omit<Finding, 'snippetHash'>): Finding {
  return {
    ...input,
    snippetHash: createHash('sha256').update(input.snippet).digest('hex'),
  };
}

/**
 * [RLDX-F4] Verify snippet integrity — pure function.
 * Compares sha256(snippet) against snippetHash.
 * Returns 'verified' if match, 'unverified' if mismatch, null if unverifiable.
 */
export function verifySnippet(snippet: string, snippetHash: string): 'verified' | 'unverified' | null {
  if (!snippet || !snippetHash) return null;
  if (snippet.includes('[REDACTED]')) return null;
  const computed = createHash('sha256').update(snippet).digest('hex');
  return computed === snippetHash ? 'verified' : 'unverified';
}

// ─── Fix Type ─────────────────────────────────────────────────────────────────

/** Proposed remediation for a finding — SARIF §3.55.4 */
export type Fix = {
  /** Description of the fix (required) */
  description: string;
  /** Source that suggested the fix (e.g. "agent:review-advisor", "human:ciso") */
  source?: string;
  /** Regulatory reference (e.g. "PCI-DSS 3.4") */
  regulation?: string;
};

// ─── Entity Factories ─────────────────────────────────────────────────────────

/**
 * [AUDIT-H1] [AUDIT-H2] Factory for creating Fix objects with validation.
 */
export function createFix(input: { description: string; source?: string; regulation?: string }): Fix {
  if (!input.description) throw new Error('Fix requires description');
  return { ...input };
}

/**
 * [AUDIT-F1] [AUDIT-F2] [AUDIT-F3] Factory for creating Waiver objects with validation.
 * A Waiver without fingerprint, ruleId, or signed FeedbackRecord is invalid.
 */
export function createWaiver(input: {
  fingerprint: string;
  ruleId: string;
  expiresAt?: Date;
  feedback: import('../record_types').GitGovFeedbackRecord;
}): Waiver {
  if (!input.fingerprint) throw new Error('Waiver requires fingerprint');
  if (!input.ruleId) throw new Error('Waiver requires ruleId');
  if (!input.feedback) throw new Error('Waiver requires signed FeedbackRecord');
  return { ...input };
}

/**
 * [AUDIT-G1] [AUDIT-G2] [AUDIT-G3] Factory for creating Scan objects with computed summary.
 * Guarantees summary counts match the findings array.
 */
export function createScan(input: {
  scope: ScanScope;
  triggeredBy: string;
  executionRecordIds: string[];
  findings: Finding[];
  policyDecision: PolicyDecision;
  policyExecutionId?: string;
}): Scan {
  if (!input.scope) throw new Error('Scan requires scope');
  if (!input.triggeredBy) throw new Error('Scan requires triggeredBy');

  // [AUDIT-G2] Compute summary from findings — guaranteed coherent
  const active = input.findings.filter(f => !f.isWaived);
  const summary: AuditSummary = {
    critical: active.filter(f => f.severity === 'critical').length,
    high: active.filter(f => f.severity === 'high').length,
    medium: active.filter(f => f.severity === 'medium').length,
    low: active.filter(f => f.severity === 'low').length,
    total: input.findings.length,
    suppressed: input.findings.filter(f => f.isWaived).length,
    agentsRun: input.executionRecordIds.length,
    agentsFailed: 0,
  };

  return { ...input, summary };
}
