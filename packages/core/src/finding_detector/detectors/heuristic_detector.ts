import type { AnchorSource, Detector, Finding, FindingCategory, FindingSeverity } from "../types";
import { createFinding } from "../../audit/types";

const MAX_SNIPPET_LENGTH = 300;

// Pattern for HEUR-001: Sensitive variable names
const SENSITIVE_VAR_PATTERN =
  /\b(user|customer|client|employee|patient)(_)?(email|phone|ssn|address|creditcard|password)\b/gi;

// Pattern for HEUR-002: Logging of user/customer objects.
// [EARS-35] Through the end of the line with the keyword: the arguments after it tell calls apart.
const LOGGING_PATTERN =
  /console\.(log|info|debug|warn)\s*\([^)]*\b(user|customer|request\.body|formData)\b[^\n]*/gi;

// Pattern for HEUR-003: Serialization of sensitive objects. [EARS-35] Same as HEUR-002.
const SERIALIZE_PATTERN =
  /JSON\.stringify\s*\([^)]*\b(user|customer|profile|account)\b[^\n]*/gi;

export interface HeuristicRule {
  id: string;
  pattern: RegExp;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  message: string;
  fixes?: Array<{ description: string }>;
  /** [EARS-35] What the identity anchors on; see RegexRule.anchor. */
  anchor?: AnchorSource;
}

/** The heuristic rules, in evaluation order. */
export const HEURISTIC_RULES: readonly HeuristicRule[] = [
  {
    id: "HEUR-001",
    pattern: SENSITIVE_VAR_PATTERN,
    category: "pii-generic",
    severity: "medium",
    confidence: 0.7,
    message: "Sensitive variable name detected",
    fixes: [{ description: "Consider if this variable contains actual PII" }],
    // [EARS-35] The match is the variable name, the same for every use in the file.
    anchor: "line",
  },
  {
    id: "HEUR-002",
    pattern: LOGGING_PATTERN,
    category: "logging-pii",
    severity: "medium",
    confidence: 0.6,
    message: "Logging of potentially sensitive object detected",
    fixes: [{ description: "Sanitize logged objects to remove PII" }],
  },
  {
    id: "HEUR-003",
    pattern: SERIALIZE_PATTERN,
    category: "third-party-transfer",
    severity: "low",
    confidence: 0.5,
    message: "JSON serialization of potentially sensitive object",
    fixes: [{ description: "Ensure sensitive fields are excluded before serialization" }],
  },
];

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
 * The full, untruncated line where a match starts.
 */
function lineAt(content: string, matchIndex: number): string {
  return content.split("\n")[getLineNumber(content, matchIndex) - 1] || "";
}

/**
 * Extracts snippet from line where match occurs.
 */
function extractSnippet(content: string, matchIndex: number): string {
  return truncateSnippet(lineAt(content, matchIndex).trim());
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

        const finding = createFinding({
          // [EARS-31] [EARS-35] Same contract as the regex detector: hand over the text that
          // distinguishes this occurrence, never the identity.
          anchor: rule.anchor === "line" ? lineAt(content, match.index) : match[0],
          ruleId: rule.id,
          file: filePath,
          line,
          message: rule.message,
          snippet,
          category: rule.category,
          severity: rule.severity,
          detector: this.name,
          confidence: rule.confidence,
          executionId: "",      // filled post-orchestration
          reportedBy: [],       // filled post-orchestration
          isWaived: false,      // filled post-orchestration
          ...(rule.fixes?.length ? { fixes: rule.fixes } : {}),
        });
        findings.push(finding);
      }
    }

    return findings;
  }
}
