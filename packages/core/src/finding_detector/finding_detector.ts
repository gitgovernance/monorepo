import type {
  CodeSnippet,
  Detector,
  GdprFinding,
  LlmDetector,
  LlmDetectorConfig,
  PiiDetectorConfig,
} from "./types";
import { RegexDetector } from "./detectors/regex_detector";
import { HeuristicDetector } from "./detectors/heuristic_detector";
import { HttpLlmDetector } from "./detectors/http_llm_detector";

/**
 * PII Detector Module - Central component for sensitive data detection.
 *
 * Architecture: Two-phase detection
 * - Phase 1: Local detection (regex + heuristic) - always runs
 * - Phase 2: Remote LLM analysis - only for low-confidence candidates
 *
 * Implements EARS-14: Execute Phase 1 before Phase 2
 * Implements EARS-16: Deduplicate by SHA256 fingerprint
 * Implements EARS-17: Work with local-only detection when no LLM
 * Implements EARS-23: Truncate snippets to 300 chars
 */
export class PiiDetectorModule {
  private localDetectors: Detector[] = [];
  private llmDetector?: LlmDetector;
  private llmConfig?: LlmDetectorConfig;

  /**
   * Constructs the module with graceful degradation.
   * Without config -> only RegexDetector (Free tier).
   */
  constructor(config?: PiiDetectorConfig) {
    // RegexDetector always available (Free tier)
    if (config?.regex?.enabled === false) {
      // Explicitly disabled
    } else {
      this.localDetectors.push(new RegexDetector(config?.regex?.rules));
    }

    // HeuristicDetector if enabled (Trial+ tier)
    if (config?.heuristic?.enabled) {
      this.localDetectors.push(new HeuristicDetector());
    }

    // LlmDetector if enabled and configured (Premium tier)
    if (config?.llm?.enabled && config.llm.endpoint) {
      this.llmConfig = config.llm;
      const apiKey = process.env["GITGOV_LLM_API_KEY"];
      if (apiKey) {
        this.llmDetector = new HttpLlmDetector(config.llm.endpoint, apiKey);
      }
      // Graceful degradation: no API key -> local-only detection
    }
  }

  /**
   * Detects PII and secrets in file content.
   *
   * Flow:
   * 1. Run all enabled local detectors (Phase 1)
   * 2. Extract candidates with confidence < 0.8
   * 3. If LLM enabled and quota OK, analyze candidates (Phase 2)
   * 4. Merge and deduplicate by fingerprint
   */
  async detect(content: string, filePath: string): Promise<GdprFinding[]> {
    // Phase 1: Local detection
    const localFindings = await this.runLocalDetectors(content, filePath);

    // Phase 2: LLM analysis (if available)
    let llmFindings: GdprFinding[] = [];
    if (this.llmDetector && this.checkQuota()) {
      const candidates = this.extractCandidates(localFindings, content, filePath);
      if (candidates.length > 0) {
        try {
          llmFindings = await this.llmDetector.analyzeSnippets(candidates);
          this.decrementQuota(candidates.length);
        } catch {
          // Graceful degradation: LLM error -> continue with local findings
        }
      }
    }

    // Merge and deduplicate
    return this.deduplicateByFingerprint([...localFindings, ...llmFindings]);
  }

  /**
   * Runs all local detectors and collects findings.
   */
  private async runLocalDetectors(
    content: string,
    filePath: string
  ): Promise<GdprFinding[]> {
    const results = await Promise.all(
      this.localDetectors.map((d) => d.detect(content, filePath))
    );
    return results.flat();
  }

  /**
   * Extracts CodeSnippets from low-confidence findings for LLM analysis.
   * Includes 2 lines of context before and after.
   * Implements EARS-15: Extract candidates with confidence < 0.8
   */
  private extractCandidates(
    findings: GdprFinding[],
    content: string,
    filePath: string
  ): CodeSnippet[] {
    const lines = content.split("\n");
    const lang = this.detectLanguage(filePath);

    return findings
      .filter((f) => f.confidence < 0.8)
      .map((f) => ({
        file: filePath,
        lineStart: Math.max(1, f.line - 2),
        lineEnd: Math.min(lines.length, f.line + 2),
        language: lang,
        content: lines.slice(Math.max(0, f.line - 3), f.line + 2).join("\n"),
        heuristicTags: [f.category, f.detector],
      }));
  }

  /**
   * Checks if LLM quota is available.
   * Implements EARS-20: Reject when trial expired
   * Implements EARS-21: Reject when remainingUses is zero
   */
  private checkQuota(): boolean {
    if (!this.llmConfig) return false;

    if (this.llmConfig.quotaType === "unlimited") return true;

    if (this.llmConfig.quotaType === "trial") {
      if (this.llmConfig.expiresAt) {
        const expired = new Date(this.llmConfig.expiresAt) < new Date();
        if (expired) return false;
      }
    }

    return (this.llmConfig.remainingUses ?? 0) > 0;
  }

  /**
   * Decrements quota after successful LLM call.
   * Implements EARS-22: Decrement remainingUses after successful call
   */
  private decrementQuota(count: number): void {
    if (this.llmConfig?.remainingUses !== undefined) {
      this.llmConfig.remainingUses = Math.max(
        0,
        this.llmConfig.remainingUses - count
      );
    }
  }

  /**
   * Deduplicates findings by SHA256 fingerprint.
   */
  private deduplicateByFingerprint(findings: GdprFinding[]): GdprFinding[] {
    const seen = new Set<string>();
    return findings.filter((f) => {
      if (seen.has(f.fingerprint)) return false;
      seen.add(f.fingerprint);
      return true;
    });
  }

  /**
   * Detects programming language based on file extension.
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      go: "go",
      java: "java",
      rs: "rust",
      rb: "ruby",
    };
    return map[ext ?? ""] ?? "unknown";
  }
}
