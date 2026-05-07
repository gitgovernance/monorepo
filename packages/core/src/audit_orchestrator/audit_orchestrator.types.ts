/**
 * AuditOrchestrator types.
 *
 * Canonical audit types (Finding, AuditOrchestrationResult, AuditSummary, etc.)
 * are imported from @gitgov/core/audit — the central definition.
 * This file re-exports them and defines orchestrator-specific types.
 */

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
  AuditOrchestrationOptions,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
} from "../audit/types";

// Re-export PolicyEvaluationResult for consumers that need the full wrapper
export type { PolicyEvaluationResult } from "../policy_evaluator/policy_evaluator.types";

// ============================================================================
// ORCHESTRATOR-SPECIFIC TYPES (internal — not in audit/types.ts)
// ============================================================================

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
  /** Target commit/branch being scanned. Agents use this for SARIF versionControlProvenance. */
  ref?: string;
};

/**
 * Read-only contract for agent discovery. Any RecordStore backend satisfies this.
 */
export type AgentRecordReader = {
  get(id: string): Promise<GitGovAgentRecord | null>;
  list(): Promise<string[]>;
};

/**
 * Dependencies injected into createAuditOrchestrator().
 */
export type AuditOrchestratorDeps = {
  /** Reader for AgentRecords — only get/list needed for discovery */
  recordStore: AgentRecordReader;
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
