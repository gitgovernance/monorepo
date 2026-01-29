import { HeuristicDetector } from "./heuristic_detector";

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
});
