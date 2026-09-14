// Sections: §4.4 (EARS-19), §4.5 (EARS-25), §4.7 (EARS-32)
import { HttpLlmDetector } from "./http_llm_detector";
import { computeFingerprint } from "../../audit/fingerprint";

describe("HttpLlmDetector", () => {
  describe("4.7. Anchor and semantic dedup (EARS-32)", () => {
    it("[EARS-32] should pass the snippet as anchor for LLM findings", async () => {
      const snippet = "const email = user.email";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          findings: [
            {
              file: "src/user.ts",
              line: 7,
              ruleId: "PII-001",
              category: "pii-email",
              severity: "high",
              message: "Email detected by LLM",
              snippet,
              confidence: 0.95,
            },
          ],
        }),
      });

      const detector = new HttpLlmDetector("https://api.example.com/analyze", "test-key");
      const findings = await detector.analyzeSnippets([
        { file: "src/user.ts", lineStart: 7, lineEnd: 9, language: "typescript", content: "x", heuristicTags: [] },
      ]);

      expect(findings).toHaveLength(1);

      // The LLM returns no delimited match, so the snippet IS the anchor. Its identity must
      // be the one that combination produces — not something this detector invented.
      expect(findings[0]!.fingerprint).toBe(
        computeFingerprint({ file: "src/user.ts", category: "pii-email", anchor: snippet }),
      );

      // Negative control: the same snippet in another file is another finding. If `file`
      // ever dropped out of the preimage, this is where it would show.
      expect(findings[0]!.fingerprint).not.toBe(
        computeFingerprint({ file: "src/other.ts", category: "pii-email", anchor: snippet }),
      );
    });
  });

  describe("4.4. LLM Detection (EARS-19)", () => {
    it("[EARS-19] should normalize LLM response to Finding format", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          findings: [
            {
              file: "test.ts",
              line: 1,
              ruleId: "PII-001",
              category: "pii-email",
              severity: "high",
              message: "Email detected by LLM",
              snippet: "const email = user.email",
              confidence: 0.95,
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const detector = new HttpLlmDetector(
        "https://api.example.com/analyze",
        "test-key"
      );
      const findings = await detector.analyzeSnippets([
        {
          file: "test.ts",
          lineStart: 1,
          lineEnd: 3,
          language: "typescript",
          content: "test",
          heuristicTags: [],
        },
      ]);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.detector).toBe("llm");
      expect(findings[0]?.confidence).toBe(0.95);
      expect(findings[0]).toHaveProperty("fingerprint");
      expect(findings[0]).toHaveProperty("executionId");
    });
  });

  describe("4.5. Security and Sanitization (EARS-25)", () => {
    it("[EARS-25] should use Bearer token in Authorization header", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ findings: [] }),
      });
      global.fetch = mockFetch;

      const detector = new HttpLlmDetector(
        "https://api.example.com/analyze",
        "my-secret-key"
      );
      await detector.analyzeSnippets([
        {
          file: "test.ts",
          lineStart: 1,
          lineEnd: 1,
          language: "typescript",
          content: "test",
          heuristicTags: [],
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-secret-key",
          }),
        })
      );
    });
  });
});
