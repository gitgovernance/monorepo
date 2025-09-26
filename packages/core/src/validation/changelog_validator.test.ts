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
jest.mock('../config_manager');

describe('ChangelogRecord Validator', () => {
  const mockSchemaValidationCache = require('../schemas/schema_cache').SchemaValidationCache;
  const mockValidateEmbeddedMetadata = require('./embedded_metadata_validator').validateFullEmbeddedMetadataRecord;
  const mockConfigManager = require('../config_manager').ConfigManager;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    signature: 'mock-signature',
    timestamp: 1752707800,
    timestamp_iso: '2025-07-30T15:16:40Z'
  });

  const validRecord: ChangelogRecord = {
    id: '1752707800-changelog-task-test-task',
    entityType: 'task',
    entityId: '1752274500-task-test-task',
    changeType: 'completion',
    title: 'Test Task Completion',
    description: 'Successfully completed the test task with all requirements',
    timestamp: 1752707800,
    trigger: 'manual',
    triggeredBy: 'human:developer',
    reason: 'All acceptance criteria met and code review passed',
    riskLevel: 'low'
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

  describe('validateFullChangelogRecord', () => {
    it('[EARS-1] should validate a complete ChangelogRecord successfully', async () => {
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

    it('[EARS-2] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/changeType', message: 'must be one of creation, completion, update, deletion, hotfix', data: 'invalid-type' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord: GitGovRecord & { payload: Partial<ChangelogRecord> } = {
        header: { version: '1.0', type: 'changelog', payloadChecksum: 'valid-checksum', signatures: [createMockSignature()] },
        payload: { id: 'invalid-id', entityType: 'task', entityId: '', changeType: 'invalid-type' as any, title: '', description: '', timestamp: 0, trigger: 'manual', triggeredBy: '', reason: '', riskLevel: 'low' }
      };

      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullChangelogRecord(invalidRecord as GitGovRecord & { payload: ChangelogRecord }, mockGetPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-3] should throw error if embedded metadata validation fails', async () => {
      const mockRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: { version: '1.0', type: 'changelog', payloadChecksum: 'wrong-checksum', signatures: [createMockSignature()] },
        payload: validRecord
      };

      const embeddedError = new Error('Embedded metadata validation failed');
      mockValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      const mockGetPublicKey = jest.fn().mockResolvedValue('mock-public-key');
      await expect(validateFullChangelogRecord(mockRecord, mockGetPublicKey)).rejects.toThrow('Embedded metadata validation failed');
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

      expect(isChangelogRecord({ id: 'invalid', entityType: 'task', entityId: '', changeType: 'invalid', title: '', description: '', timestamp: 0, trigger: 'manual', triggeredBy: '', reason: '', riskLevel: 'low' })).toBe(false);
    });
  });

  describe('validateChangelogRecordDetailed', () => {
    it('[EARS-7] should return valid result for correct ChangelogRecord', () => {
      const result = validateChangelogRecordDetailed(validRecord);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-8] should return detailed errors for invalid ChangelogRecord', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/entityId', message: 'must match pattern', data: 'invalid-entity-id' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateChangelogRecordDetailed({ id: '1752707800-changelog-test', entityType: 'task', entityId: 'invalid-entity-id', changeType: 'completion', title: 'Test', description: 'desc', timestamp: 1752707800, trigger: 'manual', triggeredBy: 'human:test', reason: 'test', riskLevel: 'low' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('ChangelogRecord Enhanced Validation (EARS 17-25)', () => {
    describe('[EARS-17] entityType validation', () => {
      it('should reject invalid entityType values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/entityType', message: 'must be one of task, cycle, agent, system, configuration', data: 'invalid-entity' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, entityType: 'invalid-entity' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'entityType',
          message: 'must be one of task, cycle, agent, system, configuration',
          value: 'invalid-entity'
        }]);
      });

      it('should accept valid entityType values', () => {
        const validEntityTypes = ['task', 'cycle', 'agent', 'system', 'configuration'];

        validEntityTypes.forEach(entityType => {
          const testRecord = { ...validRecord, entityType };
          const result = validateChangelogRecordDetailed(testRecord);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('[EARS-18] changeType validation', () => {
      it('should reject invalid changeType values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/changeType', message: 'must be one of creation, completion, update, deletion, hotfix', data: 'invalid-change' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, changeType: 'invalid-change' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'changeType',
          message: 'must be one of creation, completion, update, deletion, hotfix',
          value: 'invalid-change'
        }]);
      });

      it('should accept valid changeType values', () => {
        const validChangeTypes = ['creation', 'completion', 'update', 'deletion', 'hotfix'];

        validChangeTypes.forEach(changeType => {
          const testRecord = { ...validRecord, changeType };
          const result = validateChangelogRecordDetailed(testRecord);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('[EARS-19] trigger validation', () => {
      it('should reject invalid trigger values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/trigger', message: 'must be one of manual, automated, emergency', data: 'invalid-trigger' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, trigger: 'invalid-trigger' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'trigger',
          message: 'must be one of manual, automated, emergency',
          value: 'invalid-trigger'
        }]);
      });

      it('should accept valid trigger values', () => {
        const validTriggers = ['manual', 'automated', 'emergency'];

        validTriggers.forEach(trigger => {
          const testRecord = { ...validRecord, trigger };
          const result = validateChangelogRecordDetailed(testRecord);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('[EARS-20] riskLevel validation', () => {
      it('should reject invalid riskLevel values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/riskLevel', message: 'must be one of low, medium, high, critical', data: 'invalid-risk' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, riskLevel: 'invalid-risk' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'riskLevel',
          message: 'must be one of low, medium, high, critical',
          value: 'invalid-risk'
        }]);
      });

      it('should accept valid riskLevel values', () => {
        const validRiskLevels = ['low', 'medium', 'high', 'critical'];

        validRiskLevels.forEach(riskLevel => {
          const testRecord = { ...validRecord, riskLevel };
          const result = validateChangelogRecordDetailed(testRecord);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('[EARS-21] rollbackInstructions required for high risk', () => {
      it('should reject high riskLevel without rollbackInstructions', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '', message: 'rollbackInstructions is required when riskLevel is high', data: { riskLevel: 'high' } }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, riskLevel: 'high' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'root',
          message: 'rollbackInstructions is required when riskLevel is high',
          value: { riskLevel: 'high' }
        }]);
      });

      it('should accept high riskLevel with rollbackInstructions', () => {
        const testRecord = {
          ...validRecord,
          riskLevel: 'high',
          rollbackInstructions: 'Revert commit abc123 and restart service'
        };
        const result = validateChangelogRecordDetailed(testRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-22] rollbackInstructions required for critical risk', () => {
      it('should reject critical riskLevel without rollbackInstructions', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '', message: 'rollbackInstructions is required when riskLevel is critical', data: { riskLevel: 'critical' } }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, riskLevel: 'critical' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'root',
          message: 'rollbackInstructions is required when riskLevel is critical',
          value: { riskLevel: 'critical' }
        }]);
      });

      it('should accept critical riskLevel with rollbackInstructions', () => {
        const testRecord = {
          ...validRecord,
          riskLevel: 'critical',
          rollbackInstructions: 'Emergency rollback: stop all services, restore backup from 2025-01-15'
        };
        const result = validateChangelogRecordDetailed(testRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-23] usersAffected required for medium+ risk', () => {
      it('should reject medium riskLevel without usersAffected', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '', message: 'usersAffected is required when riskLevel is medium or higher', data: { riskLevel: 'medium' } }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, riskLevel: 'medium' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'root',
          message: 'usersAffected is required when riskLevel is medium or higher',
          value: { riskLevel: 'medium' }
        }]);
      });

      it('should accept medium riskLevel with usersAffected', () => {
        const testRecord = {
          ...validRecord,
          riskLevel: 'medium',
          usersAffected: ['team-frontend', 'team-backend']
        };
        const result = validateChangelogRecordDetailed(testRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-24] references.tasks required for completion changeType', () => {
      it('should reject completion changeType without references.tasks', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '', message: 'references.tasks is required when changeType is completion', data: { changeType: 'completion' } }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, changeType: 'completion' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'root',
          message: 'references.tasks is required when changeType is completion',
          value: { changeType: 'completion' }
        }]);
      });

      it('should accept completion changeType with references.tasks', () => {
        const testRecord = {
          ...validRecord,
          changeType: 'completion',
          references: {
            tasks: ['1752274500-task-implement-feature', '1752274600-task-write-tests']
          }
        };
        const result = validateChangelogRecordDetailed(testRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-25] timestamp format validation', () => {
      it('should reject invalid timestamp format', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/timestamp', message: 'must be Unix timestamp in seconds', data: 'invalid-timestamp' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, timestamp: 'invalid-timestamp' };
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'timestamp',
          message: 'must be Unix timestamp in seconds',
          value: 'invalid-timestamp'
        }]);
      });

      it('should accept valid Unix timestamp in seconds', () => {
        const validTimestamps = [
          1752707800,     // Valid second timestamp
          Math.floor(Date.now() / 1000),  // Current timestamp in seconds
          1640995200      // 2022-01-01 00:00:00 UTC in seconds
        ];

        validTimestamps.forEach(timestamp => {
          const testRecord = { ...validRecord, timestamp };
          const result = validateChangelogRecordDetailed(testRecord);
          expect(result.isValid).toBe(true);
        });
      });

      it('should reject invalid timestamp values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/timestamp', message: 'must be Unix timestamp in seconds', data: 1752707800 }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const invalidRecord = { ...validRecord, timestamp: 1752707800 }; // seconds, not milliseconds
        const result = validateChangelogRecordDetailed(invalidRecord);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual([{
          field: 'timestamp',
          message: 'must be Unix timestamp in seconds',
          value: 1752707800
        }]);
      });
    });
  });
});

