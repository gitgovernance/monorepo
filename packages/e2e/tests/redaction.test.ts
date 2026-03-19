/**
 * Block I: Redaction Pipeline (CI1 to CI4)
 *
 * Integration tests for the L1/L2 redaction pipeline.
 * Uses real detection modules to produce SARIF, then applies FindingRedactor
 * to verify that L1 output is properly redacted while L2 retains full data.
 *
 * Real modules: FindingDetectorModule, SourceAuditorModule, SarifBuilder, FindingRedactor
 * No mocks needed — all components are wired with real implementations.
 *
 * IMPORTANT: All imports use @gitgov/core public API.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// === @gitgov/core public API ===
import {
  SourceAuditor,
  FindingDetector,
  Sarif,
  Redaction,
} from '@gitgov/core';
import { FsFileLister } from '@gitgov/core/fs';

// ============================================================================
// Helpers
// ============================================================================

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

type SarifLog = Sarif.SarifLog;
type SarifResult = SarifLog['runs'][0]['results'][0];

// ============================================================================
// Fixtures — files with known PII (sensitive) and clean code (non-sensitive)
// ============================================================================

const FIXTURE_SENSITIVE_TS = `// src/auth/config.ts — credentials handler
const adminEmail = "admin@company.com";
const dbPassword = "supersecret123";
const api_key = "sk-1234567890abcdefghijklmnopqrstuvwxyz";

export function getCredentials() {
  return { email: adminEmail, password: dbPassword, key: api_key };
}
`;

const FIXTURE_CLEAN_TS = `// src/utils/math.ts — pure math utilities
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

function createFixtureDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-redaction-'));

  const authDir = path.join(tempDir, 'src', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'config.ts'), FIXTURE_SENSITIVE_TS);

  const utilsDir = path.join(tempDir, 'src', 'utils');
  fs.mkdirSync(utilsDir, { recursive: true });
  fs.writeFileSync(path.join(utilsDir, 'math.ts'), FIXTURE_CLEAN_TS);

  return tempDir;
}

// ============================================================================
// Scan helper — produces real SARIF via the detection pipeline
// ============================================================================

async function runScan(fixtureDir: string): Promise<SarifLog> {
  const findingDetector = new FindingDetector.FindingDetectorModule({
    regex: { enabled: true },
  });

  const noOpWaiverReader: SourceAuditor.IWaiverReader = {
    loadActiveWaivers: async () => [],
    hasActiveWaiver: async () => false,
  };

  const fileLister = new FsFileLister({ cwd: fixtureDir });

  const sourceAuditor = new SourceAuditor.SourceAuditorModule({
    findingDetector,
    waiverReader: noOpWaiverReader,
    fileLister,
  });

  const auditResult = await sourceAuditor.audit({
    baseDir: fixtureDir,
    scope: {
      include: ['**/*'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  });

  const getLineContent = async (file: string, line: number): Promise<string | null> => {
    const fullPath = path.isAbsolute(file) ? file : path.join(fixtureDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      if (line < 1 || line > lines.length) return null;
      return lines[line - 1] ?? null;
    } catch {
      return null;
    }
  };

  const sarifBuilder = Sarif.createSarifBuilder();
  return sarifBuilder.build({
    toolName: 'gitgov-security-audit',
    toolVersion: '1.0.0',
    informationUri: 'https://gitgovernance.com/agents/security-audit',
    findings: auditResult.findings,
    taskId: 'task-redaction-e2e',
    agentId: 'agent:gitgov:security-audit',
    scanScope: 'full',
    scannedFiles: auditResult.scannedFiles,
    scannedLines: auditResult.scannedLines,
    getLineContent,
  });
}

/**
 * Runs scan with redactionLevel option set — SarifBuilder will include
 * gitgov/redactionLevel in run.properties.
 */
