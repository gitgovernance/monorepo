// [SGP-A2] Types must compile cleanly with tsc --noEmit
import type { Sarif, Finding, FindingSeverity, FindingCategory } from '@gitgov/core';
type SarifLog = Sarif.SarifLog;

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
  'CWE-89': 'unknown-risk',
  'CWE-79': 'unknown-risk',
  'CWE-22': 'unknown-risk',
  'CWE-78': 'unknown-risk',
  'CWE-94': 'unknown-risk',
  'CWE-502': 'unknown-risk',
};
