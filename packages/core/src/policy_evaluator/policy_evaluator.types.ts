/**
 * PolicyEvaluator types.
 *
 * Canonical audit types (Finding, FindingSeverity, Waiver, PolicyDecision, PolicyRuleResult)
 * are imported from @gitgov/core/audit — the central definition.
 * This file re-exports them and defines policy-evaluator-specific types.
 */

import type {
  Finding,
  FindingSeverity,
  Waiver,
  PolicyDecision,
  PolicyRuleResult,
} from "../audit/types";

// ─── Re-export canonical types from audit ────────────────────────────────────

export type {
  Finding,
  FindingSeverity,
  Waiver,
  PolicyDecision,
  PolicyRuleResult,
} from "../audit/types";

export type { IWaiverReader } from "../source_auditor/types";

// ─────────────────────────────────────────────────────────────────────────────
// Policy-evaluator-specific types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input to PolicyEvaluator.evaluate().
 */
export type PolicyEvaluationInput = {
  findings: Finding[];
  activeWaivers: Waiver[];
  policy: PolicyConfig;
  scanExecutionIds: string[];
  taskId: string;
};

/**
 * Runtime policy configuration.
 * Loaded from .gitgov/policy.yml via loadPolicyConfig().
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
 */
export type OpaConfig = {
  policies: string[];
};

/**
 * Schema for .gitgov/policy.yml file on disk.
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
 */
export type WaiverRequirement = {
  role: string;
  minApprovals: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A policy rule that evaluates findings against a specific criterion.
 */
export interface PolicyRule {
  readonly name: string;
  evaluate(
    findings: Finding[],
    config: PolicyConfig,
  ): PolicyRuleResult;
}

/**
 * Interface for loading PolicyConfig from storage.
 */
export interface PolicyConfigLoader {
  loadPolicyConfig(): Promise<PolicyConfig>;
}

/**
 * Interface for creating OPA rules from .rego files.
 */
export interface OpaRuleFactory {
  createOpaRule(regoPath: string): Promise<PolicyRule>;
}

/**
 * PolicyEvaluator interface.
 */
export interface PolicyEvaluator {
  evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection and result types
// ─────────────────────────────────────────────────────────────────────────────

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

export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function higherSeverity(
  a: FindingSeverity,
  b: FindingSeverity,
): FindingSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
