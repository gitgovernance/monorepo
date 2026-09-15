import type { RegexRule } from "../types";

export const REGEX_RULES: RegexRule[] = [
  // === PII ===
  {
    id: "PII-001",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    category: "pii-email",
    severity: "high",
    message: "Email address detected in source code",
    fixes: [{ description: "Move to configuration or environment variable" }],
    legalReference: "GDPR Art. 4(1)",
  },
  {
    id: "PII-002",
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    category: "pii-phone",
    severity: "medium",
    message: "Phone number pattern detected",
    fixes: [{ description: "Avoid hardcoding personal phone numbers" }],
  },
  {
    id: "PII-003",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    category: "pii-financial",
    severity: "critical",
    message: "Potential credit card number detected",
    fixes: [{ description: "Never store credit card numbers in source code" }],
    legalReference: "PCI-DSS, GDPR Art. 32",
  },
  {
    id: "PII-004",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: "pii-generic",
    severity: "critical",
    message: "US Social Security Number pattern detected",
    fixes: [{ description: "SSNs must never be stored in source code" }],
  },
  {
    id: "PII-005",
    pattern: /\b(ssn|dni|document_number|iban)\b/gi,
    category: "pii-generic",
    severity: "medium",
    message: "Sensitive field name detected",
    fixes: [{ description: "Review if real data or structure requiring encryption" }],
    // [EARS-35] The match is the field name, the same for every use in the file.
    anchor: "line",
  },

  // === SECRETS ===
  {
    id: "SEC-001",
    pattern:
      /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][^'"]{20,}['"]/gi,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Hardcoded API key detected",
    fixes: [{ description: "Use environment variables or secret management" }],
  },
  {
    id: "SEC-002",
    pattern: /AKIA[0-9A-Z]{16}/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "AWS Access Key ID detected",
    fixes: [{ description: "Rotate this key immediately and use IAM roles" }],
  },
  {
    id: "SEC-003",
    // [EARS-35] The whole key block, not only the header: every key starts with the same line.
    // The block never runs past another BEGIN, or a key cut before its END marker would swallow
    // the next key up to that key's END. A cut key keeps up to 512 base64 chars after the header.
    pattern:
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----(?:(?:(?!-----BEGIN )[\s\S])*?-----END (?:RSA |EC )?PRIVATE KEY-----|[A-Za-z0-9+/=\s]{0,512})/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Private key detected in source code",
    fixes: [{ description: "Never commit private keys. Use secret management." }],
  },

  // === PROVIDER TOKENS ===
  {
    id: "SEC-004",
    pattern: /(?:sk|pk|rk)_(?:live|test)_[a-zA-Z0-9]{20,}/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Stripe API key detected",
    fixes: [{ description: "Use environment variables. Never commit Stripe keys." }],
  },
  {
    id: "SEC-005",
    pattern: /(?:ghp|gho|ghs|ghu|github_pat)_[a-zA-Z0-9]{20,}/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "GitHub token detected",
    fixes: [{ description: "Use environment variables or GitHub App tokens." }],
  },
  {
    id: "SEC-006",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Hardcoded password detected",
    fixes: [{ description: "Use environment variables or secret management." }],
  },
  {
    id: "SEC-007",
    pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
    category: "hardcoded-secret",
    severity: "high",
    message: "JWT token detected in source code",
    fixes: [{ description: "Never commit JWT tokens. Generate at runtime." }],
  },

  // === DATA TRANSFER ===
  {
    id: "XFER-001",
    // [EARS-35] Through the end of the line with the keyword: the arguments after it are what
    // tell two calls apart.
    pattern: /analytics\.(?:track|identify|page)\s*\([^)]*(?:email|phone|name|address|ssn)[^\n]*/gi,
    category: "third-party-transfer",
    severity: "high",
    message: "PII sent to third-party analytics",
    fixes: [{ description: "Strip PII before sending to analytics. Use pseudonymized identifiers." }],
    legalReference: "GDPR Art. 5(1)(c) — data minimization",
  },

  // === LOGGING PII ===
  {
    id: "LOG-001",
    // [EARS-35] Through the end of the line with the keyword, same reason as XFER-001.
    pattern:
      /console\.(log|info|warn|error)\s*\([^)]*(?:email|password|ssn|phone|credit)[^\n]*/gi,
    category: "logging-pii",
    severity: "high",
    message: "Potential PII being logged",
    fixes: [{ description: "Sanitize logs to remove personal data" }],
    legalReference: "GDPR Art. 5(1)(f)",
  },
];
