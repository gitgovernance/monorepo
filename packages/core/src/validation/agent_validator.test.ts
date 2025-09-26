import { validateFullAgentRecord, isAgentRecord } from './agent_validator';
import { SchemaValidationError } from './common';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import type { AgentRecord } from '../types';
import type { GitGovRecord } from '../types';

// Mock the embedded metadata validator
jest.mock('./embedded_metadata_validator');

const mockedValidateEmbeddedMetadata = validateFullEmbeddedMetadataRecord as jest.Mock;

describe('AgentValidator Module', () => {
  const validAgentPayload: AgentRecord = {
    id: 'agent:test-agent',
    guild: 'design',
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
        signatures: [{ keyId: 'agent:test-agent', role: 'author', signature: 'sig', timestamp: 123, timestamp_iso: '' }]
      },
      payload: validAgentPayload
    } as unknown as GitGovRecord & { payload: AgentRecord };

    it('[EARS-4] should complete without errors for a fully valid record', async () => {
      await expect(validateFullAgentRecord(baseRecord, getActorPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-1] should throw SchemaValidationError if the payload is invalid', async () => {
      const invalidRecord = { ...baseRecord, payload: { ...validAgentPayload, id: 'invalid-id-format' } };
      await expect(validateFullAgentRecord(invalidRecord, getActorPublicKey)).rejects.toThrow(SchemaValidationError);
    });

    it('[EARS-2] should throw error if embedded metadata validation fails', async () => {
      const embeddedError = new Error('Embedded metadata validation failed');
      mockedValidateEmbeddedMetadata.mockRejectedValue(embeddedError);
      await expect(validateFullAgentRecord(baseRecord, getActorPublicKey)).rejects.toThrow('Embedded metadata validation failed');
    });

    it('[EARS-3] should call validateFullEmbeddedMetadataRecord with correct parameters', async () => {
      await validateFullAgentRecord(baseRecord, getActorPublicKey);
      expect(mockedValidateEmbeddedMetadata).toHaveBeenCalledWith(baseRecord, getActorPublicKey);
    });
  });

  describe('isAgentRecord', () => {
    it('[EARS-5 & EARS-6] should correctly identify valid and invalid records', () => {
      expect(isAgentRecord(validAgentPayload)).toBe(true);
      expect(isAgentRecord(invalidPayloadWithoutId)).toBe(false);
    });

    it('[EARS-7] should validate agent ID pattern', () => {
      const invalidIdAgent = { ...validAgentPayload, id: 'human:test' }; // Wrong pattern
      expect(isAgentRecord(invalidIdAgent)).toBe(false);
    });

    it('[EARS-8] should validate guild enum values', () => {
      const invalidGuildAgent = { ...validAgentPayload, guild: 'invalid-guild' };
      expect(isAgentRecord(invalidGuildAgent)).toBe(false);
    });

    it('[EARS-9] should validate engine structure', () => {
      const invalidEngineAgent = { ...validAgentPayload, engine: { type: 'invalid' } };
      expect(isAgentRecord(invalidEngineAgent)).toBe(false);
    });
  });
});
