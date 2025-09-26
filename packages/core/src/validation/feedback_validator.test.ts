import {
  validateFullFeedbackRecord,
  isFeedbackRecord,
  validateFeedbackRecordDetailed
} from './feedback_validator';
import type { FeedbackRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import { DetailedValidationError } from './common';

// Mock dependencies
jest.mock('../schemas/schema_cache');
jest.mock('./embedded_metadata_validator');
jest.mock('../config_manager');

describe('FeedbackRecord Validator', () => {
  const mockSchemaValidationCache = require('../schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;
  const mockConfigManager = require('../config_manager').ConfigManager;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    signature: 'mock-signature',
    timestamp: 1752788100,
    timestamp_iso: '2025-07-31T10:15:00Z'
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
    mockConfigManager.findProjectRoot.mockReturnValue('/test/project');
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

  describe('validateFullFeedbackRecord', () => {
    it('[EARS-1] should validate a complete FeedbackRecord successfully', async () => {
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

    it('[EARS-2] should throw DetailedValidationError for invalid payload schema', async () => {
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

    it('[EARS-3] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: FeedbackRecord } = {
        header: { version: '1.0', type: 'feedback', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullFeedbackRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
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

  describe('validateFeedbackRecordDetailed', () => {
    it('[EARS-7] should return valid result for correct FeedbackRecord', () => {
      const result = validateFeedbackRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-8] should return detailed errors for invalid FeedbackRecord', () => {
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
  });
});

