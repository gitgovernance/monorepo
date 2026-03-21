/**
 * PolicyEvaluator types — Epic 5: policy_evaluation.
 *
 * Canonical types for policy evaluation. ConsolidatedFinding and FindingSeverity
 * are re-exported from audit_orchestrator (not redefined).
 * ActiveWaiver and IWaiverReader are imported from source_auditor.
 */

import type {
  ConsolidatedFinding,
  FindingSeverity,
} from "../audit_orchestrator/audit_orchestrator.types";
import type { ActiveWaiver } from "../source_auditor/types";

// Re-export for convenience
export type { ConsolidatedFinding, FindingSeverity } from "../audit_orchestrator/audit_orchestrator.types";
export type { ActiveWaiver, IWaiverReader } from "../source_auditor/types";

// ─────────────────────────────────────────────────────────────────────────────
// Core Domain Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input to PolicyEvaluator.evaluate().
 * Constructed by the caller (AuditOrchestrator or CLI).
 */
export type PolicyEvaluationInput = {
  findings: ConsolidatedFinding[];
  activeWaivers: ActiveWaiver[];
  policy: PolicyConfig;
  scanExecutionIds: string[];
  taskId: string;
};

/**
 * Runtime policy configuration.
 * Loaded from .gitgov/policy.yml via loadPolicyConfig(), or constructed programmatically.
 */
export type PolicyConfig = {
  failOn: FindingSeverity;
  blockCategories?: string[];
  waiverRequirements?: Record<string, WaiverRequirement>;
  rules?: PolicyRule[];
  opa?: OpaConfig;
};

/**
 * OPA engine configuration.
 * When present, .rego policies are loaded and evaluated via WASM.
 */
export type OpaConfig = {
  /** Paths to .rego files relative to repo root */
  policies: string[];
};

/**
 * Schema for .gitgov/policy.yml file on disk.
 * Parsed by loadPolicyConfig().
 */
export type PolicyConfigFile = {
  version: string;
  failOn: FindingSeverity;
  blockCategories?: string[];
  waiverRequirements?: Record<string, WaiverRequirement>;
  opa?: {
    policies: string[];
  };
};

/**
 * Requirements for waiver approval per category.
 * Example: { role: "ciso", minApprovals: 1 }
 */
export type WaiverRequirement = {
  role: string;
  minApprovals: number;
};

/**
 * Result of policy evaluation.
 * Returned by PolicyEvaluator.evaluate().
 */
export type PolicyDecision = {
  decision: "pass" | "block";
  reason: string;
  blockingFindings: ConsolidatedFinding[];
  waivedFindings: ConsolidatedFinding[];
  summary: Record<FindingSeverity, number>;
  rulesEvaluated: PolicyRuleResult[];
  evaluatedAt: string; // ISO 8601
};

/**
 * Result of a single rule evaluation.
 */
export type PolicyRuleResult = {
  ruleName: string;
  passed: boolean;
  reason: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces (contracts with methods)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A policy rule that evaluates findings against a specific criterion.
 * Strategy pattern: built-in and custom rules share this interface.
 */
export interface PolicyRule {
  readonly name: string;
  evaluate(
    findings: ConsolidatedFinding[],
    config: PolicyConfig,
  ): PolicyRuleResult;
}

/**
 * Interface for loading PolicyConfig from storage.
 * Implementations: FsPolicyConfigLoader (filesystem), GitHubPolicyConfigLoader (GitHub API).
 */
export interface PolicyConfigLoader {
  loadPolicyConfig(): Promise<PolicyConfig>;
}

/**
 * Interface for creating OPA rules from .rego files.
 * Implementations: FsOpaRuleFactory (local OPA CLI + WASM), future: RemoteOpaRule.
 * The factory receives repoRoot at construction time (DI), not per call.
 */
export interface OpaRuleFactory {
  createOpaRule(regoPath: string): Promise<PolicyRule>;
}

/**
 * PolicyEvaluator interface.
 * ASYNC -- evaluate() returns Promise<PolicyEvaluationResult>.
 */
export interface PolicyEvaluator {
  evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection and result types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies injected into createPolicyEvaluator().
 * opaRuleFactory is optional -- when absent, OPA policies are skipped with a warning.
 */
export type PolicyEvaluatorDeps = {
  opaRuleFactory?: OpaRuleFactory;
};

/**
 * Full result from PolicyEvaluator.evaluate().
 * Wraps PolicyDecision + ExecutionRecord data.
 */
export type PolicyEvaluationResult = {
  decision: PolicyDecision;
  executionRecord: PolicyExecutionRecordData;
};

/**
 * Data for the ExecutionRecord created by PolicyEvaluator.
 * The caller (orchestrator) handles persistence via RecordStore.
 */
export type PolicyExecutionRecordData = {
  id: string;
  type: "decision";
  title: string;
  result: string;
  references: string[];
  metadata: {
    kind: "policy-decision";
    version: "1.0.0";
    data: PolicyDecision;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants and helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severity ordering for threshold comparison.
 * critical(4) > high(3) > medium(2) > low(1).
 */
export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Returns the higher of two severities.
 */
export function higherSeverity(
  a: FindingSeverity,
  b: FindingSeverity,
): FindingSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
