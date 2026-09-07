// [SGP-A2] Types must compile cleanly with tsc --noEmit
import type { Sarif, Finding, FindingSeverity, FindingCategory } from '@gitgov/core';
type SarifLog = Sarif.SarifLog;

/**
 * A SARIF result as emitted by `semgrep --sarif`.
 * Structurally SARIF 2.1.0, but its `properties` bag carries semgrep metadata
 * (`metadata.cwe`, `metadata.category`, ...) — not the GitGov property bag that
 * `Sarif.SarifResult` requires (`gitgov/category`, `gitgov/detector`, `gitgov/confidence`).
 * The agent maps these results to `Finding[]` and only then produces a GitGov SarifLog.
 */
export type SemgrepRawResult = Omit<Sarif.SarifResult, 'properties'> & {
  properties?: Record<string, unknown>;
};

/**
 * The SARIF log received from the semgrep CLI (input of the agent), before mapping.
 */
export type SemgrepRawSarif = Omit<SarifLog, 'runs'> & {
  runs: Array<Omit<Sarif.SarifRun, 'results'> & { results: SemgrepRawResult[] }>;
};

/**
 * Input recibido por el agente via AgentExecutionContext.input.
 * Se castea explicitamente en runAgent.
 */
export type SemgrepInput = {
  scope: 'full' | 'diff';
  taskId: string;
  baseDir?: string;
  baselineCommit?: string;
  include?: string[];
  exclude?: string[];
};

/**
 * Configuracion resuelta del agente.
 */
export type SemgrepConfig = {
  configPath: string | null;
  timeout: number;
};

/**
 * Internal metadata type for the semgrep agent.
 */
export type SemgrepMetadata = {
  kind: 'sarif';
  version: '2.1.0';
  data: SarifLog;
  summary?: SemgrepSummary;
};

/**
 * Summary del scan semgrep.
 */
export type SemgrepSummary = {
  totalFindings: number;
  bySeverity: Record<string, number>;
  rulesMatched: number;
  filesScanned: number;
};

/**
 * Dependencias del agent (inyectadas en constructor).
 */
export type SemgrepAgentDeps = {
  sarifBuilder: Sarif.SarifBuilder;
  getLineContent: (file: string, line: number) => Promise<string | null>;
};

/**
 * Mapping de severidad semgrep a FindingSeverity gitgov.
 */
export const SEMGREP_SEVERITY_MAP: Record<string, FindingSeverity> = {
  ERROR: 'critical',
  WARNING: 'high',
  INFO: 'medium',
};

/**
 * Mapping de CWE de semgrep a FindingCategory gitgov.
 */
export const SEMGREP_CATEGORY_MAP: Record<string, FindingCategory> = {
  'CWE-798': 'hardcoded-secret',
  'CWE-259': 'hardcoded-secret',
  'CWE-89': 'security-vulnerability',
  'CWE-79': 'security-vulnerability',
  'CWE-22': 'security-vulnerability',
  'CWE-78': 'security-vulnerability',
  'CWE-94': 'security-vulnerability',
  'CWE-502': 'security-vulnerability',
};
