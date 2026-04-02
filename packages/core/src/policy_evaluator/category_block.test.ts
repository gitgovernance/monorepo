/**
 * CategoryBlock rule tests.
 *
 * EARS: PEVAL-C4, PEVAL-C5, PEVAL-C6
 */

import { categoryBlock } from "./category_block";
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

describe("CategoryBlock", () => {
  describe("4.3. Built-in rules (PEVAL-C4 to C6)", () => {
    it("[PEVAL-C4] should return passed:false when non-waived findings in blocked categories", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", category: "hardcoded-secret", isWaived: false }),
        makeFinding({ fingerprint: "fp-2", category: "pii-ssn", isWaived: false }),
        makeFinding({ fingerprint: "fp-3", category: "low-risk", isWaived: false }),
      ];
      const config = makeConfig({
        blockCategories: ["hardcoded-secret", "pii-ssn"],
      });

      const result = categoryBlock.evaluate(findings, config);

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe("CategoryBlock");
      expect(result.reason).toContain("2 finding(s) in blocked category");
      expect(result.reason).toContain("hardcoded-secret");
      expect(result.reason).toContain("pii-ssn");
    });

    it("[PEVAL-C5] should return passed:true when blockCategories is empty or undefined", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", category: "hardcoded-secret", isWaived: false }),
      ];

      // undefined
      const result1 = categoryBlock.evaluate(findings, makeConfig());
      expect(result1.passed).toBe(true);
      expect(result1.reason).toBe("No blocked categories configured");

      // empty
      const result2 = categoryBlock.evaluate(
        findings,
        makeConfig({ blockCategories: [] }),
      );
      expect(result2.passed).toBe(true);
      expect(result2.reason).toBe("No blocked categories configured");
    });

    it("[PEVAL-C6] should return passed:true when all blocked-category findings are waived", () => {
      const findings = [
        makeFinding({ fingerprint: "fp-1", category: "hardcoded-secret", isWaived: true }),
        makeFinding({ fingerprint: "fp-2", category: "pii-ssn", isWaived: true }),
        makeFinding({ fingerprint: "fp-3", category: "low-risk", isWaived: false }),
      ];
      const config = makeConfig({
        blockCategories: ["hardcoded-secret", "pii-ssn"],
      });

      const result = categoryBlock.evaluate(findings, config);

      expect(result.passed).toBe(true);
      expect(result.reason).toBe("All blocked-category findings are waived");
    });
  });
});
