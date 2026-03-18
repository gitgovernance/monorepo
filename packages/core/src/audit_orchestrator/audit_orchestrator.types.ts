import type { SarifLog } from "../sarif/sarif.types";
import type { RecordStore } from "../record_store/record_store";
import type { GitGovAgentRecord } from "../record_types";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { IWaiverReader, ActiveWaiver } from "../source_auditor/types";
import type {
  PolicyEvaluator,
  PolicyDecision,
} from "../policy_evaluator/policy_evaluator.types";

// Re-export PolicyEvaluator types for consumers that import from audit_orchestrator.
// Note: AuditOrchestrationResult.policyDecision exposes PolicyDecision (the inner decision),
// NOT PolicyEvaluationResult (which wraps decision + executionRecord). The orchestrator
// handles executionRecord persistence internally — callers only see the decision.
export type { PolicyDecision, PolicyEvaluationResult } from "../policy_evaluator/policy_evaluator.types";

// ============================================================================
// ORCHESTRATION INPUT/OUTPUT
// ============================================================================

/**
 * Severity levels for findings.
 */
export type FindingSeverity = "critical" | "high" | "medium" | "low";

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
  failOn?: FindingSeverity;
};

/**
 * Complete result of an orchestrated audit run.
 */
export type AuditOrchestrationResult = {
  /** Consolidated, deduplicated findings from all agents */
  findings: ConsolidatedFinding[];
  /** Per-agent execution results */
  agentResults: AgentAuditResult[];
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
};

// ============================================================================
// AGENT RESULTS
// ============================================================================

/**
 * Result from a single agent execution.
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

// ============================================================================
// CONSOLIDATED FINDINGS
// ============================================================================

/**
 * A finding consolidated across multiple agents, deduplicated by fingerprint.
 */
export type ConsolidatedFinding = {
  /** Content-based fingerprint (primaryLocationLineHash/v1 or fallback) */
  fingerprint: string;
  /** Rule ID from SARIF (e.g., "PII-001") */
  ruleId?: string;
  /** Human-readable finding message */
  message: string;
  /** Finding severity */
  severity: FindingSeverity;
  /** Finding category (e.g., "pii", "secret") */
  category: string;
  /** File path where finding was detected */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (optional, 1-based) */
  column?: number;
  /** Agent IDs that reported this finding */
  reportedBy: string[];
  /** Source code snippet from SARIF region.snippet.text */
  snippet?: string;
  /** Whether this finding is suppressed by a waiver */
  isWaived: boolean;
  /** Active waiver details if suppressed */
  waiver?: ActiveWaiver;
};

// ============================================================================
// SUMMARY AND POLICY
// ============================================================================

/**
 * Aggregated summary of the orchestration run.
 */
export type AuditSummary = {
  /** Total consolidated findings */
  total: number;
  /** Count of critical findings */
  critical: number;
  /** Count of high findings */
  high: number;
  /** Count of medium findings */
  medium: number;
  /** Count of low findings */
  low: number;
  /** Count of suppressed (waived) findings */
  suppressed: number;
  /** Number of agents executed */
  agentsRun: number;
  /** Number of agents that failed */
  agentsFailed: number;
};

// ============================================================================
// DEPENDENCY INJECTION
// ============================================================================

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
};
