import { sha256 } from '../crypto';
import type { SarifLog, SarifResultProperties } from '../sarif/sarif.types';
import type { RedactionLevel, RedactionConfig, RedactableInput, RedactedFinding } from './redactor.types';

/**
 * Aplica politica de redaccion a un Finding o ConsolidatedFinding segun el nivel de destino.
 *
 * Dos metodos publicos:
 * - `redact(finding, level)` — redaccion a nivel de Finding individual
 * - `redactSarif(sarif, level)` — redaccion a nivel de SarifLog completo (usado por el orquestador)
 *
 * Uso:
 *   const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);
 *   const l1Finding = redactor.redact(finding, 'l1');
 *   const l1Consolidated = redactor.redact(consolidated, 'l1');
 *   const l2Finding = redactor.redact(finding, 'l2');
 *   const l1Sarif = redactor.redactSarif(agentResult.sarif, 'l1');
 */
class FindingRedactor {
  private readonly sensitiveSet: Set<string>;
  private readonly safeSet: Set<string>;

  constructor(private readonly config: RedactionConfig) {
    this.sensitiveSet = new Set(config.sensitiveCategories);
    this.safeSet = new Set(config.safeCategories);
  }

  /**
   * Redacta un finding para el nivel indicado.
   * Generic over T so it accepts both Finding and ConsolidatedFinding.
   *
   * L2: retorna copia completa sin modificaciones (solo agrega metadatos).
   * L1 + categoria no sensible: retorna copia sin modificaciones.
   * L1 + categoria sensible: redacta snippet, genericiza message, elimina fixes.
   *
   * Note: ConsolidatedFinding does not have fixes field.
   * Only fields that exist on the input are redacted.
   */
  redact<T extends RedactableInput>(finding: T, level: RedactionLevel): RedactedFinding<T> {
    // Helper to build result — generic intersection types with exactOptionalPropertyTypes
    // require casting through unknown when using spread operators.
    const build = (overrides: Record<string, unknown>): RedactedFinding<T> =>
      ({ ...finding, ...overrides }) as unknown as RedactedFinding<T>;

    // L2: datos completos siempre
    if (level === 'l2') {
      return build({ redactionLevel: 'l2', hasFullSnippet: true });
    }

    // L1: decision por categoria
    const isSensitive = this.isSensitiveCategory(finding.category);

    if (!isSensitive) {
      return build({ redactionLevel: 'l1', hasFullSnippet: true });
    }

    // L1 + categoria sensible: redactar
    // Only redact snippet/fixes if they exist on the input type
    const snippet = 'snippet' in finding ? finding.snippet : undefined;
    const overrides: Record<string, unknown> = {
      message: `Sensitive finding (${finding.category})`,
      redactionLevel: 'l1',
      hasFullSnippet: false,
    };
    if ('snippet' in finding) {
      overrides['snippet'] = '[REDACTED]';
    }
    if ('fixes' in finding) {
      overrides['fixes'] = undefined;
    }
    if (snippet) {
      overrides['snippetHash'] = sha256(snippet as string);
    }
    return build(overrides);
  }

  /**
   * Redacts all snippets in a SarifLog according to the redaction level.
   * Returns a deep copy — original SarifLog is not mutated.
   * Used by the orchestrator to redact SARIF before storing in ExecutionRecord (L1).
   *
   * For each result in sarif.runs[].results[]:
   * - Checks result.properties['gitgov/category'] against category config
   * - If sensitive + L1: replaces region.snippet.text with '[REDACTED]',
   *   stores sha256(original) in result.properties['gitgov/snippetHash']
   * - If L2 or not sensitive: no change
   */
  redactSarif(sarif: SarifLog, level: RedactionLevel): SarifLog {
    const copy: SarifLog = JSON.parse(JSON.stringify(sarif));

    if (level === 'l2') {
      return copy;
    }

    for (const run of copy.runs ?? []) {
      for (const result of run.results ?? []) {
        const category = result.properties?.['gitgov/category'] as string | undefined;
        if (!category || !this.isSensitiveCategory(category)) continue;

        // Redact snippet in all locations
        for (const location of result.locations ?? []) {
          const snippet = location.physicalLocation?.region?.snippet;
          if (snippet?.text) {
            const originalText = snippet.text;
            snippet.text = '[REDACTED]';
            // Store hash for L1 <-> L2 integrity verification
            if (!result.properties) {
              result.properties = {} as SarifResultProperties;
            }
            result.properties['gitgov/snippetHash'] = sha256(originalText);
          }
        }
      }
    }

    return copy;
  }

  /**
   * Determina si una categoria requiere redaccion en L1.
   *
   * Orden de evaluacion:
   * 1. En sensitiveCategories -> true (redactar)
   * 2. En safeCategories -> false (no redactar)
   * 3. No registrada -> segun defaultBehavior ('redact' = true, 'keep' = false)
   */
  private isSensitiveCategory(category: string): boolean {
    if (this.sensitiveSet.has(category)) return true;
    if (this.safeSet.has(category)) return false;
    return this.config.defaultBehavior === 'redact';
  }
}

export { FindingRedactor };
