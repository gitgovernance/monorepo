/**
 * PolicyEvaluator types.
 *
 * Re-exports the interface and related types from audit_orchestrator.types
 * for convenience. The canonical definition lives in audit_orchestrator.types.ts
 * since PolicyEvaluator is a dependency of AuditOrchestrator.
 *
 * This file exists to follow the module folder convention and provide
 * a place for future policy-specific types (Epic 5: policy_evaluation).
 */
export type {
  PolicyEvaluator,
  PolicyDecisionStub,
  ConsolidatedFinding,
  FindingSeverity,
} from "../audit_orchestrator/audit_orchestrator.types";
