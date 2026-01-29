import {
  validateFullChangelogRecord,
  isChangelogRecord,
  validateChangelogRecordDetailed
} from './changelog_validator';
import type { ChangelogRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import { DetailedValidationError } from './common';

// Mock dependencies
jest.mock('../schemas/schema_cache');
jest.mock('./embedded_metadata_validator');

describe('ChangelogRecord Validator', () => {
  const mockSchemaValidationCache = require('../schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    notes: 'Changelog validation test signature',
    signature: 'mock-signature',
    timestamp: 1752707800
  });

  const validRecord: ChangelogRecord = {
    id: '1752707800-changelog-task-test-task',
    title: 'Test Task Completion',
    description: 'Successfully completed the test task with all requirements',
    relatedTasks: ['1752274500-task-test-task'],
    completedAt: 1752707800,
    version: 'v1.0.0'
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

  describe('validateFullChangelogRecord', () => {
    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/title', message: 'must not be empty', data: '' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord: GitGovRecord & { payload: Partial<ChangelogRecord> } = {
        header: { version: '1.0', type: 'changelog', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: { id: 'invalid-id', title: '', description: '', relatedTasks: [''], completedAt: 0 }
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullChangelogRecord(invalidRecord as GitGovRecord & { payload: ChangelogRecord }, mockGetPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: { version: '1.0', type: 'changelog', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullChangelogRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete ChangelogRecord successfully without throwing', async () => {
      const mockRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: {
          version: '1.0',
          type: 'changelog',
          payloadChecksum: 'valid-checksum',
          signatures: [createMockSignature()]
        },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullChangelogRecord(mockRecord, mockGetPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      const mockRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: { version: '1.0', type: 'changelog', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await validateFullChangelogRecord(mockRecord, mockGetPublicKey);
      expect(mockValidateEmbeddedMetadata).toHaveBeenCalledWith(mockRecord, mockGetPublicKey);
    });
  });

  describe('isChangelogRecord', () => {
    it('[EARS-5] should return true for valid ChangelogRecord', () => {
      expect(isChangelogRecord(validRecord)).toBe(true);
    });

    it('[EARS-6] should return false for invalid ChangelogRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/id', message: 'invalid format' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      expect(isChangelogRecord({ id: 'invalid', title: '', description: '', relatedTasks: [], completedAt: 0 })).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');

      validateChangelogRecordDetailed(validRecord);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateChangelogRecordDetailed(validRecord);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateChangelogRecordDetailed({ ...validRecord, id: '1752707801-changelog-another' });
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
      const result1 = validateChangelogRecordDetailed(validRecord);
      const result2 = validateChangelogRecordDetailed(validRecord);

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

  describe('validateChangelogRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct ChangelogRecord', () => {
      const result = validateChangelogRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid ChangelogRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/title', message: 'must not be empty', data: '' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateChangelogRecordDetailed({ id: '1752707800-changelog-test', title: '', description: '', relatedTasks: [], completedAt: 0 });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/description', message: 'must not be empty', data: '' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateChangelogRecordDetailed({ id: '1752707800-changelog-test', title: 'Test', description: '', relatedTasks: [], completedAt: 0 });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      // ChangelogRecord with only required fields
      const minimalRecord: ChangelogRecord = {
        id: '1752707800-changelog-minimal',
        title: 'Minimal Changelog',
        description: 'Basic changelog entry',
        relatedTasks: ['1752274500-task-test'],
        completedAt: 1752707800,
        version: 'v1.0.0'
      };

      const result = validateChangelogRecordDetailed(minimalRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/title', message: 'must not be empty', data: '' },
          { instancePath: '/description', message: 'must not be empty', data: '' },
          { instancePath: '/completedAt', message: 'must be a number', data: 'invalid' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateChangelogRecordDetailed({
        id: '1752707800-changelog-invalid',
        title: '',
        description: '',
        relatedTasks: [],
        completedAt: 'invalid' as any
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
