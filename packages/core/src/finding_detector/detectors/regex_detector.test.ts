// Sections: §4.1 (EARS-1 to EARS-9), §4.5 (EARS-23)
import { RegexDetector } from "./regex_detector";

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
      expect(findings[0]?.snippet.length).toBeLessThanOrEqual(300);
    });
  });
});
