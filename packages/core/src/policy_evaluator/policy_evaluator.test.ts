import { createPolicyEvaluator } from "./policy_evaluator";
import type { ConsolidatedFinding } from "./policy_evaluator.types";

// ============================================================================
// Test helpers
// ============================================================================

function makeFinding(
  overrides: Partial<ConsolidatedFinding> = {},
): ConsolidatedFinding {
  return {
    fingerprint: `fp-${Math.random().toString(36).slice(2, 8)}`,
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

// ============================================================================
// PolicyEvaluator stub tests (AORCH-C7 to C10)
// ============================================================================

describe("PolicyEvaluator", () => {
  describe("Cycle 2: Stub evaluation (AORCH-C7 to C10)", () => {
    const evaluator = createPolicyEvaluator();

    it("[AORCH-C7] should return pass when failOn is critical and no critical findings exist", async () => {
      const findings = [
        makeFinding({ severity: "high" }),
        makeFinding({ severity: "medium" }),
        makeFinding({ severity: "low" }),
      ];

      const result = await evaluator.evaluate(findings, {
        failOn: "critical",
        taskId: "task-1",
      });

      expect(result.decision).toBe("pass");
      expect(result.reason).toContain("No findings at or above critical");
    });

    it("[AORCH-C8] should return block when findings at or above failOn severity exist", async () => {
      const findings = [
        makeFinding({ severity: "high" }),
        makeFinding({ severity: "medium" }),
      ];

      const result = await evaluator.evaluate(findings, {
        failOn: "high",
        taskId: "task-2",
      });

      expect(result.decision).toBe("block");
      expect(result.reason).toContain("Found findings at or above high");
    });

    it("[AORCH-C9] should return executionRecordId as empty string (stub -- Epic 5 creates real ExecutionRecord)", async () => {
      const findings = [makeFinding({ severity: "critical" })];

      const result = await evaluator.evaluate(findings, {
        failOn: "critical",
        taskId: "task-3",
      });

      expect(result.executionRecordId).toBe("");
    });

    it("[AORCH-C10] should not count waived findings toward threshold", async () => {
      const findings = [
        makeFinding({ severity: "critical", isWaived: true }),
        makeFinding({ severity: "high", isWaived: true }),
        makeFinding({ severity: "low", isWaived: false }),
      ];

      const result = await evaluator.evaluate(findings, {
        failOn: "critical",
        taskId: "task-4",
      });

      expect(result.decision).toBe("pass");
      expect(result.reason).toContain("No findings at or above critical");
    });
  });

  describe("Edge cases", () => {
    const evaluator = createPolicyEvaluator();

    it("should default to critical when failOn is not specified", async () => {
      const findings = [makeFinding({ severity: "high" })];

      const result = await evaluator.evaluate(findings, {
        taskId: "task-5",
      });

      expect(result.decision).toBe("pass");
      expect(result.reason).toContain("No findings at or above critical");
    });

    it("should return pass with empty findings", async () => {
      const result = await evaluator.evaluate([], {
        failOn: "low",
        taskId: "task-6",
      });

      expect(result.decision).toBe("pass");
    });

    it("should block when failOn is low and any active finding exists", async () => {
      const findings = [makeFinding({ severity: "low" })];

      const result = await evaluator.evaluate(findings, {
        failOn: "low",
        taskId: "task-7",
      });

      expect(result.decision).toBe("block");
      expect(result.reason).toContain("Found findings at or above low");
    });
  });
});
