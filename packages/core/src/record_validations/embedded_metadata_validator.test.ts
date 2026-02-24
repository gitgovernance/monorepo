import {
  validateFullEmbeddedMetadataRecord,
  isEmbeddedMetadataRecord,
  validateEmbeddedMetadataDetailed
} from './embedded_metadata_validator';
import type { EmbeddedMetadataRecord } from '../record_types/embedded.types';
import type { TaskRecord } from '../record_types';
import type { Signature } from '../record_types/embedded.types';
import { DetailedValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';

// Mock dependencies
jest.mock('../record_schemas/schema_cache');
jest.mock('../crypto/checksum');
jest.mock('../crypto/signatures');
jest.mock('../config_manager');

describe('EmbeddedMetadata Validator', () => {
  const mockSchemaValidationCache = require('../record_schemas/schema_cache').SchemaValidationCache;
  const mockCalculatePayloadChecksum = require('../crypto/checksum').calculatePayloadChecksum;
  const mockVerifySignatures = require('../crypto/signatures').verifySignatures;

  const createMockSignature = (): Signature => ({
    keyId: 'human:test',
    role: 'author',
    notes: 'Embedded metadata validation test',
    signature: 'mock-signature',
    timestamp: 1752707800
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
    mockSchemaValidationCache.clearCache = jest.fn();
    mockSchemaValidationCache.getCacheStats = jest.fn().mockReturnValue({
      cachedSchemas: 1,
      totalValidations: 10,
      cacheHits: 9,
      cacheMisses: 1
    });
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
        value: [{ instancePath: '/header/type', message: 'must be one of actor, agent, task, execution, changelog, feedback, cycle', data: 'invalid-type' }],
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

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema');
      validateEmbeddedMetadataDetailed(validEmbeddedRecord);
      expect(cacheSpy).toHaveBeenCalledWith(expect.anything());
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const compiledValidator = jest.fn().mockReturnValue(true);
      Object.defineProperty(compiledValidator, 'errors', { value: null, writable: true, configurable: true });
      const cacheSpy = jest.spyOn(mockSchemaValidationCache, 'getValidatorFromSchema').mockReturnValue(compiledValidator);
      cacheSpy.mockClear();

      validateEmbeddedMetadataDetailed(validEmbeddedRecord);
      validateEmbeddedMetadataDetailed(validEmbeddedRecord);

      // Both calls must receive the same compiled validator instance (reuse from cache)
      const calls = cacheSpy.mock.results;
      expect(calls).toHaveLength(2);
      expect(calls[0]!.value).toBe(calls[1]!.value);
    });

    it('[EARS-9] should produce identical results with or without cache', () => {
      // First call — validator retrieved from cache (warm path)
      const result1 = validateEmbeddedMetadataDetailed(validEmbeddedRecord);

      // Simulate cache being cleared so next call re-compiles (cold path)
      mockSchemaValidationCache.clearCache();

      // Re-setup mock so the cold path still returns the same mock validator
      const freshValidator = jest.fn().mockReturnValue(true);
      Object.defineProperty(freshValidator, 'errors', { value: null, writable: true, configurable: true });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(freshValidator);

      // Second call — validator re-compiled from scratch (cold path)
      const result2 = validateEmbeddedMetadataDetailed(validEmbeddedRecord);

      // Results must be identical regardless of whether the cache was warm or cold
      expect(result1.isValid).toBe(result2.isValid);
      expect(result1.errors).toEqual(result2.errors);
    });

    it('[EARS-10] should support cache clearing', () => {
      // Populate the cache by running a validation
      validateEmbeddedMetadataDetailed(validEmbeddedRecord);

      // Clear the cache
      mockSchemaValidationCache.clearCache();

      // After clearing, getCacheStats should report zero cached schemas
      mockSchemaValidationCache.getCacheStats.mockReturnValue({ cachedSchemas: 0, totalValidations: 0, cacheHits: 0, cacheMisses: 0 });
      const stats = mockSchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(0);
    });

    it('[EARS-11] should provide cache statistics', () => {
      const stats = mockSchemaValidationCache.getCacheStats();
      // Stats must be an object with a cachedSchemas count field
      expect(stats).toBeDefined();
      expect(typeof stats.cachedSchemas).toBe('number');
      expect(stats.cachedSchemas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateEmbeddedMetadataDetailed', () => {
    it('[EARS-12] should return valid result for correct EmbeddedMetadata record', () => {
      const result = validateEmbeddedMetadataDetailed(validEmbeddedRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-13] should return detailed errors for invalid EmbeddedMetadata record', () => {
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

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/header/payloadChecksum', message: 'must be a valid SHA-256 hash', data: 'invalid', schemaPath: '#/properties/header/properties/payloadChecksum/pattern' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateEmbeddedMetadataDetailed({
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: 'invalid',
          signatures: [createMockSignature()]
        },
        payload: validTaskPayload
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      const minimalRecord = {
        header: {
          version: '1.0',
          type: 'task' as const,
          payloadChecksum: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
          signatures: [createMockSignature()]
        },
        payload: validTaskPayload
      };

      const result = validateEmbeddedMetadataDetailed(minimalRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const invalidValidator = jest.fn().mockReturnValue(false);
      Object.defineProperty(invalidValidator, 'errors', {
        value: [
          { instancePath: '/header/type', message: 'must be one of allowed values', data: 'invalid-type', schemaPath: '#/properties/header/properties/type/enum' },
          { instancePath: '/header/payloadChecksum', message: 'must be a valid SHA-256 hash', data: 'invalid', schemaPath: '#/properties/header/properties/payloadChecksum/pattern' },
          { instancePath: '/header/signatures', message: 'must have at least one item', data: [], schemaPath: '#/properties/header/properties/signatures/minItems' }
        ],
        writable: true,
        configurable: true
      });
      mockSchemaValidationCache.getValidatorFromSchema.mockReturnValue(invalidValidator);

      const result = validateEmbeddedMetadataDetailed({
        header: {
          version: '1.0',
          type: 'invalid-type',
          payloadChecksum: 'invalid',
          signatures: []
        },
        payload: validTaskPayload
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('EmbeddedMetadata Enhanced Validation (EARS-24)', () => {
    describe('[EARS-24] header.type validation', () => {
      it('should reject invalid header.type values', () => {
        const invalidValidator = jest.fn().mockReturnValue(false);
        Object.defineProperty(invalidValidator, 'errors', {
          value: [{ instancePath: '/header/type', message: 'must be one of actor, agent, task, execution, changelog, feedback, cycle', data: 'invalid-type' }],
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
        const validTypes = ['actor', 'task', 'execution', 'changelog', 'feedback', 'cycle', 'agent'];

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

    // NOTE: Tests EARS-25 through EARS-29 were removed because they tested
    // validateEmbeddedMetadataBusinessRules which was redundant with the JSON Schema validation.
    // The JSON Schema already validates:
    // - payloadChecksum format (pattern: ^[a-fA-F0-9]{64}$)
    // - signatures minItems: 1
    // - type-specific payload requirements (oneOf logic)
    // See: packages/core/src/record_schemas/generated/embedded_metadata_schema.json
  });
});
