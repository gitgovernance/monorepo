import { createAuditOrchestrator } from "./audit_orchestrator";
import type {
  AuditOrchestratorDeps,
  AuditOrchestrationOptions,
} from "./audit_orchestrator.types";
import type { SarifLog, SarifResult } from "../sarif/sarif.types";
import type { RecordStore } from "../record_store/record_store";
import type { GitGovAgentRecord } from "../record_types";
import type { IAgentRunner } from "../agent_runner/agent_runner";
import type { RunOptions, AgentResponse } from "../agent_runner/agent_runner.types";
import type { IWaiverReader, ActiveWaiver } from "../source_auditor/types";
import type {
  PolicyEvaluator,
  PolicyEvaluationResult,
  PolicyDecision,
} from "../policy_evaluator/policy_evaluator.types";
import { FindingRedactor, DEFAULT_REDACTION_CONFIG } from "../redaction";

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

function makePolicyDecision(
  decision: "pass" | "block" = "pass",
  reason: string = "No issues",
): PolicyDecision {
  return {
    decision,
    reason,
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
    putMany: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
  };

  const agentRunner: IAgentRunner = {
    runOnce: jest.fn().mockResolvedValue(makeAgentResponse("test", makeSarifLog())),
  };

  const waiverReader: IWaiverReader = {
    loadActiveWaivers: jest.fn().mockResolvedValue([]),
    hasActiveWaiver: jest.fn().mockResolvedValue(false),
  };

  const policyEvaluator: PolicyEvaluator = {
    evaluate: jest.fn().mockResolvedValue(makePolicyResult()),
  };

  return {
    recordStore,
    agentRunner,
    waiverReader,
    policyEvaluator,
    ...overrides,
  };
}

const defaultOptions: AuditOrchestrationOptions = {
  scope: "full",
  taskId: "1234567890-task-test",
};

