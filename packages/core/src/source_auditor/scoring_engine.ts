import type { Finding } from "../finding_detector/types";

/**
 * Internal component for applying scoring rules to findings.
 * Not injectable - instantiated internally by SourceAuditorModule.
 *
 * Currently a pass-through; scoring rules will be added in future cycles.
 */
export class ScoringEngine {
  /**
   * Applies scoring rules to findings.
   * Currently returns findings unchanged (future enhancement).
   * @param findings - Findings to score
   * @returns Scored findings (same as input for now)
   */
  score(findings: Finding[]): Finding[] {
    // Future: Apply weighted scoring based on:
    // - Severity weights
    // - Category priorities
    // - Context-aware adjustments
    return findings;
  }
}
