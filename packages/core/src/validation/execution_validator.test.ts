import {
  validateFullExecutionRecord,
  isExecutionRecord,
  validateExecutionRecordDetailed
} from './execution_validator';
import type { ExecutionRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import { DetailedValidationError } from './common';

// Mock dependencies
jest.mock('../schemas/schema_cache');
jest.mock('./embedded_metadata_validator');
jest.mock('../config_manager');

describe('ExecutionRecord Validator', () => {
  const mockSchemaValidationCache = require('../schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;
  const mockConfigManager = require('../config_manager').ConfigManager;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    signature: 'mock-signature',
    timestamp: 1752275500,
    timestamp_iso: '2025-07-25T15:11:40Z'
  });

  const validRecord: ExecutionRecord = {
    id: '1752275500-exec-test-execution',
    taskId: '1752274500-task-test-task',
    result: 'Successfully implemented the feature'
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

  describe('validateFullExecutionRecord', () => {
    it('[EARS-1] should validate a complete ExecutionRecord successfully', async () => {
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

    it('[EARS-2] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/taskId', message: 'must not be empty', data: '' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord: GitGovRecord & { payload: Partial<ExecutionRecord> } = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: { id: 'invalid-id', taskId: '', result: '' }
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullExecutionRecord(invalidRecord as GitGovRecord & { payload: ExecutionRecord }, mockGetPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-3] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: ExecutionRecord } = {
        header: { version: '1.0', type: 'execution', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullExecutionRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
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

  describe('validateExecutionRecordDetailed', () => {
    it('[EARS-7] should return valid result for correct ExecutionRecord', () => {
      const result = validateExecutionRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-8] should return detailed errors for invalid ExecutionRecord', () => {
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
  });

  describe('ExecutionRecord Type Enum Validation', () => {
    describe('[EARS-26] type enum validation', () => {
      it('should accept all valid type values', () => {
        const validTypes = ['analysis', 'progress', 'blocker', 'completion', 'info', 'correction'];

        validTypes.forEach(type => {
          const testRecord = { ...validRecord, type };
          expect(isExecutionRecord(testRecord)).toBe(true);
        });
      });

      it('should reject invalid type values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/type', message: 'must be one of analysis, progress, blocker, completion, info, correction', data: 'invalid-type' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, type: 'invalid-type' };
        expect(isExecutionRecord(invalidRecord)).toBe(false);
      });

      it('should provide detailed error for invalid type enum', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/type', message: 'must be one of analysis, progress, blocker, completion, info, correction', data: 'wrong-type' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const result = validateExecutionRecordDetailed({ ...validRecord, type: 'wrong-type' });
        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'type',
          message: 'must be one of analysis, progress, blocker, completion, info, correction',
          value: 'wrong-type'
        }]);
      });

      it('should allow ExecutionRecord without type field (optional)', () => {
        const recordWithoutType = {
          id: validRecord.id,
          taskId: validRecord.taskId,
          result: validRecord.result
        };
        expect(isExecutionRecord(recordWithoutType)).toBe(true);
      });
    });
  });
});
