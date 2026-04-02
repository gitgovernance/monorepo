/**
 * Finding Detector types.
 *
 * Core types (Finding, FindingCategory, FindingSeverity, DetectorName) are
 * imported from @gitgov/core/audit — the central definition.
 * This file re-exports them and defines detector-specific types.
 */

// ─── Re-export canonical types from audit ────────────────────────────────────

export type {
  Finding,
  FindingCategory,
  FindingSeverity,
  DetectorName,
} from "../audit/types";

// ─── Detector-specific types ─────────────────────────────────────────────────

import type { Finding, FindingCategory, FindingSeverity, DetectorName } from "../audit/types";

/** Quota type for LLM usage control */
export type QuotaType = "unlimited" | "trial" | "usage-based";

/**
 * Configuration to enable/disable detectors.
 */
export interface DetectorConfig {
  /** Whether the detector is enabled */
  enabled: boolean;
  /** Specific rule IDs to use (optional, default: all) */
  rules?: string[];
}

/**
 * Interface for local detectors (regex, heuristic).
 * Process file content and return findings.
 */
export interface Detector {
  /** Unique name of the detector */
  name: DetectorName;
  /**
   * Detects PII/secrets in file content.
   * @param content - File content as string
   * @param filePath - Relative path to include in findings
   * @returns Array of detected findings
   */
  detect(content: string, filePath: string): Promise<Finding[]>;
}

/**
 * Code snippet sent to LLM for semantic analysis.
 * Includes context from adjacent lines.
 */
export interface CodeSnippet {
  /** File path */
  file: string;
  /** Start line of context */
  lineStart: number;
  /** End line of context */
  lineEnd: number;
  /** Detected language (typescript, python, etc.) */
  language: string;
  /** Snippet content (typically 5 lines) */
  content: string;
  /** Tags from heuristic detector that flagged it */
  heuristicTags: string[];
}

/**
 * Remote LLM detector configuration.
 */
export interface LlmDetectorConfig {
  /** Whether LLM detector is enabled */
  enabled: boolean;
  /** Analysis endpoint URL */
  endpoint: string;
  /** Model to use (claude-3-haiku, claude-3-sonnet) */
  model?: string;
  /** Max snippets per request (default: 50) */
  maxSnippetsPerRequest?: number;
  /** Applicable quota type */
  quotaType: QuotaType;
  /** Remaining uses for trial/usage-based */
  remainingUses?: number;
  /** ISO expiration date for trial */
  expiresAt?: string;
}

/**
 * Interface for remote LLM detectors.
 * Receive pre-filtered snippets in batch.
 */
export interface LlmDetector {
  /**
   * Analyzes snippets with LLM for semantic detection.
   * @param snippets - Pre-filtered candidates by heuristic
   * @returns Findings confirmed by LLM analysis
   */
  analyzeSnippets(snippets: CodeSnippet[]): Promise<Finding[]>;
}

/**
 * Complete Finding Detector module configuration.
 * Allows enabling/disabling each detector individually.
 */
export interface FindingDetectorConfig {
  /** Regex detector configuration (Free tier) */
  regex?: DetectorConfig;
  /** Heuristic detector configuration (Trial+ tier) */
  heuristic?: DetectorConfig;
  /** LLM detector configuration (Premium tier) */
  llm?: LlmDetectorConfig;
}

/**
 * Regex detection rule definition.
 */
export interface RegexRule {
  /** Unique rule ID (e.g., "PII-001") */
  id: string;
  /** Regex pattern with global flag */
  pattern: RegExp;
  /** Resulting finding category */
  category: FindingCategory;
  /** Resulting finding severity */
  severity: FindingSeverity;
  /** Descriptive problem message */
  message: string;
  /** Proposed fixes — SARIF §3.55.4 standard */
  fixes?: Array<{ description: string }>;
  /** Applicable legal reference */
  legalReference?: string;
}

/**
 * Finding structure returned by LLM API.
 * Normalized to Finding in normalizeFindings().
 */
export interface LlmRawFinding {
  file: string;
  line: number;
  ruleId: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  confidence: number;
  fixes?: Array<{ description: string }>;
  legalReference?: string;
  snippet?: string;
}
