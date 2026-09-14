// Sections: §4.2 (EARS-10 to EARS-12), §4.7 (EARS-34)
import { HeuristicDetector, HEURISTIC_PATTERNS } from "./heuristic_detector";

describe("HeuristicDetector", () => {
  describe("4.2. Heuristic Detection (EARS-10 to EARS-12)", () => {
    it("[EARS-10] should detect sensitive variable names with conf 0.7", async () => {
      const detector = new HeuristicDetector();
      const content = "const userEmail = getEmail();";
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("pii-generic");
      expect(findings[0]?.confidence).toBe(0.7);
      expect(findings[0]?.ruleId).toBe("HEUR-001");
    });

    it("[EARS-11] should detect logging of user objects with conf 0.6", async () => {
      const detector = new HeuristicDetector();
      const content = "console.log(user);";
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("logging-pii");
      expect(findings[0]?.confidence).toBe(0.6);
      expect(findings[0]?.ruleId).toBe("HEUR-002");
    });

    it("[EARS-12] should detect JSON.stringify of sensitive objects", async () => {
      const detector = new HeuristicDetector();
      const content = "const data = JSON.stringify(user);";
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("third-party-transfer");
      expect(findings[0]?.confidence).toBe(0.5);
      expect(findings[0]?.ruleId).toBe("HEUR-003");
    });
  });

  describe("4.7. Anchor and semantic dedup (EARS-34)", () => {
    it("[EARS-34] should export the heuristic patterns as source and flags, never as stateful RegExp instances", () => {
      const entries = Object.entries(HEURISTIC_PATTERNS);
      expect(entries.map(([id]) => id)).toEqual(["HEUR-001", "HEUR-002", "HEUR-003"]);
      for (const [, pattern] of entries) {
        expect(pattern).not.toBeInstanceOf(RegExp);
        expect(Object.isFrozen(pattern)).toBe(true);
        expect(pattern.flags).toContain("g");
      }

      // A consumer builds its own RegExp per use and matches two rows in a row.
      const { source, flags } = HEURISTIC_PATTERNS["HEUR-001"]!;
      expect(new RegExp(source, flags).exec("const userEmail = a;")?.[0]).toBe("userEmail");
      expect(new RegExp(source, flags).exec("const customerPhone = b;")?.[0]).toBe("customerPhone");

      // Negative control — one shared global RegExp, as the export was: the first match leaves
      // lastIndex past the start of the second row, and the second row does not match.
      const shared = new RegExp(source, flags);
      expect(shared.exec("const a = 1; const userEmail = a;")?.[0]).toBe("userEmail");
      expect(shared.exec("const customerPhone = b;")).toBeNull();
    });
  });
});