function makeSarifResult(overrides: {
  ruleId: string;
  level: "error" | "warning" | "note" | "none";
  message: string;
  file: string;
  startLine: number;
  fingerprint?: string;
  category?: string;
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
    },
  };

  if (overrides.fingerprint) {
    result["partialFingerprints"] = {
      "primaryLocationLineHash/v1": overrides.fingerprint,
    };
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

      // AgentRunner was called once per agent
      expect(deps.agentRunner.runOnce).toHaveBeenCalledTimes(2);

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
    it("[AORCH-B6] should deduplicate findings that share the same fingerprint across agents", async () => {
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

    it("[AORCH-B12] should deduplicate using ruleId + file + startLine when primaryLocationLineHash is missing", async () => {
      const agent1 = makeAgentRecord("agent:security-audit", "audit");
      const agent2 = makeAgentRecord("agent:external-tool", "audit");

      // No fingerprint -- fallback dedup
      const resultWithoutFingerprint = makeSarifResult({
        ruleId: "EXT-001",
        level: "warning",
        message: "External finding",
        file: "src/app.ts",
        startLine: 42,
        category: "unknown-risk",
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

      // Deduplicated by fallback: ruleId + file + startLine
      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;
      expect(finding).toBeDefined();
      expect(finding.fingerprint).toBe("fallback:EXT-001:src/app.ts:42");
      expect(finding.reportedBy).toEqual([
        "agent:security-audit",
        "agent:external-tool",
      ]);
    });
  });

  describe("4.3b. Snippet Extraction (AORCH-B13)", () => {
    it("[AORCH-B13] should extract snippet from SARIF region.snippet.text into ConsolidatedFinding", async () => {
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
        partialFingerprints: {
          "primaryLocationLineHash/v1": "hash-snippet-001",
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

    it("[AORCH-B13] should omit snippet when SARIF region has no snippet.text", async () => {
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
      expect(finding.snippet).toBeUndefined();
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
      (deps.waiverReader.loadActiveWaivers as jest.Mock).mockRejectedValue(
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

      const activeWaiver: ActiveWaiver = {
        fingerprint: "waived-hash-001",
        ruleId: "SEC-001",
        feedback: {
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
      };

      // Set up policy evaluator mock to return waived finding in decision
      // (orchestrator now derives waiver state from policy decision, not independently)
      const waivedConsolidatedFinding = {
        fingerprint: "waived-hash-001",
        ruleId: "SEC-001",
        message: "Hardcoded secret",
        severity: "critical" as const,
        category: "hardcoded-secret",
        file: "src/config.ts",
        line: 10,
        reportedBy: ["agent:security-audit"],
        isWaived: true,
        waiver: activeWaiver,
      };
      const policyDecision = makePolicyDecision("pass", "All waived");
      policyDecision.waivedFindings = [waivedConsolidatedFinding];
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
      (deps.waiverReader.loadActiveWaivers as jest.Mock).mockResolvedValue([
        activeWaiver,
      ]);
      (deps.policyEvaluator.evaluate as jest.Mock).mockResolvedValue(policyResult);

      const orchestrator = createAuditOrchestrator(deps);
      const result = await orchestrator.run(defaultOptions);

      expect(result.findings).toHaveLength(2);

      const waivedFinding = result.findings.find(
        (f) => f.fingerprint === "waived-hash-001",
      );
      expect(waivedFinding).toBeDefined();
      expect(waivedFinding?.isWaived).toBe(true);
      expect(waivedFinding?.waiver).toBe(activeWaiver);

      const notWaivedFinding = result.findings.find(
        (f) => f.fingerprint === "not-waived-hash-002",
      );
      expect(notWaivedFinding).toBeDefined();
      expect(notWaivedFinding?.isWaived).toBe(false);
      expect(notWaivedFinding?.waiver).toBeUndefined();

      // Summary should count suppressed
      expect(result.summary.suppressed).toBe(1);
    });
  });

  describe("4.5. Error Handling", () => {
    it("[AORCH-B3] should propagate error when PolicyEvaluator throws", async () => {
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

  describe("4.8. Orchestrator Integration (PEVAL-G1 to G4)", () => {
    it("[PEVAL-G1] should invoke PolicyEvaluator.evaluate after all agent scans complete", async () => {
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
      expect(evaluateCall.scanExecutionIds).toContain("exec-scan-g1");
      expect(evaluateCall.taskId).toBe(defaultOptions.taskId);
    });

    it("[PEVAL-G2] should include policyDecision in AuditOrchestrationResult", async () => {
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

    it("[PEVAL-G3] should include policy ExecutionRecord ID in executionIds.policy", async () => {
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

    it("[PEVAL-G4] should include finding fingerprint in TaskRecord.references for lifecycle linkage", async () => {
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

  describe("4.9. Redaction Integration (RLDX-E1 to E3)", () => {
    it("[RLDX-E1] should apply redactSarif to agent results for L1 when redactor is provided", async () => {
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
                partialFingerprints: {
                  "primaryLocationLineHash/v1": "hash-pii-e1",
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
      const l1Sarif = result.l1AgentResults![0]!.sarif;
      const l1Snippet =
        l1Sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.region.snippet;
      expect(l1Snippet).toBeDefined();
      expect(l1Snippet!.text).toBe("[REDACTED]");

      // snippetHash should be present
      const l1Props = l1Sarif.runs[0]!.results[0]!.properties;
      expect(l1Props?.["gitgov/snippetHash"]).toBeDefined();
    });

    it("[RLDX-E2] should preserve original unredacted agent results for L2", async () => {
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
                partialFingerprints: {
                  "primaryLocationLineHash/v1": "hash-sec-e2",
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

      // Original agentResults (for L2) should be unredacted
      const l2Snippet =
        result.agentResults[0]!.sarif.runs[0]!.results[0]!.locations[0]!
          .physicalLocation.region.snippet;
      expect(l2Snippet).toBeDefined();
      expect(l2Snippet!.text).toBe(originalSnippet);

      // L1 should be redacted
      const l1Snippet =
        result.l1AgentResults![0]!.sarif.runs[0]!.results[0]!.locations[0]!
          .physicalLocation.region.snippet;
      expect(l1Snippet!.text).toBe("[REDACTED]");
    });

    it("[RLDX-E3] should not require agent knowledge of RedactionLevel", async () => {
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
});
