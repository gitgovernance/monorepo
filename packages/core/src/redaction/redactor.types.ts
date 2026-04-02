import type { Finding } from '../audit/types';

/**
 * Nivel de detalle para persistencia de findings.
 * L1 = Git (gitgov-state branch, semipublico en la org).
 * L2 = SaaS DB (PostgreSQL, protegido por auth).
 */
type RedactionLevel = 'l1' | 'l2';

/**
 * Configuracion de politica de redaccion por categoria.
 * Extensible sin modificar logica: agregar categoria a la lista correcta.
 */
type RedactionConfig = {
  /**
   * Categorias donde el snippet SE REDACTA en L1.
   * PII directo, secrets, credenciales, PCI, storage/crypto.
   */
  sensitiveCategories: string[];
  /**
   * Categorias donde el snippet es SAFE en L1.
   * El snippet en si no es el dato sensible (ej: llamada a logger, nombre de cookie).
   */
  safeCategories: string[];
  /**
   * Comportamiento para categorias no registradas.
   * 'redact' = safe-by-default (principio de precaucion).
   * 'keep' = solo para tests o overrides explicitos.
   */
  defaultBehavior: 'redact' | 'keep';
};

/**
 * Union of types that FindingRedactor can accept.
 * Finding comes from detectors; Finding from AuditOrchestrator.
 */
type RedactableInput = Finding | Finding;

/**
 * Finding con metadatos de redaccion aplicados.
 * Generic over input type so it works with both Finding and Finding.
 * Extiende T — no lo modifica. El original siempre se conserva.
 * Un RedactedFinding es una "vista" del Finding para un destino especifico.
 */
type RedactedFinding<T extends RedactableInput = Finding> = T & {
  /**
   * Nivel de redaccion que se aplico a este finding.
   * Permite a consumidores saber si el snippet esta completo o redactado.
   */
  redactionLevel: RedactionLevel;
  /**
   * SHA256 hex del snippet original antes de redaccion.
   * Presente solo cuando el snippet fue redactado (hasFullSnippet === false).
   * Permite verificar: sha256(snippet_l2) === snippetHash_l1.
   */
  snippetHash?: string;
  /**
   * True si el snippet completo esta disponible en este nivel.
   * False cuando snippet === '[REDACTED]'.
   */
  hasFullSnippet: boolean;
};

export type { RedactionLevel, RedactionConfig, RedactableInput, RedactedFinding };
