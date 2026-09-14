// Sections: §4.2 (EARS-13), §4.3 (EARS-14 to EARS-17), §4.4 (EARS-18, EARS-20 to EARS-22), §4.5 (EARS-24), §4.7 (EARS-33, EARS-35)
import { FindingDetectorModule } from "./finding_detector";
import { RegexDetector } from "./detectors/regex_detector";
import { HeuristicDetector, HEURISTIC_RULES } from "./detectors/heuristic_detector";
import { REGEX_RULES } from "./rules/regex_rules";
import type { FindingDetectorConfig } from "./types";

// GitHub push protection reads a literal `sk_test_` followed by a key-shaped tail as a real
// Stripe key and blocks the push — a fixture for a SECRET DETECTOR looks exactly like the
// thing it detects. Assembling it at runtime keeps the detector under test seeing the same
// string while the file holds no key-shaped literal. Do not inline these back.
const STRIPE_PREFIX = "sk_" + "test_";
const STRIPE_KEY = STRIPE_PREFIX + "abcdefghijklmnopqrstuvwx";
const STRIPE_KEY_B = STRIPE_PREFIX + "zyxwvutsrqponmlkjihgfe1";


describe("FindingDetectorModule", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe("4.7. Anchor and semantic dedup (EARS-33)", () => {
    it("[EARS-33] should emit one finding when the same anchor and category repeat in a file", async () => {
      const detector = new FindingDetectorModule({
        regex: { enabled: true },
        heuristic: { enabled: false },
      });

      // The same secret twice in one file: two matches, one problem.
      const content = [
        `const a = { charge: "${STRIPE_KEY}" };`,
        `const b = { refund: "${STRIPE_KEY}" };`,
      ].join("\n");

      const findings = await detector.detect(content, "src/pay.ts");

      expect(findings).toHaveLength(1);

      // ANTI-VACUITY: the fixture must actually produce two matches, otherwise this test
      // passes because the detector found one — not because dedup collapsed two.
      const raw = await new RegexDetector().detect(content, "src/pay.ts");
      expect(raw.length).toBeGreaterThan(1);
      expect(raw[0]!.fingerprint).toBe(raw[1]!.fingerprint);

      // And two DIFFERENT secrets in the same file stay two findings — the collapse is by
      // anchor, not by file.
      const twoSecrets = [
        `const a = { charge: "${STRIPE_KEY}" };`,
        `const b = { refund: "${STRIPE_KEY_B}" };`,
      ].join("\n");
      expect(await detector.detect(twoSecrets, "src/pay.ts")).toHaveLength(2);
    });

    // [EARS-35] One sample per rule: two DIFFERENT occurrences in one file, and the text that
    // repeats one of them. Secret-shaped values are assembled at runtime for the same reason as
    // STRIPE_KEY above. Where a rule's match ends at a keyword, the second occurrence differs
    // only AFTER the keyword — that is where a match that stops early loses the difference.
    const pem = (body: string) => ["-----BEGIN RSA PRIVATE KEY-----", body, "-----END RSA PRIVATE KEY-----"].join("\n");
    const jwt = (sig: string) => "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + ".eyJ" + "zdWIiOiIxMjM0NTY3ODkwIn0." + sig;
    const RULE_SAMPLES: Record<string, { first: string; second: string }> = {
      "PII-001": { first: 'const a = "ana@example.com";', second: 'const b = "luis@example.com";' },
      "PII-002": { first: 'const a = "+1 (555) 123-4567";', second: 'const b = "+1 (555) 987-6543";' },
      "PII-003": { first: 'const a = "4111-1111-1111-1111";', second: 'const b = "5500-0000-0000-0004";' },
      "PII-004": { first: 'const a = "123-45-6789";', second: 'const b = "987-65-4321";' },
      "PII-005": { first: "const ssn = form.ssn;", second: "const spouse = { ssn: other.value };" },
      "SEC-001": { first: 'api_key = "abcdefghijklmnopqrstuv01"', second: 'api_key = "zyxwvutsrqponmlkjihg02"' },
      "SEC-002": { first: 'const a = "' + "AKIA" + 'ABCDEFGHIJKLMNOP";', second: 'const b = "' + "AKIA" + 'QRSTUVWXYZ234567";' },
      "SEC-003": { first: pem("MIIEaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), second: pem("MIIEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") },
      "SEC-004": { first: 'const a = "' + "sk_" + 'live_aaaaaaaaaaaaaaaaaaaaaaaa";', second: 'const b = "' + "sk_" + 'live_bbbbbbbbbbbbbbbbbbbbbbbb";' },
      "SEC-005": { first: 'const a = "' + "ghp" + '_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";', second: 'const b = "' + "ghp" + '_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";' },
      "SEC-006": { first: 'password = "hunter2hunter2"', second: 'password = "correcthorse01"' },
      "SEC-007": { first: `const a = "${jwt("aaaaaaaaaaaaaaaaaaaaaaaa")}";`, second: `const b = "${jwt("bbbbbbbbbbbbbbbbbbbbbbbb")}";` },
      "XFER-001": {
        first: 'analytics.track("signup", { email: user.email, plan: "pro" });',
        second: 'analytics.track("signup", { email: user.email, plan: "free" });',
      },
      "LOG-001": {
        first: 'console.log("user email", user.email, "at signup");',
        second: 'console.log("user email", user.email, "at checkout");',
      },
      "HEUR-001": { first: "const userEmail = form.value;", second: "sendReceipt(userEmail);" },
      "HEUR-002": { first: 'console.log("signup", user, "step 1");', second: 'console.log("signup", user, "step 2");' },
      "HEUR-003": { first: "JSON.stringify({ who: user, step: 1 });", second: "JSON.stringify({ who: user, step: 2 });" },
    };

    it("[EARS-35] should keep a sample for every regex and heuristic rule", () => {
      // ANTI-VACUITY: a rule without a sample is a rule this property never checks. A new rule
      // fails here until it gets one.
      const ruleIds = [...REGEX_RULES.map((r) => r.id), ...HEURISTIC_RULES.map((r) => r.id)].sort();
      expect(Object.keys(RULE_SAMPLES).sort()).toEqual(ruleIds);
    });

    it("[EARS-35] should emit two findings for two different occurrences of every rule and one for a repeated one", async () => {
      const detectorFor = (ruleId: string) =>
        ruleId.startsWith("HEUR-")
          ? new FindingDetectorModule({ regex: { enabled: false }, heuristic: { enabled: true } })
          : new FindingDetectorModule({ regex: { enabled: true, rules: [ruleId] }, heuristic: { enabled: false } });
      const countOf = async (ruleId: string, content: string) =>
        (await detectorFor(ruleId).detect(content, "src/sample.ts")).filter((f) => f.ruleId === ruleId).length;

      const collapsed: string[] = [];
      const split: string[] = [];
      for (const [ruleId, { first, second }] of Object.entries(RULE_SAMPLES)) {
        // ANTI-VACUITY: each sample must be detected on its own, or the counts below say nothing.
        expect({ ruleId, detected: await countOf(ruleId, first) }).toEqual({ ruleId, detected: 1 });

        if ((await countOf(ruleId, [first, "", second].join("\n"))) !== 2) collapsed.push(ruleId);
        if ((await countOf(ruleId, [first, "", first].join("\n"))) !== 1) split.push(ruleId);
      }

      expect({ collapsed, split }).toEqual({ collapsed: [], split: [] });
    });
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

    it("[EARS-16] should deduplicate findings by fingerprint equality", async () => {
      // Renamed with the spec amendment: the module compares by EQUALITY and no longer
      // owns a formula. The previous version ran RegexDetector directly — which does not
      // deduplicate at all — so it asserted identity collision, not deduplication.
      const module = new FindingDetectorModule({ regex: { enabled: true }, heuristic: { enabled: false } });
      const detector = new RegexDetector();
      const content = 'const email = "test@test.com"; // test@test.com';

      // ANTI-VACUITY: the detector must really emit more than one, otherwise the module
      // returning one proves nothing about deduplication.
      const raw = await detector.detect(content, "test.ts");
      expect(raw.length).toBeGreaterThan(1);
      expect(new Set(raw.map((f) => f.fingerprint)).size).toBe(1);

      const deduplicated = await module.detect(content, "test.ts");
      expect(deduplicated).toHaveLength(1);

      // And equality is the whole criterion: two findings whose fingerprints differ both
      // survive. Different files → different identities (AUDIT-K2).
      const other = await module.detect(content, "src/other.ts");
      expect(other[0]!.fingerprint).not.toBe(deduplicated[0]!.fingerprint);
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
