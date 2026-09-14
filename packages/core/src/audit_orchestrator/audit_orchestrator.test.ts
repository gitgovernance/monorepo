import { createHash } from "node:crypto";
import { createAuditOrchestrator } from "./audit_orchestrator";
import { computeFingerprint } from "../audit/fingerprint";
import type {
  AuditOrchestratorDeps,
  AuditOrchestrationOptions,
} from "./audit_orchestrator.types";
import type { SarifLog, SarifResult } from "../sarif/sarif.types";
import type { RecordStore } from "../record_store/record_store";
import type { GitGovAgentRecord } from "../record_types";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { RunOptions, AgentResponse } from "../agent_runner/agent_runner.types";
import type { IWaiverReader, Waiver } from "../source_auditor/types";
import type {
  PolicyEvaluator,
  PolicyEvaluationResult,
  PolicyDecision,
  Finding,
} from "../policy_evaluator/policy_evaluator.types";
import { FindingRedactor, DEFAULT_REDACTION_CONFIG } from "../redaction";
import { RuntimeNotFoundError } from "../agent_runner/agent_runner.errors";

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Creates a valid SarifLog with given results.
 * Uses `as SarifResult[]` to bypass strict SarifResultProperties typing
 * since tests use arbitrary property values.
 */
function makeSarifLog(results: Record<string, unknown>[] = []): SarifLog {
  return {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "test-tool",
            version: "1.0.0",
            informationUri: "https://example.com",
          },
        },
        results: results as SarifResult[],
      },
    ],
  };
}

function makeAgentRecord(
  id: string,
  purpose: string,
): GitGovAgentRecord {
  return {
    header: {
      version: "1.0",
      type: "agent",
      payloadChecksum: "abc123",
      signatures: [
        {
          keyId: "agent:test",
          role: "author",
          notes: "test signature",
          signature: "dGVzdA==".padEnd(88, "="),
          timestamp: Date.now(),
        },
      ],
    },
    payload: {
      id,
      engine: { type: "local" },
      metadata: { purpose },
    },
  };
}

function makeAgentResponse(
  agentId: string,
  sarif: SarifLog,
  executionRecordId: string = "exec-001",
): AgentResponse {
  return {
    runId: "run-" + agentId,
    agentId,
    status: "success",
    output: {
      message: "Scan completed",
      metadata: {
        kind: "sarif",
        version: "2.1.0",
        data: sarif,
      },
    },
    executionRecordId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 100,
  };
}

/**
 * The response FsAgentRunner resolves when the backend fails: it catches the error and returns
 * status "error" with the message, instead of throwing (ARUN-J3).
 */
function makeErrorResponse(agentId: string, error: string): AgentResponse {
  return {
    runId: "run-" + agentId,
    agentId,
    status: "error",
    error,
    executionRecordId: "exec-err-" + agentId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 1,
  };
}

function makePolicyDecision(
  decision: "pass" | "block" = "pass",
  reason: string = "No issues",
): PolicyDecision {
  return {
    decision,
    reason,
    executionId: "",
    blockingFindings: [],
    waivedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    rulesEvaluated: [],
    evaluatedAt: new Date().toISOString(),
  };
}

function makePolicyResult(
  decision: "pass" | "block" = "pass",
  reason: string = "No issues",
): PolicyEvaluationResult {
  const policyDecision = makePolicyDecision(decision, reason);
  return {
    decision: policyDecision,
    executionRecord: {
      id: `exec-policy-test-${Date.now()}`,
      type: "decision",
      title: "Policy evaluation",
      result: decision === "pass" ? "PASS" : "BLOCK",
      references: [],
      metadata: {
        kind: "policy-decision",
        version: "1.0.0",
        data: policyDecision,
      },
    },
  };
}

function createMockDeps(overrides?: Partial<AuditOrchestratorDeps>): AuditOrchestratorDeps {
  const recordStore: RecordStore<GitGovAgentRecord> = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
    putDeferred: jest.fn().mockResolvedValue(undefined),
    putMany: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
  };

  const agentRunner: IAgentRunner = {
    runOnce: jest.fn().mockResolvedValue(makeAgentResponse("test", makeSarifLog())),
  };

  const waiverReader: IWaiverReader = {
    loadWaivers: jest.fn().mockResolvedValue([]),
    hasWaiver: jest.fn().mockResolvedValue(false),
  };

  const policyEvaluator: PolicyEvaluator = {
    evaluate: jest.fn().mockResolvedValue(makePolicyResult()),
  };

  const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);

  return {
    recordStore,
    agentRunner,
    waiverReader,
    policyEvaluator,
    redactor,
    ...overrides,
  };
}

const defaultOptions: AuditOrchestrationOptions = {
  scope: "full",
  taskId: "1234567890-task-test",
};

/** An active waiver keyed on `fingerprint`, with the FeedbackRecord shape the reader returns. */
function makeWaiver(fingerprint: string): Waiver {
  const waiver: Waiver = {
    fingerprint,
    ruleId: "SEC-001",
    feedback: {
      header: {
        version: "1.0",
        type: "feedback",
        payloadChecksum: "test",
        // Same shape the agent record helper uses above: the type requires at least one
        // signature, and nothing in this module verifies it — the waiver reader is mocked.
        signatures: [
          {
            keyId: "human:test",
            role: "author",
            notes: "test waiver",
            signature: "dGVzdA==".padEnd(88, "="),
            timestamp: Date.now(),
          },
        ],
      },
      payload: {
        id: `1234567890-feedback-waiver-${fingerprint}`,
        entityType: "execution",
        entityId: "exec-previous",
        type: "approval",
        status: "acknowledged",
        content: "Risk accepted per security review",
        metadata: { fingerprint, ruleId: "SEC-001", file: "src/config.ts", line: 10 },
      },
    },
  };
  return waiver;
}

