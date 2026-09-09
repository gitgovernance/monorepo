import type { SarifLog } from "../sarif/sarif.types";
import { rehydrateFinding } from "../audit/types";
import { computeFingerprint } from "../audit/fingerprint";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { Waiver } from "../source_auditor/types";
import type { RunOptions } from "../agent_runner/agent_runner.types";
import type {
  AgentRecordReader,
  AuditOrchestratorDeps,
  AuditOrchestrationOptions,
  AuditOrchestrationResult,
  AgentAuditResult,
  AgentAuditInput,
  Finding,
  AuditSummary,
  FindingSeverity,
  ReviewAgentResult,
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
  agentStore: AgentRecordReader,
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
 * [AORCH-F1] Discovers AgentRecords with metadata.purpose === "review".
 */
async function discoverReviewAgents(
  agentStore: AgentRecordReader,
): Promise<string[]> {
  const agentIds = await agentStore.list();
  const reviewAgentIds: string[] = [];

  for (const id of agentIds) {
    const record = await agentStore.get(id);
    if (!record) continue;
    const meta = record.payload.metadata as
      | Record<string, unknown>
      | undefined;
    if (meta && meta["purpose"] === "review") {
      reviewAgentIds.push(record.payload.id);
    }
  }

  return reviewAgentIds;
}

/**
 * [AORCH-F1, F2, F4] Executes a single review agent and returns its result.
 * AgentRunner creates the FeedbackRecord automatically (EARS-L1).
 */
async function executeReviewAgent(
  agentRunner: IAgentRunner,
  agentId: string,
  findings: Finding[],
  policyDecision: AuditOrchestrationResult["policyDecision"],
  taskId: string,
): Promise<ReviewAgentResult> {
  const startMs = Date.now();

  try {
    // [AORCH-F2] Pass findings, policyDecision, and taskId in ctx.input
    const runOpts: RunOptions = {
      agentId,
      taskId,
      input: {
        findings,
        policyDecision,
        taskId,
      },
    };

    const response = await agentRunner.runOnce(runOpts);

    return {
      agentId,
      status: "success",
      durationMs: Date.now() - startMs,
      feedbackRecordId: response.executionRecordId,
    };
  } catch (err) {
    // [AORCH-F4] Review agent failure never blocks the pipeline
    return {
      agentId,
      status: "error",
      durationMs: Date.now() - startMs,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
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
    ...(options.ref !== undefined ? { ref: options.ref } : {}),
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
 * Consolidates findings from multiple SarifLogs by identity, compared by equality.
 *
 * This module does not own the formula and never recomputes a transported value: it reads
 * `fingerprints["gitgov/v2"]` (SARIF-N1) and, when a result arrives without it, derives one
 * with the same `computeFingerprint` the detectors use (AORCH-B12).
 */
function consolidateFindings(
  agentResults: AgentAuditResult[],
): Finding[] {
  const byFingerprint = new Map<string, Finding>();

  for (const result of agentResults) {
    if (result.status !== "success") continue;

    for (const run of result.sarif.runs) {
      for (const sarifResult of run.results) {
        const location = sarifResult.locations?.[0]?.physicalLocation;
        const props = sarifResult.properties as
          | Record<string, unknown>
          | undefined;
        const rawCategory =
          (props?.["gitgov/category"] as string | undefined) ?? "unknown-risk";
        const category = rawCategory as import("../audit/types").FindingCategory;
        const snippet = location?.region?.snippet?.text;

        // [AORCH-B6] The identity travels in fingerprints["gitgov/v2"] and is compared by
        // equality. Reading partialFingerprints here was the bug: that key is GitHub's line
        // hash, it carried neither file nor category, and it silently replaced whatever the
        // detector had computed.
        const transported = sarifResult.fingerprints?.["gitgov/v2"];

        // [AORCH-B12] No key — an external tool, or a SARIF written before the cut. Derive
        // it with the SAME function the detectors use, never from ruleId/file/startLine: a
        // positional identity changes the moment someone inserts a line above the finding,
        // so "the same finding" became a new one between runs. Without a snippet there is
        // nothing to anchor on and the result is skipped.
        const file = location?.artifactLocation?.uri;
        const fingerprint =
          transported ??
          (file && snippet
            ? computeFingerprint({ file, category, anchor: snippet })
            : undefined);
        if (!fingerprint) continue;

        const existing = byFingerprint.get(fingerprint);

        if (existing) {
          // [AORCH-B14] Same key, different category: with AUDIT-K2 the category is inside
          // the preimage, so this can only come from a malformed SARIF. Merging would leave
          // the consolidated finding wearing whichever category arrived first — the D-c
          // defect, silently. Keep the first, reject the second, and say so.
          if (existing.category !== category) {
            console.warn(
              `[AORCH-B14] Rejected SARIF result from ${result.agentId}: fingerprint ${fingerprint} ` +
                `is already consolidated as "${existing.category}" and this result declares "${category}". ` +
                `Two categories cannot share an identity; the second was not merged.`,
            );
            continue;
          }
          // Dedup: add agent to reportedBy
          if (!existing.reportedBy.includes(result.agentId)) {
            existing.reportedBy.push(result.agentId);
          }
        } else {
          const detector = (props?.["gitgov/detector"] as string | undefined) ?? "regex";
          const confidence = (props?.["gitgov/confidence"] as number | undefined) ?? 1.0;

          // [AUDIT-K5] [AORCH-B6] Rehydration, not production: the identity arrives with
          // the SARIF result and is kept byte for byte. The consumer has no anchor here and
          // the snippet may be truncated or redacted, so recomputing would diverge from the
          // producer — which is how two identities entered the system to begin with.
          const finding = rehydrateFinding({
            fingerprint,
            ruleId: sarifResult.ruleId,
            file: location?.artifactLocation?.uri ?? "",
            line: location?.region?.startLine ?? 0,
            message: sarifResult.message.text,
            snippet: snippet ?? '',
            category,
            severity: levelToSeverity(sarifResult.level),
            detector: detector as import("../audit/types").DetectorName,
            confidence,
            executionId: result.executionId,
            reportedBy: [result.agentId],
            isWaived: false,
          });
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
  findings: Finding[],
  agentResults: AgentAuditResult[],
  activeWaivers: Waiver[] = [],
): AuditSummary {
  const active = findings.filter((f) => !f.isWaived);
  const present = new Set(findings.map((f) => f.fingerprint));
  return {
    total: findings.length,
    critical: active.filter((f) => f.severity === "critical").length,
    high: active.filter((f) => f.severity === "high").length,
    medium: active.filter((f) => f.severity === "medium").length,
    low: active.filter((f) => f.severity === "low").length,
    suppressed: findings.filter((f) => f.isWaived).length,
    // [AORCH-B15] Active waivers pointing at an identity nothing produced. After the cut
    // (AUDIT-K1..K6) every waiver written with the old value lands here, and without the
    // count "0 waived" reads exactly like "there were no waivers".
    unmatchedWaivers: activeWaivers.filter((w) => !present.has(w.fingerprint)).length,
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
      // [AORCH-B1, B2] Discover audit agents (filter by purpose + optional agentId)
      const auditAgents = await discoverAuditAgents(
        deps.recordStore,
        options.agentId,
      );

      // Load waivers upfront (needed for policy evaluation)
      let waivers: Waiver[] = [];
      try {
        waivers = await deps.waiverReader.loadWaivers();
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
          l1AgentResults: [],
          policyDecision: policyResult.decision,
          summary: {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            suppressed: 0,
            // [AORCH-B15] Waivers loaded, no agents to match them against: every active
            // waiver is unmatched, and saying 0 here would hide exactly that.
            unmatchedWaivers: waivers.length,
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

      // [AORCH-A1, B4, B5, B8] Execute each agent (allSettled: one failure doesn't abort batch)
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

      // [AORCH-E1] Produce L1-redacted SARIF copies (redactor is required)
      // [AORCH-E3] Agents do not need knowledge of RedactionLevel
      const l1AgentResults: AgentAuditResult[] = agentResults.map((r) => ({
        ...r,
        sarif: deps.redactor.redactSarif(r.sarif, "l1"),
      }));

      // [AORCH-E2] [RLDX-F2] Enrich L2 agentResults with snippetHash (snippet preserved, hash added)
      for (const r of agentResults) {
        r.sarif = deps.redactor.redactSarif(r.sarif, "l2");
      }

      // [AORCH-B6, B12, B13] Consolidate findings with dedup by fingerprint
      const rawFindings = consolidateFindings(agentResults);

      // [AORCH-B7, D1, D4] Pass raw findings + waivers to PolicyEvaluator
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
      const waiverByFingerprint = new Map<string, Waiver>();
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

      // [AORCH-G1] [AORCH-G2] Detect agents that failed due to unresolvable entrypoint
      const failedAgents = agentResults.filter(
        r => r.status === 'error' && r.errorMessage &&
          (r.errorMessage.includes('MODULE_NOT_FOUND') || r.errorMessage.includes('ERR_MODULE_NOT_FOUND') || r.errorMessage.includes('Cannot find module')),
      );
      let entrypointWarning: string | undefined;
      if (failedAgents.length > 0) {
        const details = failedAgents.map(a => {
          const m = a.errorMessage?.match(/['"]([^'"]+)['"]/);
          const pkg = m?.[1] ?? 'unknown';
          return `  ${a.agentId} — ${pkg} not found`;
        }).join('\n');
        const successCount = agentResults.filter(r => r.status === 'success').length;
        const guidance = '\n\nRegister an agent with: gitgov agent new <path-to-agent>\nOr install from npm:    npm install <package>';
        entrypointWarning = successCount === 0
          ? `All audit agents failed to load:\n${details}${guidance}`
          : `Some audit agents failed to load:\n${details}${guidance}`;
      }

      const result: AuditOrchestrationResult = {
        findings: findingsWithWaivers,
        agentResults,
        l1AgentResults,
        policyDecision: policyResult.decision,
        summary: buildSummary(findingsWithWaivers, agentResults, waivers),
        executionIds: {
          scans: scanExecutionIds,
          policy: policyResult.executionRecord.id,
        },
        ...(entrypointWarning ? { warning: entrypointWarning } : {}),
      };

      // [AORCH-F1] Discover and execute review agents post-policy
      // [AORCH-F3] If no review agents found, skip silently (no warning, no error)
      const reviewAgents = await discoverReviewAgents(deps.recordStore);
      if (reviewAgents.length > 0) {
        // [AORCH-F1, F2] Execute review agents with findings + policyDecision
        const reviewSettled = await Promise.allSettled(
          reviewAgents.map((agentId) =>
            executeReviewAgent(
              deps.agentRunner,
              agentId,
              findingsWithWaivers,
              policyResult.decision,
              options.taskId,
            ),
          ),
        );

        // [AORCH-F4] Collect results — failures don't block pipeline
        result.reviewResults = reviewSettled.map((s, i) =>
          s.status === "fulfilled"
            ? s.value
            : {
                agentId: reviewAgents[i] ?? "unknown",
                status: "error" as const,
                durationMs: 0,
                errorMessage:
                  s.reason instanceof Error
                    ? s.reason.message
                    : String(s.reason),
              },
        );
      }

      return result;
    },
  };
}

