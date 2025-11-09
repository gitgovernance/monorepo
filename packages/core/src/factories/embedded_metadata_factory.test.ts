import { createEmbeddedMetadataRecord, createTestSignature } from './embedded_metadata_factory';
import type { ActorRecord, TaskRecord } from '../types';
import { DetailedValidationError } from '../validation/common';

// Mock the validator
jest.mock('../validation/embedded_metadata_validator', () => ({
  validateEmbeddedMetadataDetailed: jest.fn()
}));

describe('EmbeddedMetadata Factory', () => {
  const mockValidateEmbeddedMetadataDetailed = require('../validation/embedded_metadata_validator').validateEmbeddedMetadataDetailed;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validation
    mockValidateEmbeddedMetadataDetailed.mockReturnValue({
      isValid: true,
      errors: []
    });
  });

  describe('createTestSignature', () => {
    it('[EARS-1] should create a valid test signature with default keyId', () => {
      const signature = createTestSignature();

      expect(signature).toMatchObject({
        keyId: 'human:test-user',
        role: 'author',
        notes: 'Test signature - unsigned',
        signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
      });
      expect(signature.timestamp).toBeGreaterThan(0);
    });

    it('[EARS-2] should create a signature with custom keyId', () => {
      const signature = createTestSignature('human:custom-user');

      expect(signature.keyId).toBe('human:custom-user');
    });
  });

  describe('createEmbeddedMetadataRecord', () => {
    const validActorPayload: ActorRecord = {
      id: 'human:test-user',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
      roles: ['developer:backend']
    };

    it('[EARS-3] should create a valid EmbeddedMetadataRecord with ActorRecord payload', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload);

      expect(result.header).toMatchObject({
        version: '1.0',
        type: 'actor',
        payloadChecksum: expect.any(String)
      });
      expect(result.header.signatures).toHaveLength(1);
      expect(result.header.signatures[0]).toMatchObject({
        keyId: 'human:test-user',
        role: 'author'
      });
      expect(result.payload).toEqual(validActorPayload);

      expect(mockValidateEmbeddedMetadataDetailed).toHaveBeenCalledWith(result);
    });

    it('[EARS-4] should infer type from TaskRecord payload', async () => {
      const taskPayload: TaskRecord = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'Test description',
        tags: []
      };

      const result = createEmbeddedMetadataRecord(taskPayload);

      expect(result.header.type).toBe('task');
      expect(result.payload).toEqual(taskPayload);
    });

    it('[EARS-5] should allow overriding header type', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload, {
        header: { type: 'custom' }
      });

      expect(result.header.type).toBe('custom');
    });

    it('[EARS-6] should use default version 1.0', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload);

      expect(result.header.version).toBe('1.0');
    });

    it('[EARS-7] should allow providing custom signatures', async () => {
      const customSignature = createTestSignature('human:custom-signer');

      const result = createEmbeddedMetadataRecord(validActorPayload, {
        signatures: [customSignature]
      });

      expect(result.header.signatures).toHaveLength(1);
      expect(result.header.signatures[0]?.keyId).toBe('human:custom-signer');
    });

    it('[EARS-8] should use real SHA-256 checksum (not overridable)', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload);

      // Checksum is always calculated, not provided
      expect(result.header.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.header.payloadChecksum).not.toBe('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456');
    });

    it('[EARS-9] should include schemaUrl and schemaChecksum for custom type', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload, {
        header: {
          type: 'custom',
          schemaUrl: 'https://example.com/schema.json',
          schemaChecksum: 'abc123def456789012345678901234567890abcdef1234567890abcdef123456'
        }
      });

      expect(result.header.type).toBe('custom');
      expect(result.header).toHaveProperty('schemaUrl', 'https://example.com/schema.json');
      expect(result.header).toHaveProperty('schemaChecksum', 'abc123def456789012345678901234567890abcdef1234567890abcdef123456');
    });

    it('[EARS-10] should throw DetailedValidationError when validation fails', () => {
      const validationErrors = [
        { field: 'payload.displayName', message: 'must be string', value: 123 }
      ];

      mockValidateEmbeddedMetadataDetailed.mockReturnValue({
        isValid: false,
        errors: validationErrors
      });

      const invalidPayload: ActorRecord = {
        ...validActorPayload,
        displayName: 123 as unknown as string
      };

      expect(() =>
        createEmbeddedMetadataRecord(invalidPayload)
      ).toThrow(DetailedValidationError);

      expect(() =>
        createEmbeddedMetadataRecord(invalidPayload)
      ).toThrow('EmbeddedMetadataRecord');
    });

    it('[EARS-11] should calculate real SHA-256 checksum of payload', async () => {
      const result = createEmbeddedMetadataRecord(validActorPayload);

      // Checksum should be 64 hex characters (SHA-256)
      expect(result.header.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);

      // Same payload should produce same checksum (deterministic)
      const result2 = createEmbeddedMetadataRecord(validActorPayload);
      expect(result2.header.payloadChecksum).toBe(result.header.payloadChecksum);
    });

    it('[EARS-12] should preserve all payload properties', async () => {
      const complexPayload: ActorRecord = {
        id: 'human:complex-user',
        type: 'human',
        displayName: 'Complex User',
        publicKey: 'xyz789==',
        roles: ['admin', 'developer'],
        metadata: {
          department: 'Engineering',
          location: 'Remote'
        }
      };

      const result = createEmbeddedMetadataRecord(complexPayload);

      expect(result.payload).toEqual(complexPayload);
    });
  });
});

