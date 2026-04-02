/**
 * SeverityThreshold rule tests.
 *
 * EARS: PEVAL-C1, PEVAL-C2, PEVAL-C3
 */

import { severityThreshold } from "./severity_threshold";
import type {
  Finding,
  PolicyConfig,
} from "./policy_evaluator.types";

// ============================================================================
// Test helpers
// ============================================================================

function makeFinding(
  overrides: Partial<Finding> = {},
): Finding {
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

// ============================================================================
// Tests
// ============================================================================

describe("SeverityThreshold", () => {
  describe("4.3. Built-in rules (PEVAL-C1 to C3)", () => {
    it("[PEVAL-C1] should return passed:false when non-waived findings exceed severity threshold", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", severity: "critical", isWaived: false }),
        makeFinding({ fingerprint: "fp-2", severity: "high", isWaived: false }),
      ];
      const config = makeConfig({ failOn: "high" });

      const result = severityThreshold.evaluate(findings, config);

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe("SeverityThreshold");
      expect(result.reason).toContain('2 finding(s) at severity >= "high" exceed threshold');
    });

    it("[PEVAL-C2] should return passed:true when all findings at threshold are waived", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", severity: "critical", isWaived: true }),
        makeFinding({ fingerprint: "fp-2", severity: "critical", isWaived: true }),
        makeFinding({ fingerprint: "fp-3", severity: "low", isWaived: false }),
      ];
      const config = makeConfig({ failOn: "critical" });

      const result = severityThreshold.evaluate(findings, config);

      expect(result.passed).toBe(true);
      expect(result.reason).toContain("All findings at or above threshold");
      expect(result.reason).toContain("are waived");
    });

    it("[PEVAL-C3] should return passed:true when no findings at or above threshold", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", severity: "medium", isWaived: false }),
        makeFinding({ fingerprint: "fp-2", severity: "low", isWaived: false }),
      ];
      const config = makeConfig({ failOn: "critical" });

      const result = severityThreshold.evaluate(findings, config);

      expect(result.passed).toBe(true);
      expect(result.reason).toContain("No findings at or above threshold");
    });
  });
});
