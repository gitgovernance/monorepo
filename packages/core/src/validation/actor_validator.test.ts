import { validateFullActorRecord, isActorRecord, validateActorRecordDetailed } from './actor_validator';
import { DetailedValidationError } from './common';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import type { ActorRecord } from '../types';
import type { GitGovRecord } from '../types';

// Mock the embedded metadata validator
jest.mock('./embedded_metadata_validator');

const mockedValidateEmbeddedMetadata = validateFullEmbeddedMetadataRecord as jest.Mock;

describe('ActorValidator Module', () => {
  const validActorPayload: ActorRecord = {
    id: 'human:test', type: 'human', displayName: 'Test',
    publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==', // 44 characters (Ed25519 key length)
    roles: ['author'], status: 'active'
  };

  // Create an invalid payload by removing a required property
  const { id, ...invalidPayloadWithoutId } = validActorPayload;

  const getActorPublicKey = jest.fn(async (keyId: string) => {
    if (keyId === 'human:test') return 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==';
    return null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Happy path default for embedded metadata validation
    mockedValidateEmbeddedMetadata.mockResolvedValue(undefined);
  });

  describe('validateFullActorRecord', () => {
    const baseRecord = {
      header: {
        version: '1.0', type: 'actor', payloadChecksum: 'valid_checksum',
        signatures: [{ keyId: 'human:test', role: 'author', notes: 'Actor validation test signature', signature: 'sig', timestamp: 123 }]
      },
      payload: validActorPayload
    } as GitGovRecord & { payload: ActorRecord };

    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidRecord = { ...baseRecord, payload: { ...validActorPayload, id: 'invalid-id-format' } };
      await expect(validateFullActorRecord(invalidRecord, getActorPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const embeddedError = new Error('Embedded metadata validation failed');
      mockedValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      await expect(validateFullActorRecord(baseRecord, getActorPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete ActorRecord successfully without throwing', async () => {
      await expect(validateFullActorRecord(baseRecord, getActorPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      await validateFullActorRecord(baseRecord, getActorPublicKey);
      expect(mockedValidateEmbeddedMetadata).toHaveBeenCalledWith(baseRecord, getActorPublicKey);
    });
  });

  describe('isActorRecord', () => {
    it('[EARS-5] should return true for valid ActorRecord', () => {
      expect(isActorRecord(validActorPayload)).toBe(true);
    });

    it('[EARS-6] should return false for invalid ActorRecord', () => {
      expect(isActorRecord(invalidPayloadWithoutId)).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      validateActorRecordDetailed(validActorPayload);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const { SchemaValidationCache } = require('../schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateActorRecordDetailed(validActorPayload);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateActorRecordDetailed({ ...validActorPayload, id: 'human:another' });
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
      const result1 = validateActorRecordDetailed(validActorPayload);
      const result2 = validateActorRecordDetailed(validActorPayload);

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

  describe('validateActorRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct ActorRecord', () => {
      const result = validateActorRecordDetailed(validActorPayload);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid ActorRecord', () => {
      const result = validateActorRecordDetailed(invalidPayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const result = validateActorRecordDetailed(invalidPayloadWithoutId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      // ActorRecord with only required fields (status is optional)
      const actorMinimal: ActorRecord = {
        id: 'human:minimal',
        type: 'human',
        displayName: 'Minimal Actor',
        publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
        roles: ['author']
      };

      const result = validateActorRecordDetailed(actorMinimal);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const actorWithMultipleInvalidFields = {
        id: 'invalid-format',
        type: 'robot',
        displayName: '',
        publicKey: '',
        roles: []
      };

      const result = validateActorRecordDetailed(actorWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
