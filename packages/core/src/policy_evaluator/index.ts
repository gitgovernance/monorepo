// Factory
export { createPolicyEvaluator, reevaluatePolicy } from "./policy_evaluator";

// Fs implementations (Strategy pattern)
export { loadPolicyConfig, createOpaRule, FsOpaRuleFactory } from "./fs";

// Built-in rules
export { severityThreshold } from "./severity_threshold";
export { categoryBlock } from "./category_block";

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
  ConsolidatedFinding,
  FindingSeverity,
  ActiveWaiver,
  IWaiverReader,
} from "./policy_evaluator.types";
