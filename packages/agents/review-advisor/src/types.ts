// All EARS prefixes map to review_advisor_agent.md

import type { AuditOrchestrator } from '@gitgov/core';

/**
 * Input recibido por el agente via AgentExecutionContext.input.
 * Pasado por AuditOrchestrator post-policy (AORCH-F2).
 */
export type ReviewAdvisorInput = {
  /** Findings consolidados del AuditOrchestrator */
  findings: AuditOrchestrator.ConsolidatedFinding[];
  /** Policy decision del evaluator */
  policyDecision: AuditOrchestrator.PolicyDecision;
  /** TaskRecord.id para trazabilidad */
  taskId: string;
  /** Directorio raiz del repo para contexto de archivos */
  baseDir?: string;
  /** Filtro: solo reviewar findings de estas severidades */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low';
};

/**
 * Opinion de Claude sobre un finding individual.
 */
export type ReviewOpinion = {
  /** Fingerprint del finding reviewado */
  findingFingerprint: string;
  /** Explicacion del riesgo en lenguaje humano */
  riskExplanation: string;
  /** Regulaciones aplicables (GDPR Art. X, PCI Req Y, etc.) */
  regulations: string[];
  /** Opinion sobre la remediacion sugerida */
  remediationAdvice: string;
  /** Confidence: que tan seguro esta Claude de su analisis */
  confidence: 'high' | 'medium' | 'low';
  /** Es un false positive? */
  isFalsePositive: boolean;
  /** Justificacion si es false positive */
  falsePositiveReason?: string;
};

/**
 * Resultado completo del review.
 */
export type ReviewResult = {
  /** Opiniones por finding */
  opinions: ReviewOpinion[];
  /** Resumen general */
  summary: string;
  /** Modelo utilizado */
  model: string;
};

/**
 * Metadata del AgentOutput para review-advisor.
 */
export type ReviewAdvisorMetadata = {
  /** Discriminador de formato */
  kind: 'feedback-review';
  /** Resultado del review */
  data: ReviewResult;
};

/**
 * Dependencias inyectadas al agente.
 */
export type ReviewAdvisorAgentDeps = {
  /** API key de Anthropic (requerida para Claude) */
  anthropicApiKey?: string;
};
