/**
 * PolicyEvaluator -- Epic 5: policy_evaluation.
 *
 * Factory: createPolicyEvaluator(deps) creates a PolicyEvaluator instance.
 * Pipeline: apply waivers -> evaluate rules -> build decision -> build execution record.
 *
 * EARS: PEVAL-D1 through D9, PEVAL-E1 through E5
 */

import type {
  PolicyEvaluator,
  PolicyEvaluatorDeps,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  PolicyDecision,
  PolicyExecutionRecordData,
  PolicyConfig,
  PolicyRuleResult,
  ConsolidatedFinding,
  FindingSeverity,
  ActiveWaiver,
} from "./policy_evaluator.types";
import { SEVERITY_ORDER } from "./policy_evaluator.types";
import { severityThreshold } from "./severity_threshold";
import { categoryBlock } from "./category_block";
import { createOpaRule } from "./opa_rule";

// ============================================================================
// Helper functions
// ============================================================================

/**
 * PEVAL-D1/D2: Match waivers to findings by fingerprint.
 * Creates copies with isWaived/waiver set -- does not mutate originals.
 */
function applyWaivers(
  findings: ConsolidatedFinding[],
  activeWaivers: ActiveWaiver[],
): ConsolidatedFinding[] {
  const waiverMap = new Map(
    activeWaivers
      .filter((w) => w.fingerprint)
      .map((w) => [w.fingerprint, w]),
  );

  // TODO: waiverRequirements enforcement (PEVAL-P2 Cycle 2)
  // When waiverRequirements are configured for a category, waiver application should
  // verify the waiver has sufficient approvals (ActorRecord/WorkflowRecord signatures).
  // Cycle 1 validates waiverRequirements schema at load time; enforcement requires
  // ActorRecord/FeedbackRecord integration beyond Cycle 1 scope.
  return findings.map((f) => {
    const waiver = waiverMap.get(f.fingerprint);
    return waiver
      ? { ...f, isWaived: true, waiver }
      : { ...f, isWaived: false };
  });
}

/**
 * Finds non-waived findings that match severity threshold OR blocked categories.
 * Used to populate blockingFindings in PolicyDecision.
 */
function computeBlockingFindings(
  findings: ConsolidatedFinding[],
  policy: PolicyConfig,
): ConsolidatedFinding[] {
  const threshold = SEVERITY_ORDER[policy.failOn];
  const blockedSet = new Set(policy.blockCategories ?? []);

  return findings.filter(
    (f) =>
      !f.isWaived &&
      (SEVERITY_ORDER[f.severity] >= threshold || blockedSet.has(f.category)),
  );
}

/**
 * Counts findings by severity.
 */
function buildSummary(
  findings: ConsolidatedFinding[],
): Record<FindingSeverity, number> {
  const s: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) {
    s[f.severity] = s[f.severity] + 1;
  }
  return s;
}

/**
 * Builds a human-readable result string for the ExecutionRecord.
 */
function buildResultString(decision: PolicyDecision): string {
  if (decision.decision === "pass") {
    const waived = decision.waivedFindings.length;
    return waived > 0
      ? `PASS: All findings waived or below threshold. ${String(waived)} waived.`
      : "PASS: No findings exceed configured thresholds.";
  }

  const blocking = decision.blockingFindings.length;
  const waived = decision.waivedFindings.length;
  const parts = [`BLOCK: ${String(blocking)} blocking finding(s).`];
  if (waived > 0) {
    parts.push(`${String(waived)} waived.`);
  }
  return parts.join(" ");
}

/**
 * Builds references array for the ExecutionRecord.
 * Includes scanExecutionIds and waiver feedbackRecord IDs.
 */
function buildReferences(
  scanExecutionIds: string[],
  waivedFindings: ConsolidatedFinding[],
): string[] {
  const refs = [...scanExecutionIds];

  for (const f of waivedFindings) {
    if (f.waiver?.feedback?.id) {
      refs.push(f.waiver.feedback.id);
    }
  }

  return refs;
}

/**
 * Builds the ExecutionRecord data for the policy evaluation.
 */
function buildExecutionRecord(
  input: PolicyEvaluationInput,
  decision: PolicyDecision,
): PolicyExecutionRecordData {
  return {
    id: `exec-policy-${input.taskId}-${Date.now()}`,
    type: "decision",
    title: `Policy evaluation for task ${input.taskId}`,
    result: buildResultString(decision),
    references: buildReferences(input.scanExecutionIds, decision.waivedFindings),
    metadata: {
      kind: "policy-decision",
      version: "1.0.0",
      data: decision,
    },
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory: creates PolicyEvaluator with injected dependencies.
 */
export function createPolicyEvaluator(
  _deps: PolicyEvaluatorDeps,
): PolicyEvaluator {
  return {
    async evaluate(
      input: PolicyEvaluationInput,
    ): Promise<PolicyEvaluationResult> {
      const { findings, activeWaivers, policy } = input;

      // PEVAL-D9: Empty findings -> pass immediately
      if (findings.length === 0) {
        const decision: PolicyDecision = {
          decision: "pass",
          reason: "No findings to evaluate",
          blockingFindings: [],
          waivedFindings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0 },
          rulesEvaluated: [],
          evaluatedAt: new Date().toISOString(),
        };
        return {
          decision,
          executionRecord: buildExecutionRecord(input, decision),
        };
      }

      // PEVAL-D1/D2: Apply waivers by fingerprint matching
      const withWaivers = applyWaivers(findings, activeWaivers);

      // PEVAL-D3/D4/D8: Evaluate built-in + custom + OPA rules
      const builtInRules = [severityThreshold, categoryBlock];

      // Load OPA rules if configured (PEVAL-O5: skip when opa is undefined)
      const repoRoot = process.cwd();
      const opaRules =
        policy.opa?.policies && policy.opa.policies.length > 0
          ? await Promise.all(
              policy.opa.policies.map((p) => createOpaRule(p, repoRoot)),
            )
          : [];

      const allRules = [
        ...builtInRules,
        ...(policy.rules ?? []),
        ...opaRules,
      ];

      // All rules are evaluated (no short-circuit)
      const rulesEvaluated: PolicyRuleResult[] = allRules.map((rule) =>
        rule.evaluate(withWaivers, policy),
      );

      const anyFailed = rulesEvaluated.some((r) => !r.passed);

      // PEVAL-D5/D6/D7: Build PolicyDecision
      const decision: PolicyDecision = {
        decision: anyFailed ? "block" : "pass",
        reason: anyFailed
          ? rulesEvaluated
              .filter((r) => !r.passed)
              .map((r) => r.reason)
              .join("; ")
          : "All findings waived or below configured thresholds.",
        blockingFindings: anyFailed
          ? computeBlockingFindings(withWaivers, policy)
          : [],
        waivedFindings: withWaivers.filter((f) => f.isWaived),
        summary: buildSummary(withWaivers),
        rulesEvaluated,
        evaluatedAt: new Date().toISOString(),
      };

      // PEVAL-E1 through E5: Build ExecutionRecord data
      const executionRecord = buildExecutionRecord(input, decision);

      return { decision, executionRecord };
    },
  };
}
