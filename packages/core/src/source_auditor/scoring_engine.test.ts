// Sections: §2.3 (Internal Component - ScoringEngine)
import { ScoringEngine } from "./scoring_engine";
import type { Finding } from "../finding_detector/types";

describe("ScoringEngine", () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine();
  });

  describe("§2.3 Internal Component - ScoringEngine (Step 5: Scoring)", () => {
    it("[Step-5] should return findings unchanged (pass-through for now)", () => {
      const findings: Finding[] = [
        {
          id: "test-1",
          ruleId: "PII-001",
          category: "pii-email",
          severity: "high",
          file: "test.ts",
          line: 1,
          snippet: "test",
          message: "Email detected",
          detector: "regex",
          fingerprint: "abc123",
          confidence: 1.0,
        },
      ];

      const scored = engine.score(findings);

      expect(scored).toEqual(findings);
      expect(scored).toHaveLength(1);
    });

    it("[Step-5] should handle empty findings array", () => {
      const scored = engine.score([]);
      expect(scored).toEqual([]);
    });
  });
});
