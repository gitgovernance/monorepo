// Factory
export { createPolicyEvaluator, reevaluatePolicy } from "./policy_evaluator";

// Built-in rules (part of core interface, not fs/github specific)
export { severityThreshold } from "./severity_threshold";
export { categoryBlock } from "./category_block";

// NOTE: Implementations are exported from their respective entrypoints:
// @gitgov/core/fs     → FsPolicyConfigLoader, loadPolicyConfig, FsOpaRuleFactory, createOpaRule
// @gitgov/core/github → GitHubPolicyConfigLoader

// Types and constants
export {
  SEVERITY_ORDER,
} from "./policy_evaluator.types";

export type {
  PolicyEvaluationInput,
  PolicyConfig,
  OpaConfig,
  PolicyConfigFile,
  WaiverRequirement,
  PolicyDecision,
  PolicyRuleResult,
  PolicyRule,
  PolicyConfigLoader,
  OpaRuleFactory,
  PolicyEvaluator,
  PolicyEvaluatorDeps,
  PolicyEvaluationResult,
  PolicyExecutionRecordData,
  // Re-exports from canonical sources
  Finding,
  FindingSeverity,
  Waiver,
  IWaiverReader,
} from "./policy_evaluator.types";
