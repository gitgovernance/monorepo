/**
 * CategoryBlock rule -- built-in PolicyRule.
 *
 * Blocks when non-waived findings belong to a blocked category.
 * EARS: PEVAL-C4, PEVAL-C5, PEVAL-C6
 */

import type {
  PolicyRule,
  PolicyRuleResult,
  Finding,
  PolicyConfig,
} from "./policy_evaluator.types";

export const categoryBlock: PolicyRule = {
  name: "CategoryBlock",

  evaluate(
    findings: Finding[],
    config: PolicyConfig,
  ): PolicyRuleResult {
    if (!config.blockCategories?.length) {
      return {
        ruleName: "CategoryBlock",
        passed: true,
        reason: "No blocked categories configured",
      };
    }

    const blockedSet = new Set(config.blockCategories);
    const blocking = findings.filter(
      (f) => !f.isWaived && blockedSet.has(f.category),
    );

    if (blocking.length === 0) {
      const inBlocked = findings.filter((f) => blockedSet.has(f.category));
      const reason =
        inBlocked.length > 0 && inBlocked.every((f) => f.isWaived)
          ? "All blocked-category findings are waived"
          : "No findings in blocked categories";
      return { ruleName: "CategoryBlock", passed: true, reason };
    }

    const categories = [...new Set(blocking.map((f) => f.category))].join(
      ", ",
    );
    return {
      ruleName: "CategoryBlock",
      passed: false,
      reason: `${String(blocking.length)} finding(s) in blocked category: ${categories}`,
    };
  },
};