async function runScanWithRedactionLevel(
  fixtureDir: string,
  redactionLevel: 'l1' | 'l2',
): Promise<SarifLog> {
  const findingDetector = new FindingDetector.FindingDetectorModule({
    regex: { enabled: true },
  });

  const noOpWaiverReader: SourceAuditor.IWaiverReader = {
    loadActiveWaivers: async () => [],
    hasActiveWaiver: async () => false,
  };

  const fileLister = new FsFileLister({ cwd: fixtureDir });

  const sourceAuditor = new SourceAuditor.SourceAuditorModule({
    findingDetector,
    waiverReader: noOpWaiverReader,
    fileLister,
  });

  const auditResult = await sourceAuditor.audit({
    baseDir: fixtureDir,
    scope: {
      include: ['**/*'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  });

  const getLineContent = async (file: string, line: number): Promise<string | null> => {
    const fullPath = path.isAbsolute(file) ? file : path.join(fixtureDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      if (line < 1 || line > lines.length) return null;
      return lines[line - 1] ?? null;
    } catch {
      return null;
    }
  };

  const sarifBuilder = Sarif.createSarifBuilder();
  return sarifBuilder.build({
    toolName: 'gitgov-security-audit',
    toolVersion: '1.0.0',
    informationUri: 'https://gitgovernance.com/agents/security-audit',
    findings: auditResult.findings,
    taskId: 'task-redaction-e2e',
    agentId: 'agent:gitgov:security-audit',
    scanScope: 'full',
    scannedFiles: auditResult.scannedFiles,
    scannedLines: auditResult.scannedLines,
    getLineContent,
    redactionLevel,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Block I: Redaction Pipeline (CI1 to CI4)', () => {
  let fixtureDir: string;
  let originalSarif: SarifLog;
  let l1Sarif: SarifLog;
  let l2Sarif: SarifLog;

  const redactor = new Redaction.FindingRedactor(Redaction.DEFAULT_REDACTION_CONFIG);

  beforeAll(async () => {
    fixtureDir = createFixtureDir();

    // Run real detection scan to produce SARIF with findings
    originalSarif = await runScan(fixtureDir);

    // Sanity: must have at least 1 finding
    const resultCount = originalSarif.runs[0]?.results?.length ?? 0;
    expect(resultCount).toBeGreaterThan(0);

    // Apply redaction at both levels
    l1Sarif = redactor.redactSarif(originalSarif, 'l1');
    l2Sarif = redactor.redactSarif(originalSarif, 'l2');
  });

  afterAll(() => {
    if (fixtureDir) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  // ==========================================
  // CI1: L1 redacts sensitive snippets
  // ==========================================

  it('[CI1] should redact sensitive snippets in L1 SARIF output', () => {
    const l1Results = l1Sarif.runs[0]?.results ?? [];
    expect(l1Results.length).toBeGreaterThan(0);

    // Find results with sensitive categories
    const sensitiveResults = l1Results.filter(r => {
      const cat = r.properties?.['gitgov/category'] as string | undefined;
      return cat && Redaction.DEFAULT_REDACTION_CONFIG.sensitiveCategories.includes(cat);
    });

    expect(sensitiveResults.length).toBeGreaterThan(0);

    // Every sensitive result must have its snippet replaced with '[REDACTED]'
    for (const result of sensitiveResults) {
      for (const location of result.locations ?? []) {
        const snippetText = location.physicalLocation?.region?.snippet?.text;
        if (snippetText !== undefined) {
          expect(snippetText).toBe('[REDACTED]');
        }
      }

      // Must have snippetHash stored in properties
      const snippetHash = result.properties?.['gitgov/snippetHash'] as string | undefined;
      expect(snippetHash).toBeDefined();
      expect(typeof snippetHash).toBe('string');
      expect(snippetHash!.length).toBe(64); // SHA256 hex = 64 chars
    }

    // Verify no sensitive content leaks into L1
    const l1Json = JSON.stringify(l1Sarif);
    expect(l1Json).not.toContain('admin@company.com');
    expect(l1Json).not.toContain('supersecret123');
    expect(l1Json).not.toContain('sk-1234567890');
  });

  // ==========================================
  // CI2: L2 includes full content
  // ==========================================

  it('[CI2] should include full unredacted snippets in L2 SARIF output', () => {
    const l2Results = l2Sarif.runs[0]?.results ?? [];
    expect(l2Results.length).toBeGreaterThan(0);

    // L2 must NOT have any '[REDACTED]' snippets
    for (const result of l2Results) {
      for (const location of result.locations ?? []) {
        const snippetText = location.physicalLocation?.region?.snippet?.text;
        if (snippetText !== undefined) {
          expect(snippetText).not.toBe('[REDACTED]');
        }
      }

      // L2 must NOT have snippetHash (not redacted)
      const snippetHash = result.properties?.['gitgov/snippetHash'] as string | undefined;
      expect(snippetHash).toBeUndefined();
    }

    // L2 should be identical to the original SARIF (deep copy)
    expect(l2Results.length).toBe(originalSarif.runs[0]?.results?.length);
    for (let i = 0; i < l2Results.length; i++) {
      const original = originalSarif.runs[0]!.results[i]!;
      const l2 = l2Results[i]!;
      expect(l2.ruleId).toBe(original.ruleId);
      expect(l2.message.text).toBe(original.message.text);

      const origSnippet = original.locations?.[0]?.physicalLocation?.region?.snippet?.text;
      const l2Snippet = l2.locations?.[0]?.physicalLocation?.region?.snippet?.text;
      expect(l2Snippet).toBe(origSnippet);
    }
  });

  // ==========================================
  // CI3: fingerprint unchanged after redaction
  // ==========================================

  it('[CI3] should preserve partialFingerprints unchanged in both L1 and L2', () => {
    const originalResults = originalSarif.runs[0]?.results ?? [];
    const l1Results = l1Sarif.runs[0]?.results ?? [];
    const l2Results = l2Sarif.runs[0]?.results ?? [];

    expect(l1Results.length).toBe(originalResults.length);
    expect(l2Results.length).toBe(originalResults.length);

    for (let i = 0; i < originalResults.length; i++) {
      const origFingerprint = originalResults[i]!.partialFingerprints?.['primaryLocationLineHash/v1'];
      const l1Fingerprint = l1Results[i]!.partialFingerprints?.['primaryLocationLineHash/v1'];
      const l2Fingerprint = l2Results[i]!.partialFingerprints?.['primaryLocationLineHash/v1'];

      // Fingerprints must be preserved exactly — redaction never changes them
      expect(l1Fingerprint).toBe(origFingerprint);
      expect(l2Fingerprint).toBe(origFingerprint);
    }

    // Also verify L1-L2 integrity: sha256(l2_snippet) === l1_snippetHash
    for (let i = 0; i < originalResults.length; i++) {
      const l1Hash = l1Results[i]!.properties?.['gitgov/snippetHash'] as string | undefined;
      if (l1Hash) {
        // This result was redacted — verify integrity
        const l2Snippet = l2Results[i]!.locations?.[0]?.physicalLocation?.region?.snippet?.text;
        expect(l2Snippet).toBeDefined();
        expect(sha256(l2Snippet!)).toBe(l1Hash);
      }
    }
  });

  // ==========================================
  // CI4: redactionLevel preserved in run.properties
  // ==========================================

  it('[CI4] should preserve redactionLevel in SARIF run.properties when built with redactionLevel option', async () => {
    // Build SARIF with redactionLevel: 'l1' — SarifBuilder sets run.properties['gitgov/redactionLevel']
    const sarifWithLevel = await runScanWithRedactionLevel(fixtureDir, 'l1');

    // Verify run.properties contains the redaction level
    const runProps = sarifWithLevel.runs[0]?.properties as Record<string, unknown> | undefined;
    expect(runProps).toBeDefined();
    expect(runProps!['gitgov/redactionLevel']).toBe('l1');

    // Apply redactSarif — must preserve run.properties
    const redactedSarif = redactor.redactSarif(sarifWithLevel, 'l1');
    const redactedRunProps = redactedSarif.runs[0]?.properties as Record<string, unknown> | undefined;
    expect(redactedRunProps).toBeDefined();
    expect(redactedRunProps!['gitgov/redactionLevel']).toBe('l1');

    // Also verify for L2
    const sarifWithL2 = await runScanWithRedactionLevel(fixtureDir, 'l2');
    const l2RunProps = sarifWithL2.runs[0]?.properties as Record<string, unknown> | undefined;
    expect(l2RunProps).toBeDefined();
    expect(l2RunProps!['gitgov/redactionLevel']).toBe('l2');
  });
});
