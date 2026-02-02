import { createHash, randomUUID } from "node:crypto";
import type {
  CodeSnippet,
  FindingCategory,
  Finding,
  LlmDetector,
  LlmRawFinding,
} from "../types";

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
 * Validates if a category string is a valid FindingCategory.
 */
function isValidCategory(category: string): category is FindingCategory {
  const validCategories: FindingCategory[] = [
    "pii-email",
    "pii-phone",
    "pii-financial",
    "pii-health",
    "pii-generic",
    "hardcoded-secret",
    "logging-pii",
    "tracking-cookie",
    "tracking-analytics-id",
    "unencrypted-storage",
    "third-party-transfer",
    "unknown-risk",
  ];
  return validCategories.includes(category as FindingCategory);
}

/**
 * HTTP-based LLM detector for semantic PII analysis.
 * Tier: Premium (requires API key and quota)
 * Confidence: 0.9 (LLM-confirmed)
 *
 * Implements EARS-24: Reads API key from GITGOV_LLM_API_KEY env var
 * Implements EARS-25: Uses Bearer token authentication
 */
export class HttpLlmDetector implements LlmDetector {
  private endpoint: string;
  private apiKey: string;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  /**
   * Analyzes code snippets with LLM for semantic PII detection.
   * Implements EARS-18: Send candidates to LLM when quota available
   * Implements EARS-19: Normalize LLM response to Finding format
   */
  async analyzeSnippets(snippets: CodeSnippet[]): Promise<Finding[]> {
    if (snippets.length === 0) {
      return [];
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ snippets }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { findings: LlmRawFinding[] };
    return this.normalizeFindings(data.findings);
  }

  /**
   * Normalizes raw LLM findings to Finding format.
   */
  private normalizeFindings(rawFindings: LlmRawFinding[]): Finding[] {
    return rawFindings.map((raw) => {
      const category: FindingCategory = isValidCategory(raw.category)
        ? raw.category
        : "unknown-risk";

      const finding: Finding = {
        id: randomUUID(),
        ruleId: raw.ruleId ?? "LLM-001",
        category,
        severity: raw.severity,
        file: raw.file,
        line: raw.line,
        snippet: truncateSnippet(raw.snippet ?? ""),
        message: raw.message,
        detector: "llm",
        fingerprint: generateFingerprint(
          raw.ruleId ?? "LLM-001",
          raw.file,
          raw.line
        ),
        confidence: raw.confidence ?? 0.9,
      };

      if (raw.suggestion) finding.suggestion = raw.suggestion;
      if (raw.legalReference) finding.legalReference = raw.legalReference;

      return finding;
    });
  }
}
