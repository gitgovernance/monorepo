/**
 * AuditOrchestrator types.
 *
 * Canonical audit types (Finding, AuditOrchestrationResult, AuditSummary, etc.)
 * are imported from @gitgov/core/audit — the central definition.
 * This file re-exports them and defines orchestrator-specific types.
 */

import type { RecordStore } from "../record_store/record_store";
import type { GitGovAgentRecord } from "../record_types";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { IWaiverReader } from "../source_auditor/types";
import type { PolicyEvaluator } from "../policy_evaluator/policy_evaluator.types";
import type { FindingRedactor } from "../redaction";

// ─── Re-export canonical types from audit ────────────────────────────────────

export type {
  Finding,
  FindingSeverity,
  Waiver,
  PolicyDecision,
  AuditOrchestrationResult,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
} from "../audit/types";

// Re-export PolicyEvaluationResult for consumers that need the full wrapper
export type { PolicyEvaluationResult } from "../policy_evaluator/policy_evaluator.types";

// ============================================================================
// ORCHESTRATOR-SPECIFIC TYPES (not in audit/types.ts)
// ============================================================================

/**
 * Options passed to AuditOrchestrator.run().
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
  failOn?: import("../audit/types").FindingSeverity;
};

/**
 * Input passed to each audit agent via AgentRunner ctx.input.
 */
export type AgentAuditInput = {
  /** Scan scope */
  scope: "diff" | "full" | "baseline";
  /** Glob patterns to include */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** TaskRecord ID for traceability */
  taskId: string;
  /** Base directory for scanning (resolved by orchestrator from project root) */
  baseDir?: string;
};

/**
 * Dependencies injected into createAuditOrchestrator().
 */
export type AuditOrchestratorDeps = {
  /** RecordStore for reading AgentRecords (typed for agent records) */
  recordStore: RecordStore<GitGovAgentRecord>;
  /** AgentRunner interface for executing agents */
  agentRunner: IAgentRunner;
  /** WaiverReader for loading active waivers */
  waiverReader: IWaiverReader;
  /** PolicyEvaluator for pass/block decision */
  policyEvaluator: PolicyEvaluator;
  /**
   * Optional FindingRedactor for L1/L2 separation (RLDX-E1..E3).
   * When provided, the orchestrator produces redacted SARIF copies for L1 persistence.
   * Agents do not need to know about RedactionLevel — the orchestrator applies the policy.
   */
  redactor?: FindingRedactor;
};
