import { createHash, randomUUID } from "node:crypto";
import type { Detector, GdprFinding, RegexRule } from "../types";
import { REGEX_RULES } from "../rules/regex_rules";

const MAX_SNIPPET_LENGTH = 300;

/**
 * Generates SHA256 fingerprint for deduplication.
 * Format: hash(ruleId:file:line)
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
 * Regex-based detector for PII and secrets.
 * Tier: Free (always available)
 * Confidence: 1.0 (deterministic)
 */
export class RegexDetector implements Detector {
  readonly name = "regex" as const;
  private rules: RegexRule[];

  constructor(ruleIds?: string[]) {
    if (ruleIds && ruleIds.length > 0) {
      this.rules = REGEX_RULES.filter((r) => ruleIds.includes(r.id));
    } else {
      this.rules = REGEX_RULES;
    }
  }

  async detect(content: string, filePath: string): Promise<GdprFinding[]> {
    const findings: GdprFinding[] = [];

    for (const rule of this.rules) {
      // Reset regex lastIndex for global patterns
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const line = getLineNumber(content, match.index);
        const snippet = extractSnippet(content, match.index);

        const finding: GdprFinding = {
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
          confidence: 1.0,
        };
        if (rule.suggestion) finding.suggestion = rule.suggestion;
        if (rule.legalReference) finding.legalReference = rule.legalReference;
        findings.push(finding);
      }
    }

    return findings;
  }
}
