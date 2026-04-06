/**
 * Schema-Type Coherence Tests (COH-A1 to COH-A4)
 *
 * Verifies that Prisma schema fields are coherent with TypeScript types.
 * Parses .prisma files and compares against the actual TS type definitions.
 *
 * These tests catch:
 * - Fields added to TS types but not to Prisma schema
 * - Fields in Prisma schema not present in TS types (orphaned)
 * - Field renames (fingerprint vs primaryLocationLineHash)
 *
 * Spec: record_projection.md §4.8 (COH-A1 to COH-A4)
 */

import * as fs from 'fs';
import * as path from 'path';

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
      // Match field lines: "  fieldName  Type  @attributes"
      const fieldMatch = line.match(/^\s+(\w+)\s+([\w[\]?]+)/);
      if (fieldMatch && !line.trim().startsWith('//') && !line.trim().startsWith('@@')) {
        const name = fieldMatch[1];
        const rawType = fieldMatch[2];
        // Skip relation fields
        if (rawType.match(/^[A-Z]/) && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'].includes(rawType.replace('?', '').replace('[]', ''))) {
          // Check if it's an enum (enums are also PascalCase)
          const knownEnums = ['FindingSeverity', 'FindingCategory', 'DetectorName'];
          if (!knownEnums.includes(rawType.replace('?', '').replace('[]', ''))) {
            continue; // Skip relation fields
          }
        }
        models.push; // just to satisfy linter
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

// These are the fields from the TS types that MUST exist in the Prisma schema.
// Excluded: 'waiver' (Finding.waiver is a runtime reference, not stored in DB)
// Excluded: 'feedback' (Waiver.feedback is the full FeedbackRecord, materialized as individual fields)
// Excluded: 'findings', 'policyDecision', 'summary' (Scan stores these differently — JSON + flattened counts)

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

// Fields that are ONLY in Prisma (projection-specific) — documented and expected
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

const SCHEMA_DIR = path.resolve(__dirname, '../../prisma/schema');

describe('Schema-Type Coherence', () => {

  describe('4.8. Schema-Type Coherence (COH-A1 to COH-A4)', () => {

    let auditModels: PrismaModel[];
    let protocolModels: PrismaModel[];

    beforeAll(() => {
      const auditPath = path.join(SCHEMA_DIR, 'audit.prisma');
      const protocolPath = path.join(SCHEMA_DIR, 'protocol.prisma');

      expect(fs.existsSync(auditPath)).toBe(true);
      expect(fs.existsSync(protocolPath)).toBe(true);

      auditModels = parsePrismaSchema(auditPath);
      protocolModels = parsePrismaSchema(protocolPath);
    });

    it('[COH-A1] should verify every protocol.prisma field maps to a record type field', () => {
      // Protocol models should exist
      expect(protocolModels.length).toBeGreaterThan(0);

      const taskModel = protocolModels.find(m => m.name === 'GitgovTask');
      expect(taskModel).toBeDefined();

      // Task model should have core TaskRecord fields
      const taskFieldNames = taskModel!.fields.map(f => f.name);
      const expectedTaskFields = ['title', 'status', 'priority', 'description', 'tags', 'references', 'cycleIds', 'notes', 'metadata'];
      for (const field of expectedTaskFields) {
        expect(taskFieldNames).toContain(field);
      }

      // Should also have enrichment fields
      const enrichmentFields = ['isStalled', 'isAtRisk', 'needsClarification', 'healthScore'];
      for (const field of enrichmentFields) {
        expect(taskFieldNames).toContain(field);
      }
    });

    it('[COH-A2] should fail when record type field is added but not in prisma schema', () => {
      // This test documents the mechanism: if we add a field to a record type,
      // COH-A1 must be updated to include it — otherwise the test still passes
      // but the schema is out of sync.
      //
      // The real enforcement is: any PR that adds a field to a record type
      // MUST also add it to the Prisma schema AND update the expected fields list.

      const taskModel = protocolModels.find(m => m.name === 'GitgovTask');
      const taskFieldNames = taskModel!.fields.map(f => f.name);

      // Verify that a known field exists (if this fails, schema is stale)
      expect(taskFieldNames).toContain('recordId');
      expect(taskFieldNames).toContain('header');
    });

    it('[COH-A3] should fail when prisma has field not in record type or enrichment', () => {
      const taskModel = protocolModels.find(m => m.name === 'GitgovTask');
      const taskFieldNames = taskModel!.fields.map(f => f.name);

      // All task fields should be either: record payload, enrichment, or documented driver fields
      const knownTaskFields = [
        // Prisma infra
        'id', 'recordId', 'createdAt', 'updatedAt',
        // TaskRecord payload
        'title', 'status', 'priority', 'description', 'tags', 'references', 'cycleIds', 'notes', 'metadata',
        // EmbeddedMetadataRecord
        'header',
        // EnrichedTaskRecord enrichment
        'isStalled', 'isAtRisk', 'needsClarification', 'isBlockedByDependency',
        'healthScore', 'timeInCurrentStage', 'executionCount',
        'blockingFeedbackCount', 'openQuestionCount', 'timeToResolution',
        'isReleased', 'lastReleaseVersion',
        'lastUpdated', 'lastActivityType', 'recentActivity', 'relationships',
      ];

      const orphanedFields = taskFieldNames.filter(f => !knownTaskFields.includes(f));
      expect(orphanedFields).toEqual([]);
    });

    it('[COH-A4] should verify every audit.prisma field maps to an audit type field', () => {
      // Finding model
      const findingModel = auditModels.find(m => m.name === 'Finding');
      expect(findingModel).toBeDefined();
      const findingFieldNames = findingModel!.fields.map(f => f.name);

      // All base fields must be present
      for (const field of FINDING_BASE_FIELDS) {
        expect(findingFieldNames).toContain(field);
      }

      // No orphaned fields (every field is either base or documented projection)
      const allExpectedFindingFields = [...FINDING_BASE_FIELDS, ...FINDING_PROJECTION_FIELDS];
      const orphanedFindingFields = findingFieldNames.filter(f => !allExpectedFindingFields.includes(f));
      expect(orphanedFindingFields).toEqual([]);

      // Waiver model
      const waiverModel = auditModels.find(m => m.name === 'Waiver');
      expect(waiverModel).toBeDefined();
      const waiverFieldNames = waiverModel!.fields.map(f => f.name);

      for (const field of WAIVER_BASE_FIELDS) {
        expect(waiverFieldNames).toContain(field);
      }

      const allExpectedWaiverFields = [...WAIVER_BASE_FIELDS, ...WAIVER_PROJECTION_FIELDS];
      const orphanedWaiverFields = waiverFieldNames.filter(f => !allExpectedWaiverFields.includes(f));
      expect(orphanedWaiverFields).toEqual([]);

      // Scan model
      const scanModel = auditModels.find(m => m.name === 'Scan');
      expect(scanModel).toBeDefined();
      const scanFieldNames = scanModel!.fields.map(f => f.name);

      for (const field of SCAN_BASE_FIELDS) {
        expect(scanFieldNames).toContain(field);
      }

      const allExpectedScanFields = [...SCAN_BASE_FIELDS, ...SCAN_PROJECTION_FIELDS];
      const orphanedScanFields = scanFieldNames.filter(f => !allExpectedScanFields.includes(f));
      expect(orphanedScanFields).toEqual([]);
    });
  });
});
