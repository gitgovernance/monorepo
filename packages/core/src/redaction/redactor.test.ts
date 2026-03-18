/**
 * redactor.test.ts — FindingRedactor tests
 *
 * Trazabilidad EARS:
 * | EARS ID  | Test Case                                                                                      |
 * |----------|-----------------------------------------------------------------------------------------------|
 * | RLDX-A1  | should expose all three fields when RedactionConfig is instantiated                             |
 * | RLDX-A2  | should include 23 sensitive categories in DEFAULT_REDACTION_CONFIG                              |
 * | RLDX-A3  | should include 13 safe categories in DEFAULT_REDACTION_CONFIG                                  |
 * | RLDX-A4  | should have defaultBehavior equal to redact in DEFAULT_REDACTION_CONFIG                         |
 * | RLDX-A5  | should carry all finding fields plus redactionLevel hasFullSnippet and snippetHash              |
 * | RLDX-B1  | should return all original fields with redactionLevel l2 when level is l2                      |
 * | RLDX-B2  | should replace snippet with [REDACTED] and set hasFullSnippet false for sensitive category at l1|
 * | RLDX-B3  | should set snippetHash to sha256 of original snippet for sensitive finding with non-empty snippet|
 * | RLDX-B4  | should genericize message and set suggestion to undefined for sensitive category                |
 * | RLDX-B5  | should return all original fields with hasFullSnippet true for safe category at l1              |
 * | RLDX-B6  | should apply full redaction for unregistered category when defaultBehavior is redact            |
 * | RLDX-B7  | should return original fields intact for unregistered category when defaultBehavior is keep     |
 * | RLDX-B8  | should redact snippet.text in SARIF for sensitive categories at l1                              |
 * | RLDX-B9  | should store snippetHash in SARIF properties for redacted results                               |
 * | RLDX-B10 | should return unchanged deep copy for l2                                                       |
 * | RLDX-B11 | should not mutate the original SarifLog                                                        |
 */

import { FindingRedactor } from './redactor';
import { DEFAULT_REDACTION_CONFIG } from './category_config';
import { sha256 } from '../crypto';
import type { Finding } from '../finding_detector/types';
import type { ConsolidatedFinding } from '../audit_orchestrator/audit_orchestrator.types';
import type { RedactionConfig } from './redactor.types';
import type { SarifLog } from '../sarif/sarif.types';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const sensitiveFinding: Finding = {
  id: 'f-001',
  file: 'src/auth/config.ts',
  line: 12,
  ruleId: 'SEC-001',
  category: 'hardcoded-secret',
  severity: 'critical',
  snippet: "const apiKey = 'sk-1234567890abcdef'",
  message: 'Hardcoded API key detected at line 12',
  suggestion: 'Move to environment variable API_KEY',
  fingerprint: 'abc123fingerprint',
  detector: 'regex',
  confidence: 0.95,
};

const safeFinding: Finding = {
  id: 'f-002',
  file: 'src/analytics/tracker.ts',
  line: 5,
  ruleId: 'TRK-001',
  category: 'tracking-cookie',
  severity: 'low',
  snippet: "document.cookie = '_ga=' + gaId",
  message: 'Analytics tracking cookie set',
  suggestion: 'Ensure cookie consent is obtained',
  fingerprint: 'def456fingerprint',
  detector: 'regex',
  confidence: 0.8,
};

const consolidatedFinding: ConsolidatedFinding = {
  fingerprint: 'cons-001',
  ruleId: 'PII-001',
  message: 'PII email detected in user service',
  severity: 'high',
  category: 'pii-email',
  file: 'src/user/service.ts',
  line: 42,
  reportedBy: ['agent-a', 'agent-b'],
  snippet: "const email = user.email; // john@example.com",
  isWaived: false,
};

