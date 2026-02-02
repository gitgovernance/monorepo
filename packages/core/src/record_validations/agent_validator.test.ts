import { validateFullAgentRecord, isAgentRecord, validateAgentRecordDetailed } from './agent_validator';
import { DetailedValidationError } from './common';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import type { AgentRecord } from '../record_types';
import type { GitGovRecord } from '../record_types';

// Mock the embedded metadata validator
jest.mock('./embedded_metadata_validator');

const mockedValidateEmbeddedMetadata = validateFullEmbeddedMetadataRecord as jest.Mock;

describe('AgentValidator Module', () => {
  const validAgentPayload: AgentRecord = {
    id: 'agent:test-agent',
    status: 'active',
    engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
    triggers: [{ type: 'manual' }],
    knowledge_dependencies: [],
    prompt_engine_requirements: {}
  };

  // Create an invalid payload by removing a required property
  const { id, ...invalidPayloadWithoutId } = validAgentPayload;

  const getActorPublicKey = jest.fn(async (keyId: string) => {
    if (keyId === 'agent:test-agent') return 'key';
    return null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Happy path default for embedded metadata validation
    mockedValidateEmbeddedMetadata.mockResolvedValue(undefined);
  });

  describe('validateFullAgentRecord', () => {
    const baseRecord = {
      header: {
        version: '1.0', type: 'agent' as const, payloadChecksum: 'valid_checksum',
        signatures: [{ keyId: 'agent:test-agent', role: 'author', notes: 'Agent validation test signature', signature: 'sig', timestamp: 123 }]
      },
      payload: validAgentPayload
    } as unknown as GitGovRecord & { payload: AgentRecord };

    it('[EARS-1] should throw DetailedValidationError for invalid payload schema', async () => {
      const invalidRecord = { ...baseRecord, payload: { ...validAgentPayload, id: 'invalid-id-format' } };
      await expect(validateFullAgentRecord(invalidRecord, getActorPublicKey)).rejects.toThrow(DetailedValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const embeddedError = new Error('Embedded metadata validation failed');
      mockedValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      await expect(validateFullAgentRecord(baseRecord, getActorPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should validate a complete AgentRecord successfully without throwing', async () => {
      await expect(validateFullAgentRecord(baseRecord, getActorPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-4] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      await validateFullAgentRecord(baseRecord, getActorPublicKey);
      expect(mockedValidateEmbeddedMetadata).toHaveBeenCalledWith(baseRecord, getActorPublicKey);
    });
  });

  describe('isAgentRecord', () => {
    it('[EARS-5] should return true for valid AgentRecord', () => {
      expect(isAgentRecord(validAgentPayload)).toBe(true);
    });

    it('[EARS-6] should return false for invalid AgentRecord', () => {
      expect(isAgentRecord(invalidPayloadWithoutId)).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      validateAgentRecordDetailed(validAgentPayload);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateAgentRecordDetailed(validAgentPayload);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateAgentRecordDetailed({ ...validAgentPayload, id: 'agent:another' });
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
      const result1 = validateAgentRecordDetailed(validAgentPayload);
      const result2 = validateAgentRecordDetailed(validAgentPayload);

      expect(result1).toEqual(result2);
    });

    it('[EARS-10] should support cache clearing', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      // Verify clearCache method exists and can be called
      expect(SchemaValidationCache.clearCache).toBeDefined();
      expect(() => SchemaValidationCache.clearCache()).not.toThrow();
    });

    it('[EARS-11] should provide cache statistics', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      // Verify getCacheStats method exists and returns stats
      const stats = SchemaValidationCache.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.cachedSchemas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateAgentRecordDetailed', () => {
    it('[EARS-12] should return valid result for correct AgentRecord', () => {
      const result = validateAgentRecordDetailed(validAgentPayload);
      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('[EARS-13] should return detailed errors for invalid AgentRecord', () => {
      const result = validateAgentRecordDetailed(invalidPayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-14] should format errors in user-friendly structure with field, message, and value', () => {
      const result = validateAgentRecordDetailed(invalidPayloadWithoutId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-15] should validate optional fields correctly', () => {
      // AgentRecord with only required fields
      const agentMinimal: AgentRecord = {
        id: 'agent:minimal',
        status: 'active',
        engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
        triggers: [{ type: 'manual' }],
        knowledge_dependencies: [],
        prompt_engine_requirements: {}
      };

      const result = validateAgentRecordDetailed(agentMinimal);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const agentWithMultipleInvalidFields = {
        id: 'invalid-format',
        status: 'invalid-status',
        engine: {},
        triggers: []
      };

      const result = validateAgentRecordDetailed(agentWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
