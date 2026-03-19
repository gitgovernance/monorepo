/**
 * PolicyEvaluator tests -- Epic 5: policy_evaluation.
 *
 * Trazabilidad:
 * | EARS ID   | Test                                                                         | Section  |
 * |:----------|:-----------------------------------------------------------------------------|:---------|
 * | PEVAL-A1  | should require all fields in PolicyEvaluationInput                            | 4.1      |
 * | PEVAL-A2  | should include required fields and optional ruleId in ConsolidatedFinding     | 4.1      |
 * | PEVAL-A3  | should require failOn in PolicyConfig and allow optional fields               | 4.1      |
 * | PEVAL-A4  | should include all fields in PolicyDecision                                   | 4.1      |
 * | PEVAL-A5  | should include ruleName, passed, and reason in PolicyRuleResult               | 4.1      |
 * | PEVAL-D1  | should apply active waivers to findings before evaluating rules               | 4.4      |
 * | PEVAL-D2  | should set isWaived:true and attach waiver when fingerprint matches           | 4.4      |
 * | PEVAL-D3  | should set decision to block when any rule returns passed:false               | 4.4      |
 * | PEVAL-D4  | should set decision to pass when all rules return passed:true                 | 4.4      |
 * | PEVAL-D5  | should populate blockingFindings with findings causing rule failure            | 4.4      |
 * | PEVAL-D6  | should populate waivedFindings with all findings where isWaived is true       | 4.4      |
 * | PEVAL-D7  | should set evaluatedAt to a valid ISO 8601 timestamp                         | 4.4      |
 * | PEVAL-D8  | should evaluate custom rules after built-in rules                            | 4.4      |
 * | PEVAL-D9  | should return decision pass with empty blockingFindings when findings is empty| 4.4      |
 * | PEVAL-E1  | should create ExecutionRecord with type decision                             | 4.5      |
 * | PEVAL-E2  | should set result to human-readable string describing decision               | 4.5      |
 * | PEVAL-E3  | should populate references with scanExecutionIds and waiver feedbackRecordIds | 4.5      |
 * | PEVAL-E4  | should set metadata kind to policy-decision with version and full PolicyDecision | 4.5  |
 * | PEVAL-E5  | should return ExecutionRecord to caller without persisting                    | 4.5      |
 * | PEVAL-O5  | should skip OPA evaluation when opa config is undefined                       | 4.9      |
 * | PEVAL-F1  | should load findings from ExecutionRecords without re-executing agents        | 4.7      |
 * | PEVAL-F2  | should use current active waivers not historical ones                         | 4.7      |
 * | PEVAL-F3  | should create new ExecutionRecord without modifying previous decision         | 4.7      |
 * | PEVAL-F4  | should log warning and skip ExecutionRecord without SARIF in metadata         | 4.7      |
 * | PEVAL-F5  | should include waiver feedbackRecordId in references when pass after prior block | 4.7   |
 */

import { createPolicyEvaluator, reevaluatePolicy } from "./policy_evaluator";
import type {
  PolicyEvaluationInput,
  PolicyConfig,
  PolicyRule,
  PolicyRuleResult,
  ConsolidatedFinding,
  PolicyEvaluatorDeps,
  ActiveWaiver,
  IWaiverReader,
} from "./policy_evaluator.types";
import type { FeedbackRecord, GitGovExecutionRecord } from "../record_types";
import type { WaiverMetadata } from "../source_auditor/types";
import type { RecordStore } from "../record_store/record_store";
import type { SarifLog, SarifResult } from "../sarif/sarif.types";

// ============================================================================
// Test helpers
// ============================================================================

