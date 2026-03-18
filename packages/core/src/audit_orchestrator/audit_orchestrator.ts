import type { SarifLog, SarifPhysicalLocation } from "../sarif/sarif.types";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { RecordStore } from "../record_store/record_store";
import type { GitGovAgentRecord } from "../record_types";
import type { ActiveWaiver } from "../source_auditor/types";
import type { RunOptions } from "../agent_runner/agent_runner.types";
import type {
  AuditOrchestratorDeps,
  AuditOrchestrationOptions,
  AuditOrchestrationResult,
  AgentAuditResult,
  AgentAuditInput,
  ConsolidatedFinding,
  AuditSummary,
  FindingSeverity,
} from "./audit_orchestrator.types";
import type { PolicyEvaluationInput } from "../policy_evaluator/policy_evaluator.types";

/**
 * Creates an empty SarifLog (used for error cases).
 */
function emptySarif(): SarifLog {
  return {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [],
  };
}

/**
 * Maps SARIF level to GitGov severity.
 */
function levelToSeverity(level: string | undefined): FindingSeverity {
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
 * Discovers AgentRecords with metadata.purpose === "audit".
 * If agentId is provided, filters to only that agent.
 *
 * RecordStore.list() returns string[] (IDs).
 * RecordStore.get(id) returns the full record with payload.metadata.
 */
async function discoverAuditAgents(
  agentStore: RecordStore<GitGovAgentRecord>,
  agentId?: string,
): Promise<string[]> {
  const agentIds = await agentStore.list();
  const auditAgentIds: string[] = [];

  for (const id of agentIds) {
    const record = await agentStore.get(id);
    if (!record) continue;
    const meta = record.payload.metadata as
      | Record<string, unknown>
      | undefined;
    if (meta && meta["purpose"] === "audit") {
      auditAgentIds.push(record.payload.id);
    }
  }

  if (agentId) {
    return auditAgentIds.includes(agentId) ? [agentId] : [];
  }

  return auditAgentIds;
}

/**
 * Executes a single agent via AgentRunner and returns its result.
 * AgentRunner creates the ExecutionRecord automatically (AORCH-B8).
 */
async function executeAgent(
  agentRunner: IAgentRunner,
  agentId: string,
  options: AuditOrchestrationOptions,
): Promise<AgentAuditResult> {
  const startMs = Date.now();

  const input: AgentAuditInput = {
    scope: options.scope,
    ...(options.include !== undefined ? { include: options.include } : {}),
    ...(options.exclude !== undefined ? { exclude: options.exclude } : {}),
    taskId: options.taskId,
  };

  const runOpts: RunOptions = {
    agentId,
    taskId: options.taskId,
    input,
  };

  const response = await agentRunner.runOnce(runOpts);

  // Agent output contains SARIF in metadata.data
  const metadata = response.output?.metadata as
    | Record<string, unknown>
    | undefined;
  const sarif = (metadata?.["data"] as SarifLog | undefined) ?? emptySarif();

  return {
    agentId,
    sarif,
    executionId: response.executionRecordId,
    status: "success",
    durationMs: Date.now() - startMs,
  };
}

/**
 * Fallback fingerprint for SARIF results without primaryLocationLineHash/v1.
 * Format: "fallback:{ruleId}:{file}:{startLine}"
 */
function buildFallbackFingerprint(
  ruleId: string | undefined,
  location: SarifPhysicalLocation | undefined,
): string | undefined {
  const file = location?.artifactLocation?.uri;
  const line = location?.region?.startLine;
  if (!ruleId || !file) return undefined;
  return `fallback:${ruleId}:${file}:${line ?? 0}`;
}

/**
 * Consolidates findings from multiple SarifLogs with dedup by fingerprint.
 * If two agents report the same fingerprint, both agentIds are included in reportedBy.
 */
function consolidateFindings(
  agentResults: AgentAuditResult[],
): ConsolidatedFinding[] {
  const byFingerprint = new Map<string, ConsolidatedFinding>();

  for (const result of agentResults) {
    if (result.status !== "success") continue;

    for (const run of result.sarif.runs) {
      for (const sarifResult of run.results) {
        // Primary: use standardized primaryLocationLineHash/v1 from SarifBuilder
        // Fallback: ruleId + file + startLine (for external tools without GitGov fingerprinting)
        const location = sarifResult.locations?.[0]?.physicalLocation;
        const fingerprint =
          sarifResult.partialFingerprints?.["primaryLocationLineHash/v1"] ??
          buildFallbackFingerprint(sarifResult.ruleId, location);
        if (!fingerprint) continue;

        const existing = byFingerprint.get(fingerprint);

        if (existing) {
          // Dedup: add agent to reportedBy
          if (!existing.reportedBy.includes(result.agentId)) {
            existing.reportedBy.push(result.agentId);
          }
        } else {
          // Read severity from properties['gitgov/category'] or infer from level
          const props = sarifResult.properties as
            | Record<string, unknown>
            | undefined;
          const category =
            (props?.["gitgov/category"] as string | undefined) ?? "unknown";

          const snippet = location?.region?.snippet?.text;

          const finding: ConsolidatedFinding = {
            fingerprint,
            ruleId: sarifResult.ruleId,
            message: sarifResult.message.text,
            severity: levelToSeverity(sarifResult.level),
            file: location?.artifactLocation?.uri ?? "",
            line: location?.region?.startLine ?? 0,
            category,
            reportedBy: [result.agentId],
            ...(snippet ? { snippet } : {}),
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
  }

  return Array.from(byFingerprint.values());
}

/**
 * Builds the summary counts for CLI display.
 *
 * NOTE: `total` counts ALL findings (including waived), while severity counts
 * (critical, high, medium, low) only count non-waived (active) findings.
 * This asymmetry is intentional: `total` reflects the full scan scope,
 * severity counts reflect actionable findings for the policy decision.
 */
function buildSummary(
  findings: ConsolidatedFinding[],
  agentResults: AgentAuditResult[],
): AuditSummary {
  const active = findings.filter((f) => !f.isWaived);
  return {
    total: findings.length,
    critical: active.filter((f) => f.severity === "critical").length,
    high: active.filter((f) => f.severity === "high").length,
    medium: active.filter((f) => f.severity === "medium").length,
    low: active.filter((f) => f.severity === "low").length,
    suppressed: findings.filter((f) => f.isWaived).length,
    agentsRun: agentResults.filter((r) => r.status === "success").length,
    agentsFailed: agentResults.filter((r) => r.status === "error").length,
  };
}

/**
 * Factory: creates an AuditOrchestrator with injected dependencies.
 * Uses DI for full testability -- all external interactions are mockable.
 */
export function createAuditOrchestrator(deps: AuditOrchestratorDeps) {
  return {
    /**
     * Executes the full orchestration pipeline:
     * 1. Discover audit agents from RecordStore
     * 2. Filter by agentId if specified
     * 3. Execute via AgentRunner (Promise.allSettled)
     * 4. Consolidate SARIF findings, dedup by fingerprint
     * 5. Load active waivers
     * 6. Pass raw findings + waivers to PolicyEvaluator
     * 7. Return AuditOrchestrationResult
     */
    async run(
      options: AuditOrchestrationOptions,
    ): Promise<AuditOrchestrationResult> {
      // 1. Discover audit agents
      const auditAgents = await discoverAuditAgents(
        deps.recordStore,
        options.agentId,
      );

      // Load waivers upfront (needed for policy evaluation)
      let waivers: ActiveWaiver[] = [];
      try {
        waivers = await deps.waiverReader.loadActiveWaivers();
      } catch {
        // WaiverReader failure is non-fatal: findings remain unsuppressed (AORCH-B7)
      }

      // 2. If no agents found, return empty result with warning (AORCH-B3)
      if (auditAgents.length === 0) {
        const policyInput: PolicyEvaluationInput = {
          findings: [],
          activeWaivers: waivers,
          policy: { failOn: options.failOn ?? "critical" },
          scanExecutionIds: [],
          taskId: options.taskId,
        };
        const policyResult = await deps.policyEvaluator.evaluate(policyInput);

        return {
          findings: [],
          agentResults: [],
          policyDecision: policyResult.decision,
          summary: {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            suppressed: 0,
            agentsRun: 0,
            agentsFailed: 0,
          },
          executionIds: {
            scans: [],
            policy: "",
          },
          warning: "No audit agents found",
        };
      }

      // 3. Execute each agent (allSettled: one failure doesn't abort batch -- AORCH-B5)
      const settled = await Promise.allSettled(
        auditAgents.map((agentId) =>
          executeAgent(deps.agentRunner, agentId, options),
        ),
      );

      const agentResults: AgentAuditResult[] = settled.map((s, i) =>
        s.status === "fulfilled"
          ? s.value
          : {
              agentId: auditAgents[i] ?? "unknown",
              sarif: emptySarif(),
              executionId: "",
              status: "error" as const,
              durationMs: 0,
              errorMessage:
                s.reason instanceof Error
                  ? s.reason.message
                  : String(s.reason),
            },
      );

      // 4. Consolidate findings with dedup by fingerprint
      const rawFindings = consolidateFindings(agentResults);

      // 5-6. Pass raw findings + waivers to PolicyEvaluator (it handles waiver application internally)
      const scanExecutionIds = agentResults.map((r) => r.executionId);
      const policyInput: PolicyEvaluationInput = {
        findings: rawFindings,
        activeWaivers: waivers,
        policy: { failOn: options.failOn ?? "critical" },
        scanExecutionIds,
        taskId: options.taskId,
      };
      const policyResult = await deps.policyEvaluator.evaluate(policyInput);

      // Derive findings with waiver state from the policy decision to avoid
      // duplicating waiver application logic. PolicyEvaluator is the single source
      // of truth for waiver matching.
      const waivedFingerprints = new Set(
        policyResult.decision.waivedFindings.map((f) => f.fingerprint),
      );
      const waiverByFingerprint = new Map<string, ActiveWaiver>();
      for (const f of policyResult.decision.waivedFindings) {
        if (f.waiver) {
          waiverByFingerprint.set(f.fingerprint, f.waiver);
        }
      }
      const findingsWithWaivers = rawFindings.map((f) => {
        const waiver = waiverByFingerprint.get(f.fingerprint);
        if (waivedFingerprints.has(f.fingerprint) && waiver) {
          return { ...f, isWaived: true, waiver };
        }
        return f;
      });

      return {
        findings: findingsWithWaivers,
        agentResults,
        policyDecision: policyResult.decision,
        summary: buildSummary(findingsWithWaivers, agentResults),
        executionIds: {
          scans: scanExecutionIds,
          policy: policyResult.executionRecord.id,
        },
      };
    },
  };
}

