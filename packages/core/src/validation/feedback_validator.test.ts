import {
  validateFullFeedbackRecord,
  isFeedbackRecord,
  validateFeedbackRecordDetailed
} from './feedback_validator';
import type { FeedbackRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import { DetailedValidationError } from './common';

// Mock dependencies
jest.mock('../record_schemas/schema_cache');
jest.mock('./embedded_metadata_validator');

describe('FeedbackRecord Validator', () => {
  const mockSchemaValidationCache = require('../record_schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    notes: 'Feedback validation test signature',
    signature: 'mock-signature',
    timestamp: 1752788100
  });

  const validRecord: FeedbackRecord = {
    id: '1752788100-feedback-blocking-issue',
    entityType: 'task',
    entityId: '1752274500-task-test-task',
    type: 'blocking',
    status: 'open',
    content: 'This task has a blocking issue that needs resolution before proceeding'
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
    mockSchemaValidationCache.clearCache = jest.fn();
    mockSchemaValidationCache.getCacheStats = jest.fn().mockReturnValue({
      cachedSchemas: 1,
      totalValidations: 10,
      cacheHits: 9,
      cacheMisses: 1
    });
  });

  describe('validateFullFeedbackRecord', () => {
    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/entityType', message: 'must be one of allowed values', data: 'invalid' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord: GitGovRecord & { payload: Partial<FeedbackRecord> } = {
        header: { version: '1.0', type: 'feedback', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: { id: 'invalid-id', entityType: 'invalid' as any, entityId: '', type: 'invalid' as any, status: 'invalid' as any, content: '' }
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullFeedbackRecord(invalidRecord as GitGovRecord & { payload: FeedbackRecord }, mockGetPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: FeedbackRecord } = {
        header: { version: '1.0', type: 'feedback', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullFeedbackRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete FeedbackRecord successfully without throwing', async () => {
      const mockRecord: GitGovRecord & { payload: FeedbackRecord } = {
        header: {
          version: '1.0',
          type: 'feedback',
          payloadChecksum: 'valid-checksum',
          signatures: [createMockSignature()]
        },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullFeedbackRecord(mockRecord, mockGetPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      const mockRecord: GitGovRecord & { payload: FeedbackRecord } = {
        header: { version: '1.0', type: 'feedback', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await validateFullFeedbackRecord(mockRecord, mockGetPublicKey);
      expect(mockValidateEmbeddedMetadata).toHaveBeenCalledWith(mockRecord, mockGetPublicKey);
    });
  });

  describe('isFeedbackRecord', () => {
    it('[EARS-5] should return true for valid FeedbackRecord', () => {
      expect(isFeedbackRecord(validRecord)).toBe(true);
    });

    it('[EARS-6] should return false for invalid FeedbackRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/id', message: 'invalid format' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      expect(isFeedbackRecord({ id: 'invalid', entityType: 'invalid', entityId: '', type: 'invalid', status: 'invalid', content: '' })).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');
      validateFeedbackRecordDetailed(validRecord);
      expect(cacheSpy).toHaveBeenCalledWith(expect.anything());
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');
      validateFeedbackRecordDetailed(validRecord);
      validateFeedbackRecordDetailed(validRecord);
      expect(cacheSpy).toHaveBeenCalledTimes(2);
      expect(cacheSpy).toHaveBeenCalledWith(expect.anything());
    });

    it('[EARS-9] should produce identical results with or without cache', () => {
      const result1 = validateFeedbackRecordDetailed(validRecord);
      const result2 = validateFeedbackRecordDetailed(validRecord);
      expect(result1).toEqual(result2);
    });

    it('[EARS-10] should support cache clearing', () => {
      expect(() => mockSchemaValidationCache.clearCache()).not.toThrow();
    });

    it('[EARS-11] should provide cache statistics', () => {
      const stats = mockSchemaValidationCache.getCacheStats();
      expect(stats).toBeDefined();
    });
  });

  describe('validateFeedbackRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct FeedbackRecord', () => {
      const result = validateFeedbackRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid FeedbackRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/entityType', message: 'must be one of allowed values', data: 'invalid-type' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateFeedbackRecordDetailed({
        id: '1752788100-feedback-test',
        entityType: 'invalid-type',
        entityId: 'task-1',
        type: 'question',
        status: 'open',
        content: 'content'
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/entityType', message: 'must be one of allowed values', data: 'invalid-type', params: {} }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateFeedbackRecordDetailed({
        id: '1752788100-feedback-test',
        entityType: 'invalid-type',
        entityId: 'task-1',
        type: 'question',
        status: 'open',
        content: 'content'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      const minimalRecord: FeedbackRecord = {
        id: '1752788100-feedback-minimal',
        entityType: 'task',
        entityId: '1752274500-task-test',
        type: 'blocking',
        status: 'open',
        content: 'Minimal feedback content'
      };

      const result = validateFeedbackRecordDetailed(minimalRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/entityType', message: 'must be one of allowed values', data: 'invalid-type', params: {} },
          { instancePath: '/type', message: 'must be one of allowed values', data: 'invalid-feedback-type', params: {} },
          { instancePath: '/status', message: 'must be one of allowed values', data: 'invalid-status', params: {} }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateFeedbackRecordDetailed({
        id: '1752788100-feedback-test',
        entityType: 'invalid-type',
        entityId: 'task-1',
        type: 'invalid-feedback-type',
        status: 'invalid-status',
        content: 'content'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

