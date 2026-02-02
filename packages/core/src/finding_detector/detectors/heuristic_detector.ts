import { createHash, randomUUID } from "node:crypto";
import type { Detector, FindingCategory, FindingSeverity, Finding } from "../types";

const MAX_SNIPPET_LENGTH = 300;

// Pattern for HEUR-001: Sensitive variable names
const SENSITIVE_VAR_PATTERN =
  /\b(user|customer|client|employee|patient)(_)?(email|phone|ssn|address|creditcard|password)\b/gi;

// Pattern for HEUR-002: Logging of user/customer objects
const LOGGING_PATTERN =
  /console\.(log|info|debug|warn)\s*\([^)]*\b(user|customer|request\.body|formData)\b/gi;

// Pattern for HEUR-003: Serialization of sensitive objects
const SERIALIZE_PATTERN =
  /JSON\.stringify\s*\([^)]*\b(user|customer|profile|account)\b/gi;

interface HeuristicRule {
  id: string;
  pattern: RegExp;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  message: string;
  suggestion?: string;
}

const HEURISTIC_RULES: HeuristicRule[] = [
  {
    id: "HEUR-001",
    pattern: SENSITIVE_VAR_PATTERN,
    category: "pii-generic",
    severity: "medium",
    confidence: 0.7,
    message: "Sensitive variable name detected",
    suggestion: "Consider if this variable contains actual PII",
  },
  {
    id: "HEUR-002",
    pattern: LOGGING_PATTERN,
    category: "logging-pii",
    severity: "medium",
    confidence: 0.6,
    message: "Logging of potentially sensitive object detected",
    suggestion: "Sanitize logged objects to remove PII",
  },
  {
    id: "HEUR-003",
    pattern: SERIALIZE_PATTERN,
    category: "third-party-transfer",
    severity: "low",
    confidence: 0.5,
    message: "JSON serialization of potentially sensitive object",
    suggestion: "Ensure sensitive fields are excluded before serialization",
  },
];

/**
 * Generates SHA256 fingerprint for deduplication.
 */
function generateFingerprint(
  ruleId: string,
  file: string,
  line: number
): string {
  return createHash("sha256").update(`${ruleId}:${file}:${line}`).digest("hex");
}

/**
 * Truncates snippet to maximum 300 characters.
 */
function truncateSnippet(snippet: string): string {
  if (snippet.length <= MAX_SNIPPET_LENGTH) {
    return snippet;
  }
  return snippet.slice(0, MAX_SNIPPET_LENGTH - 3) + "...";
}

/**
 * Calculates line number (1-based) given an index in content.
 */
function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/**
 * Extracts snippet from line where match occurs.
 */
function extractSnippet(content: string, matchIndex: number): string {
  const lines = content.split("\n");
  const lineNumber = getLineNumber(content, matchIndex);
  const line = lines[lineNumber - 1] || "";
  return truncateSnippet(line.trim());
}

/**
 * Heuristic detector for complex PII patterns.
 * Tier: Trial+ (requires enablement)
 * Confidence: 0.5-0.7 (probabilistic)
 */
export class HeuristicDetector implements Detector {
  readonly name = "heuristic" as const;

  async detect(content: string, filePath: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const rule of HEURISTIC_RULES) {
      // Reset regex lastIndex for global patterns
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const line = getLineNumber(content, match.index);
        const snippet = extractSnippet(content, match.index);

        const finding: Finding = {
          id: randomUUID(),
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          file: filePath,
          line,
          snippet,
          message: rule.message,
          detector: this.name,
          fingerprint: generateFingerprint(rule.id, filePath, line),
          confidence: rule.confidence,
        };
        if (rule.suggestion) finding.suggestion = rule.suggestion;
        findings.push(finding);
      }
    }

    return findings;
  }
}
