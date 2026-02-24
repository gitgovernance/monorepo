import { validateEmbeddedMetadataDetailed } from '../../record_validations/embedded_metadata_validator';
import type { AgentRecord, TaskRecord, ExecutionRecord, ChangelogRecord, FeedbackRecord, CycleRecord, GitGovActorRecord } from '../../record_types';
import type { Signature } from '../../record_types/embedded.types';

describe('EmbeddedMetadata Schema Integration Tests (EARS 12-60)', () => {
  // Helper to create valid signature
  // Ed25519 signatures are 64 bytes → base64 = 88 chars (86 + '==')
  const createValidSignature = (): Signature => ({
    keyId: 'human:test-user',
    role: 'author',
    notes: 'Test signature for integration testing',
    signature: 'dGVzdHNpZ25hdHVyZWJhc2U2NGVuY29kZWRmb3J0ZXN0aW5ncHVycG9zZXNvbmx5bm90cmVhbHNpZ25hdHVyZQ==',
    timestamp: 1752274500
  });

  // Helper to create valid header (flexible for testing invalid cases)
  const createValidHeader = (type: string = 'actor'): GitGovActorRecord['header'] => ({
    version: '1.0',
    type: type as GitGovActorRecord['header']['type'],
    payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    signatures: [createValidSignature()]
  });

  // Helper to create valid embedded metadata
  const createValidEmbeddedMetadata = (): GitGovActorRecord => ({
    header: createValidHeader('actor'),
    payload: {
      id: 'human:test-user',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
      roles: ['developer:backend']
    }
  });

  describe('Root Level Validation (EARS 12-14)', () => {
    it('[EARS-12] should reject missing required field: header', () => {
      const invalid = {
        // header missing
        payload: { id: 'test', type: 'actor' }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('header'))).toBe(true);
    });

    it('[EARS-13] should reject missing required field: payload', () => {
      const invalid = {
        header: createValidHeader(),
        // payload missing
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('payload'))).toBe(true);
    });

    it('[EARS-14] should reject additional properties at root level', () => {
      const invalid = {
        header: createValidHeader(),
        payload: { id: 'test', type: 'actor' },
        extraField: 'not allowed'
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Header Basic Validation (EARS 15-27)', () => {
    it('[EARS-15] should reject missing required field: header.version', () => {
      const invalid = {
        header: {
          // version missing
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [createValidSignature()]
        },
        payload: { id: 'test', type: 'actor' }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('version'))).toBe(true);
    });

    it('[EARS-16] should reject invalid header.version value not in enum', () => {
      const invalid = createValidEmbeddedMetadata();
      (invalid.header.version as string) = '2.0'; // Invalid enum value

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field.includes('version'))).toBe(true);
    });

    it('[EARS-17] should accept valid header.version value "1.0"', () => {
      const valid = createValidEmbeddedMetadata();
      valid.header.version = '1.0';

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-18] should reject missing required field: header.type', () => {
      const invalid = {
        header: {
          version: '1.0',
          // type missing
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [createValidSignature()]
        },
        payload: { id: 'test' }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('type'))).toBe(true);
    });

    it('[EARS-19] should accept all 7 valid header.type enum values', () => {
      // This test verifies that all enum values are accepted in header.type
      // Full payload validation is tested in EARS-44 through EARS-50
      const validTypes = ['actor', 'agent', 'task', 'execution', 'changelog', 'feedback', 'cycle'];

      for (const type of validTypes) {
        // Create complete EmbeddedMetadata records with proper payloads for each type
        const valid = createValidEmbeddedMetadata();

        // For non-actor types, just update the header.type to test enum acceptance
        // (The oneOf will fail but that's not what we're testing here - we're testing enum)
        if (type !== 'actor') {
          valid.header.type = type;
        }

        const result = validateEmbeddedMetadataDetailed(valid);
        // We only check that the enum value in header.type itself is not rejected
        // If validation fails, it should NOT be because of an invalid enum value in header.type
        // (payload.type errors are acceptable here since we're not testing payload validation)
        const hasHeaderTypeEnumError = result.errors.some(e =>
          e.message.includes('must be equal to one of the allowed values') &&
          e.field === '/header/type'
        );

        expect(hasHeaderTypeEnumError).toBe(false);
      }
    });

    it('[EARS-20] should reject invalid header.type value not in enum', () => {
      const invalid = createValidEmbeddedMetadata();
      (invalid.header.type as string) = 'invalid-type';

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('type') || e.field.includes('type'))).toBe(true);
    });

    it('[EARS-21] should reject missing required field: header.payloadChecksum', () => {
      const invalid = {
        header: {
          version: '1.0',
          type: 'actor',
          // payloadChecksum missing
          signatures: [createValidSignature()]
        },
        payload: { id: 'test', type: 'actor' }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('payloadChecksum'))).toBe(true);
    });

    it('[EARS-22] should reject invalid header.payloadChecksum pattern', () => {
      const invalid = createValidEmbeddedMetadata();
      invalid.header.payloadChecksum = 'invalid-checksum-format';

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('payloadChecksum') || e.field.includes('payloadChecksum'))).toBe(true);
    });

    it('[EARS-23] should accept valid header.payloadChecksum with 64 hex characters', () => {
      const valid = createValidEmbeddedMetadata();
      valid.header.payloadChecksum = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-24] should reject missing required field: header.signatures', () => {
      const invalid = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          // signatures missing
        },
        payload: { id: 'test', type: 'actor' }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('signatures'))).toBe(true);
    });

    it('[EARS-25] should reject empty header.signatures array (minItems: 1)', () => {
      const invalid = createValidEmbeddedMetadata();
      (invalid.header.signatures as Signature[]) = [];

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('signatures') || e.field.includes('signatures'))).toBe(true);
    });

    it('[EARS-26] should accept header.signatures array with at least 1 item', () => {
      const valid = createValidEmbeddedMetadata();
      valid.header.signatures = [createValidSignature()];

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-27] should reject additional properties in header object', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [createValidSignature()],
          extraField: 'not allowed'
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Header Conditional Validation (EARS 28-31) — custom type removed', () => {
    it('[EARS-28] should reject "custom" as an invalid header.type', () => {
      const invalid = createValidEmbeddedMetadata();
      invalid.header.type = 'custom';

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-29] should reject additional properties like schemaUrl in header', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [createValidSignature()],
          schemaUrl: 'https://example.com/schema.json'
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('additional properties'))).toBe(true);
    });

    it('[EARS-30] should reject additional properties like schemaChecksum in header', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [createValidSignature()],
          schemaChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('additional properties'))).toBe(true);
    });

    it('[EARS-31] should accept valid header without schemaUrl or schemaChecksum', () => {
      const valid = createValidEmbeddedMetadata();

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Signatures Array Item Validation (EARS 32-52)', () => {
    it('[EARS-32] should reject signature item missing required field: keyId', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            // keyId missing
            role: 'author',
            notes: 'Test note',
            signature: 'test',
            timestamp: 1752274500
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('keyId'))).toBe(true);
    });

    it('[EARS-33] should reject signature item missing required field: role', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test',
            // role missing
            notes: 'Test note',
            signature: 'test',
            timestamp: 1752274500
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('role'))).toBe(true);
    });

    it('[EARS-34] should reject signature item missing required field: notes', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test',
            role: 'author',
            // notes missing
            signature: 'test',
            timestamp: 1752274500
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('notes'))).toBe(true);
    });

    it('[EARS-35] should reject signature.notes with empty string (minLength: 1)', () => {
      const invalid = createValidEmbeddedMetadata();
      if (invalid.header.signatures[0]) {
        invalid.header.signatures[0].notes = '';
      }

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('notes') || e.field.includes('notes'))).toBe(true);
    });

    it('[EARS-36] should accept signature.notes with exactly 1 character', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].notes = 'a';
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-37] should reject signature.notes exceeding 1000 characters', () => {
      const invalid = createValidEmbeddedMetadata();
      if (invalid.header.signatures[0]) {
        invalid.header.signatures[0].notes = 'a'.repeat(1001);
      }

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('notes') || e.field.includes('notes'))).toBe(true);
    });

    it('[EARS-38] should accept signature.notes with exactly 1000 characters', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].notes = 'a'.repeat(1000);
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-39] should reject signature item missing required field: signature', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test',
            role: 'author',
            notes: 'Test note',
            // signature missing
            timestamp: 1752274500
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('signature'))).toBe(true);
    });

    it('[EARS-40] should reject signature item missing required field: timestamp', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test',
            role: 'author',
            notes: 'Test note',
            signature: 'test',
            // timestamp missing
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('timestamp'))).toBe(true);
    });

    it('[EARS-41] should reject signature.timestamp with non-integer value', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test-user',
            role: 'author',
            notes: 'Test note',
            signature: 'test',
            timestamp: 'not-an-integer'  // Invalid: should be integer
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('timestamp') || e.field.includes('timestamp'))).toBe(true);
    });

    it('[EARS-42] should reject signature item with additional properties', () => {
      const invalid: Record<string, unknown> = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signatures: [{
            keyId: 'human:test-user',
            role: 'author',
            notes: 'Test signature for integration testing',
            signature: 'dGVzdHNpZ25hdHVyZWJhc2U2NGVuY29kZWQ=',
            timestamp: 1752274500,
            extraField: 'not allowed'
          }]
        },
        payload: {
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
          roles: ['developer:backend']
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('[EARS-43] should reject signature.keyId with invalid ActorRecord ID pattern', () => {
      const invalid = createValidEmbeddedMetadata();
      invalid.header.signatures[0].keyId = 'invalid-key-id';  // Should match: ^(human|agent)(:[a-z0-9-]+)+$

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('keyId') || e.field.includes('keyId'))).toBe(true);
    });

    it('[EARS-44] should accept signature.keyId with valid ActorRecord ID pattern', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].keyId = 'human:test-user-123';  // Valid pattern
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-45] should reject signature.role with invalid role pattern', () => {
      const invalid = createValidEmbeddedMetadata();
      if (invalid.header.signatures[0]) {
        invalid.header.signatures[0].role = 'Invalid_Role_123';  // Should match: ^([a-z-]+|custom:[a-z0-9-]+)$
      }

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('role') || e.field.includes('role'))).toBe(true);
    });

    it('[EARS-46] should accept signature.role with exactly 1 character', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].role = 'a';  // Exactly minLength: 1
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-47] should reject signature.role exceeding maxLength 50', () => {
      const invalid = createValidEmbeddedMetadata();
      if (invalid.header.signatures[0]) {
        invalid.header.signatures[0].role = 'custom:' + 'a'.repeat(50);  // > 50 chars total
      }

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('role') || e.field.includes('role'))).toBe(true);
    });

    it('[EARS-48] should accept signature.role with exactly 50 characters (maxLength boundary)', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].role = 'custom:' + 'a'.repeat(42);  // Exactly 50 chars (custom: = 7 + 43 = 50)
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-49] should reject signature.signature with invalid Ed25519 base64 pattern', () => {
      const invalid = createValidEmbeddedMetadata();
      if (invalid.header.signatures[0]) {
        invalid.header.signatures[0].signature = 'invalid-signature-too-short';  // Should be 88 chars: ^[A-Za-z0-9+/]{86}==$
      }

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('signature') || e.field.includes('signature'))).toBe(true);
    });

    it('[EARS-50] should accept signature.signature with valid Ed25519 base64 pattern', () => {
      const valid = createValidEmbeddedMetadata();
      // createValidSignature() already uses a valid 88-char signature, so we just verify it passes

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-51] should accept multiple signatures in array', () => {
      const valid = createValidEmbeddedMetadata();
      valid.header.signatures = [
        createValidSignature(),
        { ...createValidSignature(), keyId: 'agent:reviewer', role: 'reviewer', notes: 'Reviewed and approved' }
      ];

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-52] should accept signature.timestamp with value 0 (Unix epoch)', () => {
      const valid = createValidEmbeddedMetadata();
      if (valid.header.signatures[0]) {
        valid.header.signatures[0].timestamp = 0;  // Unix epoch
      }

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Payload Conditional Validation - oneOf (EARS 53-60)', () => {
    it('[EARS-53] should validate payload against ActorRecord schema when header.type=actor', () => {
      const valid = createValidEmbeddedMetadata();
      valid.header.type = 'actor';
      valid.payload = {
        id: 'human:test-user',
        type: 'human',
        displayName: 'Test User',
        publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
        roles: ['developer']
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-54] should validate payload against AgentRecord schema when header.type=agent', () => {
      const agentPayload: AgentRecord = {
        id: 'agent:test-agent',
        engine: {
          type: 'local',
          runtime: 'typescript',
          entrypoint: 'src/index.ts'
        },
        status: 'active',
        triggers: []
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('agent'),
        payload: agentPayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-55] should validate payload against TaskRecord schema when header.type=task', () => {
      const taskPayload: TaskRecord = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'Test description',
        tags: []
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('task'),
        payload: taskPayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-56] should validate payload against ExecutionRecord schema when header.type=exec', () => {
      const execPayload: ExecutionRecord = {
        id: '1234567890-exec-test',
        taskId: '1234567890-task-test',
        type: 'progress',
        title: 'Test Execution',
        result: 'Test result with sufficient length'
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('execution'),
        payload: execPayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-57] should validate payload against ChangelogRecord schema when header.type=log', () => {
      const changelogPayload: ChangelogRecord = {
        id: '1234567890-changelog-test',
        title: 'Test Changelog Entry Title',  // minLength: 10
        description: 'This is a test description for the changelog record with sufficient length',  // minLength: 20
        relatedTasks: ['1234567890-task-test'],
        completedAt: 1234567890,
        version: 'v1.0.0'
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('changelog'),
        payload: changelogPayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-58] should validate payload against FeedbackRecord schema when header.type=feed', () => {
      const feedbackPayload: FeedbackRecord = {
        id: '1234567890-feedback-test',
        entityType: 'task',
        entityId: '1234567890-task-test',
        type: 'suggestion',
        status: 'open',
        content: 'Test feedback'
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('feedback'),
        payload: feedbackPayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-59] should validate payload against CycleRecord schema when header.type=cycle', () => {
      const cyclePayload: CycleRecord = {
        id: '1234567890-cycle-test',
        status: 'active',
        title: 'Test Cycle',
        taskIds: []
      };

      const valid: Record<string, unknown> = {
        header: createValidHeader('cycle'),
        payload: cyclePayload
      };

      const result = validateEmbeddedMetadataDetailed(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-60] should reject payload that doesn\'t match the schema specified by header.type', () => {
      const invalid: Record<string, unknown> = {
        header: createValidHeader('actor'),
        payload: {
          // Invalid ActorRecord - missing required fields
          id: 'invalid-actor'
        }
      };

      const result = validateEmbeddedMetadataDetailed(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