function makeSarifResult(overrides: {
  ruleId: string;
  level: "error" | "warning" | "note" | "none";
  message: string;
  file: string;
  startLine: number;
  fingerprint?: string;
  category?: string;
  snippet?: string;
  snippetHash?: string;
  legacyKeyOnly?: boolean;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ruleId: overrides.ruleId,
    level: overrides.level,
    message: { text: overrides.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: overrides.file },
          region: { startLine: overrides.startLine },
        },
      },
    ],
    properties: {
      "gitgov/category": overrides.category ?? "unknown-risk",
      "gitgov/detector": "regex",
      "gitgov/confidence": 0.9,
      ...(overrides.snippetHash !== undefined ? { "gitgov/snippetHash": overrides.snippetHash } : {}),
    },
  };

  if (overrides.snippet !== undefined) {
    const loc = (result["locations"] as Array<Record<string, any>>)[0]!;
    loc["physicalLocation"].region.snippet = { text: overrides.snippet };
  }

  // [AORCH-B6] The identity travels under `fingerprints["gitgov/v2"]` (SARIF-N1). The old
  // `partialFingerprints["primaryLocationLineHash/v1"]` is GitHub's line hash and is no
  // longer read as identity; `legacyKeyOnly` emits it alone, to exercise B12's fallback.
  if (overrides.fingerprint) {
    if (overrides.legacyKeyOnly) {
      result["partialFingerprints"] = {
        "primaryLocationLineHash/v1": overrides.fingerprint,
      };
    } else {
      result["fingerprints"] = { "gitgov/v2": overrides.fingerprint };
    }
  }

  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe("AuditOrchestrator", () => {
  describe("4.1. Agent Discovery (AORCH-A1)", () => {
    it("[AORCH-A1] should pass scope, include, exclude, and taskId in ctx.input to AgentRunner", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog();

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      await orchestrator.run({
        scope: "diff",
        include: ["src/**/*.ts"],
        exclude: ["node_modules/**"],
        taskId: "1234567890-task-audit",
      });

      expect(deps.agentRunner.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "agent:security-audit",
          taskId: "1234567890-task-audit",
          input: {
            scope: "diff",
            include: ["src/**/*.ts"],
            exclude: ["node_modules/**"],
            taskId: "1234567890-task-audit",
          },
        }),
      );
    });
  });

  describe("4.2. Agent Execution (AORCH-B1 to B5, B8)", () => {
    it("[AORCH-B1] should read AgentRecords from RecordStore and filter by metadata.purpose === audit", async () => {
      const auditAgent = makeAgentRecord("agent:security-audit", "audit");
      const nonAuditAgent = makeAgentRecord("agent:deployment", "deploy");

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:security-audit",
        "agent:deployment",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return auditAgent;
        if (id === "agent:deployment") return nonAuditAgent;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", makeSarifLog(), "exec-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // Only the audit agent should be executed
      expect(deps.agentRunner.runOnce).toHaveBeenCalledTimes(1);
      expect(deps.agentRunner.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent:security-audit" }),
      );
      expect(result.agentResults).toHaveLength(1);
      const firstResult = result.agentResults[0]!;
      expect(firstResult).toBeDefined();
      expect(firstResult.agentId).toBe("agent:security-audit");
    });

    it("[AORCH-B2] should filter discovered agents to only the specified agentId when --agent is provided", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:pii-scan", "audit");

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:security-audit",
        "agent:pii-scan",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return agent1;
        if (id === "agent:pii-scan") return agent2;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:pii-scan", makeSarifLog(), "exec-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run({
        ...defaultOptions,
        agentId: "agent:pii-scan",
      });

      expect(deps.agentRunner.runOnce).toHaveBeenCalledTimes(1);
      expect(deps.agentRunner.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent:pii-scan" }),
      );
      expect(result.agentResults).toHaveLength(1);
      const firstResult = result.agentResults[0]!;
      expect(firstResult).toBeDefined();
      expect(firstResult.agentId).toBe("agent:pii-scan");
    });

    it("[AORCH-B3] should return empty findings and warning when no audit agents are found", async () => {
      const nonAuditAgent = makeAgentRecord("agent:deployment", "deploy");

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:deployment"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(nonAuditAgent);

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(0);
      expect(result.agentResults).toHaveLength(0);
      expect(result.l1AgentResults).toEqual([]);
      expect(result.summary.total).toBe(0);
      expect(result.summary.agentsRun).toBe(0);
      expect(deps.agentRunner.runOnce).not.toHaveBeenCalled();
      expect(result.warning).toBe("No audit agents found");
    });

    it("[AORCH-B4] should collect SarifLog and include in agentResults with status success when agent succeeds", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret found",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "hash-sec-001",
          category: "hardcoded-secret",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.agentResults).toHaveLength(1);
      const firstResult = result.agentResults[0]!;
      expect(firstResult).toBeDefined();
      expect(firstResult.status).toBe("success");
      const firstRun = firstResult.sarif.runs[0]!;
      expect(firstRun).toBeDefined();
      expect(firstRun.results).toHaveLength(1);
      expect(firstResult.executionId).toBe("exec-scan-001");
    });

    it("[AORCH-B5] should report status error when the runner resolves a response with status error", async () => {
      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(makeAgentRecord("agent:security-audit", "audit"));
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeErrorResponse("agent:security-audit", "RuntimeNotFound: typescript"),
      );

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      // Anti-vacuity: the agent was discovered and dispatched.
      expect(deps.agentRunner.runOnce).toHaveBeenCalledTimes(1);
      expect(result.agentResults).toHaveLength(1);
      const agent = result.agentResults[0]!;
      expect(agent.status).toBe("error");
      expect(agent.errorMessage).toBe("RuntimeNotFound: typescript");
      expect(result.findings).toHaveLength(0);
      // "Nothing was scanned" is readable from the summary, not from an empty findings list.
      expect(result.summary.agentsRun).toBe(0);
      expect(result.summary.agentsFailed).toBe(1);
    });

    it("[AORCH-B5] should let the G1 warning see an unresolvable entrypoint returned as a response", async () => {
      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(makeAgentRecord("agent:security-audit", "audit"));
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeErrorResponse("agent:security-audit", "Cannot find module '@gitgov/agent-security-audit'"),
      );

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      expect(result.warning).toContain("agent:security-audit — @gitgov/agent-security-audit not found");
      expect(result.warning).toContain("All audit agents failed to load");
    });

    it("[AORCH-B5] should include result with status error and continue with remaining agents when agent fails", async () => {
      const agent1 = makeAgentRecord("agent:failing-audit", "audit");
      const agent2 = makeAgentRecord("agent:working-audit", "audit");

      const workingSarif = makeSarifLog([
        makeSarifResult({
          ruleId: "PII-001",
          level: "warning",
          message: "PII detected",
          file: "src/user.ts",
          startLine: 5,
          fingerprint: "hash-pii-001",
          category: "pii-email",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:failing-audit",
        "agent:working-audit",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:failing-audit") return agent1;
        if (id === "agent:working-audit") return agent2;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock).mockImplementation(
        async (opts: RunOptions) => {
          if (opts.agentId === "agent:failing-audit") {
            throw new Error("Agent crashed");
          }
          return makeAgentResponse("agent:working-audit", workingSarif, "exec-002");
        },
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // Both agents should appear in results
      expect(result.agentResults).toHaveLength(2);

      const failedResult = result.agentResults.find(
        (r) => r.agentId === "agent:failing-audit",
      );
      expect(failedResult).toBeDefined();
      expect(failedResult?.status).toBe("error");
      expect(failedResult?.errorMessage).toBe("Agent crashed");

      const successResult = result.agentResults.find(
        (r) => r.agentId === "agent:working-audit",
      );
      expect(successResult).toBeDefined();
      expect(successResult?.status).toBe("success");

      // Findings from the working agent should still be consolidated
      expect(result.findings).toHaveLength(1);
      const firstFinding = result.findings[0]!;
      expect(firstFinding).toBeDefined();
      expect(firstFinding.ruleId).toBe("PII-001");

      // Summary should reflect both
      expect(result.summary.agentsRun).toBe(1);
      expect(result.summary.agentsFailed).toBe(1);
    });

    it("[AORCH-B8] should create one ExecutionRecord of type analysis per agent via AgentRunner", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:pii-scan", "audit");

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:security-audit",
        "agent:pii-scan",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return agent1;
        if (id === "agent:pii-scan") return agent2;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock)
        .mockResolvedValueOnce(
          makeAgentResponse("agent:security-audit", makeSarifLog(), "exec-scan-001"),
        )
        .mockResolvedValueOnce(
          makeAgentResponse("agent:pii-scan", makeSarifLog(), "exec-scan-002"),
        );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // AgentRunner was called once per agent with type context
      expect(deps.agentRunner.runOnce).toHaveBeenCalledTimes(2);
      const firstCall = (deps.agentRunner.runOnce as jest.Mock).mock.calls[0]![0];
      expect(firstCall.input.taskId).toBe(defaultOptions.taskId);

      // ExecutionRecord IDs are captured from AgentRunner responses
      expect(result.executionIds.scans).toEqual(["exec-scan-001", "exec-scan-002"]);
      const result0 = result.agentResults[0]!;
      const result1 = result.agentResults[1]!;
      expect(result0).toBeDefined();
      expect(result1).toBeDefined();
      expect(result0.executionId).toBe("exec-scan-001");
      expect(result1.executionId).toBe("exec-scan-002");
    });
  });

  describe("4.3. Consolidation and Dedup (AORCH-B6, B12)", () => {
    it("[AORCH-B6] should merge results sharing fingerprints gitgov/v2 across agents into one finding with both reportedBy", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:pii-scan", "audit");

      const sharedResult = makeSarifResult({
        ruleId: "SEC-001",
        level: "error",
        message: "Hardcoded secret",
        file: "src/config.ts",
        startLine: 10,
        fingerprint: "shared-hash-001",
        category: "hardcoded-secret",
      });

      const sarif1 = makeSarifLog([sharedResult]);
      const sarif2 = makeSarifLog([sharedResult]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:security-audit",
        "agent:pii-scan",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return agent1;
        if (id === "agent:pii-scan") return agent2;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock)
        .mockResolvedValueOnce(
          makeAgentResponse("agent:security-audit", sarif1, "exec-001"),
        )
        .mockResolvedValueOnce(
          makeAgentResponse("agent:pii-scan", sarif2, "exec-002"),
        );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // Only one consolidated finding despite two agents reporting it
      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;
      expect(finding).toBeDefined();
      expect(finding.fingerprint).toBe("shared-hash-001");
      expect(finding.reportedBy).toEqual([
        "agent:security-audit",
        "agent:pii-scan",
      ]);
    });

    it("[AORCH-B12] should warn when discarding a result that has neither the identity key nor a snippet", async () => {
      // B12 says such a result is skipped. The skip used to be a bare `continue`, so a
      // malformed SARIF produced a shorter findings list and nothing recorded why — while B14
      // warns in the analogous case. Same format as B14 so both filter together in a log.
      const agent = makeAgentRecord("agent:external-tool", "audit");
      const bare = makeSarifResult({
        ruleId: "EXT-002",
        level: "warning",
        message: "Bare result",
        file: "src/x.ts",
        startLine: 3,
        category: "unknown-risk",
        // no fingerprint, no snippet: nothing to transport and nothing to anchor on
      });

      const warn = jest.spyOn(console, "warn").mockImplementation(() => { /* captured */ });
      try {
        const deps = createMockDeps();
        (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:external-tool"]);
        (deps.recordStore.get as jest.Mock).mockResolvedValue(agent);
        (deps.agentRunner.runOnce as jest.Mock).mockResolvedValueOnce(
          makeAgentResponse("agent:external-tool", makeSarifLog([bare]), "exec-001"),
        );

        const out = await createAuditOrchestrator(deps).run(defaultOptions);

        // Discarded, as B12 requires.
        expect(out.findings).toHaveLength(0);

        // And said so. Filtered by tag so an unrelated warn cannot satisfy this.
        const b12 = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[AORCH-B12]"));
        expect(b12).toHaveLength(1);
        expect(b12[0]).toContain("agent:external-tool");
      } finally {
        warn.mockRestore();
      }
    });

    it("[AORCH-B12] should discard with a warning a result without the key whose snippet is redacted or a placeholder", async () => {
      const agent = makeAgentRecord("agent:external-tool", "audit");
      // Two different results of one file and category that carry no usable text. Anchored
      // on that text, they would share one identity and consolidation would keep only one.
      const redacted = makeSarifResult({
        ruleId: "EXT-003", level: "error", message: "Redacted", file: "src/x.ts", startLine: 3,
        category: "hardcoded-secret", snippet: "[REDACTED]",
      });
      const placeholder = makeSarifResult({
        ruleId: "EXT-004", level: "error", message: "Login placeholder", file: "src/x.ts", startLine: 9,
        category: "hardcoded-secret", snippet: "requires login",
      });

      const warn = jest.spyOn(console, "warn").mockImplementation(() => { /* captured */ });
      try {
        const deps = createMockDeps();
        (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:external-tool"]);
        (deps.recordStore.get as jest.Mock).mockResolvedValue(agent);
        (deps.agentRunner.runOnce as jest.Mock).mockResolvedValueOnce(
          makeAgentResponse("agent:external-tool", makeSarifLog([redacted, placeholder]), "exec-001"),
        );

        const out = await createAuditOrchestrator(deps).run(defaultOptions);

        expect(out.findings).toHaveLength(0);
        const b12 = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[AORCH-B12]"));
        expect(b12).toEqual([
          "[AORCH-B12] Discarded SARIF result from agent:external-tool: no fingerprint key and a redacted snippet",
          "[AORCH-B12] Discarded SARIF result from agent:external-tool: no fingerprint key and no snippet text to anchor on",
        ]);
      } finally {
        warn.mockRestore();
      }
    });

    it("[AORCH-B12] should compute the identity with computeFingerprint when fingerprints gitgov/v2 is missing", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:external-tool", "audit");

      // An external tool: no gitgov/v2 key, but a snippet to anchor on.
      const resultWithoutFingerprint = makeSarifResult({
        ruleId: "EXT-001",
        level: "warning",
        message: "External finding",
        file: "src/app.ts",
        startLine: 42,
        category: "unknown-risk",
        snippet: 'const token = "ext-abc123"',
      });

      const sarif1 = makeSarifLog([resultWithoutFingerprint]);
      const sarif2 = makeSarifLog([resultWithoutFingerprint]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:security-audit",
        "agent:external-tool",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return agent1;
        if (id === "agent:external-tool") return agent2;
        return null;
      });
      (deps.agentRunner.runOnce as jest.Mock)
        .mockResolvedValueOnce(
          makeAgentResponse("agent:security-audit", sarif1, "exec-001"),
        )
        .mockResolvedValueOnce(
          makeAgentResponse("agent:external-tool", sarif2, "exec-002"),
        );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;

      // The SAME function the detectors use — not a formula this module owns.
      expect(finding.fingerprint).toBe(
        computeFingerprint({
          file: "src/app.ts",
          category: "unknown-risk",
          anchor: 'const token = "ext-abc123"',
        }),
      );
      expect(finding.reportedBy).toEqual([
        "agent:security-audit",
        "agent:external-tool",
      ]);

      // Negative control — the positional fallback it replaces. That value moved whenever
      // someone inserted a line above the finding, so "the same finding" became a new one
      // between runs. It must not be what we land on.
      expect(finding.fingerprint).not.toBe("fallback:EXT-001:src/app.ts:42");
      expect(finding.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("[AORCH-B6] should not read partialFingerprints primaryLocationLineHash/v1 as the identity", async () => {
      // THE negative control for B6's own bug. The orchestrator used to key consolidation on
      // partialFingerprints["primaryLocationLineHash/v1"] — GitHub's line hash, carrying
      // neither file nor category. `legacyKeyOnly` emits that key ALONE, with no gitgov/v2,
      // which is exactly what a SARIF written with that key looks like.
      const agent = makeAgentRecord("agent:security-audit", "audit");
      const legacyValue = "a1b2c3d4e5f60718:1";
      const snippet = 'const token = "sk-legacy"';
      const result = makeSarifResult({
        ruleId: "SEC-001",
        level: "error",
        message: "Legacy-keyed result",
        file: "src/legacy.ts",
        startLine: 7,
        fingerprint: legacyValue,
        legacyKeyOnly: true,
        category: "hardcoded-secret",
        snippet,
      });

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agent);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValueOnce(
        makeAgentResponse("agent:security-audit", makeSarifLog([result]), "exec-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const out = await orchestrator.run(defaultOptions);

      // ANTI-VACUITY: the result was NOT discarded — B12 derived an identity from the snippet,
      // so the assertions below are about which identity, not about presence.
      expect(out.findings).toHaveLength(1);
      const finding = out.findings[0]!;

      // The legacy line hash is not the identity. This is the line that turns red if the
      // orchestrator ever reads primaryLocationLineHash/v1 as a fallback again.
      expect(finding.fingerprint).not.toBe(legacyValue);

      // And what it IS: the same derivation the detectors use, from file + category + snippet.
      expect(finding.fingerprint).toBe(
        computeFingerprint({ file: "src/legacy.ts", category: "hardcoded-secret", anchor: snippet }),
      );
    });

    it("[AORCH-B6] should keep two findings when the same line carries two categories", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:pii-scan", "audit");

      // Same file and line, two categories: a secret and a PII hit. Under the old line hash
      // these collapsed into one finding wearing whichever category arrived first (D-c).
      const base = { level: "error" as const, message: "m", file: "src/config.ts", startLine: 10, snippet: 'const x = "a@b.com"' };
      const secret = makeSarifResult({ ...base, ruleId: "SEC-001", category: "hardcoded-secret", fingerprint: "fp-secret" });
      const pii = makeSarifResult({ ...base, ruleId: "PII-001", category: "pii-email", fingerprint: "fp-pii-email" });

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit", "agent:pii-scan"]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) =>
        id === "agent:security-audit" ? agent1 : id === "agent:pii-scan" ? agent2 : null,
      );
      (deps.agentRunner.runOnce as jest.Mock)
        .mockResolvedValueOnce(makeAgentResponse("agent:security-audit", makeSarifLog([secret]), "exec-001"))
        .mockResolvedValueOnce(makeAgentResponse("agent:pii-scan", makeSarifLog([pii]), "exec-002"));

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      expect(result.findings).toHaveLength(2);
      expect(result.findings.map((f) => f.category).sort()).toEqual(["hardcoded-secret", "pii-email"]);
      // Each keeps its own reporter — neither absorbed the other.
      expect(result.findings.every((f) => f.reportedBy.length === 1)).toBe(true);
    });

    it("[AORCH-B6] should keep the transported fingerprint unchanged when rehydrating", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const transported = "b".repeat(64);

      const sarifResult = makeSarifResult({
        ruleId: "SEC-001",
        level: "error",
        message: "Hardcoded secret",
        file: "src/config.ts",
        startLine: 10,
        category: "hardcoded-secret",
        snippet: 'const k = "sk_test_x"',
        fingerprint: transported,
      });

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agent1);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", makeSarifLog([sarifResult]), "exec-001"),
      );

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.fingerprint).toBe(transported);

      // Negative control: recomputing here lands somewhere else, because the consumer has
      // no anchor and the snippet may be truncated or redacted by the time it arrives.
      expect(
        computeFingerprint({ file: "src/config.ts", category: "hardcoded-secret", anchor: 'const k = "sk_test_x"' }),
      ).not.toBe(transported);
    });

    it("[AORCH-B6] should keep a transported snippetHash when rehydrating", async () => {
      // A result whose snippet is not the text its hash was taken over — what an L1 result is,
      // with the redaction sentinel in place of the snippet. The finding keeps the transported
      // hash, which is the L1↔L2 bridge (RLDX-F2).
      const transportedHash = "d".repeat(64);
      const sarifResult = makeSarifResult({
        ruleId: "SEC-001", level: "error", message: "Hardcoded secret", file: "src/config.ts", startLine: 10,
        category: "hardcoded-secret", snippet: "[REDACTED]", fingerprint: "b".repeat(64), snippetHash: transportedHash,
      });

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(makeAgentRecord("agent:security-audit", "audit"));
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", makeSarifLog([sarifResult]), "exec-001"),
      );

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.snippetHash).toBe(transportedHash);
      // Negative control: the hash a recomputation lands on is the sentinel's.
      expect(createHash("sha256").update("[REDACTED]").digest("hex")).not.toBe(transportedHash);
    });

    it("[AORCH-B14] should not merge results sharing the key but differing in gitgov/category", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:pii-scan", "audit");
      const collided = "c".repeat(64);

      // Only reachable with a malformed SARIF — AUDIT-K2 puts category in the preimage, so
      // two categories cannot legitimately share a key. The point is that the consolidated
      // result must not go quiet wearing the first agent's category.
      const base = { level: "error" as const, message: "m", file: "src/config.ts", startLine: 10, fingerprint: collided };
      const asSecret = makeSarifResult({ ...base, ruleId: "SEC-001", category: "hardcoded-secret" });
      const asPii = makeSarifResult({ ...base, ruleId: "PII-001", category: "pii-email" });

      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const deps = createMockDeps();
        (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit", "agent:pii-scan"]);
        (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) =>
          id === "agent:security-audit" ? agent1 : id === "agent:pii-scan" ? agent2 : null,
        );
        (deps.agentRunner.runOnce as jest.Mock)
          .mockResolvedValueOnce(makeAgentResponse("agent:security-audit", makeSarifLog([asSecret]), "exec-001"))
          .mockResolvedValueOnce(makeAgentResponse("agent:pii-scan", makeSarifLog([asPii]), "exec-002"));

        const result = await createAuditOrchestrator(deps).run(defaultOptions);

        // The first wins, the second is rejected — and NOT absorbed into reportedBy.
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]!.category).toBe("hardcoded-secret");
        expect(result.findings[0]!.reportedBy).toEqual(["agent:security-audit"]);

        // The rejection is audible, and names both categories and the key.
        const message = warn.mock.calls.map((c) => String(c[0])).join("\n");
        expect(message).toContain("hardcoded-secret");
        expect(message).toContain("pii-email");
        expect(message).toContain(collided);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe("4.3. Consolidation and Dedup — Snippet Extraction (AORCH-B13)", () => {
    it("[AORCH-B13] should include snippet text in Finding when SARIF result has region.snippet.text", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarifResultWithSnippet = {
        ruleId: "SEC-001",
        level: "error",
        message: { text: "Hardcoded secret found" },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: "src/config.ts" },
              region: {
                startLine: 10,
                snippet: { text: 'const API_KEY = "sk-secret-12345";' },
              },
            },
          },
        ],
        fingerprints: {
          "gitgov/v2": "hash-snippet-001",
        },
        properties: {
          "gitgov/category": "hardcoded-secret",
          "gitgov/detector": "regex",
          "gitgov/confidence": 0.95,
        },
      };
      const sarif = makeSarifLog([sarifResultWithSnippet]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-snippet-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;
      expect(finding).toBeDefined();
      expect(finding.snippet).toBe('const API_KEY = "sk-secret-12345";');
    });

    it("[AORCH-B13] should set empty string snippet when SARIF region has no snippet.text", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-002",
          level: "warning",
          message: "Weak crypto",
          file: "src/crypto.ts",
          startLine: 20,
          fingerprint: "hash-no-snippet-001",
          category: "unknown-risk",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-no-snippet-001"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;
      expect(finding).toBeDefined();
      expect(finding.snippet).toBe('');
    });
  });

  describe("4.4. Waiver Application (AORCH-B7)", () => {
    it("[AORCH-B7] should continue with unsuppressed findings when WaiverReader fails", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "hash-sec-001",
          category: "hardcoded-secret",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-001"),
      );
      (deps.waiverReader.loadWaivers as jest.Mock).mockRejectedValue(
        new Error("WaiverReader connection failed"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      // Should not throw
      const result = await orchestrator.run(defaultOptions);

      // Findings should be returned unsuppressed
      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;
      expect(finding).toBeDefined();
      expect(finding.isWaived).toBe(false);
      expect(finding.waiver).toBeUndefined();
    });

    it("[AORCH-B7] should mark finding as suppressed when active waiver exists for its fingerprint", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "waived-hash-001",
          category: "hardcoded-secret",
        }),
        makeSarifResult({
          ruleId: "SEC-002",
          level: "warning",
          message: "Weak crypto",
          file: "src/crypto.ts",
          startLine: 20,
          fingerprint: "not-waived-hash-002",
          category: "unknown-risk",
        }),
      ]);

      const activeWaiver: Waiver = {
        fingerprint: "waived-hash-001",
        ruleId: "SEC-001",
        feedback: {
          header: { version: "1.0", type: "feedback", payloadChecksum: "test", signatures: [] },
          payload: {
            id: "1234567890-feedback-waiver-sec001",
            entityType: "execution",
            entityId: "exec-previous",
            type: "approval",
            status: "acknowledged",
            content: "Risk accepted per security review",
            metadata: {
              fingerprint: "waived-hash-001",
              ruleId: "SEC-001",
              file: "src/config.ts",
              line: 10,
            },
          },
        } as any,
      };

      // Set up policy evaluator mock to return waived finding in decision
      // (orchestrator now derives waiver state from policy decision, not independently)
      const waivedFinding: Finding = {
        fingerprint: "waived-hash-001",
        ruleId: "SEC-001",
        message: "Hardcoded secret",
        snippet: 'const secret = "sk-live-123"',
        snippetHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        severity: "critical",
        category: "hardcoded-secret",
        file: "src/config.ts",
        line: 10,
        detector: "regex",
        confidence: 1.0,
        executionId: "",
        reportedBy: ["agent:security-audit"],
        isWaived: true,
        waiver: activeWaiver,
      };
      const policyDecision = makePolicyDecision("pass", "All waived");
      policyDecision.waivedFindings = [waivedFinding];
      const policyResult: PolicyEvaluationResult = {
        decision: policyDecision,
        executionRecord: {
          id: `exec-policy-test-${Date.now()}`,
          type: "decision",
          title: "Policy evaluation",
          result: "PASS",
          references: [],
          metadata: {
            kind: "policy-decision",
            version: "1.0.0",
            data: policyDecision,
          },
        },
      };

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-001"),
      );
      (deps.waiverReader.loadWaivers as jest.Mock).mockResolvedValue([
        activeWaiver,
      ]);
      (deps.policyEvaluator.evaluate as jest.Mock).mockResolvedValue(policyResult);

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(2);

      const foundWaived = result.findings.find(
        (f) => f.fingerprint === "waived-hash-001",
      );
      expect(foundWaived).toBeDefined();
      expect(foundWaived?.isWaived).toBe(true);
      expect(foundWaived?.waiver).toBe(activeWaiver);

      const notWaivedFinding = result.findings.find(
        (f) => f.fingerprint === "not-waived-hash-002",
      );
      expect(notWaivedFinding).toBeDefined();
      expect(notWaivedFinding?.isWaived).toBe(false);
      expect(notWaivedFinding?.waiver).toBeUndefined();

      // Summary should count suppressed
      expect(result.summary.suppressed).toBe(1);
    });

    it("[AORCH-B15] should report active waivers that matched no consolidated finding in summary.unmatchedWaivers", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "fp-present",
          category: "hardcoded-secret",
        }),
      ]);

      // Two active waivers: one covers the finding that exists, the other points at an
      // identity nothing produces any more — what a waiver written with an earlier identity becomes.
      const matching = makeWaiver("fp-present");
      const orphaned = makeWaiver("fp-from-before-the-cut");

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-001"),
      );
      (deps.waiverReader.loadWaivers as jest.Mock).mockResolvedValue([matching, orphaned]);

      const result = await createAuditOrchestrator(deps).run(defaultOptions);

      expect(result.summary.unmatchedWaivers).toBe(1);

      // ANTI-VACUITY / negative control: with every waiver matching, the count is 0 — so a
      // 1 above means "one did not match", not "the field is always 1". Without this pair a
      // hardcoded 0 would pass the first assertion's opposite and nobody would notice: a
      // silent 0 is exactly the failure this EARS exists to prevent.
      (deps.waiverReader.loadWaivers as jest.Mock).mockResolvedValue([matching]);
      const allMatched = await createAuditOrchestrator(deps).run(defaultOptions);
      expect(allMatched.summary.unmatchedWaivers).toBe(0);
    });

    it("[AORCH-B15] should report unmatchedWaivers as null when the run did not cover every file a waiver can point at", async () => {
      const sarif = makeSarifLog([
        makeSarifResult({ ruleId: "SEC-001", level: "error", message: "s", file: "src/config.ts", startLine: 10, fingerprint: "fp-present", category: "hardcoded-secret" }),
      ]);
      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(makeAgentRecord("agent:security-audit", "audit"));
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(makeAgentResponse("agent:security-audit", sarif, "exec-001"));
      // A waiver on a file this narrower run may not have read.
      (deps.waiverReader.loadWaivers as jest.Mock).mockResolvedValue([makeWaiver("fp-on-an-untouched-file")]);
      const orchestrator = createAuditOrchestrator(deps);

      const narrower: AuditOrchestrationOptions[] = [
        { ...defaultOptions, scope: "diff" },
        { ...defaultOptions, include: ["src/**"] },
        { ...defaultOptions, exclude: ["test/**"] },
        { ...defaultOptions, agentId: "agent:security-audit" },
      ];
      for (const options of narrower) {
        expect((await orchestrator.run(options)).summary.unmatchedWaivers).toBeNull();
      }

      // An agent that failed did not read its files either.
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValueOnce(makeErrorResponse("agent:security-audit", "boom"));
      expect((await orchestrator.run(defaultOptions)).summary.unmatchedWaivers).toBeNull();

      // Nothing ran at all.
      (deps.recordStore.list as jest.Mock).mockResolvedValueOnce([]);
      expect((await orchestrator.run(defaultOptions)).summary.unmatchedWaivers).toBeNull();

      // Negative control — the full run over the same waiver measures it: the null above comes
      // from the narrowing, not from a field that is always null.
      expect((await orchestrator.run(defaultOptions)).summary.unmatchedWaivers).toBe(1);
      expect((await orchestrator.run({ ...defaultOptions, scope: "baseline" })).summary.unmatchedWaivers).toBe(1);
    });
  });

  describe("4.5. Error Handling (AORCH-C1)", () => {
    it("[AORCH-C1] should propagate error when PolicyEvaluator throws", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog();

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-001"),
      );
      (deps.policyEvaluator.evaluate as jest.Mock).mockRejectedValue(
        new Error("PolicyEvaluator internal error"),
      );

      const orchestrator = createAuditOrchestrator(deps);

      await expect(orchestrator.run(defaultOptions)).rejects.toThrow(
        "PolicyEvaluator internal error",
      );
    });
  });

  describe("4.6. PolicyEvaluator Integration (AORCH-D1 to D4)", () => {
    it("[AORCH-D1] should invoke PolicyEvaluator.evaluate after all agent scans complete", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "hash-sec-001",
          category: "hardcoded-secret",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-g1"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      await orchestrator.run(defaultOptions);

      // PolicyEvaluator.evaluate should have been called after scans
      expect(deps.policyEvaluator.evaluate).toHaveBeenCalledTimes(1);

      // The input should contain the consolidated findings from the scan
      const evaluateCall = (deps.policyEvaluator.evaluate as jest.Mock).mock.calls[0][0];
      expect(evaluateCall.findings).toHaveLength(1);
      expect(evaluateCall.findings[0].fingerprint).toBe("hash-sec-001");
      expect(evaluateCall.activeWaivers).toBeDefined();
      expect(Array.isArray(evaluateCall.activeWaivers)).toBe(true);
      expect(evaluateCall.scanExecutionIds).toContain("exec-scan-g1");
      expect(evaluateCall.taskId).toBe(defaultOptions.taskId);
    });

    it("[AORCH-D2] should include policyDecision in AuditOrchestrationResult", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Critical finding",
          file: "src/app.ts",
          startLine: 5,
          fingerprint: "hash-critical-g2",
          category: "secret",
        }),
      ]);

      const blockDecision = makePolicyDecision("block", "1 critical finding exceeds threshold");
      const blockResult = makePolicyResult("block", "1 critical finding exceeds threshold");
      blockResult.decision = blockDecision;

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-g2"),
      );
      (deps.policyEvaluator.evaluate as jest.Mock).mockResolvedValue(blockResult);

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // policyDecision should be present in the result
      expect(result.policyDecision).toBeDefined();
      expect(result.policyDecision.decision).toBe("block");
      expect(result.policyDecision.reason).toBe("1 critical finding exceeds threshold");
    });

    it("[AORCH-D3] should include policy ExecutionRecord ID in executionIds.policy", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog();

      const policyResult = makePolicyResult("pass", "No issues");
      // Use a known ID to verify it's included
      policyResult.executionRecord.id = "exec-policy-g3-test";

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-g3"),
      );
      (deps.policyEvaluator.evaluate as jest.Mock).mockResolvedValue(policyResult);

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // executionIds.policy should contain the policy ExecutionRecord ID
      expect(result.executionIds.policy).toBe("exec-policy-g3-test");
      // scan IDs should also be present
      expect(result.executionIds.scans).toContain("exec-scan-g3");
    });

    it("[AORCH-D4] should include finding fingerprint in TaskRecord.references for lifecycle linkage", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog([
        makeSarifResult({
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "fp-lifecycle-001",
          category: "hardcoded-secret",
        }),
        makeSarifResult({
          ruleId: "PII-001",
          level: "warning",
          message: "Email detected",
          file: "src/user.ts",
          startLine: 20,
          fingerprint: "fp-lifecycle-002",
          category: "pii-email",
        }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-scan-g4"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // Finding fingerprints should be available in the result for task linkage
      const fingerprints = result.findings.map((f) => f.fingerprint);
      expect(fingerprints).toContain("fp-lifecycle-001");
      expect(fingerprints).toContain("fp-lifecycle-002");

      // Each finding should have a non-empty fingerprint string
      for (const finding of result.findings) {
        expect(finding.fingerprint).toBeDefined();
        expect(typeof finding.fingerprint).toBe("string");
        expect(finding.fingerprint.length).toBeGreaterThan(0);
      }
    });
  });

  describe("4.7. Redaction Integration (AORCH-E1 to E3)", () => {
    it("[AORCH-E1] should always apply redactSarif to agent results for L1", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarifWithSnippet: SarifLog = {
        $schema:
          "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [
          {
            tool: {
              driver: {
                name: "test-tool",
                version: "1.0.0",
                informationUri: "https://example.com",
              },
            },
            results: [
              {
                ruleId: "PII-001",
                level: "error",
                message: { text: "Email detected in source" },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: "src/user.ts" },
                      region: {
                        startLine: 10,
                        snippet: { text: "const email = user@example.com;" },
                      },
                    },
                  },
                ],
                fingerprints: {
                  "gitgov/v2": "hash-pii-e1",
                },
                properties: {
                  "gitgov/category": "pii-email",
                  "gitgov/detector": "regex",
                  "gitgov/confidence": 0.95,
                },
              },
            ] as SarifResult[],
          },
        ],
      };

      const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);
      const deps = createMockDeps({ redactor });
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarifWithSnippet, "exec-e1"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // l1AgentResults should be present
      expect(result.l1AgentResults).toBeDefined();
      expect(result.l1AgentResults).toHaveLength(1);

      // L1 SARIF should have redacted snippet for pii-email (sensitive)
      const l1Sarif = result.l1AgentResults[0]!.sarif;
      const l1Snippet =
        l1Sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.region.snippet;
      expect(l1Snippet).toBeDefined();
      expect(l1Snippet!.text).toBe("[REDACTED]");

      // snippetHash should be present
      const l1Props = l1Sarif.runs[0]!.results[0]!.properties;
      expect(l1Props?.["gitgov/snippetHash"]).toBeDefined();

      // L1 SARIF must be a distinct object from L2 (copy, not mutation)
      expect(result.l1AgentResults[0]!.sarif).not.toBe(result.agentResults[0]!.sarif);
    });

    it("[AORCH-E2] should enrich L2 agentResults with snippetHash while preserving snippets", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const originalSnippet = "const secret = 'sk-12345';";
      const sarifWithSnippet: SarifLog = {
        $schema:
          "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [
          {
            tool: {
              driver: {
                name: "test-tool",
                version: "1.0.0",
                informationUri: "https://example.com",
              },
            },
            results: [
              {
                ruleId: "SEC-001",
                level: "error",
                message: { text: "Hardcoded secret found" },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: "src/config.ts" },
                      region: {
                        startLine: 5,
                        snippet: { text: originalSnippet },
                      },
                    },
                  },
                ],
                fingerprints: {
                  "gitgov/v2": "hash-sec-e2",
                },
                properties: {
                  "gitgov/category": "hardcoded-secret",
                  "gitgov/detector": "regex",
                  "gitgov/confidence": 0.99,
                },
              },
            ] as SarifResult[],
          },
        ],
      };

      const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);
      const deps = createMockDeps({ redactor });
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarifWithSnippet, "exec-e2"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      // L2 agentResults: snippet preserved (NOT redacted) + snippetHash added
      const l2Result = result.agentResults[0]!.sarif.runs[0]!.results[0]!;
      const l2Snippet = l2Result.locations[0]!.physicalLocation.region.snippet;
      expect(l2Snippet).toBeDefined();
      expect(l2Snippet!.text).toBe(originalSnippet);
      expect(l2Result.properties?.['gitgov/snippetHash']).toBeDefined();
      expect(l2Result.properties?.['gitgov/snippetHash']).toMatch(/^[a-f0-9]{64}$/);

      // L1: snippet redacted + snippetHash present
      const l1Result = result.l1AgentResults[0]!.sarif.runs[0]!.results[0]!;
      expect(l1Result.locations[0]!.physicalLocation.region.snippet!.text).toBe("[REDACTED]");
      expect(l1Result.properties?.['gitgov/snippetHash']).toBeDefined();
    });

    // [RLDX-E3] The redaction spec delegates its E3 to this test (redaction_module §4.5.2);
    // the tag makes the delegation greppable from both sides.
    it("[AORCH-E3] [RLDX-E3] should not require agent knowledge of RedactionLevel", async () => {
      // Verify that AgentAuditInput does not include RedactionLevel
      // (structural test — agents receive scope, include, exclude, taskId only)
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const sarif = makeSarifLog();

      const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);
      const deps = createMockDeps({ redactor });
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:security-audit", sarif, "exec-e3"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      await orchestrator.run(defaultOptions);

      // Verify the input passed to AgentRunner does NOT contain redactionLevel
      const runOnceCall = (deps.agentRunner.runOnce as jest.Mock).mock.calls[0]![0] as RunOptions;
      const agentInput = runOnceCall.input as Record<string, unknown>;
      expect(agentInput).not.toHaveProperty("redactionLevel");
      expect(agentInput).not.toHaveProperty("redactionConfig");
    });
  });

  describe("4.8. Review Agent Execution (AORCH-F1 to AORCH-F4)", () => {
    it("[AORCH-F1] should discover and execute review agents after policy evaluation", async () => {
      // Setup: 1 audit agent + 1 review agent
      const auditRecord = makeAgentRecord("agent:scanner", "audit");
      const reviewRecord = makeAgentRecord("agent:reviewer", "review");
      const deps = createMockDeps();
      const orchestrator = createAuditOrchestrator(deps);

      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:scanner",
        "agent:reviewer",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(
        async (id: string) => {
          if (id === "agent:scanner") return auditRecord;
          if (id === "agent:reviewer") return reviewRecord;
          return null;
        },
      );

      // Audit agent returns SARIF with findings
      const sarif = makeSarifLog([
        {
          ruleId: "SEC-001",
          level: "error",
          message: { text: "Secret found" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "config.ts" },
                region: { startLine: 3 },
              },
            },
          ],
          fingerprints: { "gitgov/v2": "fp-001" },
        },
      ]);

      let callCount = 0;
      (deps.agentRunner.runOnce as jest.Mock).mockImplementation(
        async (opts: RunOptions) => {
          callCount++;
          if (callCount === 1) {
            // Audit agent
            return makeAgentResponse("agent:scanner", sarif);
          }
          // Review agent
          return {
            runId: "run-review",
            agentId: opts.agentId,
            status: "success",
            output: { message: "Review complete" },
            executionRecordId: "feedback:review-001",
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 50,
          };
        },
      );

      const result = await orchestrator.run(defaultOptions);

      // Review agents should have been executed
      expect(result.reviewResults).toBeDefined();
      expect(result.reviewResults).toHaveLength(1);
      expect(result.reviewResults![0]!.agentId).toBe("agent:reviewer");
      expect(result.reviewResults![0]!.status).toBe("success");
      expect(result.reviewResults![0]!.feedbackRecordId).toBe("feedback:review-001");
    });

    it("[AORCH-F2] should pass findings, policyDecision, and taskId in ctx.input to review agents", async () => {
      const auditRecord = makeAgentRecord("agent:scanner", "audit");
      const reviewRecord = makeAgentRecord("agent:reviewer", "review");
      const deps = createMockDeps();
      const orchestrator = createAuditOrchestrator(deps);

      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:scanner",
        "agent:reviewer",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(
        async (id: string) => {
          if (id === "agent:scanner") return auditRecord;
          if (id === "agent:reviewer") return reviewRecord;
          return null;
        },
      );

      const sarif = makeSarifLog([
        {
          ruleId: "PII-001",
          level: "warning",
          message: { text: "PII detected" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "checkout.ts" },
                region: { startLine: 47 },
              },
            },
          ],
          fingerprints: { "gitgov/v2": "fp-pii" },
        },
      ]);

      let reviewInput: Record<string, unknown> | undefined;
      let callCount = 0;
      (deps.agentRunner.runOnce as jest.Mock).mockImplementation(
        async (opts: RunOptions) => {
          callCount++;
          if (callCount === 1) {
            return makeAgentResponse("agent:scanner", sarif);
          }
          // Capture review agent input
          reviewInput = opts.input as Record<string, unknown>;
          return {
            runId: "run-review",
            agentId: opts.agentId,
            status: "success",
            output: { message: "Review complete" },
            executionRecordId: "feedback:review-002",
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 50,
          };
        },
      );

      await orchestrator.run(defaultOptions);

      // Verify review agent received findings + policyDecision + taskId with content
      expect(reviewInput).toBeDefined();
      const findings = reviewInput!["findings"] as Array<Record<string, unknown>>;
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]!["ruleId"]).toBe("PII-001");
      const pd = reviewInput!["policyDecision"] as Record<string, unknown>;
      expect(pd).toBeDefined();
      expect(pd["decision"]).toBeDefined();
      expect(reviewInput!["taskId"]).toBe(defaultOptions.taskId);
    });

    it("[AORCH-F3] should skip review step without warning when no review agents are found", async () => {
      // Only audit agent, no review agents
      const auditRecord = makeAgentRecord("agent:scanner", "audit");
      const deps = createMockDeps();
      const orchestrator = createAuditOrchestrator(deps);

      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:scanner"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(auditRecord);

      const sarif = makeSarifLog();
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeAgentResponse("agent:scanner", sarif),
      );

      const result = await orchestrator.run(defaultOptions);

      // No review results — silently skipped
      expect(result.reviewResults).toBeUndefined();
      // No warning about missing review agents
      expect(result.warning).toBeUndefined();
    });

    it("[AORCH-F4] should continue audit pipeline when review agent fails and include error in result", async () => {
      const auditRecord = makeAgentRecord("agent:scanner", "audit");
      const reviewRecord = makeAgentRecord("agent:bad-reviewer", "review");
      const deps = createMockDeps();
      const orchestrator = createAuditOrchestrator(deps);

      (deps.recordStore.list as jest.Mock).mockResolvedValue([
        "agent:scanner",
        "agent:bad-reviewer",
      ]);
      (deps.recordStore.get as jest.Mock).mockImplementation(
        async (id: string) => {
          if (id === "agent:scanner") return auditRecord;
          if (id === "agent:bad-reviewer") return reviewRecord;
          return null;
        },
      );

      const sarif = makeSarifLog();
      // Both failure shapes: the runner resolving status "error" — what FsAgentRunner does with a
      // backend failure — and a runner that throws.
      const failures: Array<() => Promise<AgentResponse>> = [
        async () => makeErrorResponse("agent:bad-reviewer", "Claude API unavailable"),
        async () => { throw new Error("Claude API unavailable"); },
      ];
      for (const fail of failures) {
        (deps.agentRunner.runOnce as jest.Mock).mockImplementation(async (opts: RunOptions) =>
          opts.agentId === "agent:scanner" ? makeAgentResponse("agent:scanner", sarif) : fail(),
        );

        // Should NOT throw — review failure is non-fatal
        const result = await orchestrator.run(defaultOptions);

        expect(result.findings).toBeDefined();
        expect(result.policyDecision).toBeDefined();
        expect(result.reviewResults).toHaveLength(1);
        expect(result.reviewResults![0]!.status).toBe("error");
        expect(result.reviewResults![0]!.errorMessage).toBe("Claude API unavailable");
        expect(result.reviewResults![0]!.feedbackRecordId).toBeUndefined();
      }
    });
  });

  describe("4.9. Agent Entrypoint Validation (AORCH-G1 to G2)", () => {
    it("[AORCH-G1] should add warning with entrypoint name and dual remediation when agent is unresolvable", async () => {
      const failingAgent = makeAgentRecord("agent:security-audit", "audit");
      const workingAgent = makeAgentRecord("agent:pii-scan", "audit");
      const workingSarif = makeSarifLog([
        makeSarifResult({ ruleId: "PII-001", level: "warning", message: "PII detected", file: "src/user.ts", startLine: 5, fingerprint: "hash-pii-g1", category: "pii-email" }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit", "agent:pii-scan"]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return failingAgent;
        if (id === "agent:pii-scan") return workingAgent;
        return null;
      });
      // The form the real runner produces: the backend's MODULE_NOT_FOUND resolved as a response.
      (deps.agentRunner.runOnce as jest.Mock).mockImplementation(async (opts: RunOptions) => {
        if (opts.agentId === "agent:security-audit") {
          return makeErrorResponse("agent:security-audit", "Cannot find module '@gitgov/agent-security-audit'");
        }
        return makeAgentResponse("agent:pii-scan", workingSarif, "exec-g1");
      });

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("Some audit agents failed");
      expect(result.warning).toContain("@gitgov/agent-security-audit");
      expect(result.warning).toContain("gitgov agent new");
      expect(result.warning).toContain("npm install");
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("[AORCH-G1] should add warning with the runtime name when the agent's runtime has no registered handler", async () => {
      // A specialist registered with `runtime: 'typescript'` fails in production with
      // RuntimeNotFoundError: LocalBackend runs `runtime` before `entrypoint`, and no handler is
      // registered.
      const failingAgent = makeAgentRecord("agent:security-audit", "audit");
      const workingAgent = makeAgentRecord("agent:pii-scan", "audit");
      const workingSarif = makeSarifLog([
        makeSarifResult({ ruleId: "PII-001", level: "warning", message: "PII detected", file: "src/user.ts", startLine: 5, fingerprint: "hash-pii-g1-rt", category: "pii-email" }),
      ]);

      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit", "agent:pii-scan"]);
      (deps.recordStore.get as jest.Mock).mockImplementation(async (id: string) => {
        if (id === "agent:security-audit") return failingAgent;
        if (id === "agent:pii-scan") return workingAgent;
        return null;
      });

      // First the form the real runner produces — the error resolved as a response — then a
      // runner that throws it.
      const failures: Array<() => Promise<AgentResponse>> = [
        async () => makeErrorResponse("agent:security-audit", new RuntimeNotFoundError("typescript").message),
        async () => { throw new RuntimeNotFoundError("typescript"); },
      ];
      for (const fail of failures) {
        (deps.agentRunner.runOnce as jest.Mock).mockImplementation(async (opts: RunOptions) =>
          opts.agentId === "agent:security-audit" ? fail() : makeAgentResponse("agent:pii-scan", workingSarif, "exec-g1-rt"),
        );

        const result = await createAuditOrchestrator(deps).run(defaultOptions);

        expect(result.agentResults.find((r) => r.agentId === "agent:security-audit")?.status).toBe("error");
        expect(result.warning).toContain("Some audit agents failed");
        expect(result.warning).toContain("agent:security-audit — runtime 'typescript' has no registered handler");
        expect(result.warning).toContain("gitgov agent new");
      }

      // NEGATIVE CONTROL: a failure that is not a load error carries no re-registration
      // guidance — the warning is about agents that could not be loaded, not any failure.
      (deps.agentRunner.runOnce as jest.Mock).mockImplementation(async (opts: RunOptions) => {
        if (opts.agentId === "agent:security-audit") {
          return makeErrorResponse("agent:security-audit", "agent crashed while scanning");
        }
        return makeAgentResponse("agent:pii-scan", workingSarif, "exec-g1-rt2");
      });
      const crashed = await createAuditOrchestrator(deps).run(defaultOptions);
      expect(crashed.agentResults.find((r) => r.agentId === "agent:security-audit")?.status).toBe("error");
      expect(crashed.warning).toBeUndefined();
    });

    it("[AORCH-G2] should warn with entrypoint details and npm install when all agents failed", async () => {
      const agentRecord = makeAgentRecord("agent:security-audit", "audit");
      const deps = createMockDeps();
      (deps.recordStore.list as jest.Mock).mockResolvedValue(["agent:security-audit"]);
      (deps.recordStore.get as jest.Mock).mockResolvedValue(agentRecord);
      (deps.agentRunner.runOnce as jest.Mock).mockResolvedValue(
        makeErrorResponse("agent:security-audit", "Cannot find module '@gitgov/agent-security-audit'"),
      );

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.warning).toContain("All audit agents failed");
      expect(result.warning).toContain("@gitgov/agent-security-audit");
      expect(result.warning).toContain("npm install");
      expect(result.agentResults[0]!.status).toBe("error");
      expect(result.findings).toHaveLength(0);
    });
  });
});
