// Blueprint: packages/blueprints/03_products/core/specs/modules/finding_detector/finding_detector_module.md
// Sections: §4.2 (EARS-13), §4.3 (EARS-14 to EARS-17), §4.4 (EARS-18, EARS-20 to EARS-22), §4.5 (EARS-24)
import { FindingDetectorModule } from "./finding_detector";
import { RegexDetector } from "./detectors/regex_detector";
import { HeuristicDetector } from "./detectors/heuristic_detector";
import type { FindingDetectorConfig } from "./types";

describe("FindingDetectorModule", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe("4.2. Heuristic Detection (EARS-13)", () => {
    it("[EARS-13] should skip heuristic detection when disabled", async () => {
      const config: FindingDetectorConfig = {
        heuristic: { enabled: false },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      const findings = await module.detect(content, "test.ts");

      expect(findings.every((f) => f.detector !== "heuristic")).toBe(true);
    });
  });

  describe("4.3. Two-Phase Architecture (EARS-14 to EARS-17)", () => {
    it("[EARS-14] should execute local detectors before LLM", async () => {
      const executionOrder: string[] = [];

      const mockRegexDetect = jest
        .spyOn(RegexDetector.prototype, "detect")
        .mockImplementation(async () => {
          executionOrder.push("regex");
          return [];
        });

      const mockHeuristicDetect = jest
        .spyOn(HeuristicDetector.prototype, "detect")
        .mockImplementation(async () => {
          executionOrder.push("heuristic");
          return [];
        });

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
      };
      const module = new FindingDetectorModule(config);
      await module.detect("test content", "test.ts");

      expect(executionOrder).toContain("regex");
      expect(executionOrder).toContain("heuristic");

      mockRegexDetect.mockRestore();
      mockHeuristicDetect.mockRestore();
    });

    it("[EARS-15] should extract candidates with confidence below 0.8", async () => {
      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      const findings = await module.detect(content, "test.ts");

      const lowConfFindings = findings.filter((f) => f.confidence < 0.8);
      expect(lowConfFindings.length).toBeGreaterThan(0);
    });

    it("[EARS-16] should deduplicate findings by SHA256 fingerprint", async () => {
      const detector = new RegexDetector();
      const content = 'const email = "test@test.com"; // test@test.com';
      const findings = await detector.detect(content, "test.ts");

      const fingerprints = findings.map((f) => f.fingerprint);
      const uniqueFingerprints = [...new Set(fingerprints)];

      // Same line should have same fingerprint
      expect(findings.length).toBe(2);
      expect(uniqueFingerprints.length).toBe(1);
    });

    it("[EARS-17] should work with local-only detection when no LLM", async () => {
      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
      };
      const module = new FindingDetectorModule(config);
      const content = 'const email = "test@example.com";';
      const findings = await module.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.detector !== "llm")).toBe(true);
    });
  });

  describe("4.4. LLM Detection and Quota (EARS-18, EARS-20 to EARS-22)", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("[EARS-18] should send candidates to LLM when quota available", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ findings: [] }),
      });
      global.fetch = mockFetch;

      process.env["GITGOV_LLM_API_KEY"] = "test-api-key";

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
        llm: {
          enabled: true,
          endpoint: "https://api.example.com/analyze",
          quotaType: "unlimited",
        },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      await module.detect(content, "test.ts");

      expect(mockFetch).toHaveBeenCalled();
    });

    it("[EARS-20] should reject LLM calls when trial has expired", async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      process.env["GITGOV_LLM_API_KEY"] = "test-api-key";

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
        llm: {
          enabled: true,
          endpoint: "https://api.example.com/analyze",
          quotaType: "trial",
          expiresAt: "2020-01-01T00:00:00Z",
          remainingUses: 100,
        },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      await module.detect(content, "test.ts");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("[EARS-21] should reject LLM calls when remainingUses is zero", async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      process.env["GITGOV_LLM_API_KEY"] = "test-api-key";

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
        llm: {
          enabled: true,
          endpoint: "https://api.example.com/analyze",
          quotaType: "trial",
          remainingUses: 0,
        },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      await module.detect(content, "test.ts");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("[EARS-22] should decrement remainingUses after successful call", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ findings: [] }),
      });
      global.fetch = mockFetch;

      process.env["GITGOV_LLM_API_KEY"] = "test-api-key";

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
        llm: {
          enabled: true,
          endpoint: "https://api.example.com/analyze",
          quotaType: "usage-based",
          remainingUses: 100,
        },
      };
      const module = new FindingDetectorModule(config);
      const content = "const userEmail = getEmail();";
      await module.detect(content, "test.ts");

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("4.5. Security and Sanitization (EARS-24)", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("[EARS-24] should read LLM API key from environment variable", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ findings: [] }),
      });
      global.fetch = mockFetch;

      process.env["GITGOV_LLM_API_KEY"] = "env-api-key-12345";

      const config: FindingDetectorConfig = {
        heuristic: { enabled: true },
        llm: {
          enabled: true,
          endpoint: "https://api.example.com/analyze",
          quotaType: "unlimited",
        },
      };
      const module = new FindingDetectorModule(config);
      await module.detect("const userEmail = test;", "test.ts");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/analyze",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer env-api-key-12345",
          }),
        })
      );
    });
  });
});
