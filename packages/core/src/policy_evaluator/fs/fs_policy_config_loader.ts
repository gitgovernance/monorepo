/**
 * FsPolicyConfigLoader -- filesystem implementation of PolicyConfigLoader.
 *
 * Loads and parses .gitgov/policy.yml into PolicyConfig.
 * Returns default config (failOn: "critical") when file is absent.
 *
 * EARS: PEVAL-P1, PEVAL-P2, PEVAL-P3, PEVAL-P4
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import type {
  PolicyConfig,
  PolicyConfigFile,
  PolicyConfigLoader,
} from "../policy_evaluator.types";

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

const DEFAULT_CONFIG: PolicyConfig = {
  failOn: "critical",
};

/**
 * Filesystem implementation of PolicyConfigLoader.
 * Loads .gitgov/policy.yml from disk and parses it into PolicyConfig.
 */
export class FsPolicyConfigLoader implements PolicyConfigLoader {
  async loadPolicyConfig(gitgovDir: string): Promise<PolicyConfig> {
    const policyPath = path.join(gitgovDir, "policy.yml");

    let content: string;
    try {
      content = await fs.promises.readFile(policyPath, "utf-8");
    } catch {
      // File not found -- return default config (PEVAL-P3)
      return { ...DEFAULT_CONFIG };
    }

    const parsed = yaml.load(content) as PolicyConfigFile | undefined;

    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_CONFIG };
    }

    // Validate version field
    if (typeof parsed.version !== "string") {
      throw new Error('policy.yml: missing or invalid "version" field');
    }

    // Validate failOn (PEVAL-P1)
    if (!VALID_SEVERITIES.has(parsed.failOn)) {
      throw new Error(
        `Invalid failOn value "${String(parsed.failOn)}" in policy.yml. Must be one of: critical, high, medium, low`,
      );
    }

    const config: PolicyConfig = {
      failOn: parsed.failOn,
    };

    // blockCategories (PEVAL-P4)
    if (parsed.blockCategories) {
      config.blockCategories = parsed.blockCategories;
    }

    // waiverRequirements (PEVAL-P2)
    if (parsed.waiverRequirements) {
      for (const [category, req] of Object.entries(
        parsed.waiverRequirements,
      )) {
        if (
          !req ||
          typeof req.role !== "string" ||
          typeof req.minApprovals !== "number" ||
          req.minApprovals < 1
        ) {
          throw new Error(
            `Invalid waiverRequirement for category "${category}": requires role (string) and minApprovals (number >= 1)`,
          );
        }
      }
      config.waiverRequirements = parsed.waiverRequirements;
    }

    // OPA config
    if (parsed.opa?.policies) {
      config.opa = { policies: parsed.opa.policies };
    }

    return config;
  }
}

/**
 * Standalone function wrapper around FsPolicyConfigLoader.
 * Delegates to FsPolicyConfigLoader.
 */
export async function loadPolicyConfig(
  gitgovDir: string,
): Promise<PolicyConfig> {
  const loader = new FsPolicyConfigLoader();
  return loader.loadPolicyConfig(gitgovDir);
}
