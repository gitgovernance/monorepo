import type { RedactionConfig } from './redactor.types';

/**
 * Configuracion de redaccion por defecto del protocolo GitGovernance.
 * 36 categories organized by group.
 *
 * Categorias sensibles (snippet redactado en L1):
 * - Original 6: pii-email, pii-phone, pii-financial, pii-health, pii-generic, hardcoded-secret
 * - PCI (Group A): pci-pan, pci-cvv, pci-track, pci-logging, pci-token-misuse, pci-last4
 * - PII extended (Group B): pii-dob, pii-address, pii-national-id, pii-passport, pii-bank-account, pii-biometric
 * - Storage/Crypto (Group E): storage-pii, storage-pci, crypto-weak, crypto-key, crypto-tls
 *
 * Categorias no sensibles (snippet visible en L1):
 * - Original 6: logging-pii, tracking-cookie, tracking-analytics-id, unencrypted-storage, third-party-transfer, unknown-risk
 * - Logging extended (Group C): logging-auth, logging-error, logging-debug, logging-trace
 * - Transfer/Consent (Group D): data-transfer, privacy-consent, privacy-retention
 *
 * Categorias no registradas: tratadas como sensibles (safe-by-default).
 */
const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  sensitiveCategories: [
    // Original 6
    'pii-email',
    'pii-phone',
    'pii-financial',
    'pii-health',
    'pii-generic',
    'hardcoded-secret',
    // PCI (Group A)
    'pci-pan',
    'pci-cvv',
    'pci-track',
    'pci-logging',
    'pci-token-misuse',
    'pci-last4',
    // PII extended (Group B)
    'pii-dob',
    'pii-address',
    'pii-national-id',
    'pii-passport',
    'pii-bank-account',
    'pii-biometric',
    // Storage/Crypto (Group E)
    'storage-pii',
    'storage-pci',
    'crypto-weak',
    'crypto-key',
    'crypto-tls',
  ],
  safeCategories: [
    // Original 6
    'logging-pii',
    'tracking-cookie',
    'tracking-analytics-id',
    'unencrypted-storage',
    'third-party-transfer',
    'unknown-risk',
    // Logging extended (Group C) — snippet is the logger call, not the PII
    'logging-auth',
    'logging-error',
    'logging-debug',
    'logging-trace',
    // Transfer/Consent (Group D) — snippet is the API call/pattern, not user data
    'data-transfer',
    'privacy-consent',
    'privacy-retention',
  ],
  defaultBehavior: 'redact',
};

/**
 * Crea una nueva configuracion de redaccion combinando base y override.
 * No muta el objeto base.
 *
 * Uso para agregar nuevas categorias sensibles en un agente especifico:
 *   const config = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {
 *     sensitiveCategories: ['pii-biometric', 'pii-genetic'],
 *   });
 */
function mergeRedactionConfig(
  base: RedactionConfig,
  override: Partial<RedactionConfig>,
): RedactionConfig {
  return {
    sensitiveCategories: [
      ...base.sensitiveCategories,
      ...(override.sensitiveCategories ?? []),
    ],
    safeCategories: [
      ...base.safeCategories,
      ...(override.safeCategories ?? []),
    ],
    defaultBehavior: override.defaultBehavior ?? base.defaultBehavior,
  };
}

export { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig };
