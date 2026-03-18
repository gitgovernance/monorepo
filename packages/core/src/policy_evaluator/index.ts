// Factory
export { createPolicyEvaluator, reevaluatePolicy } from "./policy_evaluator";

// Config loader
export { loadPolicyConfig } from "./policy_config_loader";

// Built-in rules
export { severityThreshold } from "./severity_threshold";
export { categoryBlock } from "./category_block";

// OPA rule
export { createOpaRule } from "./opa_rule";

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
