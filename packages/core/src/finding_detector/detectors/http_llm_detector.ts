import type {
  CodeSnippet,
  BaseFindingCategory,
  Finding,
  LlmDetector,
  LlmRawFinding,
} from "../types";
import { createFinding } from "../../audit/types";

const MAX_SNIPPET_LENGTH = 300;

/**
 * Truncates snippet to maximum 300 characters.
 */
function truncateSnippet(snippet: string): string {
  if (snippet.length <= MAX_SNIPPET_LENGTH) {
    return snippet;
  }
  return snippet.slice(0, MAX_SNIPPET_LENGTH - 3) + "...";
}

const LLM_KNOWN_CATEGORIES: BaseFindingCategory[] = [
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

function isKnownCategory(category: string): category is BaseFindingCategory {
  return (LLM_KNOWN_CATEGORIES as string[]).includes(category);
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
      const category = isKnownCategory(raw.category)
        ? raw.category
        : "unknown-risk";

      const snippet = truncateSnippet(raw.snippet);
      const finding = createFinding({
        // [EARS-32] The LLM does not return a delimited match, so the snippet IS the anchor.
        // Passing it explicitly rather than relying on the fallback keeps the contract
        // readable: this detector has decided what its anchor is.
        anchor: snippet,
        ruleId: raw.ruleId,
        file: raw.file,
        line: raw.line,
        message: raw.message,
        snippet,
        category,
        severity: raw.severity,
        detector: "llm",
        confidence: raw.confidence,
        executionId: "",      // filled post-orchestration
        reportedBy: [],       // filled post-orchestration
        isWaived: false,      // filled post-orchestration
      });

      if (raw.fixes?.length) finding.fixes = raw.fixes;
      if (raw.legalReference) finding.legalReference = raw.legalReference;

      return finding;
    });
  }
}
