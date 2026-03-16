import type {
  PolicyEvaluator,
  ConsolidatedFinding,
  FindingSeverity,
  PolicyDecisionStub,
} from "./policy_evaluator.types";

/**
 * Severity order for threshold comparison.
 * Higher number = more severe.
 */
const severityOrder: Record<FindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Creates a stub PolicyEvaluator.
 *
 * This is a minimal implementation for Cycle 2 of audit_orchestration.
 * It checks active (non-waived) findings against a severity threshold
 * and returns pass/block. No ExecutionRecord is created (deferred to Epic 5).
 */
export function createPolicyEvaluator(): PolicyEvaluator {
  return {
    async evaluate(
      findings: ConsolidatedFinding[],
      options: { failOn?: FindingSeverity; taskId: string },
    ): Promise<PolicyDecisionStub> {
      const failOn = options.failOn ?? "critical";
      const threshold = severityOrder[failOn];

      const activeFindings = findings.filter((f) => !f.isWaived);
      const hasBlocking = activeFindings.some(
        (f) => severityOrder[f.severity] >= threshold,
      );

      return {
        decision: hasBlocking ? "block" : "pass",
        reason: hasBlocking
          ? `Found findings at or above ${failOn} severity`
          : `No findings at or above ${failOn} severity`,
        executionRecordId: "", // Stub -- Epic 5 creates real ExecutionRecord
      };
    },
  };
}
