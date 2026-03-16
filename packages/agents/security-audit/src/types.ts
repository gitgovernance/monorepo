import type { Sarif } from '@gitgov/core';

type SarifLog = Sarif.SarifLog;

/**
 * Input recibido por el agente via AgentExecutionContext.input.
 * Se castea explicitamente en runAgent (Decision A8).
 */
export type SecurityAuditInput = {
  /** Alcance del scan: diff (PR), full (todo), baseline (snapshot) */
  scope: 'diff' | 'full' | 'baseline';
  /** TaskRecord.id que origino la ejecucion — required para trazabilidad */
  taskId: string;
  /** Directorio raiz del repo. Optional — orchestrator lo resuelve */
  baseDir?: string;
  /** Globs de inclusion (default: todo) */
  include?: string[];
  /** Globs de exclusion (default: node_modules, .git, dist) */
  exclude?: string[];
  /** Severidad minima para incluir en el output */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low';
};

/**
 * Internal metadata type for the security audit agent.
 * Refines the framework's Record<string, unknown> metadata.
 */
export type SecurityAuditMetadata = {
  kind: 'sarif';
  version: '2.1.0';
  data: SarifLog;
  summary?: AuditSummary;
};

/**
 * Summary agregado del scan.
 * No incluye waivedCount — el agente NO aplica waivers (Decision A12/A13).
 */
export type AuditSummary = {
  totalFindings: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  scopeType: SecurityAuditInput['scope'];
  filesScanned: number;
};

/**
 * Una etapa del pipeline de deteccion.
 * Si conditional: true, solo se ejecuta si la etapa anterior
 * produjo al menos un finding.
 */
export type DetectorStage = {
  detector: 'regex' | 'heuristic' | 'llm';
  conditional: boolean;
  config?: Record<string, unknown>;
};

/**
 * Configuracion del pipeline de deteccion.
 */
export type AgentDetectorConfig = {
  pipeline: DetectorStage[];
  rules?: Record<string, string[]>;
};
