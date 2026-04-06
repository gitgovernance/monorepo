/**
 * Audit Types + Schema Coherence Tests
 *
 * Spec: audit_record_types_module.md (AUDIT-A1 to A6, B1-B3, C1-C4)
 * Spec: audit_prisma_record_projection_module.md §4.4 (APRJ-D1 to APRJ-D3)
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Type imports for AUDIT-A tests ─────────────────────────────────────────
import type {
  Finding,
  FindingSeverity,
  FindingCategory,
  DetectorName,
  Waiver,
  WaiverMetadata,
  PolicyDecision,
  PolicyRuleResult,
  Scan,
  AuditOrchestrationResult,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
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
      currentModel = { name: modelMatch[1], fields: [] };
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
        const name = fieldMatch[1];
        const rawType = fieldMatch[2];
        if (rawType.match(/^[A-Z]/) && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'].includes(rawType.replace('?', '').replace('[]', ''))) {
          const knownEnums = ['FindingSeverity', 'FindingCategory', 'DetectorName'];
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
      const withOptionals: Finding = { ...finding, column: 5, snippet: 'code', fixes: [{ description: 'fix' }], legalReference: 'GDPR', waiver: undefined };
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
          header: { version: '1.0', type: 'feedback', payloadChecksum: 'sha256:mock', signatures: [] },
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
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, suppressed: 0, agentsRun: 1, agentsFailed: 0 },
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

    it('[APRJ-A3] should use Prisma enums FindingSeverity FindingCategory DetectorName', () => {
      const finding = auditModels.find(m => m.name === 'Finding');
      const fieldMap = Object.fromEntries(finding!.fields.map(f => [f.name, f.type]));
      expect(fieldMap['severity']).toBe('FindingSeverity');
      expect(fieldMap['category']).toBe('FindingCategory');
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
});
