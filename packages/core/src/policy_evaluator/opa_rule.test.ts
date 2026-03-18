/**
 * OPA rule tests.
 *
 * EARS: PEVAL-O1 through PEVAL-O6
 *
 * These tests require the `opa` CLI to be installed.
 * If not available, the suite is skipped.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { createOpaRule } from "./opa_rule";
import type {
  ConsolidatedFinding,
  PolicyConfig,
} from "./policy_evaluator.types";

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

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "peval-opa-test-"));
}

function isOpaAvailable(): boolean {
  try {
    execSync("opa version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// OPA v1 Rego syntax
const BLOCKING_REGO = `package gitgov.policy.test_block

import rego.v1

block contains msg if {
  some f in input.findings
  f.category == "hardcoded-secret"
  not f.isWaived
  msg := sprintf("Secret found in %s:%d", [f.file, f.line])
}
`;

const PASSING_REGO = `package gitgov.policy.test_pass

import rego.v1

block contains msg if {
  some f in input.findings
  f.category == "nonexistent-category"
  msg := sprintf("Should never match: %s", [f.file])
}
`;

// ============================================================================
// Tests
// ============================================================================

const describeIfOpa = isOpaAvailable() ? describe : describe.skip;

describeIfOpa("OPA Rule", () => {
  describe("4.9. OPA Integration (PEVAL-O1 to O6)", () => {
    it("[PEVAL-O1] should load and evaluate .rego policies via OPA WASM runtime", async () => {
      const dir = createTmpDir();
      const regoPath = path.join(dir, "test_block.rego");
      fs.writeFileSync(regoPath, BLOCKING_REGO, "utf-8");

      const rule = await createOpaRule(regoPath, dir);

      expect(rule.name).toBe("opa:test_block");

      const findings = [
        makeFinding({
          fingerprint: "fp-1",
          category: "hardcoded-secret",
          file: "src/config.ts",
          line: 10,
          isWaived: false,
        }),
      ];

      const result = rule.evaluate(findings, makeConfig());
      expect(result.ruleName).toBe("opa:test_block");
      // The rule should have evaluated (blocking or passing)
      expect(typeof result.passed).toBe("boolean");

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-O2] should map OPA block results to PolicyRuleResult with passed false", async () => {
      const dir = createTmpDir();
      const regoPath = path.join(dir, "test_block.rego");
      fs.writeFileSync(regoPath, BLOCKING_REGO, "utf-8");

      const rule = await createOpaRule(regoPath, dir);

      const findings = [
        makeFinding({
          fingerprint: "fp-1",
          category: "hardcoded-secret",
          file: "src/config.ts",
          line: 10,
          isWaived: false,
        }),
      ];

      const result = rule.evaluate(findings, makeConfig());

      expect(result.passed).toBe(false);
      expect(result.reason).toContain("Secret found in src/config.ts:10");

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-O3] should return passed true when OPA policy produces no block results", async () => {
      const dir = createTmpDir();
      const regoPath = path.join(dir, "test_pass.rego");
      fs.writeFileSync(regoPath, PASSING_REGO, "utf-8");

      const rule = await createOpaRule(regoPath, dir);

      const findings = [
        makeFinding({
          fingerprint: "fp-1",
          category: "hardcoded-secret",
          isWaived: false,
        }),
      ];

      const result = rule.evaluate(findings, makeConfig());

      expect(result.passed).toBe(true);
      expect(result.reason).toBe("OPA policy passed");

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-O4] should pass ConsolidatedFinding as input.findings to OPA", async () => {
      const dir = createTmpDir();
      const regoPath = path.join(dir, "test_block.rego");
      fs.writeFileSync(regoPath, BLOCKING_REGO, "utf-8");

      const rule = await createOpaRule(regoPath, dir);

      // Finding with matching category should trigger block
      const matchingFindings = [
        makeFinding({
          fingerprint: "fp-1",
          category: "hardcoded-secret",
          file: "src/secrets.ts",
          line: 42,
          isWaived: false,
        }),
      ];

      const result1 = rule.evaluate(matchingFindings, makeConfig());
      expect(result1.passed).toBe(false);
      expect(result1.reason).toContain("src/secrets.ts:42");

      // Finding with non-matching category should pass
      const nonMatchingFindings = [
        makeFinding({
          fingerprint: "fp-2",
          category: "low-risk",
          isWaived: false,
        }),
      ];

      const result2 = rule.evaluate(nonMatchingFindings, makeConfig());
      expect(result2.passed).toBe(true);

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-O5] should skip OPA evaluation when opa config is undefined", async () => {
      // This is tested at the evaluator level (policy_evaluator.test.ts).
      // At the rule level, createOpaRule is only called when policies are configured.
      // Verify that the rule works correctly when called.
      const dir = createTmpDir();
      const regoPath = path.join(dir, "test_pass.rego");
      fs.writeFileSync(regoPath, PASSING_REGO, "utf-8");

      const rule = await createOpaRule(regoPath, dir);
      const result = rule.evaluate([], makeConfig());

      expect(result.passed).toBe(true);

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-O6] should log warning and skip when rego file does not exist", async () => {
      const dir = createTmpDir();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const rule = await createOpaRule(
        path.join(dir, "nonexistent.rego"),
        dir,
      );

      // Should return a no-op rule
      const result = rule.evaluate(
        [makeFinding({ fingerprint: "fp-1" })],
        makeConfig(),
      );
      expect(result.passed).toBe(true);
      expect(result.reason).toBe("OPA policy skipped");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
      fs.rmSync(dir, { recursive: true });
    });
  });
});
