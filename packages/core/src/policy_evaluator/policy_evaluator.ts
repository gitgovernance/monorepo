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
  PolicyRule,
  PolicyRuleResult,
  ConsolidatedFinding,
  FindingSeverity,
  ActiveWaiver,
  IWaiverReader,
} from "./policy_evaluator.types";
import { SEVERITY_ORDER } from "./policy_evaluator.types";
import { severityThreshold } from "./severity_threshold";
import { categoryBlock } from "./category_block";
import type { RecordStore } from "../record_store/record_store";
import type { GitGovExecutionRecord } from "../record_types";
import type { SarifLog, SarifLevel, SarifPhysicalLocation } from "../sarif/sarif.types";

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
    activeWaivers.map((w) => [w.fingerprint, w]),
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
  deps: PolicyEvaluatorDeps,
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
      let opaRules: PolicyRule[] = [];
      if (policy.opa?.policies && policy.opa.policies.length > 0) {
        if (deps.opaRuleFactory) {
          opaRules = await Promise.all(
            policy.opa.policies.map((p) =>
              deps.opaRuleFactory!.createOpaRule(p),
            ),
          );
        } else {
          console.warn(
            "[PolicyEvaluator] OPA policies configured but no opaRuleFactory provided, skipping OPA evaluation",
          );
        }
      }

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

// ============================================================================
// Re-evaluation (Cycle 2: PEVAL-F1 through F5)
// ============================================================================

/**
 * Maps SARIF level to FindingSeverity.
 * Same logic as levelToSeverity in audit_orchestrator.
 */
function levelToSeverity(level: SarifLevel | string | undefined): FindingSeverity {
  switch (level) {
    case "error":
      return "critical";
    case "warning":
      return "high";
    case "note":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Builds a fallback fingerprint for SARIF results missing primaryLocationLineHash/v1.
 */
function buildFallbackFingerprint(
  ruleId: string | undefined,
  location: SarifPhysicalLocation | undefined,
): string | undefined {
  const file = location?.artifactLocation?.uri;
  const line = location?.region?.startLine;
  if (!ruleId || !file) return undefined;
  return `fallback:${ruleId}:${file}:${String(line ?? 0)}`;
}

/**
 * Extracts ConsolidatedFinding[] from a SarifLog.
 * Re-consolidates findings from SARIF results with dedup by fingerprint.
 */
function extractFindingsFromSarif(sarif: SarifLog): ConsolidatedFinding[] {
  const byFingerprint = new Map<string, ConsolidatedFinding>();

  for (const run of sarif.runs) {
    const agentId = run.tool?.driver?.name ?? "unknown";

    for (const sarifResult of run.results) {
      const location = sarifResult.locations?.[0]?.physicalLocation;
      const fingerprint =
        sarifResult.partialFingerprints?.["primaryLocationLineHash/v1"] ??
        buildFallbackFingerprint(sarifResult.ruleId, location);
      if (!fingerprint) continue;

      const existing = byFingerprint.get(fingerprint);

      if (existing) {
        if (!existing.reportedBy.includes(agentId)) {
          existing.reportedBy.push(agentId);
        }
      } else {
        const props = sarifResult.properties as
          | Record<string, unknown>
          | undefined;
        const category =
          (props?.["gitgov/category"] as string | undefined) ?? "unknown";

        const finding: ConsolidatedFinding = {
          fingerprint,
          ruleId: sarifResult.ruleId,
          message: sarifResult.message.text,
          severity: levelToSeverity(sarifResult.level),
          file: location?.artifactLocation?.uri ?? "",
          line: location?.region?.startLine ?? 0,
          category,
          reportedBy: [agentId],
          isWaived: false,
        };
        const col = location?.region?.startColumn;
        if (col !== undefined) {
          finding.column = col;
        }
        byFingerprint.set(fingerprint, finding);
      }
    }
  }

  return Array.from(byFingerprint.values());
}

/**
 * Type guard for SARIF metadata on an ExecutionRecord.
 */
type SarifMetadata = {
  kind: "sarif";
  version: string;
  data: SarifLog;
};

function isSarifMetadata(
  metadata: unknown,
): metadata is SarifMetadata {
  if (metadata === null || metadata === undefined || typeof metadata !== "object") {
    return false;
  }
  const m = metadata as Record<string, unknown>;
  return m["kind"] === "sarif" && m["data"] !== null && m["data"] !== undefined;
}

/**
 * Re-evaluates policy using existing scan ExecutionRecords without re-executing agents.
 *
 * PEVAL-F1: Loads findings from ExecutionRecords (no re-scan).
 * PEVAL-F2: Uses current active waivers (not historical).
 * PEVAL-F3: Creates a NEW ExecutionRecord (previous untouched).
 * PEVAL-F4: Skips ExecutionRecords without SARIF metadata (logs warning).
 * PEVAL-F5: Includes waiver feedbackRecordId in references when pass after prior block.
 */
export async function reevaluatePolicy(
  scanExecutionIds: string[],
  taskId: string,
  policy: PolicyConfig,
  deps: {
    executionStore: RecordStore<GitGovExecutionRecord>;
    waiverReader: IWaiverReader;
    policyEvaluator: PolicyEvaluator;
  },
): Promise<PolicyEvaluationResult> {
  // PEVAL-F1: Load findings from each scan ExecutionRecord
  const allFindings: ConsolidatedFinding[] = [];

  for (const execId of scanExecutionIds) {
    const record = await deps.executionStore.get(execId);
    if (!record) {
      // PEVAL-F4: Log warning for missing records
      console.warn(
        `reevaluatePolicy: ExecutionRecord "${execId}" not found, skipping`,
      );
      continue;
    }

    const metadata = record.payload.metadata;

    // PEVAL-F4: Skip records without SARIF in metadata
    if (!isSarifMetadata(metadata)) {
      console.warn(
        `reevaluatePolicy: ExecutionRecord "${execId}" does not contain SARIF metadata (kind !== "sarif"), skipping`,
      );
      continue;
    }

    const findings = extractFindingsFromSarif(metadata.data);
    allFindings.push(...findings);
  }

  // Dedup across multiple SarifLogs (same fingerprint from different scans)
  const dedupMap = new Map<string, ConsolidatedFinding>();
  for (const f of allFindings) {
    const existing = dedupMap.get(f.fingerprint);
    if (existing) {
      for (const agent of f.reportedBy) {
        if (!existing.reportedBy.includes(agent)) {
          existing.reportedBy.push(agent);
        }
      }
    } else {
      dedupMap.set(f.fingerprint, { ...f });
    }
  }
  const consolidatedFindings = Array.from(dedupMap.values());

  // PEVAL-F2: Load CURRENT active waivers (not historical)
  const activeWaivers = await deps.waiverReader.loadActiveWaivers();

  // PEVAL-F3: Create NEW evaluation (delegates to PolicyEvaluator.evaluate)
  const input: PolicyEvaluationInput = {
    findings: consolidatedFindings,
    activeWaivers,
    policy,
    scanExecutionIds,
    taskId,
  };

  // The PolicyEvaluator.evaluate() call creates a new PolicyDecision + ExecutionRecord
  // (PEVAL-F3: new record, previous decision record is untouched)
  // (PEVAL-F5: references are built by buildReferences() which includes waiver feedback IDs)
  const result = await deps.policyEvaluator.evaluate(input);

  return result;
}
