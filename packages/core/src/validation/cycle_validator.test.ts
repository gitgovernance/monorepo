import {
  isCycleRecord,
  validateCycleRecordDetailed,
  validateFullCycleRecord
} from './cycle_validator';
import type { CycleRecord } from '../types';
import type { GitGovRecord } from '../types';

describe('CycleValidator Module', () => {
  const validCyclePayload: CycleRecord = {
    id: '1754400000-cycle-sprint-q4-api-performance',
    title: 'Sprint Q4 - API Performance',
    status: 'active',
    taskIds: ['1752274500-task-optimizar-endpoint-search', '1752360900-task-anadir-cache-a-redis'],
    childCycleIds: ['1754500000-cycle-phase-1-optimization'],
    tags: ['roadmap:q4', 'team:backend'],
    notes: 'Objetivo: Reducir la latencia p95 de la API por debajo de 200ms.'
  };

  const invalidCyclePayloadWithoutId = {
    title: 'Cycle without ID',
    status: 'active',
    taskIds: ['1752274500-task-test'],
    tags: ['test']
  };

  describe('validateFullCycleRecord', () => {
    const mockGetActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

    const validRecord: GitGovRecord & { payload: CycleRecord } = {
      header: {
        version: '1.0',
        type: 'cycle',
        payloadChecksum: 'mock-checksum',
        signatures: [{
          keyId: 'human:product-manager',
          role: 'author',
          signature: 'mock-signature',
          timestamp: 1754400000,
          timestamp_iso: '2025-08-12T12:00:00Z'
        }]
      },
      payload: validCyclePayload
    };

    beforeEach(() => {
      mockGetActorPublicKey.mockClear();
    });

    it('[EARS-1] should throw SchemaValidationError for invalid payload', async () => {
      const invalidRecord = {
        ...validRecord,
        payload: invalidCyclePayloadWithoutId as CycleRecord
      };

      await expect(validateFullCycleRecord(invalidRecord, mockGetActorPublicKey))
        .rejects.toThrow('CycleRecord payload failed schema validation');
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      // Mock embedded metadata validator to fail
      jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockRejectedValue(new Error('Embedded metadata validation failed'));

      const recordWithWrongChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: 'wrong-checksum'
        }
      };

      await expect(validateFullCycleRecord(recordWithWrongChecksum, mockGetActorPublicKey))
        .rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      // Mock embedded metadata validator to succeed
      const mockValidateEmbedded = jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockResolvedValue(undefined);

      await validateFullCycleRecord(validRecord, mockGetActorPublicKey);

      expect(mockValidateEmbedded).toHaveBeenCalledWith(validRecord, mockGetActorPublicKey);
    });

    it('[EARS-4] should complete without errors for a fully valid record', async () => {
      // Calculate correct checksum and mock valid signature
      const { calculatePayloadChecksum } = require('../crypto/checksum');
      const actualChecksum = calculatePayloadChecksum(validRecord.payload);

      const recordWithCorrectChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: actualChecksum
        }
      };

      // Mock signature verification to return true
      jest.spyOn(require('../crypto/signatures'), 'verifySignatures')
        .mockResolvedValue(true);

      await expect(validateFullCycleRecord(recordWithCorrectChecksum, mockGetActorPublicKey))
        .resolves.not.toThrow();
    });
  });

  describe('isCycleRecord', () => {
    it('[EARS-5 & EARS-6] should correctly identify valid and invalid records', () => {
      expect(isCycleRecord(validCyclePayload)).toBe(true);
      expect(isCycleRecord(invalidCyclePayloadWithoutId)).toBe(false);
    });

    it('[EARS-7] should return false for non-object input', () => {
      expect(isCycleRecord(null)).toBe(false);
      expect(isCycleRecord(undefined)).toBe(false);
      expect(isCycleRecord('string')).toBe(false);
      expect(isCycleRecord(123)).toBe(false);
    });

    it('[EARS-8] should validate ID format (timestamp-cycle-slug)', () => {
      const cycleWithInvalidId = {
        ...validCyclePayload,
        id: 'invalid-id-format'
      };
      expect(isCycleRecord(cycleWithInvalidId)).toBe(false);
    });

    it('[EARS-9] should validate status enum values', () => {
      const cycleWithInvalidStatus = {
        ...validCyclePayload,
        status: 'invalid-status'
      };
      expect(isCycleRecord(cycleWithInvalidStatus)).toBe(false);
    });

    it('[EARS-10] should validate taskIds format when provided', () => {
      const cycleWithInvalidTaskIds = {
        ...validCyclePayload,
        taskIds: ['invalid-task-id', '1752274500-task-valid']
      };
      expect(isCycleRecord(cycleWithInvalidTaskIds)).toBe(false);
    });

    it('[EARS-11] should validate childCycleIds format when provided', () => {
      const cycleWithInvalidChildCycleIds = {
        ...validCyclePayload,
        childCycleIds: ['invalid-cycle-id', '1754500000-cycle-valid']
      };
      expect(isCycleRecord(cycleWithInvalidChildCycleIds)).toBe(false);
    });
  });

  describe('validateCycleRecordDetailed', () => {
    it('[EARS-12] should return success for valid CycleRecord', () => {
      const result = validateCycleRecordDetailed(validCyclePayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-13] should return detailed errors for invalid CycleRecord', () => {
      const result = validateCycleRecordDetailed(invalidCyclePayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-14] should provide specific error details for each invalid field', () => {
      const invalidCycle = {
        id: 'invalid-format', // Wrong ID pattern
        title: '', // Empty string
        status: 'invalid-status', // Invalid status
        taskIds: ['invalid-task-id'], // Invalid task ID format
        childCycleIds: ['invalid-cycle-id'], // Invalid cycle ID format
        tags: 'not-an-array' // Should be array
      };

      const result = validateCycleRecordDetailed(invalidCycle);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Multiple errors
    });

    it('[EARS-15] should validate optional fields when provided', () => {
      const cycleWithOptionalFields: CycleRecord = {
        ...validCyclePayload,
        taskIds: ['1752274500-task-optimizar-endpoint-search'],
        childCycleIds: ['1754500000-cycle-phase-1'],
        tags: ['roadmap:q4', 'team:backend'],
        notes: 'This cycle focuses on API performance improvements for Q4 objectives'
      };

      const result = validateCycleRecordDetailed(cycleWithOptionalFields);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return multiple errors for multiple invalid fields', () => {
      const cycleWithMultipleInvalidFields = {
        ...validCyclePayload,
        id: 'invalid-id-format',
        status: 'invalid-status',
        taskIds: ['invalid-task-id', '1752274500-task-valid'],
        childCycleIds: ['invalid-cycle-id', '1754500000-cycle-valid'],
        tags: ['valid-tag', 'INVALID TAG WITH SPACES']
      };

      const result = validateCycleRecordDetailed(cycleWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Multiple errors
      expect(result.errors.some(err => err.field.includes('id'))).toBe(true);
      expect(result.errors.some(err => err.field.includes('status'))).toBe(true);
      expect(result.errors.some(err => err.field.includes('taskIds') || err.field.includes('childCycleIds') || err.field.includes('tags'))).toBe(true);
    });
  });
});

