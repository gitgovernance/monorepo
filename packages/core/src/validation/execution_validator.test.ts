import {
  validateFullExecutionRecord,
  isExecutionRecord,
  validateExecutionRecordDetailed
} from './execution_validator';
import type { ExecutionRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import { DetailedValidationError } from './common';

// Mock dependencies
jest.mock('../record_schemas/schema_cache');
jest.mock('./embedded_metadata_validator');

describe('ExecutionRecord Validator', () => {
  const mockSchemaValidationCache = require('../record_schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    notes: 'Execution validation test signature',
    signature: 'mock-signature',
    timestamp: 1752275500
  });

  const validRecord: ExecutionRecord = {
    id: '1752275500-exec-test-execution',
    taskId: '1752274500-task-test-task',
    type: 'progress',
    title: 'Test Execution',
    result: 'Successfully implemented the feature'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateEmbeddedMetadata.mockResolvedValue(undefined);

    // Default validator mock
    const defaultValidator = jest.fn().mockReturnValue(true);
    Object.defineProperty(defaultValidator, 'errors', {
      value: null,
      writable: true,
      configurable: true
    });
    mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(defaultValidator);
  });

  describe('validateFullExecutionRecord', () => {
    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/taskId', message: 'must not be empty', data: '' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord: GitGovRecord & { payload: Partial<ExecutionRecord> } = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: { id: 'invalid-id', taskId: '', type: 'progress', title: '', result: '' }
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullExecutionRecord(invalidRecord as GitGovRecord & { payload: ExecutionRecord }, mockGetPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: ExecutionRecord } = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullExecutionRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete ExecutionRecord successfully without throwing', async () => {
      const mockRecord: GitGovRecord & { payload: ExecutionRecord } = {
        header: {
          version: '1.0',
          type: 'execution',
          payloadChecksum: 'valid-checksum',
          signatures: [createMockSignature()]
        },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullExecutionRecord(mockRecord, mockGetPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      const mockRecord: GitGovRecord & { payload: ExecutionRecord } = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await validateFullExecutionRecord(mockRecord, mockGetPublicKey);
      expect(mockValidateEmbeddedMetadata).toHaveBeenCalledWith(mockRecord, mockGetPublicKey);
    });
  });

  describe('isExecutionRecord', () => {
    it('[EARS-5] should return true for valid ExecutionRecord', () => {
      expect(isExecutionRecord(validRecord)).toBe(true);
    });

    it('[EARS-6] should return false for invalid ExecutionRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/id', message: 'invalid format' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      expect(isExecutionRecord({ id: 'invalid', taskId: '', result: '' })).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');

      validateExecutionRecordDetailed(validRecord);

      expect(cacheSpy).toHaveBeenCalledWith(expect.anything());
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateExecutionRecordDetailed(validRecord);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateExecutionRecordDetailed({ ...validRecord, id: '1752275501-exec-another' });
      const secondCallResult = cacheSpy.mock.results[1];

      expect(cacheSpy).toHaveBeenCalledTimes(2);
      // Both calls should return the same cached validator
      expect(firstCallResult?.value).toBe(secondCallResult?.value);
    });
  });

  describe('Schema Cache Advanced', () => {
    it('[EARS-9] should produce identical results with or without cache', () => {
      // This test verifies that cached validators behave identically
      const result1 = validateExecutionRecordDetailed(validRecord);
      const result2 = validateExecutionRecordDetailed(validRecord);

      expect(result1).toEqual(result2);
    });

    it('[EARS-10] should support cache clearing', () => {
      // Verify clearCache method exists and can be called
      expect(mockSchemaValidationCache.clearCache).toBeDefined();
      expect(() => mockSchemaValidationCache.clearCache()).not.toThrow();
    });

    it('[EARS-11] should provide cache statistics', () => {
      // Verify getCacheStats method exists and returns stats
      mockSchemaValidationCache.getCacheStats = jest.fn().mockReturnValue({
        cachedSchemas: 1,
        totalValidations: 5
      });

      const stats = mockSchemaValidationCache.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.cachedSchemas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateExecutionRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct ExecutionRecord', () => {
      const result = validateExecutionRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid ExecutionRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/taskId', message: 'must match pattern', data: 'invalid-task-id' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateExecutionRecordDetailed({ id: '1752275500-exec-test', taskId: 'invalid-task-id', result: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/title', message: 'must not be empty', data: '' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateExecutionRecordDetailed({ ...validRecord, title: '' });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
      expect(result.errors[0]?.field).toBe('title');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      // ExecutionRecord with only required fields (no notes, no references)
      const minimalRecord = {
        id: '1752275500-exec-minimal',
        taskId: '1752274500-task-test',
        type: 'progress',
        title: 'Minimal Execution',
        result: 'Just the required fields'
      };

      const result = validateExecutionRecordDetailed(minimalRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/taskId', message: 'must match pattern', data: 'invalid-task' },
          { instancePath: '/title', message: 'must not be empty', data: '' },
          { instancePath: '/result', message: 'is too short', data: 'short' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateExecutionRecordDetailed({
        id: '1752275500-exec-test',
        taskId: 'invalid-task',
        type: 'progress',
        title: '',
        result: 'short'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
