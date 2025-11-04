import {
  isCycleRecord,
  validateCycleRecordDetailed,
  validateFullCycleRecord
} from './cycle_validator';
import type { CycleRecord } from '../types';
import type { GitGovRecord } from '../types';
import { DetailedValidationError } from './common';

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
          notes: 'Cycle validation test record',
          signature: 'mock-signature',
          timestamp: 1754400000
        }]
      },
      payload: validCyclePayload
    };

    beforeEach(() => {
      mockGetActorPublicKey.mockClear();
    });

    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidRecord = {
        ...validRecord,
        payload: invalidCyclePayloadWithoutId as CycleRecord
      };

      await expect(validateFullCycleRecord(invalidRecord, mockGetActorPublicKey))
        .rejects.toThrow(DetailedValidationError);
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

    it('[EARS-3] should validate a complete CycleRecord successfully without throwing', async () => {
      // Mock embedded metadata validator to succeed
      jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockResolvedValue(undefined);

      await expect(validateFullCycleRecord(validRecord, mockGetActorPublicKey))
        .resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      // Mock embedded metadata validator to succeed
      const mockValidateEmbedded = jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockResolvedValue(undefined);

      await validateFullCycleRecord(validRecord, mockGetActorPublicKey);

      expect(mockValidateEmbedded).toHaveBeenCalledWith(validRecord, mockGetActorPublicKey);
    });
  });

  describe('isCycleRecord', () => {
    it('[EARS-5] should return true for valid CycleRecord', () => {
      expect(isCycleRecord(validCyclePayload)).toBe(true);
    });

    it('[EARS-6] should return false for invalid CycleRecord', () => {
      expect(isCycleRecord(invalidCyclePayloadWithoutId)).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      validateCycleRecordDetailed(validCyclePayload);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateCycleRecordDetailed(validCyclePayload);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateCycleRecordDetailed({ ...validCyclePayload, id: '1754500001-cycle-another' });
      const secondCallResult = cacheSpy.mock.results[1];

      expect(cacheSpy).toHaveBeenCalledTimes(2);
      // Both calls should return the same cached validator
      expect(firstCallResult?.value).toBe(secondCallResult?.value);
      cacheSpy.mockRestore();
    });
  });

  describe('Schema Cache Advanced', () => {
    it('[EARS-9] should produce identical results with or without cache', () => {
      // This test verifies that cached validators behave identically
      const result1 = validateCycleRecordDetailed(validCyclePayload);
      const result2 = validateCycleRecordDetailed(validCyclePayload);

      expect(result1).toEqual(result2);
    });

    it('[EARS-10] should support cache clearing', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      // Verify clearCache method exists and can be called
      expect(SchemaValidationCache.clearCache).toBeDefined();
      expect(() => SchemaValidationCache.clearCache()).not.toThrow();
    });

    it('[EARS-11] should provide cache statistics', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      // Verify getCacheStats method exists and returns stats
      const stats = SchemaValidationCache.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.cachedSchemas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateCycleRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct CycleRecord', () => {
      const result = validateCycleRecordDetailed(validCyclePayload);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid CycleRecord', () => {
      const result = validateCycleRecordDetailed(invalidCyclePayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const result = validateCycleRecordDetailed(invalidCyclePayloadWithoutId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
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

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const cycleWithMultipleInvalidFields = {
        ...validCyclePayload,
        id: 'invalid-id-format',
        title: '',
        status: 'invalid-status'
      };

      const result = validateCycleRecordDetailed(cycleWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

