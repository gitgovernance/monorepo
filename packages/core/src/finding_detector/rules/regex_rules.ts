import type { RegexRule } from "../types";

export const REGEX_RULES: RegexRule[] = [
  // === PII ===
  {
    id: "PII-001",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    category: "pii-email",
    severity: "high",
    message: "Email address detected in source code",
    suggestion: "Move to configuration or environment variable",
    legalReference: "GDPR Art. 4(1)",
  },
  {
    id: "PII-002",
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    category: "pii-phone",
    severity: "medium",
    message: "Phone number pattern detected",
    suggestion: "Avoid hardcoding personal phone numbers",
  },
  {
    id: "PII-003",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    category: "pii-financial",
    severity: "critical",
    message: "Potential credit card number detected",
    suggestion: "Never store credit card numbers in source code",
    legalReference: "PCI-DSS, GDPR Art. 32",
  },
  {
    id: "PII-004",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: "pii-generic",
    severity: "critical",
    message: "US Social Security Number pattern detected",
    suggestion: "SSNs must never be stored in source code",
  },
  {
    id: "PII-005",
    pattern: /\b(ssn|dni|document_number|iban)\b/gi,
    category: "pii-generic",
    severity: "medium",
    message: "Sensitive field name detected",
    suggestion: "Review if real data or structure requiring encryption",
  },

  // === SECRETS ===
  {
    id: "SEC-001",
    pattern:
      /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][^'"]{20,}['"]/gi,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Hardcoded API key detected",
    suggestion: "Use environment variables or secret management",
  },
  {
    id: "SEC-002",
    pattern: /AKIA[0-9A-Z]{16}/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "AWS Access Key ID detected",
    suggestion: "Rotate this key immediately and use IAM roles",
  },
  {
    id: "SEC-003",
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    category: "hardcoded-secret",
    severity: "critical",
    message: "Private key detected in source code",
    suggestion: "Never commit private keys. Use secret management.",
  },

  // === LOGGING PII ===
  {
    id: "LOG-001",
    pattern:
      /console\.(log|info|warn|error)\s*\([^)]*(?:email|password|ssn|phone|credit)/gi,
    category: "logging-pii",
    severity: "high",
    message: "Potential PII being logged",
    suggestion: "Sanitize logs to remove personal data",
    legalReference: "GDPR Art. 5(1)(f)",
  },
];
