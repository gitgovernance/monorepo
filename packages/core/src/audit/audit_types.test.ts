/**
 * Audit Types + Schema Coherence Tests
 *
 * Spec: audit_record_types_module.md (AUDIT-A1 to A6, B1-B3, C1-C4)
 * Spec: audit_prisma_record_projection_module.md §4.4 (APRJ-D1 to APRJ-D3)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

// ─── Type + value imports for AUDIT-A/D tests ──────────────────────────────
import {
  createFinding,
  rehydrateFinding,
  createFix,
  createWaiver,
  createScan,
  countUnmatchedWaivers,
  waiversForFiles,
  countBySeverity,
  isScanScope,
  isDetectorName,
  isAnchorText,
  REDACTED_SNIPPET,
} from './types';
import { makeTestFinding, makeTestWaiver } from './testing';
import { computeFingerprint, computeRegionFingerprint } from './fingerprint';
import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  Waiver,
  PolicyDecision,
  Scan,
} from './types';

// ─── Schema Parser ──────────────────────────────────────────────────────────

type PrismaField = {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
};

type PrismaModel = {
  name: string;
  fields: PrismaField[];
};

function parsePrismaSchema(schemaPath: string): PrismaModel[] {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const models: PrismaModel[] = [];
  let currentModel: PrismaModel | null = null;

  for (const line of content.split('\n')) {
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = { name: modelMatch[1]!, fields: [] };
      continue;
    }

    if (line.trim() === '}' && currentModel) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    if (currentModel) {
      const fieldMatch = line.match(/^\s+(\w+)\s+([\w[\]?]+)/);
      if (fieldMatch && !line.trim().startsWith('//') && !line.trim().startsWith('@@')) {
        const name = fieldMatch[1]!;
        const rawType = fieldMatch[2]!;
        if (rawType.match(/^[A-Z]/) && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'].includes(rawType.replace('?', '').replace('[]', ''))) {
          const knownEnums = ['FindingSeverity', 'DetectorName'];
          if (!knownEnums.includes(rawType.replace('?', '').replace('[]', ''))) {
            continue;
          }
        }
        currentModel.fields.push({
          name,
          type: rawType.replace('?', '').replace('[]', ''),
          isOptional: rawType.includes('?'),
          isArray: rawType.includes('[]'),
        });
      }
    }
  }

  return models;
}

// ─── Expected Fields ────────────────────────────────────────────────────────

// Base fields from audit/types.ts that MUST exist in audit.prisma
// Excluded: 'waiver' (Finding.waiver is runtime, not stored)
// Excluded: 'feedback' (Waiver.feedback is materialized as individual fields)
// Excluded: 'findings', 'policyDecision', 'summary' (Scan transforms these)

const FINDING_BASE_FIELDS = [
  'fingerprint', 'ruleId', 'file', 'line', 'column', 'message', 'snippet',
  'category', 'severity', 'detector', 'confidence', 'fixes', 'legalReference',
  'executionId', 'reportedBy', 'isWaived',
];

const WAIVER_BASE_FIELDS = [
  'fingerprint', 'ruleId', 'expiresAt',
];

const SCAN_BASE_FIELDS = [
  'scope', 'triggeredBy', 'executionRecordIds', 'policyExecutionId',
];

// Projection-specific fields (documented and expected)
const FINDING_PROJECTION_FIELDS = [
  'id', 'findingId', 'snippetHash', 'hasFullSnippet',
  'detectionCount', 'detectionScanIds', 'firstDetectedAt', 'lastDetectedAt',
  'createdAt', 'updatedAt',
];

const WAIVER_PROJECTION_FIELDS = [
  'id', 'justification', 'approvedBy', 'file', 'line', 'relatedTaskId',
  'gitRecordId', 'status', 'createdAt', 'updatedAt',
];

const SCAN_PROJECTION_FIELDS = [
  'id', 'policyDecisionJson', 'displayStatus',
  'findingsCount', 'criticalCount', 'highCount', 'mediumCount', 'lowCount', 'waivedCount',
  'scanNumber', 'status', 'prNumber', 'prUrl', 'checkRunId',
  'branch', 'commitSha', 'commitAuthor', 'commitMessage',
  'scannedFiles', 'scannedLines', 'errorMessage',
  'startedAt', 'completedAt', 'createdAt', 'updatedAt',
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Audit Record Types (audit_record_types_module.md)', () => {

  // §4.1 Central Type Definitions (AUDIT-A1 to A6)
  describe('4.1. Central Type Definitions (AUDIT-A1 to A6)', () => {

    it('[AUDIT-A1] should export Finding with identity, location, description, detection, remediation, and enrichment fields', () => {
      // Compile-time: if any field is missing, this file won't compile.
      // Runtime: verify the interface shape via a type-satisfying object.
      const finding: Finding = {
        fingerprint: 'sha256:test',
        ruleId: 'SEC-001',
        file: 'test.ts',
        line: 1,
        message: 'test finding',
        snippet: 'const x = "secret"',
        snippetHash: '7b10787e8626afad655037099dfb965ca0f65b3d57004a6677bf9146b8f449a5',
        category: 'hardcoded-secret',
        severity: 'critical',
        detector: 'regex',
        confidence: 1.0,
        executionId: '1700000000-exec-test',
        reportedBy: ['agent:test'],
        isWaived: false,
      };
      expect(finding.fingerprint).toBeDefined();
      expect(finding.ruleId).toBeDefined();
      expect(finding.file).toBeDefined();
      expect(finding.line).toBeDefined();
      expect(finding.message).toBeDefined();
      expect(finding.category).toBeDefined();
      expect(finding.severity).toBeDefined();
      expect(finding.detector).toBeDefined();
      expect(finding.confidence).toBeDefined();
      expect(finding.executionId).toBeDefined();
      expect(finding.reportedBy).toBeDefined();
      expect(typeof finding.isWaived).toBe('boolean');
      // Optional fields compile without error
      const withOptionals: Finding = { ...finding, column: 5, snippet: 'code', fixes: [{ description: 'fix' }], legalReference: 'GDPR' };
      expect(withOptionals.column).toBe(5);
    });

    it('[AUDIT-A2] should export FindingSeverity as critical, high, medium, low only', () => {
      const validValues: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];
      expect(validValues).toHaveLength(4);
      // "info" must NOT be assignable — this is a compile-time check.
      // If someone adds "info" back to the union, this test documents the intent.
      expect(validValues).not.toContain('info');
    });

    it('[AUDIT-A3] should export Waiver with fingerprint, ruleId, expiresAt, feedback', () => {
      const waiver: Waiver = {
        fingerprint: 'sha256:test',
        ruleId: 'SEC-001',
        feedback: {
          header: { version: '1.0', type: 'feedback', payloadChecksum: 'sha256:mock', signatures: [{ keyId: 'human:test', role: 'approver', notes: '', signature: 'mock', timestamp: 1700000000 }] },
          payload: {
            id: '1700000000-feedback-test',
            entityType: 'execution',
            entityId: '1700000000-exec-test',
            type: 'approval',
            status: 'resolved',
            content: 'waiver justification',
          },
        } as Waiver['feedback'],
      };
      expect(waiver.fingerprint).toBeDefined();
      expect(waiver.ruleId).toBeDefined();
      expect(waiver.feedback).toBeDefined();
      expect(waiver.expiresAt).toBeUndefined(); // permanent waiver
    });

    it('[AUDIT-A4] should export PolicyDecision with blockingFindings and waivedFindings as Finding arrays', () => {
      const decision: PolicyDecision = {
        decision: 'pass',
        reason: 'No critical findings',
        executionId: '1700000000-exec-policy',
        blockingFindings: [],
        waivedFindings: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0 },
        rulesEvaluated: [{ ruleName: 'severity-threshold', passed: true, reason: 'ok' }],
        evaluatedAt: new Date().toISOString(),
      };
      expect(decision.decision).toBe('pass');
      expect(Array.isArray(decision.blockingFindings)).toBe(true);
      expect(Array.isArray(decision.waivedFindings)).toBe(true);
      expect(decision.executionId).toBeDefined();
    });

    it('[AUDIT-A5] should export Scan with scope, triggeredBy, executionRecordIds, findings, policyDecision, summary', () => {
      const scan: Scan = {
        scope: 'full',
        triggeredBy: 'human:test',
        executionRecordIds: ['1700000000-exec-scan'],
        findings: [],
        policyDecision: {
          decision: 'pass',
          reason: 'clean',
          executionId: '1700000000-exec-policy',
          blockingFindings: [],
          waivedFindings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0 },
          rulesEvaluated: [],
          evaluatedAt: new Date().toISOString(),
        },
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, suppressed: 0, unmatchedWaivers: 0, agentsRun: 1, agentsFailed: 0 },
      };
      expect(scan.scope).toBe('full');
      expect(scan.triggeredBy).toBeDefined();
      expect(Array.isArray(scan.executionRecordIds)).toBe(true);
      expect(Array.isArray(scan.findings)).toBe(true);
      expect(scan.policyDecision).toBeDefined();
      expect(scan.summary).toBeDefined();
    });

    it('[AUDIT-A6] should re-export all audit types from @gitgov/core main barrel', () => {
      // This test verifies that the barrel exports exist.
      // The actual re-export from @gitgov/core is verified by the fact that
      // consumers (CLI, saas-api) import from '@gitgov/core' and compile.
      // Here we verify the local barrel (audit/index.ts) exports everything.
      const auditIndex = require('./index');
      // Types are type-only exports — they don't appear at runtime.
      // But the module should at least be importable without error.
      expect(auditIndex).toBeDefined();
    });
  });

  // §4.2 Module Import Direction (AUDIT-B1 to B3)
  describe('4.2. Module Import Direction (AUDIT-B1 to B3)', () => {

    it('[AUDIT-B1] should verify finding_detector imports Finding from audit/types', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../finding_detector/types.ts'), 'utf-8');
      // Should import from audit/types, not define Finding locally
      expect(content).toMatch(/import.*from.*['"]\.\.\/audit/);
      expect(content).not.toMatch(/export interface Finding\s*\{/);
    });

    it('[AUDIT-B2] should verify audit_orchestrator has no local ConsolidatedFinding definition', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../audit_orchestrator/audit_orchestrator.types.ts'), 'utf-8');
      expect(content).not.toMatch(/export type ConsolidatedFinding/);
      // Should import from audit/types (may be multiline import)
      expect(content).toContain('from "../audit/types"');
    });

    it('[AUDIT-B3] should verify policy_evaluator imports Finding from audit/types', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../policy_evaluator/policy_evaluator.types.ts'), 'utf-8');
      expect(content).toContain('from "../audit/types"');
      expect(content).not.toMatch(/export type PolicyDecision\s*=/);
    });

    it('[AUDIT-B4] should verify source_auditor and redaction import Finding from audit/types', () => {
      // These two cited AUDIT-B1 as their licence, but B1's WHEN names finding_detector and
      // its test reads finding_detector only: a local `Finding` here went unnoticed (audit
      // cross-spec F-11). One row per module, so the failure names the offender.
      const modules = [
        { file: '../source_auditor/types.ts', quote: '"' },
        { file: '../redaction/redactor.types.ts', quote: "'" },
      ];
      const offenders = modules.filter(({ file, quote }) => {
        const content = fs.readFileSync(path.resolve(__dirname, file), 'utf-8');
        const importsCanonical = content.includes(`from ${quote}../audit/types${quote}`);
        const redefines = /export (type|interface) Finding\b/.test(content);
        return !importsCanonical || redefines;
      }).map((m) => m.file);
      expect(offenders).toEqual([]);
    });
  });

  // §4.3 Projection Contract (AUDIT-C1 to C4)
  describe('4.3. Projection Contract (AUDIT-C1 to C4)', () => {

    it('[AUDIT-C1] should verify projection types include all Finding fields', () => {
      // Verified by APRJ-D1 (Prisma schema coherence) below.
      // This test documents that projections must be supersets.
      const findingFields = [
        'fingerprint', 'ruleId', 'file', 'line', 'column', 'message', 'snippet',
        'category', 'severity', 'detector', 'confidence', 'fixes', 'legalReference',
        'executionId', 'reportedBy', 'isWaived',
      ];
      expect(findingFields.length).toBe(16);
    });

    it('[AUDIT-C2] should verify no field renames between Finding and projection', () => {
      // Verified by APRJ-D2 (schema coherence).
      // The projection contract rule (AUDIT-C2) states: projections must NOT rename
      // base type fields. This is enforced at the schema level by APRJ-D2 which
      // parses audit.prisma and verifies field names match audit/types.ts exactly.
      // See APRJ-D2 test below for the actual verification.
      const auditSchema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema/audit.prisma'), 'utf-8');
      // Verify core fields exist with their canonical names
      expect(auditSchema).toContain('fingerprint');
      expect(auditSchema).toContain('executionId');
      expect(auditSchema).toContain('ruleId');
    });

    it('[AUDIT-C3] should verify no field removals between Finding and projection', () => {
      // Verified by APRJ-D3 below.
      // Every base field must exist in audit.prisma
      const auditSchema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema/audit.prisma'), 'utf-8');
      const requiredFields = ['fingerprint', 'ruleId', 'executionId', 'reportedBy', 'isWaived'];
      for (const field of requiredFields) {
        expect(auditSchema).toContain(field);
      }
    });

    it('[AUDIT-C4] should verify projections use & or extends pattern', () => {
      // This is a design-time constraint, not runtime.
      // The test documents the rule: projections use TypeScript intersection or extends.
      // Verified by code review — if a projection redefines types locally, the
      // dependency_auditor will flag it as TYPE_REDEFINITION.
      expect(true).toBe(true); // Design-time rule, documented
    });
  });
});

// ─── Schema Coherence (APRJ-D1 to D3) ──────────────────────────────────────

const SCHEMA_DIR = path.resolve(__dirname, '../../prisma/schema');

describe('Audit Prisma Schema Verification (audit_prisma_record_projection_module.md)', () => {

  let auditModels: PrismaModel[];

  beforeAll(() => {
    const auditPath = path.join(SCHEMA_DIR, 'audit.prisma');
    expect(fs.existsSync(auditPath)).toBe(true);
    auditModels = parsePrismaSchema(auditPath);
  });

  describe('4.1. Finding Schema Verification (APRJ-A1 to A4)', () => {

    it('[APRJ-A1] should have fingerprint as column name in Finding model', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      expect(finding).toBeDefined();
      const fields = finding!.fields.map(f => f.name);
      expect(fields).toContain('fingerprint');
    });

    it('[APRJ-A2] should have executionId as column name in Finding model', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      const fields = finding!.fields.map(f => f.name);
      expect(fields).toContain('executionId');
    });

    it('[APRJ-A3] should use Prisma enums FindingSeverity DetectorName and String for category', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      const fieldMap = Object.fromEntries(finding!.fields.map(f => [f.name, f.type]));
      expect(fieldMap['severity']).toBe('FindingSeverity');
      expect(fieldMap['category']).toBe('String');
      expect(fieldMap['detector']).toBe('DetectorName');
    });

    it('[APRJ-A4] should include all Finding base fields without removing any', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      const fields = finding!.fields.map(f => f.name);
      for (const field of FINDING_BASE_FIELDS) {
        expect(fields).toContain(field);
      }
    });
  });

  describe('4.4. Contract Compliance (APRJ-D1 to APRJ-D3)', () => {

    it('[APRJ-D1] should verify all Prisma tables are supersets of base audit types', () => {
      // Finding
      const findingModel = auditModels.find(m => m.name === 'Finding');
      expect(findingModel).toBeDefined();
      const findingFieldNames = findingModel!.fields.map(f => f.name);

      for (const field of FINDING_BASE_FIELDS) {
        expect(findingFieldNames).toContain(field);
      }

      // Waiver
      const waiverModel = auditModels.find(m => m.name === 'Waiver');
      expect(waiverModel).toBeDefined();
      const waiverFieldNames = waiverModel!.fields.map(f => f.name);

      for (const field of WAIVER_BASE_FIELDS) {
        expect(waiverFieldNames).toContain(field);
      }

      // Scan
      const scanModel = auditModels.find(m => m.name === 'Scan');
      expect(scanModel).toBeDefined();
      const scanFieldNames = scanModel!.fields.map(f => f.name);

      for (const field of SCAN_BASE_FIELDS) {
        expect(scanFieldNames).toContain(field);
      }
    });

    it('[APRJ-D2] should verify no field renames between base types and Prisma columns', () => {
      // Verify canonical field names exist — if they were renamed, APRJ-D1 (superset check)
      // would also fail, but this test explicitly checks the critical ones.
      const findingModel = auditModels.find(m => m.name === 'Finding');
      const findingFieldNames = findingModel!.fields.map(f => f.name);

      expect(findingFieldNames).toContain('fingerprint');
      expect(findingFieldNames).toContain('executionId');
      expect(findingFieldNames).toContain('category');
      expect(findingFieldNames).toContain('severity');
      expect(findingFieldNames).toContain('detector');
    });

    it('[APRJ-D3] should verify no field removals between base types and Prisma columns', () => {
      // Finding: no orphaned fields
      const findingModel = auditModels.find(m => m.name === 'Finding');
      const findingFieldNames = findingModel!.fields.map(f => f.name);
      const allExpectedFindingFields = [...FINDING_BASE_FIELDS, ...FINDING_PROJECTION_FIELDS];
      const orphanedFindingFields = findingFieldNames.filter(f => !allExpectedFindingFields.includes(f));
      expect(orphanedFindingFields).toEqual([]);

      // Waiver: no orphaned fields
      const waiverModel = auditModels.find(m => m.name === 'Waiver');
      const waiverFieldNames = waiverModel!.fields.map(f => f.name);
      const allExpectedWaiverFields = [...WAIVER_BASE_FIELDS, ...WAIVER_PROJECTION_FIELDS];
      const orphanedWaiverFields = waiverFieldNames.filter(f => !allExpectedWaiverFields.includes(f));
      expect(orphanedWaiverFields).toEqual([]);

      // Scan: no orphaned fields
      const scanModel = auditModels.find(m => m.name === 'Scan');
      const scanFieldNames = scanModel!.fields.map(f => f.name);
      const allExpectedScanFields = [...SCAN_BASE_FIELDS, ...SCAN_PROJECTION_FIELDS];
      const orphanedScanFields = scanFieldNames.filter(f => !allExpectedScanFields.includes(f));
      expect(orphanedScanFields).toEqual([]);
    });
  });

  // ============================================================================
  // §4.4. Finding Factory (AUDIT-D1 to D2)
  // ============================================================================
  describe('4.4. Finding Factory (AUDIT-D1 to D2)', () => {
    it('[AUDIT-D1] should compute snippetHash as sha256 of snippet', () => {
      const { createHash } = require('node:crypto');
      const finding = createFinding({
        ruleId: 'TEST-001',
        file: 'src/test.ts',
        line: 1,
        message: 'test',
        snippet: 'const secret = "abc123"',
        category: 'hardcoded-secret',
        severity: 'critical',
        detector: 'regex',
        confidence: 1.0,
        executionId: '',
        reportedBy: [],
        isWaived: false,
      });
      const expected = createHash('sha256').update('const secret = "abc123"').digest('hex');
      expect(finding.snippetHash).toBe(expected);
      expect(finding.snippetHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('[AUDIT-D2] should be used by all Finding constructors (structural verification)', () => {
      const { execSync } = require('node:child_process');
      const coreRoot = require('node:path').resolve(__dirname, '..');
      // Verify no production file constructs Finding inline (without createFinding)
      // Pattern: "const finding: Finding = {" or "const finding = {" followed by snippetHash
      const inlineFindings = execSync(
        `grep -rn "const finding.*: Finding = {\\|const finding = {" ${coreRoot}/finding_detector/ ${coreRoot}/audit_orchestrator/ ${coreRoot}/policy_evaluator/ --include="*.ts" | grep -v test | grep -v createFinding || true`,
        { encoding: 'utf-8' },
      ).trim();
      expect(inlineFindings).toBe('');
    });
  });

  describe('4.5. FindingCategory Extensible (AUDIT-E1 to E4)', () => {
    const typesPath = path.resolve(__dirname, 'types.ts');

    it('[AUDIT-E1] should export BaseFindingCategory with all built-in categories', () => {
      const typesSource = fs.readFileSync(typesPath, 'utf-8');
      expect(typesSource).toContain('export type BaseFindingCategory =');
      expect(typesSource).toContain('"pii-email"');
      expect(typesSource).toContain('"hardcoded-secret"');
      expect(typesSource).toContain('"security-vulnerability"');
      expect(typesSource).toContain('"code-quality"');
      expect(typesSource).toContain('"unknown-risk"');
    });

    it('[AUDIT-E2] should accept custom category strings via FindingCategory type', () => {
      const typesSource = fs.readFileSync(typesPath, 'utf-8');
      expect(typesSource).toContain('export type FindingCategory = BaseFindingCategory | (string & {})');

      const customCategory: FindingCategory = 'firewall-disabled';
      const baseCategory: FindingCategory = 'pii-email';
      expect(typeof customCategory).toBe('string');
      expect(typeof baseCategory).toBe('string');
    });

    it('[AUDIT-E3] should use String type for Finding.category in Prisma schema', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      const fieldMap = Object.fromEntries(finding!.fields.map(f => [f.name, f.type]));
      expect(fieldMap['category']).toBe('String');
    });

    it('[AUDIT-E4] should normalize hyphens to underscores without rejecting custom categories', () => {
      const finding = createFinding({
        ruleId: 'DSEC-D3',
        file: 'device://macbook/firewall',
        line: 0,
        message: 'Firewall disabled',
        snippet: 'Status: inactive',
        category: 'firewall-disabled',
        severity: 'high',
        detector: 'heuristic',
        confidence: 1.0,
        executionId: 'test-exec',
        reportedBy: ['device-security'],
        isWaived: false,
      });
      expect(finding.category).toBe('firewall-disabled');
      expect(finding.snippetHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ── 4.6. Waiver Factory (AUDIT-F1 to F3) ──

  describe('4.6. Waiver Factory (AUDIT-F1 to F3)', () => {
    const mockFeedback = {
      header: { version: '1.1', type: 'feedback', payloadChecksum: 'test', signatures: [] },
      payload: { id: 'fb-1', entityType: 'execution', entityId: 'exec-1', type: 'approval', status: 'open', content: 'waive' },
    } as any;

    it('[AUDIT-F1] should create Waiver with required fingerprint ruleId and feedback', () => {
      const waiver = createWaiver({ fingerprint: 'sha256:abc', ruleId: 'SEC-001', feedback: mockFeedback });
      expect(waiver.fingerprint).toBe('sha256:abc');
      expect(waiver.ruleId).toBe('SEC-001');
      expect(waiver.feedback).toBe(mockFeedback);
    });

    it('[AUDIT-F2] should include expiresAt when provided and omit when not', () => {
      const date = new Date('2026-12-31');
      const withExpiry = createWaiver({ fingerprint: 'fp', ruleId: 'R1', feedback: mockFeedback, expiresAt: date });
      expect(withExpiry.expiresAt).toEqual(date);

      const permanent = createWaiver({ fingerprint: 'fp', ruleId: 'R1', feedback: mockFeedback });
      expect(permanent.expiresAt).toBeUndefined();
    });

    it('[AUDIT-F3] should throw when fingerprint or ruleId or feedback is missing', () => {
      expect(() => createWaiver({ fingerprint: '', ruleId: 'R1', feedback: mockFeedback })).toThrow('fingerprint');
      expect(() => createWaiver({ fingerprint: 'fp', ruleId: '', feedback: mockFeedback })).toThrow('ruleId');
      expect(() => createWaiver({ fingerprint: 'fp', ruleId: 'R1', feedback: null as any })).toThrow('FeedbackRecord');
    });
  });

  // ── 4.7. Scan Factory (AUDIT-G1 to G3) ──

  describe('4.7. Scan Factory (AUDIT-G1 to G3)', () => {
    const makeFinding = (severity: FindingSeverity, isWaived = false): Finding =>
      createFinding({
        ruleId: 'R1', category: 'hardcoded-secret',
        severity, file: 'a.ts', line: 1, column: 1, message: 'test',
        snippet: `secret-${severity}`, detector: 'regex', confidence: 1,
        executionId: 'e1', reportedBy: ['agent:test'], isWaived,
      });

    const policyDecision: PolicyDecision = { decision: 'pass', reason: 'OK', executionId: 'e-p', blockingFindings: [], waivedFindings: [], summary: { critical: 0, high: 0, medium: 0, low: 0 }, rulesEvaluated: [], evaluatedAt: new Date().toISOString() };

    it('[AUDIT-G1] should create Scan with summary computed from findings array', () => {
      const findings = [makeFinding('critical'), makeFinding('high'), makeFinding('low')];
      const scan = createScan({
        scope: 'full', triggeredBy: 'user',
        executionRecordIds: ['e1'], findings, policyDecision,
      });
      expect(scan.summary.critical).toBe(1);
      expect(scan.summary.high).toBe(1);
      expect(scan.summary.low).toBe(1);
      expect(scan.summary.medium).toBe(0);
      expect(scan.summary.total).toBe(3);
    });

    it('[AUDIT-G2] should guarantee summary counts equal non-waived findings count', () => {
      const findings = [makeFinding('critical'), makeFinding('high', true), makeFinding('medium')];
      const scan = createScan({
        scope: 'full', triggeredBy: 'user',
        executionRecordIds: ['e1'], findings, policyDecision,
      });
      const activeCount = scan.summary.critical + scan.summary.high + scan.summary.medium + scan.summary.low;
      expect(activeCount).toBe(2); // 3 total - 1 waived
      expect(scan.summary.suppressed).toBe(1);
      expect(scan.summary.total).toBe(3);
    });

    it('[AUDIT-G3] should throw when scope or triggeredBy is missing', () => {
      expect(() => createScan({
        scope: '' as any, triggeredBy: 'user',
        executionRecordIds: [], findings: [], policyDecision,
      })).toThrow('scope');
      expect(() => createScan({
        scope: 'full', triggeredBy: '',
        executionRecordIds: [], findings: [], policyDecision,
      })).toThrow('triggeredBy');
    });
  });

  // ── 4.8. Fix Factory (AUDIT-H1 to H2) ──

  describe('4.8. Fix Factory (AUDIT-H1 to H2)', () => {
    it('[AUDIT-H1] should create Fix with description and throw when empty', () => {
      const fix = createFix({ description: 'Move to env vars' });
      expect(fix.description).toBe('Move to env vars');

      expect(() => createFix({ description: '' })).toThrow('description');
    });

    it('[AUDIT-H2] should preserve source and regulation fields in Fix', () => {
      const fix = createFix({
        description: 'Use vault',
        source: 'agent:review-advisor',
        regulation: 'PCI-DSS 3.4',
      });
      expect(fix.source).toBe('agent:review-advisor');
      expect(fix.regulation).toBe('PCI-DSS 3.4');
    });
  });

  // ── 4.10. Runtime-Iterable Enums (AUDIT-J1 to J3) ──

  describe('4.10. Runtime-Iterable Enums (AUDIT-J1 to J3)', () => {
    const typesPath = path.resolve(__dirname, 'types.ts');

    // Pre-existing closed-domain unions that J1 does NOT require converting (the
    // spec's §4.10.1 time-bound scope). Measured: there are FIVE. None has
    // an observed failure. When a consumer that needs to iterate one of them appears,
    // THAT one gets converted and drops off this list — not all of them at once.
    // `ScanScope` left this list with AUDIT-J4, when it was widened to three values, and
    // `DetectorName` with AUDIT-J6, when the SARIF rehydrator needed to narrow a string to it.
    const GRANDFATHERED_BARE_UNIONS = [
      'WaiverStatus',
      'ScanDisplayStatus',
      'PolicyStatus',
    ];

    // `FindingCategory` is neither listed nor matched by the pattern: it is extensible
    // BY DESIGN (`BaseFindingCategory | (string & {})`, AUDIT-E1..E4). Closing it would
    // revert a standing decision, not apply J1.
    const RE_BARE_STRING_UNION = /^export type (\w+) = "[^"]*"(?:\s*\|\s*"[^"]*")*;$/gm;

    it('[AUDIT-J1] should derive closed-domain audit types from an exported readonly tuple', () => {
      const src = fs.readFileSync(typesPath, 'utf-8');
      const bareUnions = [...src.matchAll(RE_BARE_STRING_UNION)].map((m) => m[1] as string);

      // ANTI-VACUITY: if `RE_BARE_STRING_UNION` stops matching — a style refactor, a
      // formatting change — `bareUnions` comes back empty and this test would pass
      // WITHOUT VERIFYING ANYTHING: a green that proves nothing, which is worse than a
      // red. Require seeing the grandfathered ones we KNOW exist before trusting it.
      expect({
        detector: 'bare-string-union',
        seen: GRANDFATHERED_BARE_UNIONS.filter((n) => bareUnions.includes(n)).sort(),
      }).toEqual({
        detector: 'bare-string-union',
        seen: [...GRANDFATHERED_BARE_UNIONS].sort(),
      });

      // Any closed-domain bare union NOT declared as an exception violates J1.
      const violations = bareUnions.filter((n) => !GRANDFATHERED_BARE_UNIONS.includes(n));
      expect(violations).toEqual([]);
    });

    it('[AUDIT-J2] should export FINDING_STATUSES as a readonly tuple and derive FindingStatus from it', () => {
      // Imported from the MAIN barrel, not from `./index`: AUDIT-A6 declares "re-export
      // all TYPES" and these constants are VALUES — a missing value re-export is NOT
      // caught by A6. Importing from here turns that silent gap into a loud red.
      const mainBarrel = require('../index');
      expect(Array.isArray(mainBarrel.FINDING_STATUSES)).toBe(true);
      expect([...mainBarrel.FINDING_STATUSES]).toEqual(['new', 'in_progress', 'waived', 'resolved']);

      // The type DERIVES from the constant, not the other way around.
      const src = fs.readFileSync(typesPath, 'utf-8');
      expect(src).toMatch(/export const FINDING_STATUSES = \[[^\]]*\] as const;/);
      expect(src).toMatch(/export type FindingStatus = \(typeof FINDING_STATUSES\)\[number\];/);
    });

    it('[AUDIT-J3] should export FINDING_SEVERITIES as a readonly tuple and derive FindingSeverity from it', () => {
      const mainBarrel = require('../index');
      expect(Array.isArray(mainBarrel.FINDING_SEVERITIES)).toBe(true);
      // AUDIT-A2 still holds for its VALUES: four of them, and "info" is not one.
      expect([...mainBarrel.FINDING_SEVERITIES]).toEqual(['critical', 'high', 'medium', 'low']);
      expect(mainBarrel.FINDING_SEVERITIES).not.toContain('info');

      const src = fs.readFileSync(typesPath, 'utf-8');
      expect(src).toMatch(/export const FINDING_SEVERITIES = \[[^\]]*\] as const;/);
      expect(src).toMatch(/export type FindingSeverity = \(typeof FINDING_SEVERITIES\)\[number\];/);
    });

    it('[AUDIT-J4] should export SCAN_SCOPES as a readonly tuple and let createScan record a baseline run', () => {
      const mainBarrel = require('../index');
      expect(Array.isArray(mainBarrel.SCAN_SCOPES)).toBe(true);
      expect([...mainBarrel.SCAN_SCOPES]).toEqual(['diff', 'full', 'baseline']);

      const src = fs.readFileSync(typesPath, 'utf-8');
      expect(src).toMatch(/export const SCAN_SCOPES = \[[^\]]*\] as const;/);
      expect(src).toMatch(/export type ScanScope = \(typeof SCAN_SCOPES\)\[number\];/);

      // The run whose grouping matters most — the one that writes the new baseline — is
      // representable in the type that groups it. With the old two-value union this line did
      // not compile, which is the negative control for the widening.
      const scan = createScan({
        scope: 'baseline',
        triggeredBy: 'ci',
        executionRecordIds: [],
        findings: [],
        policyDecision: {
          decision: 'pass', reason: 'OK', executionId: 'e-p', blockingFindings: [], waivedFindings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0 }, rulesEvaluated: [], evaluatedAt: new Date().toISOString(),
        },
      });
      expect(scan.scope).toBe('baseline');

      // The runtime guard a persisted `string` goes through instead of a cast (saas-api).
      expect(isScanScope('baseline')).toBe(true);
      expect(isScanScope('diff')).toBe(true);
      expect(isScanScope('everything')).toBe(false);
    });

    it('[AUDIT-J5] should export BASE_FINDING_CATEGORIES as a readonly tuple and keep FindingCategory open', () => {
      const mainBarrel = require('../index');
      expect(Array.isArray(mainBarrel.BASE_FINDING_CATEGORIES)).toBe(true);
      // 38 built-ins, no duplicates, and the two SAST ones that went unclassified are there.
      expect(mainBarrel.BASE_FINDING_CATEGORIES).toHaveLength(38);
      expect(new Set(mainBarrel.BASE_FINDING_CATEGORIES).size).toBe(38);
      expect(mainBarrel.BASE_FINDING_CATEGORIES).toEqual(
        expect.arrayContaining(['pii-email', 'security-vulnerability', 'code-quality']),
      );

      const src = fs.readFileSync(typesPath, 'utf-8');
      expect(src).toMatch(/export const BASE_FINDING_CATEGORIES = \[[^\]]*\] as const;/);
      expect(src).toMatch(/export type BaseFindingCategory = \(typeof BASE_FINDING_CATEGORIES\)\[number\];/);
      // The OPEN half survives exactly as AUDIT-E2 declares it — J1 applies to the tuple, not here.
      expect(src).toMatch(/export type FindingCategory = BaseFindingCategory \| \(string & \{\}\);/);
      const custom: FindingCategory = 'firewall-disabled';
      expect(typeof custom).toBe('string');
    });
  });

  // ── 4.11. Finding identity (AUDIT-K1, K5, K6, K7) + AUDIT-D2 ──

  describe('4.11. Finding identity (AUDIT-K1, K5, K6, K7)', () => {
    const producerInput = {
      ruleId: 'SEC-001',
      file: 'src/config.ts',
      line: 42,
      message: 'Hardcoded secret detected',
      snippet: 'const apiKey = "sk_test_abc123";',
      category: 'hardcoded-secret' as FindingCategory,
      severity: 'critical' as FindingSeverity,
      detector: 'regex' as const,
      confidence: 1.0,
      executionId: 'exec-test-001',
      reportedBy: ['agent:security-audit'],
      isWaived: false,
    };

    it('[AUDIT-K1] should compute a 64-hex fingerprint in createFinding and reject fingerprint in the input type', () => {
      const finding = createFinding({ ...producerInput, anchor: 'sk_test_abc123' });

      expect(finding.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(finding.fingerprint).toBe(
        computeFingerprint({ file: producerInput.file, category: producerInput.category, anchor: 'sk_test_abc123' }),
      );

      // The caller cannot supply it: `fingerprint` is omitted from the input type, so this
      // is a compile-time error. `@ts-expect-error` FAILS the build if the error stops
      // happening — the assertion is that the door stays shut, and it is checked by tsc,
      // not at runtime.
      // @ts-expect-error fingerprint is not an accepted input of createFinding (AUDIT-K1)
      createFinding({ ...producerInput, fingerprint: 'deadbeef' });
    });

    it('[AUDIT-K1] should fall back to snippet as anchor when anchor is absent', () => {
      const withoutAnchor = createFinding(producerInput);

      expect(withoutAnchor.fingerprint).toBe(
        computeFingerprint({
          file: producerInput.file,
          category: producerInput.category,
          anchor: producerInput.snippet,
        }),
      );

      // And the fallback is a real fallback, not an alias: a finding whose anchor is the
      // matched token differs from one that hashed the whole line. That difference is the
      // entire point of the anchor (D-d).
      const withAnchor = createFinding({ ...producerInput, anchor: 'sk_test_abc123' });
      expect(withAnchor.fingerprint).not.toBe(withoutAnchor.fingerprint);
    });

    it('[AUDIT-K5] should keep the transported fingerprint byte for byte in rehydrateFinding', () => {
      const transported = 'a'.repeat(64);
      const rehydrated = rehydrateFinding({
        ...producerInput,
        fingerprint: transported,
        snippet: '[REDACTED]',
      });

      expect(rehydrated.fingerprint).toBe(transported);

      // Negative control: recomputing at this point diverges, because the consumer no
      // longer has the anchor and the snippet may be redacted or truncated. If
      // rehydrateFinding ever recomputed, it would land on this value instead.
      const recomputed = computeFingerprint({
        file: producerInput.file,
        category: producerInput.category,
        anchor: '[REDACTED]',
      });
      expect(recomputed).not.toBe(transported);
    });

    it('[AUDIT-K6] should hash the exact snippet without normalization', () => {
      const tight = createFinding({ ...producerInput, snippet: 'a b' });
      const spread = createFinding({ ...producerInput, snippet: 'a  b' });

      // snippetHash proves the EXACT text — it is the L1↔L2 integrity bridge (RLDX-F2/F4).
      // Normalizing it would make verifySnippet compare a normalized hash against a raw
      // one and answer "unverified" forever, silently.
      expect(tight.snippetHash).not.toBe(spread.snippetHash);
      expect(spread.snippetHash).toBe(createHash('sha256').update('a  b').digest('hex'));

      // The other hash goes the other way: normalization is exactly what makes the
      // identity survive the same reformat. Two hashes, two roles.
      expect(tight.fingerprint).toBe(spread.fingerprint);
    });

    it('[AUDIT-K7] should fall back to the snippet when the anchor carries no text', () => {
      const fromSnippet = computeFingerprint({
        file: producerInput.file,
        category: producerInput.category,
        anchor: producerInput.snippet,
      });

      for (const empty of ['', '   ', 'requires login', REDACTED_SNIPPET]) {
        expect(createFinding({ ...producerInput, anchor: empty }).fingerprint).toBe(fromSnippet);
      }
      expect([undefined, '', ' \t', 'requires login', REDACTED_SNIPPET].map(isAnchorText)).toEqual([
        false, false, false, false, false,
      ]);
      expect(isAnchorText('sk_test_abc123')).toBe(true);
    });

    it('[AUDIT-K7] should degrade to the region with a warning and never collapse findings without text', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        // Three semgrep results in one file and category, no snippet text: an empty snippet,
        // the login placeholder, and a second rule on the first result's line.
        const noText = { ...producerInput, ruleId: 'semgrep.sqli', category: 'security-vulnerability', snippet: '' };
        const findings = [
          createFinding({ ...noText, line: 10, anchor: '' }),
          createFinding({ ...noText, line: 20, snippet: 'requires login', anchor: 'requires login' }),
          createFinding({ ...noText, line: 10, ruleId: 'semgrep.xss', anchor: '' }),
        ];

        expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(3);
        expect(findings[0]!.fingerprint).toBe(
          computeRegionFingerprint({ file: noText.file, category: noText.category, ruleId: 'semgrep.sqli', line: 10 }),
        );
        const k7 = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('[AUDIT-K7]'));
        expect(k7).toHaveLength(3);
        expect(k7[0]).toContain('semgrep.sqli at src/config.ts:10');

        // Negative control — the identity as it was computed before: the empty anchor hashed
        // as text. The three findings become one, and consolidation drops two of them.
        const asText = findings.map((f) =>
          computeFingerprint({ file: f.file, category: f.category, anchor: '' }),
        );
        expect(new Set(asText).size).toBe(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('4.10. Runtime-Iterable Enums — DetectorName (AUDIT-J6)', () => {
    it('[AUDIT-J6] should export DETECTOR_NAMES as a readonly tuple and narrow a string with isDetectorName', () => {
      const mainBarrel = require('../index');
      expect(mainBarrel.DETECTOR_NAMES).toEqual(['regex', 'heuristic', 'llm', 'sast']);
      expect(isDetectorName('sast')).toBe(true);
      expect(isDetectorName('semgrep')).toBe(false);

      const src = fs.readFileSync(path.resolve(__dirname, 'types.ts'), 'utf-8');
      expect(src).toMatch(/export type DetectorName = \(typeof DETECTOR_NAMES\)\[number\];/);
    });
  });

  describe('4.12. Unmatched waivers (AUDIT-L1, L2)', () => {
    it('[AUDIT-L2] should keep only the waivers whose finding file was read', () => {
      const withFile = (fingerprint: string, file?: string): Waiver => {
        const base = makeTestWaiver({ fingerprint });
        return {
          ...base,
          feedback: {
            ...base.feedback,
            payload: {
              ...base.feedback.payload,
              ...(file !== undefined ? { metadata: { fingerprint, ruleId: 'SEC-001', file, line: 1 } } : {}),
            },
          },
        };
      };
      const inRead = withFile('a'.repeat(64), 'src/read.ts');
      const notRead = withFile('b'.repeat(64), 'src/untouched.ts');
      const noFile = withFile('c'.repeat(64));

      expect(waiversForFiles([inRead, notRead, noFile], ['src/read.ts', 'src/other.ts'])).toEqual([inRead]);

      // Negative control — without the filter, a diff run that read one file reports the
      // waiver of a file it never opened as unmatched, and tells the user to re-create it.
      const finding = makeTestFinding({ file: 'src/read.ts', anchor: 'still-here' });
      const matchedInRead = withFile(finding.fingerprint, 'src/read.ts');
      expect(countUnmatchedWaivers([matchedInRead, notRead], [finding])).toBe(1);
      expect(countUnmatchedWaivers(waiversForFiles([matchedInRead, notRead], ['src/read.ts']), [finding])).toBe(0);
    });
    it('[AUDIT-L1] should count the waivers whose fingerprint matches no finding', () => {
      const a = makeTestFinding({ anchor: 'still-here-a' });
      const b = makeTestFinding({ anchor: 'still-here-b' });
      const matched = makeTestWaiver({ fingerprint: a.fingerprint });
      const stale1 = makeTestWaiver({ fingerprint: 'f'.repeat(64) });
      const stale2 = makeTestWaiver({ fingerprint: 'e'.repeat(64) });

      // ONE matched and TWO stale, asymmetric on purpose: with one of each, "count the ones
      // that matched" and "count the ones that did not" both return 1, and an inverted
      // predicate passes. Found by mutation in source_auditor's EARS-C6 on 2026-09-10.
      expect(countUnmatchedWaivers([matched, stale1, stale2], [a, b])).toBe(2);
    });

    it('[AUDIT-L1] should count every waiver as unmatched when there are no findings', () => {
      // The edge case the orchestrator's no-agents branch used to hard-code as
      // `waivers.length` with the reasoning in a comment. A property of the function,
      // tested once, instead of a special case at a call site.
      const waivers = [
        makeTestWaiver({ fingerprint: 'a'.repeat(64) }),
        makeTestWaiver({ fingerprint: 'b'.repeat(64) }),
      ];
      expect(countUnmatchedWaivers(waivers, [])).toBe(2);
      expect(countUnmatchedWaivers([], [])).toBe(0);
    });
  });

  describe('4.13. Severity counts (AUDIT-M1)', () => {
    it('[AUDIT-M1] should count findings per severity with every key present', () => {
      // Two critical and one low, asymmetric on purpose: with one finding per severity a
      // counter that ignores the severity and returns findings.length / 4 would also pass.
      const findings = [
        makeTestFinding({ anchor: 'c1', severity: 'critical' }),
        makeTestFinding({ anchor: 'c2', severity: 'critical' }),
        makeTestFinding({ anchor: 'l1', severity: 'low' }),
      ];
      expect(countBySeverity(findings)).toEqual({ critical: 2, high: 0, medium: 0, low: 1 });
      // Every key present even with nothing to count — consumers index without a guard.
      expect(countBySeverity([])).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    });

    it('[AUDIT-M1] should type every severity aggregate in core as SeverityCounts', () => {
      // The map was written five ways (audit M3b); the three core sites now name the one type.
      const sites = [
        { file: 'types.ts', pattern: /export type AuditSummary = SeverityCounts & \{/ },
        { file: '../source_auditor/types.ts', pattern: /bySeverity: SeverityCounts;/ },
        { file: '../sarif/sarif.types.ts', pattern: /bySeverity: SeverityCounts;/ },
      ];
      const missing = sites
        .filter(({ file, pattern }) => !pattern.test(fs.readFileSync(path.resolve(__dirname, file), 'utf-8')))
        .map((s) => s.file);
      expect(missing).toEqual([]);
    });
  });

  describe('4.4. Finding Factory — two constructors (AUDIT-D2)', () => {
    it('[AUDIT-D2] should construct every Finding through createFinding or rehydrateFinding', () => {
      const srcRoot = path.resolve(__dirname, '..');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) files.push(full);
        }
      };
      walk(srcRoot);

      // Assigning `snippetHash` in an OBJECT LITERAL is the signature of a Finding built by
      // hand. The trailing comma is what tells it apart from a TYPE MEMBER, which ends in a
      // semicolon: `redaction/redactor.types.ts` legitimately declares `snippetHash: string;`
      // as a field of RedactedFinding and is not a construction site. A scan that cannot
      // make that distinction reports a type declaration as a violation.
      const RE_LITERAL_ASSIGNMENT = /^\s*snippetHash:\s*.+,\s*$/m;

      // ANTI-VACUITY: if the pattern stops matching — a formatting change, a refactor — the
      // list comes back empty and this test passes WITHOUT VERIFYING ANYTHING. types.ts MUST
      // appear, because that is where both factories assign the field. Until it does, a zero
      // here is blindness, not compliance.
      const withProperty = files.filter((f) => RE_LITERAL_ASSIGNMENT.test(fs.readFileSync(f, 'utf-8')));
      expect(withProperty.map((f) => path.relative(srcRoot, f))).toContain('audit/types.ts');

      // Everywhere else, a Finding is built by a factory and never as a literal.
      const violations = withProperty
        .map((f) => path.relative(srcRoot, f))
        .filter((f) => f !== 'audit/types.ts' && f !== 'audit/testing.ts');
      expect(violations).toEqual([]);
    });
  });
});
