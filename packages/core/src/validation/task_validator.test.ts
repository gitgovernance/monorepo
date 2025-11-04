import {
  isTaskRecord,
  validateTaskRecordDetailed,
  validateFullTaskRecord
} from './task_validator';
import type { TaskRecord } from '../types';
import type { GitGovRecord } from '../types';
import { DetailedValidationError } from './common';

describe('TaskValidator Module', () => {
  const validTaskPayload: TaskRecord = {
    id: '1752274500-task-implement-auth',
    title: 'Implement user authentication',
    status: 'draft',
    priority: 'high',
    description: 'Create a complete user authentication system with JWT tokens and secure session management',
    tags: ['skill:typescript', 'area:backend', 'category:feature']
  };

  const invalidTaskPayloadWithoutId = {
    title: 'Task without ID',
    status: 'draft',
    priority: 'high',
    description: 'This task is missing a required ID field',
    tags: ['test']
  };

  describe('validateFullTaskRecord', () => {
    const mockGetActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

    const validRecord: GitGovRecord & { payload: TaskRecord } = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'mock-checksum',
        signatures: [{
          keyId: 'human:test-user',
          role: 'author',
          notes: 'Task validation test record',
          signature: 'mock-signature',
          timestamp: 1752274500
        }]
      },
      payload: validTaskPayload
    };

    beforeEach(() => {
      mockGetActorPublicKey.mockClear();
    });

    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidRecord = {
        ...validRecord,
        payload: invalidTaskPayloadWithoutId as TaskRecord
      };

      await expect(validateFullTaskRecord(invalidRecord, mockGetActorPublicKey))
        .rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      // Mock embedded metadata validator to throw error
      const embeddedError = new Error('Embedded metadata validation failed');
      jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockRejectedValue(embeddedError);

      const recordWithWrongChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: 'wrong-checksum'
        }
      };

      await expect(validateFullTaskRecord(recordWithWrongChecksum, mockGetActorPublicKey))
        .rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete TaskRecord successfully without throwing', async () => {
      // Mock embedded metadata validator to succeed
      jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockResolvedValue(undefined);

      const recordWithCorrectChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: 'valid-checksum'
        }
      };

      await expect(validateFullTaskRecord(recordWithCorrectChecksum, mockGetActorPublicKey))
        .resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      // Mock embedded metadata validator to succeed
      const { validateFullEmbeddedMetadataRecord } = require('./embedded_metadata_validator');
      jest.spyOn(require('./embedded_metadata_validator'), 'validateFullEmbeddedMetadataRecord')
        .mockResolvedValue(undefined);

      const recordWithCorrectChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: 'valid-checksum'
        }
      };

      await validateFullTaskRecord(recordWithCorrectChecksum, mockGetActorPublicKey);

      expect(validateFullEmbeddedMetadataRecord).toHaveBeenCalledWith(recordWithCorrectChecksum, mockGetActorPublicKey);
    });
  });

  describe('isTaskRecord', () => {
    it('[EARS-5] should return true for valid TaskRecord', () => {
      expect(isTaskRecord(validTaskPayload)).toBe(true);
    });

    it('[EARS-6] should return false for invalid TaskRecord', () => {
      expect(isTaskRecord(invalidTaskPayloadWithoutId)).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      validateTaskRecordDetailed(validTaskPayload);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateTaskRecordDetailed(validTaskPayload);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateTaskRecordDetailed({ ...validTaskPayload, id: '1752275501-task-another' });
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
      const result1 = validateTaskRecordDetailed(validTaskPayload);
      const result2 = validateTaskRecordDetailed(validTaskPayload);

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

  describe('validateTaskRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct TaskRecord', () => {
      const result = validateTaskRecordDetailed(validTaskPayload);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid TaskRecord', () => {
      const result = validateTaskRecordDetailed(invalidTaskPayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const result = validateTaskRecordDetailed(invalidTaskPayloadWithoutId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      const taskWithOptionalFields: TaskRecord = {
        ...validTaskPayload,
        cycleIds: ['1752274500-cycle-sprint-1'],
        references: ['file:src/auth.ts', 'url:https://jwt.io'],
        notes: 'Important security considerations for this task'
      };

      const result = validateTaskRecordDetailed(taskWithOptionalFields);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const taskWithMultipleInvalidFields = {
        ...validTaskPayload,
        id: 'invalid-id-format',
        title: '',
        description: 'x'
      };

      const result = validateTaskRecordDetailed(taskWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