function makeFinding(
  overrides: Partial<ConsolidatedFinding> = {},
): ConsolidatedFinding {
  return {
    fingerprint: "fp-test-001",
    message: "test finding",
    severity: "high",
    category: "test",
    file: "src/foo.ts",
    line: 10,
    reportedBy: ["agent-1"],
    isWaived: false,
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<PolicyConfig> = {},
): PolicyConfig {
  return {
    failOn: "critical",
    ...overrides,
  };
}

function makeFeedbackRecord(
  id: string,
  fingerprint: string,
): FeedbackRecord<WaiverMetadata> {
  return {
    id,
    entityType: "execution",
    entityId: "exec-previous",
    type: "approval",
    status: "acknowledged",
    content: "Risk accepted per security review",
    metadata: {
      fingerprint,
      ruleId: "SEC-001",
      file: "src/config.ts",
      line: 10,
    },
  };
}

function makeWaiver(
  fingerprint: string,
  feedbackId: string,
): ActiveWaiver {
  return {
    fingerprint,
    ruleId: "SEC-001",
    feedback: makeFeedbackRecord(feedbackId, fingerprint),
  };
}

function makeDeps(): PolicyEvaluatorDeps {
  return {};
}

function makeInput(
  overrides: Partial<PolicyEvaluationInput> = {},
): PolicyEvaluationInput {
  return {
    findings: [makeFinding()],
    activeWaivers: [],
    policy: makeConfig(),
    scanExecutionIds: ["exec-scan-001"],
    taskId: "task-001",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("PolicyEvaluator", () => {
  describe("4.1. Types and structure (PEVAL-A1 to A5)", () => {
    it("[PEVAL-A1] should require all fields in PolicyEvaluationInput", () => {
      const input: PolicyEvaluationInput = {
        findings: [],
        activeWaivers: [],
        policy: { failOn: "critical" },
        scanExecutionIds: ["exec-001"],
        taskId: "task-001",
      };

      expect(input.findings).toEqual([]);
      expect(input.activeWaivers).toEqual([]);
      expect(input.policy.failOn).toBe("critical");
      expect(input.scanExecutionIds).toEqual(["exec-001"]);
      expect(input.taskId).toBe("task-001");
    });

    it("[PEVAL-A2] should include required fields and optional ruleId in ConsolidatedFinding", () => {
      // With ruleId
      const withRuleId = makeFinding({ ruleId: "SEC-001" });
      expect(withRuleId.fingerprint).toBe("fp-test-001");
      expect(withRuleId.severity).toBe("high");
      expect(withRuleId.category).toBe("test");
      expect(withRuleId.file).toBe("src/foo.ts");
      expect(withRuleId.line).toBe(10);
      expect(withRuleId.reportedBy).toEqual(["agent-1"]);
      expect(withRuleId.isWaived).toBe(false);
      expect(withRuleId.message).toBe("test finding");
      expect(withRuleId.ruleId).toBe("SEC-001");

      // Without ruleId
      const withoutRuleId = makeFinding();
      expect(withoutRuleId.ruleId).toBeUndefined();
    });

    it("[PEVAL-A3] should require failOn in PolicyConfig and allow optional fields", () => {
      const minimal: PolicyConfig = { failOn: "critical" };
      expect(minimal.failOn).toBe("critical");
      expect(minimal.blockCategories).toBeUndefined();
      expect(minimal.rules).toBeUndefined();

      const full: PolicyConfig = {
        failOn: "high",
        blockCategories: ["secret"],
        rules: [],
      };
      expect(full.failOn).toBe("high");
      expect(full.blockCategories).toEqual(["secret"]);
      expect(full.rules).toEqual([]);
    });

    it("[PEVAL-A4] should include all fields in PolicyDecision", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      const decision = result.decision;
      expect(decision.decision).toBeDefined();
      expect(decision.reason).toBeDefined();
      expect(decision.blockingFindings).toBeDefined();
      expect(decision.waivedFindings).toBeDefined();
      expect(decision.summary).toBeDefined();
      expect(decision.rulesEvaluated).toBeDefined();
      expect(decision.evaluatedAt).toBeDefined();
    });

    it("[PEVAL-A5] should include ruleName, passed, and reason in PolicyRuleResult", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.decision.rulesEvaluated.length).toBeGreaterThan(0);
      const firstRule = result.decision.rulesEvaluated[0];
      expect(firstRule).toBeDefined();
      expect(firstRule!.ruleName).toBeDefined();
      expect(typeof firstRule!.passed).toBe("boolean");
      expect(firstRule!.reason).toBeDefined();
    });
  });

  describe("4.4. Evaluator principal (PEVAL-D1 to D9)", () => {
    it("[PEVAL-D1] should apply active waivers to findings before evaluating rules", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const waiver = makeWaiver("fp-critical-001", "feedback-waiver-001");

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({
              fingerprint: "fp-critical-001",
              severity: "critical",
              isWaived: false,
            }),
          ],
          activeWaivers: [waiver],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      // The critical finding should be waived, so decision should be pass
      expect(result.decision.decision).toBe("pass");
      expect(result.decision.waivedFindings).toHaveLength(1);
    });

    it("[PEVAL-D2] should set isWaived:true and attach waiver when fingerprint matches", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const waiver = makeWaiver("fp-match-001", "feedback-waiver-002");

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-match-001", severity: "critical" }),
          ],
          activeWaivers: [waiver],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      const waivedFinding = result.decision.waivedFindings[0];
      expect(waivedFinding).toBeDefined();
      expect(waivedFinding!.isWaived).toBe(true);
      expect(waivedFinding!.waiver).toBe(waiver);
    });

    it("[PEVAL-D3] should set decision to block when any rule returns passed:false", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-1", severity: "critical" }),
          ],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.decision.decision).toBe("block");
    });

    it("[PEVAL-D4] should set decision to pass when all rules return passed:true", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.decision.decision).toBe("pass");
      expect(result.decision.rulesEvaluated.every((r) => r.passed)).toBe(true);
    });

    it("[PEVAL-D5] should populate blockingFindings with findings causing rule failure", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-crit", severity: "critical" }),
            makeFinding({ fingerprint: "fp-low", severity: "low" }),
          ],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.decision.decision).toBe("block");
      expect(result.decision.blockingFindings).toHaveLength(1);
      expect(result.decision.blockingFindings[0]!.fingerprint).toBe("fp-crit");
    });

    it("[PEVAL-D6] should populate waivedFindings with all findings where isWaived is true", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const waiver1 = makeWaiver("fp-waived-1", "feedback-1");
      const waiver2 = makeWaiver("fp-waived-2", "feedback-2");

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-waived-1", severity: "critical" }),
            makeFinding({ fingerprint: "fp-waived-2", severity: "high" }),
            makeFinding({ fingerprint: "fp-not-waived", severity: "low" }),
          ],
          activeWaivers: [waiver1, waiver2],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.decision.waivedFindings).toHaveLength(2);
      const waivedFingerprints = result.decision.waivedFindings.map(
        (f) => f.fingerprint,
      );
      expect(waivedFingerprints).toContain("fp-waived-1");
      expect(waivedFingerprints).toContain("fp-waived-2");
    });

    it("[PEVAL-D7] should set evaluatedAt to a valid ISO 8601 timestamp", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
        }),
      );

      const date = new Date(result.decision.evaluatedAt);
      expect(date.toISOString()).toBe(result.decision.evaluatedAt);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it("[PEVAL-D8] should evaluate custom rules after built-in rules", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const evaluationOrder: string[] = [];

      const customRule: PolicyRule = {
        name: "CustomRule",
        evaluate(_findings, _config): PolicyRuleResult {
          evaluationOrder.push("CustomRule");
          return {
            ruleName: "CustomRule",
            passed: false,
            reason: "Custom rule failed",
          };
        },
      };

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical", rules: [customRule] }),
        }),
      );

      // Custom rule should appear after built-in rules
      const ruleNames = result.decision.rulesEvaluated.map((r) => r.ruleName);
      expect(ruleNames).toEqual([
        "SeverityThreshold",
        "CategoryBlock",
        "CustomRule",
      ]);

      // Custom rule failure should block
      expect(result.decision.decision).toBe("block");
    });

    it("[PEVAL-D9] should return decision pass with empty blockingFindings when findings is empty", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [],
          policy: makeConfig({ failOn: "low" }),
        }),
      );

      expect(result.decision.decision).toBe("pass");
      expect(result.decision.reason).toBe("No findings to evaluate");
      expect(result.decision.blockingFindings).toHaveLength(0);
      expect(result.decision.rulesEvaluated).toHaveLength(0);
    });
  });

  describe("4.5. ExecutionRecord (PEVAL-E1 to E5)", () => {
    it("[PEVAL-E1] should create ExecutionRecord with type decision", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
        }),
      );

      expect(result.executionRecord.type).toBe("decision");
    });

    it("[PEVAL-E2] should set result to human-readable string describing decision", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      // Pass case
      const passResult = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );
      expect(passResult.executionRecord.result).toContain("PASS");

      // Block case
      const blockResult = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-1", severity: "critical" }),
          ],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );
      expect(blockResult.executionRecord.result).toContain("BLOCK");
      expect(blockResult.executionRecord.result).toContain("blocking");
    });

    it("[PEVAL-E3] should populate references with scanExecutionIds and waiver feedbackRecordIds", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const waiver = makeWaiver("fp-waived", "feedback-waiver-003");

      const result = await evaluator.evaluate(
        makeInput({
          findings: [
            makeFinding({ fingerprint: "fp-waived", severity: "critical" }),
          ],
          activeWaivers: [waiver],
          scanExecutionIds: ["exec-scan-001", "exec-scan-002"],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      expect(result.executionRecord.references).toContain("exec-scan-001");
      expect(result.executionRecord.references).toContain("exec-scan-002");
      expect(result.executionRecord.references).toContain(
        "feedback-waiver-003",
      );
    });

    it("[PEVAL-E4] should set metadata kind to policy-decision with version and full PolicyDecision", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          taskId: "task-id-test",
        }),
      );

      expect(result.executionRecord.metadata.kind).toBe("policy-decision");
      expect(result.executionRecord.metadata.version).toBe("1.0.0");
      expect(result.executionRecord.metadata.data).toBe(result.decision);
      // ExecutionRecord.id is populated with taskId-based identifier
      expect(result.executionRecord.id).toBeDefined();
      expect(result.executionRecord.id).toContain("exec-policy-task-id-test-");
    });

    it("[PEVAL-E5] should return ExecutionRecord to caller without persisting", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          taskId: "task-test-e5",
        }),
      );

      // executionRecord is returned directly, not persisted
      expect(result.executionRecord).toBeDefined();
      expect(result.executionRecord.type).toBe("decision");
      expect(result.executionRecord.title).toContain("task-test-e5");
    });
  });

  describe("4.2. OPA Integration in Evaluator (PEVAL-O5)", () => {
    it("[PEVAL-O5] should skip OPA evaluation when opa config is undefined", async () => {
      const deps = makeDeps();
      const evaluator = createPolicyEvaluator(deps);

      const result = await evaluator.evaluate(
        makeInput({
          findings: [makeFinding({ fingerprint: "fp-1", severity: "low" })],
          policy: makeConfig({ failOn: "critical" }),
        }),
      );

      // No OPA rules should appear in rulesEvaluated
      const opaRules = result.decision.rulesEvaluated.filter((r) =>
        r.ruleName.startsWith("opa:"),
      );
      expect(opaRules).toHaveLength(0);

      // Only built-in rules should be evaluated
      const ruleNames = result.decision.rulesEvaluated.map((r) => r.ruleName);
      expect(ruleNames).toEqual(["SeverityThreshold", "CategoryBlock"]);
    });
  });

  describe("4.7. Re-evaluation (PEVAL-F1 to F5)", () => {
    /**
     * Helper: builds a mock ExecutionRecord with SARIF metadata.
     */
    function makeExecRecordWithSarif(
      id: string,
      sarif: SarifLog,
    ): GitGovExecutionRecord {
      return {
        header: {
          version: "1.0",
          type: "execution",
          payloadChecksum: "abc123",
          signatures: [
            {
              keyId: "agent:test",
              role: "author",
              notes: "test",
              signature: "dGVzdA==".padEnd(88, "="),
              timestamp: Date.now(),
            },
          ],
        },
        payload: {
          id,
          taskId: "task-reeval-001",
          type: "analysis",
          title: "Scan result",
          result: "Scan completed",
          references: [],
          metadata: {
            kind: "sarif",
            version: "2.1.0",
            data: sarif,
          },
        },
      };
    }

    /**
     * Helper: builds a mock ExecutionRecord WITHOUT SARIF (e.g., a decision record).
     */
    function makeExecRecordWithoutSarif(
      id: string,
    ): GitGovExecutionRecord {
      return {
        header: {
          version: "1.0",
          type: "execution",
          payloadChecksum: "abc123",
          signatures: [
            {
              keyId: "agent:test",
              role: "author",
              notes: "test",
              signature: "dGVzdA==".padEnd(88, "="),
              timestamp: Date.now(),
            },
          ],
        },
        payload: {
          id,
          taskId: "task-reeval-001",
          type: "decision",
          title: "Policy decision",
          result: "PASS",
          references: [],
          metadata: {
            kind: "policy-decision",
            version: "1.0.0",
            data: {},
          },
        },
      };
    }

    /**
     * Helper: builds a minimal SarifLog with results.
     */
    function makeSarifLogForReeval(
      results: Array<{
        ruleId: string;
        level: "error" | "warning" | "note" | "none";
        message: string;
        file: string;
        startLine: number;
        fingerprint?: string;
        category?: string;
      }>,
    ): SarifLog {
      return {
        $schema:
          "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [
          {
            tool: {
              driver: {
                name: "test-agent",
                version: "1.0.0",
                informationUri: "https://example.com",
              },
            },
            results: results.map((r) => ({
              ruleId: r.ruleId,
              level: r.level,
              message: { text: r.message },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: r.file },
                    region: { startLine: r.startLine },
                  },
                },
              ],
              ...(r.fingerprint
                ? {
                    partialFingerprints: {
                      "primaryLocationLineHash/v1": r.fingerprint,
                    },
                  }
                : {}),
              properties: {
                "gitgov/category": r.category ?? "unknown",
                "gitgov/detector": "regex",
                "gitgov/confidence": 0.9,
              },
            })) as SarifResult[],
          },
        ],
      };
    }

    /**
     * Helper: creates mock deps for reevaluatePolicy.
     */
    function makeReevalDeps(overrides?: {
      executionRecords?: Map<string, GitGovExecutionRecord>;
      activeWaivers?: ActiveWaiver[];
    }) {
      const recordsMap =
        overrides?.executionRecords ?? new Map<string, GitGovExecutionRecord>();
      const waivers = overrides?.activeWaivers ?? [];

      const executionStore: RecordStore<GitGovExecutionRecord> = {
        get: jest.fn().mockImplementation(async (id: string) => {
          return recordsMap.get(id) ?? null;
        }),
        put: jest.fn().mockResolvedValue(undefined),
        putMany: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([...recordsMap.keys()]),
        exists: jest.fn().mockImplementation(async (id: string) => {
          return recordsMap.has(id);
        }),
      };

      const waiverReader: IWaiverReader = {
        loadActiveWaivers: jest.fn().mockResolvedValue(waivers),
        hasActiveWaiver: jest.fn().mockResolvedValue(false),
      };

      const evalDeps = makeDeps();
      const policyEvaluator = createPolicyEvaluator(evalDeps);

      return { executionStore, waiverReader, policyEvaluator };
    }

    it("[PEVAL-F1] should load findings from ExecutionRecords without re-executing agents", async () => {
      const sarif = makeSarifLogForReeval([
        {
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret found",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "fp-sec-001",
          category: "hardcoded-secret",
        },
        {
          ruleId: "PII-001",
          level: "warning",
          message: "Email detected",
          file: "src/user.ts",
          startLine: 20,
          fingerprint: "fp-pii-001",
          category: "pii-email",
        },
      ]);

      const records = new Map<string, GitGovExecutionRecord>();
      records.set("exec-scan-001", makeExecRecordWithSarif("exec-scan-001", sarif));

      const deps = makeReevalDeps({ executionRecords: records });

      const result = await reevaluatePolicy(
        ["exec-scan-001"],
        "task-reeval-001",
        makeConfig({ failOn: "critical" }),
        deps,
      );

      // Should have extracted findings from the SARIF without re-scanning
      expect(result.decision.blockingFindings.length + result.decision.waivedFindings.length).toBeGreaterThan(0);
      // The findings should be from the SARIF data (no agent was re-executed)
      expect(deps.executionStore.get).toHaveBeenCalledWith("exec-scan-001");
      // Findings were loaded: the decision was made based on SARIF content
      expect(result.decision.decision).toBe("block"); // critical finding => block
      expect(result.decision.blockingFindings).toHaveLength(1);
      expect(result.decision.blockingFindings[0]!.fingerprint).toBe("fp-sec-001");
    });

    it("[PEVAL-F2] should use current active waivers not historical ones", async () => {
      const sarif = makeSarifLogForReeval([
        {
          ruleId: "SEC-001",
          level: "error",
          message: "Hardcoded secret found",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "fp-sec-reeval-001",
          category: "hardcoded-secret",
        },
      ]);

      const records = new Map<string, GitGovExecutionRecord>();
      records.set("exec-scan-002", makeExecRecordWithSarif("exec-scan-002", sarif));

      // Current waivers (not the ones from scan time)
      const currentWaiver = makeWaiver("fp-sec-reeval-001", "feedback-current-waiver");

      const deps = makeReevalDeps({
        executionRecords: records,
        activeWaivers: [currentWaiver],
      });

      const result = await reevaluatePolicy(
        ["exec-scan-002"],
        "task-reeval-002",
        makeConfig({ failOn: "critical" }),
        deps,
      );

      // The current waiver should waive the critical finding => pass
      expect(result.decision.decision).toBe("pass");
      expect(result.decision.waivedFindings).toHaveLength(1);
      expect(result.decision.waivedFindings[0]!.fingerprint).toBe("fp-sec-reeval-001");
      // Verify waiverReader.loadActiveWaivers was called (current waivers)
      expect(deps.waiverReader.loadActiveWaivers).toHaveBeenCalled();
    });

    it("[PEVAL-F3] should create new ExecutionRecord without modifying previous decision", async () => {
      const sarif = makeSarifLogForReeval([
        {
          ruleId: "SEC-001",
          level: "warning",
          message: "Minor issue",
          file: "src/app.ts",
          startLine: 5,
          fingerprint: "fp-minor-001",
          category: "code-quality",
        },
      ]);

      const records = new Map<string, GitGovExecutionRecord>();
      const originalRecord = makeExecRecordWithSarif("exec-scan-003", sarif);
      records.set("exec-scan-003", originalRecord);

      const deps = makeReevalDeps({ executionRecords: records });

      const result = await reevaluatePolicy(
        ["exec-scan-003"],
        "task-reeval-003",
        makeConfig({ failOn: "critical" }),
        deps,
      );

      // New ExecutionRecord should have a different ID
      expect(result.executionRecord.id).toBeDefined();
      expect(result.executionRecord.id).not.toBe("exec-scan-003");
      expect(result.executionRecord.type).toBe("decision");

      // Original record should not have been modified (put was not called)
      expect(deps.executionStore.put).not.toHaveBeenCalled();

      // The original record in the map should be unchanged
      const unchangedRecord = records.get("exec-scan-003");
      expect(unchangedRecord).toBe(originalRecord);
    });

    it("[PEVAL-F4] should log warning and skip ExecutionRecord without SARIF in metadata", async () => {
      const sarifRecord = makeExecRecordWithSarif(
        "exec-scan-sarif",
        makeSarifLogForReeval([
          {
            ruleId: "SEC-001",
            level: "warning",
            message: "Issue found",
            file: "src/app.ts",
            startLine: 5,
            fingerprint: "fp-issue-001",
            category: "code-quality",
          },
        ]),
      );
      const nonSarifRecord = makeExecRecordWithoutSarif("exec-decision-001");

      const records = new Map<string, GitGovExecutionRecord>();
      records.set("exec-scan-sarif", sarifRecord);
      records.set("exec-decision-001", nonSarifRecord);

      const deps = makeReevalDeps({ executionRecords: records });

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await reevaluatePolicy(
        ["exec-scan-sarif", "exec-decision-001"],
        "task-reeval-004",
        makeConfig({ failOn: "critical" }),
        deps,
      );

      // Should warn about the non-SARIF record
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("exec-decision-001"),
      );

      // Should NOT throw -- result should contain findings from the SARIF record only
      expect(result.decision).toBeDefined();
      // The SARIF record's finding should be present
      expect(result.decision.decision).toBe("pass"); // warning with failOn: critical => pass

      warnSpy.mockRestore();
    });

    it("[PEVAL-F5] should include waiver feedbackRecordId in references when pass after prior block", async () => {
      const sarif = makeSarifLogForReeval([
        {
          ruleId: "SEC-001",
          level: "error",
          message: "Critical secret found",
          file: "src/config.ts",
          startLine: 10,
          fingerprint: "fp-sec-block-001",
          category: "hardcoded-secret",
        },
      ]);

      const records = new Map<string, GitGovExecutionRecord>();
      records.set("exec-scan-block", makeExecRecordWithSarif("exec-scan-block", sarif));

      // New waiver that turns the previous block into a pass
      const waiver = makeWaiver("fp-sec-block-001", "feedback-waiver-unblock");

      const deps = makeReevalDeps({
        executionRecords: records,
        activeWaivers: [waiver],
      });

      const result = await reevaluatePolicy(
        ["exec-scan-block"],
        "task-reeval-005",
        makeConfig({ failOn: "critical" }),
        deps,
      );

      // Should pass now (critical finding is waived)
      expect(result.decision.decision).toBe("pass");

      // References should include the waiver's feedbackRecordId
      expect(result.executionRecord.references).toContain("feedback-waiver-unblock");
      // References should also include the scan execution ID
      expect(result.executionRecord.references).toContain("exec-scan-block");
    });
  });
});