function buildSarifLog(category: string, snippetText: string): SarifLog {
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'gitgov-audit',
            version: '2.15.0',
            informationUri: 'https://gitgovernance.com',
          },
        },
        results: [
          {
            ruleId: 'SEC-001',
            level: 'error',
            message: { text: 'Sensitive data found' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/auth/config.ts' },
                  region: {
                    startLine: 12,
                    snippet: { text: snippetText },
                  },
                },
              },
            ],
            properties: {
              'gitgov/category': category as 'hardcoded-secret',
              'gitgov/detector': 'regex',
              'gitgov/confidence': 0.95,
            },
          },
        ],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FindingRedactor', () => {
  const redactor = new FindingRedactor(DEFAULT_REDACTION_CONFIG);

  // ────────────────────────────────────────────────────────────────────────
  // 4.1. Types y Configuracion (RLDX-A1 a A5)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.1. Types y Configuracion (RLDX-A1 a A5)', () => {
    it('[RLDX-A1] should expose all three fields when RedactionConfig is instantiated', () => {
      const config: RedactionConfig = {
        sensitiveCategories: ['pii-email'],
        safeCategories: ['logging-pii'],
        defaultBehavior: 'redact',
      };

      expect(config.sensitiveCategories).toEqual(['pii-email']);
      expect(config.safeCategories).toEqual(['logging-pii']);
      expect(config.defaultBehavior).toBe('redact');
    });

    it('[RLDX-A2] should include 23 sensitive categories in DEFAULT_REDACTION_CONFIG', () => {
      expect(DEFAULT_REDACTION_CONFIG.sensitiveCategories).toHaveLength(23);
    });

    it('[RLDX-A3] should include 13 safe categories in DEFAULT_REDACTION_CONFIG', () => {
      expect(DEFAULT_REDACTION_CONFIG.safeCategories).toHaveLength(13);
    });

    it('[RLDX-A4] should have defaultBehavior equal to redact in DEFAULT_REDACTION_CONFIG', () => {
      expect(DEFAULT_REDACTION_CONFIG.defaultBehavior).toBe('redact');
    });

    it('[RLDX-A5] should carry all finding fields plus redactionLevel hasFullSnippet and snippetHash', () => {
      // Test with Finding (has snippet, suggestion)
      const redactedFinding = redactor.redact(sensitiveFinding, 'l1');
      expect(redactedFinding.file).toBe(sensitiveFinding.file);
      expect(redactedFinding.line).toBe(sensitiveFinding.line);
      expect(redactedFinding.ruleId).toBe(sensitiveFinding.ruleId);
      expect(redactedFinding.category).toBe(sensitiveFinding.category);
      expect(redactedFinding.severity).toBe(sensitiveFinding.severity);
      expect(redactedFinding.fingerprint).toBe(sensitiveFinding.fingerprint);
      expect(redactedFinding.redactionLevel).toBeDefined();
      expect(redactedFinding.hasFullSnippet).toBeDefined();
      expect(redactedFinding.snippetHash).toBeDefined();

      // Test with ConsolidatedFinding (has snippet, no suggestion)
      const redactedConsolidated = redactor.redact(consolidatedFinding, 'l1');
      expect(redactedConsolidated.fingerprint).toBe(consolidatedFinding.fingerprint);
      expect(redactedConsolidated.reportedBy).toEqual(consolidatedFinding.reportedBy);
      expect(redactedConsolidated.redactionLevel).toBeDefined();
      expect(redactedConsolidated.hasFullSnippet).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4.2. FindingRedactor Logic (RLDX-B1 a B11)
  // ────────────────────────────────────────────────────────────────────────

  describe('4.2. FindingRedactor Logic (RLDX-B1 a B11)', () => {
    it('[RLDX-B1] should return all original fields with redactionLevel l2 when level is l2', () => {
      const result = redactor.redact(sensitiveFinding, 'l2');

      expect(result.snippet).toBe(sensitiveFinding.snippet);
      expect(result.message).toBe(sensitiveFinding.message);
      expect(result.suggestion).toBe(sensitiveFinding.suggestion);
      expect(result.redactionLevel).toBe('l2');
      expect(result.hasFullSnippet).toBe(true);
    });

    it('[RLDX-B2] should replace snippet with [REDACTED] and set hasFullSnippet false for sensitive category at l1', () => {
      const result = redactor.redact(sensitiveFinding, 'l1');

      expect(result.snippet).toBe('[REDACTED]');
      expect(result.hasFullSnippet).toBe(false);
      expect(result.redactionLevel).toBe('l1');
    });

    it('[RLDX-B3] should set snippetHash to sha256 of original snippet for sensitive finding with non-empty snippet', () => {
      const result = redactor.redact(sensitiveFinding, 'l1');

      expect(result.snippetHash).toBeDefined();
      expect(typeof result.snippetHash).toBe('string');
      expect(result.snippetHash).toHaveLength(64); // SHA256 hex = 64 chars
      expect(result.snippetHash).toBe(sha256(sensitiveFinding.snippet));
    });

    it('[RLDX-B4] should genericize message and set suggestion to undefined for sensitive category', () => {
      const result = redactor.redact(sensitiveFinding, 'l1');

      expect(result.message).toContain('hardcoded-secret');
      expect(result.message).not.toBe(sensitiveFinding.message);
      expect(result.suggestion).toBeUndefined();
    });

    it('[RLDX-B5] should return all original fields with hasFullSnippet true for safe category at l1', () => {
      const result = redactor.redact(safeFinding, 'l1');

      expect(result.snippet).toBe(safeFinding.snippet);
      expect(result.message).toBe(safeFinding.message);
      expect(result.suggestion).toBe(safeFinding.suggestion);
      expect(result.hasFullSnippet).toBe(true);
      expect(result.redactionLevel).toBe('l1');
    });

    it('[RLDX-B6] should apply full redaction for unregistered category when defaultBehavior is redact', () => {
      const unregisteredFinding: Finding = {
        ...sensitiveFinding,
        category: 'custom-unknown-category' as Finding['category'],
      };

      const result = redactor.redact(unregisteredFinding, 'l1');

      expect(result.snippet).toBe('[REDACTED]');
      expect(result.hasFullSnippet).toBe(false);
    });

    it('[RLDX-B7] should return original fields intact for unregistered category when defaultBehavior is keep', () => {
      const keepConfig: RedactionConfig = { ...DEFAULT_REDACTION_CONFIG, defaultBehavior: 'keep' };
      const keepRedactor = new FindingRedactor(keepConfig);
      const unregisteredFinding: Finding = {
        ...safeFinding,
        category: 'new-unknown-category' as Finding['category'],
      };

      const result = keepRedactor.redact(unregisteredFinding, 'l1');

      expect(result.snippet).toBe(unregisteredFinding.snippet);
      expect(result.hasFullSnippet).toBe(true);
    });

    it('[RLDX-B8] should redact snippet.text in SARIF for sensitive categories at l1', () => {
      const sarif = buildSarifLog('hardcoded-secret', "const secret = 'my-secret-key'");
      const result = redactor.redactSarif(sarif, 'l1');

      const sarifResult = result.runs[0]!.results[0]!;
      const snippetText = sarifResult.locations[0]!.physicalLocation.region.snippet?.text;
      expect(snippetText).toBe('[REDACTED]');
    });

    it('[RLDX-B9] should store snippetHash in SARIF properties for redacted results', () => {
      const originalSnippet = "const secret = 'my-secret-key'";
      const sarif = buildSarifLog('hardcoded-secret', originalSnippet);
      const result = redactor.redactSarif(sarif, 'l1');

      const props = result.runs[0]!.results[0]!.properties;
      expect(props?.['gitgov/snippetHash']).toBe(sha256(originalSnippet));
    });

    it('[RLDX-B10] should return unchanged deep copy for l2', () => {
      const originalSnippet = "const secret = 'my-secret-key'";
      const sarif = buildSarifLog('hardcoded-secret', originalSnippet);
      const result = redactor.redactSarif(sarif, 'l2');

      const sarifResult = result.runs[0]!.results[0]!;
      const snippetText = sarifResult.locations[0]!.physicalLocation.region.snippet?.text;
      expect(snippetText).toBe(originalSnippet);
      expect(sarifResult.properties?.['gitgov/snippetHash']).toBeUndefined();
    });

    it('[RLDX-B11] should not mutate the original SarifLog', () => {
      const originalSnippet = "const secret = 'my-secret-key'";
      const sarif = buildSarifLog('hardcoded-secret', originalSnippet);

      // Capture original state
      const originalSnippetBefore = sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.region.snippet?.text;

      // Redact — should NOT mutate sarif
      redactor.redactSarif(sarif, 'l1');

      // Verify original is unchanged
      const originalSnippetAfter = sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.region.snippet?.text;
      expect(originalSnippetAfter).toBe(originalSnippetBefore);
      expect(originalSnippetAfter).toBe(originalSnippet);
    });
  });
});
