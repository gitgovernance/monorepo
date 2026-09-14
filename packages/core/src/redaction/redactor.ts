import { sha256 } from '../crypto';
import type { SarifLog, SarifResultProperties } from '../sarif/sarif.types';
import type { FindingCategory } from '../audit/types';
import { REDACTED_SNIPPET } from '../audit/types';
import type { RedactionLevel, RedactionConfig, RedactableInput, RedactedFinding } from './redactor.types';

/**
 * [RLDX-B2] [RLDX-B8] The sentinel a redacted snippet becomes, declared once in audit/ and
 * re-exported here: the SaaS projection derives `hasFullSnippet` by comparing against it
 * (RLDX-F3), and the SARIF rehydrator refuses to derive an identity from it (AUDIT-N1).
 */
export { REDACTED_SNIPPET };

/**
 * What `redact()` may write on top of the source finding: the two keys it owns plus the two
 * fields L1 redaction rewrites. Typed, so a typo in a key is a compile error and no cast is
 * needed on the result. `snippetHash` is deliberately absent — transported, never rewritten
 * (RLDX-B3).
 */
type RedactionOverrides = {
  redactionLevel: RedactionLevel;
  hasFullSnippet: boolean;
  snippet?: string;
  message?: string;
};

/**
 * Aplica politica de redaccion a un Finding segun el nivel de destino.
 *
 * Dos metodos publicos:
 * - `redact(finding, level)` — redaccion a nivel de Finding individual
 * - `redactSarif(sarif, level)` — redaccion a nivel de SarifLog completo (usado por el orquestador)
 *
 * Uso:
 *   const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);
 *   const l1Finding = redactor.redact(finding, 'l1');
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
   * Generic over T so the concrete subtype of the input survives into the return.
   *
   * L2: retorna copia completa sin modificaciones (solo agrega metadatos).
   * L1 + categoria no sensible: retorna copia sin modificaciones.
   * L1 + categoria sensible: redacta snippet, genericiza message, omite fixes.
   * En todos los casos `snippetHash` se transporta tal cual (RLDX-B3).
   */
  redact<T extends RedactableInput>(finding: T, level: RedactionLevel): RedactedFinding<T> {
    // [RLDX-A5] The result is the source plus the two redaction-owned keys. Typed overrides,
    // no cast: `{ ...finding, ...overrides }` is `T & RedactionOverrides`, which IS a
    // RedactedFinding<T> because `snippetHash` comes from T (required on Finding).
    // [RLDX-B3] `snippetHash` is never touched here — createFinding computed it once
    // (AUDIT-K6) and this module transports it, at every level and for every category.
    const build = (overrides: RedactionOverrides): RedactedFinding<T> => ({ ...finding, ...overrides });

    // [RLDX-B1] L2: datos completos siempre
    if (level === 'l2') {
      return build({ redactionLevel: 'l2', hasFullSnippet: true });
    }

    // [RLDX-B5] [RLDX-B6] [RLDX-B7] L1: decision por categoria
    if (!this.isSensitiveCategory(finding.category)) {
      return build({ redactionLevel: 'l1', hasFullSnippet: true });
    }

    // [RLDX-B2] [RLDX-B4] L1 + categoria sensible: redactar
    const redacted = build({
      snippet: REDACTED_SNIPPET,
      message: `Sensitive finding (${finding.category})`,
      redactionLevel: 'l1',
      hasFullSnippet: false,
    });
    // [RLDX-B4] `fixes` is OMITTED, not set to undefined: `Finding.fixes?: Fix[]` admits no
    // explicit undefined under exactOptionalPropertyTypes, and deleting an absent key is a
    // no-op, so a finding that never had `fixes` does not gain the key either.
    delete redacted.fixes;
    return redacted;
  }

  /**
   * Redacts all snippets in a SarifLog according to the redaction level.
   * [RLDX-B11] Returns a deep copy — original SarifLog is not mutated.
   * Used by the orchestrator to redact SARIF before storing in ExecutionRecord (L1).
   *
   * Two independent rules, in this order, for each result with a non-empty region.snippet.text:
   * 1. Hash, unconditional (any level): result.properties['gitgov/snippetHash'] is ensured —
   *    a value the producer transported (SarifBuilder writes finding.snippetHash there) is
   *    kept byte for byte; only when absent is sha256(original text) computed (RLDX-B9, B10).
   * 2. Redaction, conditional: only at L1 AND for a sensitive category (RLDX-B6 via
   *    isSensitiveCategory), region.snippet.text becomes '[REDACTED]' (RLDX-B8).
   * At L2 the snippet is left intact and the hash is ensured all the same.
   */
  redactSarif(sarif: SarifLog, level: RedactionLevel): SarifLog {
    const copy: SarifLog = JSON.parse(JSON.stringify(sarif));

    for (const run of copy.runs ?? []) {
      for (const result of run.results ?? []) {
        for (const location of result.locations ?? []) {
          const snippet = location.physicalLocation?.region?.snippet;
          if (snippet?.text) {
            if (!result.properties) {
              // Declared in redaction_module.md §3.5: an empty bag asserted as the SARIF
              // property type, whose three required fields a third-party SARIF may not carry.
              // The requiredness question belongs to the SARIF spec.
              result.properties = {} as SarifResultProperties;
            }
            // [RLDX-B9] [RLDX-B10] Transport first; compute only for SARIF that arrived
            // without the hash (third-party producers). Overwriting a transported hash was a
            // second computation of a value computed once by createFinding — AUDIT-K5's class.
            result.properties['gitgov/snippetHash'] ??= sha256(snippet.text);

            // [RLDX-B8] L1 only: redact sensitive snippets
            if (level === 'l1') {
              const category = result.properties['gitgov/category'] as string | undefined;
              if (category && this.isSensitiveCategory(category)) {
                snippet.text = REDACTED_SNIPPET;
              }
            }
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
  // [RLDX-C1] [RLDX-C2] [RLDX-C3] [RLDX-C4] Public since 2026-09-13: external verifiers (the
  // E2E in packages/e2e) call this instead of re-deriving the three-step rule with step 1 only.
  isSensitiveCategory(category: FindingCategory): boolean {
    if (this.sensitiveSet.has(category)) return true;
    if (this.safeSet.has(category)) return false;
    return this.config.defaultBehavior === 'redact';
  }
}

export { FindingRedactor };
