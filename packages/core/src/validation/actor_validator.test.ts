import { validateFullActorRecord, isActorRecord, validateActorRecordDetailed } from './actor_validator';
import { SchemaValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { verifySignatures } from '../crypto/signatures';
import type { ActorRecord } from '../types/actor_record';
import type { GitGovRecord } from '../models';

// Mock the crypto dependencies
jest.mock('../crypto/checksum');
jest.mock('../crypto/signatures');

const mockedCalculateChecksum = calculatePayloadChecksum as jest.Mock;
const mockedVerifySignatures = verifySignatures as jest.Mock;

describe('ActorValidator Module', () => {
  const validActorPayload: ActorRecord = {
    id: 'human:test', type: 'human', displayName: 'Test',
    publicKey: 'key', roles: ['author'], status: 'active'
  };

  // Create an invalid payload by removing a required property
  const { id, ...invalidPayloadWithoutId } = validActorPayload;

  const getActorPublicKey = jest.fn(async (keyId: string) => {
    if (keyId === 'human:test') return 'key';
    return null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Happy path defaults for mocks
    mockedCalculateChecksum.mockReturnValue('valid_checksum');
    mockedVerifySignatures.mockResolvedValue(true);
  });

  describe('validateFullActorRecord', () => {
    const baseRecord = {
      header: {
        version: '1.0', type: 'actor', payloadChecksum: 'valid_checksum',
        signatures: [{ keyId: 'human:test', role: 'author', signature: 'sig', timestamp: 123, timestamp_iso: '' }]
      },
      payload: validActorPayload
    } as GitGovRecord & { payload: ActorRecord };

    it('[EARS-4] should complete without errors for a fully valid record', async () => {
      await expect(validateFullActorRecord(baseRecord, getActorPublicKey)).resolves.not.toThrow();
    });

    it('[EARS-1] should throw SchemaValidationError if the payload is invalid', async () => {
      const invalidRecord = { ...baseRecord, payload: { ...validActorPayload, id: 'invalid-id-format' } };
      await expect(validateFullActorRecord(invalidRecord, getActorPublicKey)).rejects.toThrow(SchemaValidationError);
    });

    it('[EARS-2] should throw ChecksumMismatchError if checksum is invalid', async () => {
      mockedCalculateChecksum.mockReturnValue('intentionally_wrong_checksum');
      await expect(validateFullActorRecord(baseRecord, getActorPublicKey)).rejects.toThrow(ChecksumMismatchError);
    });

    it('[EARS-3] should throw SignatureVerificationError if signatures are invalid', async () => {
      mockedVerifySignatures.mockResolvedValue(false);
      await expect(validateFullActorRecord(baseRecord, getActorPublicKey)).rejects.toThrow(SignatureVerificationError);
    });
  });

  describe('isActorRecord', () => {
    it('[EARS-5 & EARS-6] should correctly identify valid and invalid records', () => {
      expect(isActorRecord(validActorPayload)).toBe(true);
      expect(isActorRecord(invalidPayloadWithoutId)).toBe(false);
    });
  });

  describe('validateActorRecordDetailed', () => {
    it('[EARS-7] should return success for valid ActorRecord', () => {
      const result = validateActorRecordDetailed(validActorPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-8] should return detailed errors for invalid ActorRecord', () => {
      const result = validateActorRecordDetailed(invalidPayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-9] should provide specific error details for each invalid field', () => {
      const invalidActor = {
        id: 'invalid-format', // Wrong ID pattern
        type: 'robot', // Invalid type
        displayName: '', // Empty string
        publicKey: '', // Empty string
        roles: [] // Empty array
      };

      const result = validateActorRecordDetailed(invalidActor);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Multiple errors
    });
  });
});
