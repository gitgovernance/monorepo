/**
 * FsPolicyConfigLoader tests.
 *
 * EARS: PEVAL-P1, PEVAL-P2, PEVAL-P3, PEVAL-P4
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { FsPolicyConfigLoader, loadPolicyConfig } from "./fs_policy_config_loader";

// ============================================================================
// Test helpers
// ============================================================================

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "peval-test-"));
}

function writePolicyYml(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, "policy.yml"), content, "utf-8");
}

// ============================================================================
// Tests
// ============================================================================

describe("FsPolicyConfigLoader", () => {
  describe("4.1. policy.yml Schema + Loader (PEVAL-P1 to P4)", () => {
    it("[PEVAL-P1] should load and parse policy.yml into PolicyConfig", async () => {
      const dir = createTmpDir();
      writePolicyYml(
        dir,
        `
version: "1.0"
failOn: high
blockCategories:
  - hardcoded-secret
  - pii-ssn
`,
      );

      const config = await loadPolicyConfig(dir);

      expect(config.failOn).toBe("high");
      expect(config.blockCategories).toEqual(["hardcoded-secret", "pii-ssn"]);

      fs.rmSync(dir, { recursive: true });

      // Also verify FsPolicyConfigLoader class interface
      const dir2 = createTmpDir();
      writePolicyYml(
        dir2,
        `
version: "1.0"
failOn: medium
`,
      );

      const loader = new FsPolicyConfigLoader(dir2);
      const classConfig = await loader.loadPolicyConfig();

      expect(classConfig.failOn).toBe("medium");

      fs.rmSync(dir2, { recursive: true });
    });

    it("[PEVAL-P2] should validate waiver FeedbackRecords against roles and minApprovals", async () => {
      const dir = createTmpDir();
      writePolicyYml(
        dir,
        `
version: "1.0"
failOn: critical
waiverRequirements:
  hardcoded-secret:
    role: ciso
    minApprovals: 1
  pii-ssn:
    role: security-lead
    minApprovals: 2
`,
      );

      const config = await loadPolicyConfig(dir);

      expect(config.waiverRequirements).toBeDefined();
      const secretReq = config.waiverRequirements?.["hardcoded-secret"];
      expect(secretReq).toEqual({ role: "ciso", minApprovals: 1 });
      const piiReq = config.waiverRequirements?.["pii-ssn"];
      expect(piiReq).toEqual({ role: "security-lead", minApprovals: 2 });

      // Invalid: minApprovals < 1
      const dir2 = createTmpDir();
      writePolicyYml(
        dir2,
        `
version: "1.0"
failOn: critical
waiverRequirements:
  hardcoded-secret:
    role: ciso
    minApprovals: 0
`,
      );

      await expect(loadPolicyConfig(dir2)).rejects.toThrow(
        "Invalid waiverRequirement",
      );

      fs.rmSync(dir, { recursive: true });
      fs.rmSync(dir2, { recursive: true });
    });

    it("[PEVAL-P3] should use default PolicyConfig when policy.yml is absent", async () => {
      const dir = createTmpDir();

      const config = await loadPolicyConfig(dir);

      expect(config.failOn).toBe("critical");
      expect(config.blockCategories).toBeUndefined();
      expect(config.waiverRequirements).toBeUndefined();

      fs.rmSync(dir, { recursive: true });
    });

    it("[PEVAL-P4] should pass blockCategories to CategoryBlock rule", async () => {
      const dir = createTmpDir();
      writePolicyYml(
        dir,
        `
version: "1.0"
failOn: high
blockCategories:
  - hardcoded-secret
  - pii-ssn
  - weak-crypto
`,
      );

      const config = await loadPolicyConfig(dir);

      expect(config.blockCategories).toEqual([
        "hardcoded-secret",
        "pii-ssn",
        "weak-crypto",
      ]);
      // blockCategories are available for CategoryBlock rule consumption
      expect(config.blockCategories).toHaveLength(3);

      fs.rmSync(dir, { recursive: true });
    });
  });
});
