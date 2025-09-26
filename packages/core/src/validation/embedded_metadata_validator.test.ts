import {
  validateFullEmbeddedMetadataRecord,
  isEmbeddedMetadataRecord,
  validateEmbeddedMetadataDetailed,
  validateEmbeddedMetadataBusinessRules
} from './embedded_metadata_validator';
import type { EmbeddedMetadataRecord } from '../types/embedded.types';
import type { TaskRecord } from '../types';
import type { Signature } from '../types/embedded.types';
import { DetailedValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';

// Mock dependencies
jest.mock('../schemas/schema_cache');
jest.mock('../crypto/checksum');
jest.mock('../crypto/signatures');
jest.mock('../config_manager');

describe('EmbeddedMetadata Validator', () => {
  const mockSchemaValidationCache = require('../schemas/schema_cache').SchemaValidationCache;
  const mockCalculatePayloadChecksum = require('../crypto/checksum').calculatePayloadChecksum;
  const mockVerifySignatures = require('../crypto/signatures').verifySignatures;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    signature: 'mock-signature',
    timestamp: 1752707800,
    timestamp_iso: '2025-07-30T15:16:40Z'
  });

  const validTaskPayload: TaskRecord = {
    id: '1752707800-task-test',
    title: 'Test Task',
    status: 'ready',
    priority: 'high',
    description: 'Test task',
    tags: ['test']
  };

  const validEmbeddedRecord: EmbeddedMetadataRecord<TaskRecord> = {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
      signatures: [createMockSignature()]
    },
    payload: validTaskPayload
  };

  beforeEach(() => {
    // Setup default mocks
    const defaultValidator = jest.fn().mockReturnValue(true);
    Object.defineProperty(defaultValidator, 'errors', {
      value: null,
      writable: true,
      configurable: true
    });
    mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(defaultValidator);
    mockCalculatePayloadChecksum.mockReturnValue('a1b2c3d4e5f67890123456789012345678901234567890123456789012345678');
    mockVerifySignatures.mockResolvedValue(true);
    // ConfigManager is not used directly in embedded_metadata_validator
    // getActorPublicKey is passed as parameter to validateFullEmbeddedMetadataRecord
  });

  describe('validateFullEmbeddedMetadataRecord', () => {
    it('[EARS-1] should validate a complete EmbeddedMetadata record successfully', async () => {
      const getActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

      await expect(validateFullEmbeddedMetadataRecord(validEmbeddedRecord, getActorPublicKey))
        .resolves.not.toThrow();
    });

    it('[EARS-2] should throw DetailedValidationError for invalid schema', async () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/header/type', message: 'must be one of actor, task, execution, changelog, feedback, cycle, custom', data: 'invalid-type' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const invalidRecord = { ...validEmbeddedRecord };
      invalidRecord.header.type = 'invalid-type' as any;

      const getActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

      await expect(validateFullEmbeddedMetadataRecord(invalidRecord, getActorPublicKey))
        .rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-3] should throw ChecksumMismatchError for mismatched checksum', async () => {
      mockCalculatePayloadChecksum.mockReturnValue('different-checksum');

      const getActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

      await expect(validateFullEmbeddedMetadataRecord(validEmbeddedRecord, getActorPublicKey))
        .rejects.toThrow(ChecksumMismatchError);
    });

    it('[EARS-4] should throw SignatureVerificationError for invalid signatures', async () => {
      mockVerifySignatures.mockResolvedValue(false);

      const getActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

      await expect(validateFullEmbeddedMetadataRecord(validEmbeddedRecord, getActorPublicKey))
        .rejects.toThrow(SignatureVerificationError);
    });
  });

  describe('isEmbeddedMetadataRecord', () => {
    it('[EARS-5] should return true for valid EmbeddedMetadata record', () => {
      expect(isEmbeddedMetadataRecord(validEmbeddedRecord)).toBe(true);
    });

    it('[EARS-6] should return false for invalid EmbeddedMetadata record', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [{ instancePath: '/header/version', message: 'invalid format' }],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      expect(isEmbeddedMetadataRecord({ invalid: 'data' })).toBe(false);
    });
  });

  describe('validateEmbeddedMetadataDetailed', () => {
    it('[EARS-7] should return valid result for correct EmbeddedMetadata record', () => {
      const result = validateEmbeddedMetadataDetailed(validEmbeddedRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-8] should return detailed errors for invalid EmbeddedMetadata record', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/header/type', message: 'must be one of allowed values', data: 'invalid-type' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateEmbeddedMetadataDetailed({ header: { type: 'invalid-type' } });
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('/header/type');
    });
  });

  describe('EmbeddedMetadata Enhanced Validation (EARS 24-29)', () => {
    describe('[EARS-24] header.type validation', () => {
      it('should reject invalid header.type values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/header/type', message: 'must be one of actor, task, execution, changelog, feedback, cycle, custom', data: 'invalid-type' }],
          writable: true,
          configurable: true
        });
        mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

        const result = validateEmbeddedMetadataDetailed({
          header: {
            version: '1.0',
            type: 'invalid-type',
            payloadChecksum: 'valid-checksum',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field.includes('/header/type'))).toBe(true);
      });

      it('should accept valid header.type values', () => {
        const validTypes = ['actor', 'task', 'execution', 'changelog', 'feedback', 'cycle', 'custom'];

        validTypes.forEach(type => {
          const record = {
            header: {
              version: '1.0',
              type,
              payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
              signatures: [createMockSignature()]
            },
            payload: validTaskPayload
          };

          const result = validateEmbeddedMetadataDetailed(record);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('[EARS-25] custom type requirements', () => {
      it('should require schemaUrl for header.type custom', () => {
        const customRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'custom',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
            // Missing schemaUrl and schemaChecksum
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(customRecord);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'header.schemaUrl')).toBe(true);
        expect(result.errors.some(e => e.field === 'header.schemaChecksum')).toBe(true);
      });

      it('should accept custom type with schemaUrl and schemaChecksum', () => {
        const customRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'custom',
            schemaUrl: 'https://example.com/schema.json',
            schemaChecksum: 'b2c3d4e5f67890123456789012345678901234567890123456789012345678ab',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(customRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-26] payloadChecksum format validation', () => {
      it('should reject invalid payloadChecksum format', () => {
        const invalidRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'invalid-checksum', // Not SHA-256 format
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(invalidRecord);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'header.payloadChecksum')).toBe(true);
      });

      it('should accept valid SHA-256 payloadChecksum', () => {
        const validRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(validRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-27] signatures validation', () => {
      it('should reject empty signatures array', () => {
        const invalidRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [] as any // Empty signatures
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(invalidRecord);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'header.signatures')).toBe(true);
      });

      it('should accept valid signatures array', () => {
        const validRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(validRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-28] audit field validation', () => {
      it('should reject audit field that is too long', () => {
        const invalidRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()],
            audit: 'x'.repeat(3001) // Too long
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(invalidRecord);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'header.audit')).toBe(true);
      });

      it('should accept valid audit field', () => {
        const validRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'task',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()],
            audit: 'Valid audit message'
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(validRecord);
        expect(result.isValid).toBe(true);
      });
    });

    describe('[EARS-29] schemaChecksum format validation', () => {
      it('should reject invalid schemaChecksum format', () => {
        const invalidRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'custom',
            schemaUrl: 'https://example.com/schema.json',
            schemaChecksum: 'invalid-checksum', // Not SHA-256 format
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(invalidRecord);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'header.schemaChecksum')).toBe(true);
      });

      it('should accept valid SHA-256 schemaChecksum', () => {
        const validRecord: EmbeddedMetadataRecord<TaskRecord> = {
          header: {
            version: '1.0',
            type: 'custom',
            schemaUrl: 'https://example.com/schema.json',
            schemaChecksum: 'b2c3d4e5f67890123456789012345678901234567890123456789012345678ab',
            payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            signatures: [createMockSignature()]
          },
          payload: validTaskPayload
        };

        const result = validateEmbeddedMetadataBusinessRules(validRecord);
        expect(result.isValid).toBe(true);
      });
    });
  });
});
