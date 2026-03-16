import type { AgentDetectorConfig, SecurityAuditInput } from './types';

/**
 * Configuracion por defecto del pipeline de deteccion.
 * - Etapa 1: regex (siempre, rapido, gratis)
 * - Etapa 2: heuristic (solo si regex encontro algo)
 * El LLM NO esta en el default — requiere override explicito.
 */
export const DEFAULT_CONFIG: AgentDetectorConfig = Object.freeze({
  pipeline: Object.freeze([
    Object.freeze({ detector: 'regex' as const, conditional: false }),
    Object.freeze({ detector: 'heuristic' as const, conditional: true }),
  ]),
}) as AgentDetectorConfig;

/**
 * Construye la configuracion final del agente.
 * Sin overrides retorna DEFAULT_CONFIG. Con overrides, el pipeline
 * del override reemplaza el default completo.
 *
 * @param _input - Reserved for future input-driven config adaptation
 *   (e.g., scope='diff' could use lighter pipeline). Not consumed in MVP.
 */
export function buildConfig(
  _input: SecurityAuditInput,
  overrides?: Partial<AgentDetectorConfig>,
): AgentDetectorConfig {
  if (!overrides) return DEFAULT_CONFIG;

  return {
    pipeline: overrides.pipeline ?? DEFAULT_CONFIG.pipeline,
    rules: overrides.rules,
  };
}
