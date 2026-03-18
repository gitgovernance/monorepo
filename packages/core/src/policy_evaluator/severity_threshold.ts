/**
 * SeverityThreshold rule -- built-in PolicyRule.
 *
 * Blocks when non-waived findings have severity >= config.failOn.
 * EARS: PEVAL-C1, PEVAL-C2, PEVAL-C3
 */

import type {
  PolicyRule,
  PolicyRuleResult,
  ConsolidatedFinding,
  PolicyConfig,
} from "./policy_evaluator.types";
import { SEVERITY_ORDER } from "./policy_evaluator.types";

export const severityThreshold: PolicyRule = {
  name: "SeverityThreshold",

  evaluate(
    findings: ConsolidatedFinding[],
    config: PolicyConfig,
  ): PolicyRuleResult {
    const threshold = SEVERITY_ORDER[config.failOn];
    const blocking = findings.filter(
      (f) => !f.isWaived && SEVERITY_ORDER[f.severity] >= threshold,
    );

    if (blocking.length === 0) {
      // Distinguish: all-at-threshold waived vs none-at-threshold
      const atThreshold = findings.filter(
        (f) => SEVERITY_ORDER[f.severity] >= threshold,
      );
      const reason =
        atThreshold.length > 0 && atThreshold.every((f) => f.isWaived)
          ? `All findings at or above threshold "${config.failOn}" are waived`
          : `No findings at or above threshold "${config.failOn}"`;
      return { ruleName: "SeverityThreshold", passed: true, reason };
    }

    return {
      ruleName: "SeverityThreshold",
      passed: false,
      reason: `${String(blocking.length)} finding(s) at severity >= "${config.failOn}" exceed threshold`,
    };
  },
};
