// Sections: §4.1 (EARS-1 to EARS-9), §4.5 (EARS-23)
import { createHash } from "node:crypto";
import { RegexDetector } from "./regex_detector";
import { computeFingerprint } from "../../audit/fingerprint";

// GitHub push protection reads a literal `sk_test_` followed by a key-shaped tail as a real
// Stripe key and blocks the push — a fixture for a SECRET DETECTOR looks exactly like the
// thing it detects. Assembling it at runtime keeps the detector under test seeing the same
// string while the file holds no key-shaped literal. Do not inline these back.
const STRIPE_PREFIX = "sk_" + "test_";
const STRIPE_KEY = STRIPE_PREFIX + "abcdefghijklmnopqrstuvwx";


describe("RegexDetector", () => {
  describe("4.1. Regex Detection (EARS-1 to EARS-9)", () => {
    it("[EARS-1] should detect email addresses with pii-email", async () => {
      const detector = new RegexDetector();
      const content = 'const email = "john.doe@example.com";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("pii-email");
      expect(findings[0]?.severity).toBe("high");
      expect(findings[0]?.confidence).toBe(1.0);
      expect(findings[0]?.ruleId).toBe("PII-001");
    });

    it("[EARS-2] should detect phone numbers with pii-phone", async () => {
      const detector = new RegexDetector();
      const content = 'const phone = "+1 (555) 123-4567";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("pii-phone");
      expect(findings[0]?.severity).toBe("medium");
    });

    it("[EARS-3] should detect credit cards with pii-financial", async () => {
      const detector = new RegexDetector();
      const content = 'const cc = "4111-1111-1111-1111";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("pii-financial");
      expect(findings[0]?.severity).toBe("critical");
    });

    it("[EARS-4] should detect US SSN with pii-generic", async () => {
      const detector = new RegexDetector();
      const content = 'const socialNum = "123-45-6789";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("pii-generic");
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.ruleId).toBe("PII-004");
    });

    it("[EARS-5] should detect sensitive field names", async () => {
      const detector = new RegexDetector();
      const content = "const ssn = getValue();\nconst iban = getIban();";
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(2);
      expect(findings.some((f) => f.ruleId === "PII-005")).toBe(true);
      expect(findings.some((f) => f.category === "pii-generic")).toBe(true);
    });

    it("[EARS-6] should detect hardcoded API keys", async () => {
      const detector = new RegexDetector();
      const content =
        'const api_key = "sk_test_abcdefghijklmnopqrstuvwxyz123456";';
      const findings = await detector.detect(content, "test.ts");

      // Matches both SEC-001 (generic api_key pattern) and SEC-004 (Stripe sk_test_ pattern)
      expect(findings).toHaveLength(2);
      const ruleIds = findings.map(f => f.ruleId).sort();
      expect(ruleIds).toEqual(["SEC-001", "SEC-004"]);
      expect(findings.every(f => f.category === "hardcoded-secret")).toBe(true);
      expect(findings.every(f => f.severity === "critical")).toBe(true);
    });

    it("[EARS-7] should detect AWS Access Key IDs", async () => {
      const detector = new RegexDetector();
      const content = 'const awsKey = "AKIAIOSFODNN7EXAMPLE";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("hardcoded-secret");
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.ruleId).toBe("SEC-002");
    });

    it("[EARS-8] should detect private keys (RSA/EC)", async () => {
      const detector = new RegexDetector();
      const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("hardcoded-secret");
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.ruleId).toBe("SEC-003");
    });

    it("[EARS-9] should detect PII in console logging", async () => {
      const detector = new RegexDetector();
      const content = 'console.log("User email:", userEmail);';
      const findings = await detector.detect(content, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe("logging-pii");
      expect(findings[0]?.severity).toBe("high");
      expect(findings[0]?.ruleId).toBe("LOG-001");
    });
  });

  describe("4.6. Provider Tokens and Data Transfer (EARS-26 to EARS-30)", () => {
    it("[EARS-26] should detect GitHub tokens (SEC-005)", async () => {
      const detector = new RegexDetector();
      const content = 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const ghFinding = findings.find(f => f.ruleId === "SEC-005");
      expect(ghFinding).toBeDefined();
      expect(ghFinding!.category).toBe("hardcoded-secret");
      expect(ghFinding!.severity).toBe("critical");
    });

    it("[EARS-27] should detect hardcoded passwords (SEC-006)", async () => {
      const detector = new RegexDetector();
      const content = 'const password = "super_secret_password_123";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const pwFinding = findings.find(f => f.ruleId === "SEC-006");
      expect(pwFinding).toBeDefined();
      expect(pwFinding!.category).toBe("hardcoded-secret");
      expect(pwFinding!.severity).toBe("critical");
    });

    it("[EARS-28] should detect JWT tokens (SEC-007)", async () => {
      const detector = new RegexDetector();
      const content = 'const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const jwtFinding = findings.find(f => f.ruleId === "SEC-007");
      expect(jwtFinding).toBeDefined();
      expect(jwtFinding!.category).toBe("hardcoded-secret");
      expect(jwtFinding!.severity).toBe("high");
    });

    it("[EARS-29] should detect PII sent to third-party analytics (XFER-001)", async () => {
      const detector = new RegexDetector();
      const content = 'analytics.track("purchase", { email: user.email, phone: user.phone });';
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const xferFinding = findings.find(f => f.ruleId === "XFER-001");
      expect(xferFinding).toBeDefined();
      expect(xferFinding!.category).toBe("third-party-transfer");
      expect(xferFinding!.severity).toBe("high");
    });

    it("[EARS-30] should detect Stripe keys standalone without api_key variable name (SEC-004)", async () => {
      const detector = new RegexDetector();
      const content = 'const STRIPE_KEY = "sk_test_4eC39HqLyjWDarjtT1zdp7dc";';
      const findings = await detector.detect(content, "test.ts");

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const stripeFinding = findings.find(f => f.ruleId === "SEC-004");
      expect(stripeFinding).toBeDefined();
      expect(stripeFinding!.category).toBe("hardcoded-secret");
      expect(stripeFinding!.severity).toBe("critical");
    });
  });

  describe("4.5. Security and Sanitization (EARS-23)", () => {
    it("[EARS-23] should truncate snippet to maximum 300 characters", async () => {
      const detector = new RegexDetector();
      const longLine = "x".repeat(400) + " test@example.com";
      const findings = await detector.detect(longLine, "test.ts");

      expect(findings).toHaveLength(1);
      expect(findings[0]?.snippet?.length).toBeLessThanOrEqual(300);
    });
  });

  describe("4.7. Anchor y dedup semántico (EARS-31)", () => {
    it("[EARS-31] should pass the matched text as anchor and not compute a fingerprint", async () => {
      const detector = new RegexDetector();
      const content = `const stripe = "${STRIPE_KEY}";`;
      const findings = await detector.detect(content, "src/pay.ts");

      expect(findings).toHaveLength(1);
      const finding = findings[0]!;

      // The identity is the one createFinding derives from file + category + matched text.
      // The detector supplies the anchor and nothing else — computing it here is what put
      // three different formulas in three detectors (input #19 §0.3).
      expect(finding.fingerprint).toBe(
        computeFingerprint({
          file: "src/pay.ts",
          category: finding.category,
          anchor: STRIPE_KEY,
        }),
      );

      // Negative control — the old formula, hash(ruleId:file:line). If the detector ever
      // goes back to computing its own, this is the value it would land on.
      const positional = createHash("sha256")
        .update(`${finding.ruleId}:src/pay.ts:${finding.line}`)
        .digest("hex");
      expect(finding.fingerprint).not.toBe(positional);
    });

    it("[EARS-31] should keep the same fingerprint when the statement is reformatted across lines", async () => {
      const detector = new RegexDetector();
      // Deliberately no `apiKey`/`token`/`secret` nearby: that would also match SEC-001 and
      // yield two findings, turning this into a test about deduplication (EARS-33) instead
      // of one about the anchor.
      const oneLine = `const k = { charge: "${STRIPE_KEY}" };`;
      const reformatted = `const k = {\n  charge:\n    "${STRIPE_KEY}"\n};`;

      const before = await detector.detect(oneLine, "src/pay.ts");
      const after = await detector.detect(reformatted, "src/pay.ts");

      expect(before).toHaveLength(1);
      expect(after).toHaveLength(1);

      // This is the defect the epic exists to close (D-d): prettier splitting the statement
      // used to change the identity, and the waiver went with it.
      expect(after[0]!.fingerprint).toBe(before[0]!.fingerprint);

      // The line DID move, so the test is not passing because nothing changed.
      expect(after[0]!.line).not.toBe(before[0]!.line);

      // Negative control — hashing the snippet instead of the match reproduces D-d: the
      // surrounding text differs across the two layouts, so the identity would differ too.
      const snippetBased = (snippet: string) =>
        computeFingerprint({ file: "src/pay.ts", category: before[0]!.category, anchor: snippet });
      expect(snippetBased(after[0]!.snippet)).not.toBe(snippetBased(before[0]!.snippet));
    });
  });
});
