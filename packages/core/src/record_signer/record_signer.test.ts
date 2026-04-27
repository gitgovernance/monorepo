import { RecordSigner } from './record_signer';
import type { KeyProvider } from '../key_provider/key_provider';
import { KeyProviderError } from '../key_provider/key_provider';
import { MockKeyProvider } from '../key_provider/memory/mock_key_provider';
import { generateKeys, verifySignatures } from '../crypto/signatures';
import { calculatePayloadChecksum } from '../crypto/checksum';
import type { TaskRecord } from '../record_types';
import type { GitGovRecord } from '../record_types/common.types';

/** Helper: build a minimal TaskRecord payload for testing. */
function makeTaskPayload(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: '1714200000-task-test-task',
    title: 'Test task',
    status: 'draft',
    priority: 'medium',
    description: 'A test task',
    assignees: [],
    ...overrides,
  } as TaskRecord;
}

/** Helper: build a mock KeyProvider with jest.fn() spies. */
function makeMockKeyProvider(overrides: Partial<KeyProvider> = {}): KeyProvider {
  return {
    sign: jest.fn().mockResolvedValue(new Uint8Array(64).fill(1)),
    getPrivateKey: jest.fn().mockResolvedValue(null),
    getPublicKey: jest.fn().mockResolvedValue(null),
    setPrivateKey: jest.fn().mockResolvedValue(undefined),
    hasPrivateKey: jest.fn().mockResolvedValue(false),
    deletePrivateKey: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('RecordSigner', () => {
  describe('4.1. createSignedRecord (RSIG-A1 to A4)', () => {
    it('[RSIG-A1] should return record with exactly 1 real signature', async () => {
      const mockKp = makeMockKeyProvider();
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      const result = await signer.createSignedRecord(
        payload, 'task', 'actor:human:alice', 'author', 'Task created',
      );

      // Must have header with version, type, payloadChecksum, signatures
      expect(result.header.version).toBe('1.0');
      expect(result.header.type).toBe('task');
      expect(result.header.payloadChecksum).toBeDefined();
      expect(result.header.signatures).toHaveLength(1);

      // The signature must NOT be 'placeholder' or empty
      const sig = result.header.signatures[0];
      expect(sig.signature).not.toBe('placeholder');
      expect(sig.signature).not.toBe('');
      expect(sig.keyId).toBe('actor:human:alice');
      expect(sig.role).toBe('author');
      expect(sig.notes).toBe('Task created');
      expect(typeof sig.timestamp).toBe('number');

      // Payload must be preserved
      expect(result.payload).toEqual(payload);
    });

    it('[RSIG-A2] should calculate payloadChecksum internally', async () => {
      const signSpy = jest.fn().mockResolvedValue(new Uint8Array(64).fill(2));
      const mockKp = makeMockKeyProvider({ sign: signSpy });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      const result = await signer.createSignedRecord(
        payload, 'task', 'actor:human:alice', 'author', 'Created',
      );

      // The checksum in the header must match what calculatePayloadChecksum returns
      const expectedChecksum = calculatePayloadChecksum(payload);
      expect(result.header.payloadChecksum).toBe(expectedChecksum);

      // keyProvider.sign must have been called exactly once
      expect(signSpy).toHaveBeenCalledTimes(1);
    });

    it('[RSIG-A3] should propagate KeyProviderError when key not found', async () => {
      const signSpy = jest.fn().mockRejectedValue(
        new KeyProviderError(
          'Private key not found for actor:human:unknown',
          'KEY_NOT_FOUND',
          { actorId: 'actor:human:unknown', hint: 'Run gitgov init or gitgov login to configure keys' },
        ),
      );
      const mockKp = makeMockKeyProvider({ sign: signSpy });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      await expect(
        signer.createSignedRecord(payload, 'task', 'actor:human:unknown', 'author', 'Fail'),
      ).rejects.toThrow(KeyProviderError);

      await expect(
        signer.createSignedRecord(payload, 'task', 'actor:human:unknown', 'author', 'Fail'),
      ).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
    });

    it('[RSIG-A4] should produce record that passes verifySignatures', async () => {
      // Use REAL crypto: generate real keys, use MockKeyProvider with real signing
      const keys = await generateKeys();
      const actorId = 'actor:human:alice';
      const mockKp = new MockKeyProvider({ keys: { [actorId]: keys.privateKey } });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      const result = await signer.createSignedRecord(
        payload, 'task', actorId, 'author', 'Task created with real keys',
      );

      // Verify with REAL verifySignatures
      const isValid = await verifySignatures(
        result,
        async (keyId: string) => {
          if (keyId === actorId) return keys.publicKey;
          return null;
        },
      );

      expect(isValid).toBe(true);
    });
  });

  describe('4.2. signRecord (RSIG-B1 to B4)', () => {
    it('[RSIG-B1] should delegate to keyProvider.sign producing Ed25519 signature', async () => {
      // Use real crypto to verify the produced signature is valid Ed25519
      const keys = await generateKeys();
      const actorId = 'actor:human:bob';
      const mockKp = new MockKeyProvider({ keys: { [actorId]: keys.privateKey } });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      // Create an initial record to re-sign
      const initial = await signer.createSignedRecord(
        payload, 'task', actorId, 'author', 'Initial',
      );

      const cosignerId = 'actor:human:carol';
      const cosignerKeys = await generateKeys();
      await mockKp.setPrivateKey(cosignerId, cosignerKeys.privateKey);

      const result = await signer.signRecord(
        initial as unknown as GitGovRecord,
        cosignerId,
        'approver',
        'Approved',
      );

      // payloadChecksum must be recalculated
      const expectedChecksum = calculatePayloadChecksum(result.payload);
      expect(result.header.payloadChecksum).toBe(expectedChecksum);

      // Must have 2 signatures now (initial + cosign)
      expect(result.header.signatures).toHaveLength(2);
      const cosignerSig = result.header.signatures[1]!;
      expect(cosignerSig.keyId).toBe(cosignerId);
      expect(cosignerSig.role).toBe('approver');
      expect(cosignerSig.signature).not.toBe('placeholder');
    });

    it('[RSIG-B2] should propagate KeyProviderError when key not found', async () => {
      const keys = await generateKeys();
      const actorId = 'actor:human:alice';
      const mockKp = new MockKeyProvider({ keys: { [actorId]: keys.privateKey } });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      // Create an initial record
      const initial = await signer.createSignedRecord(
        payload, 'task', actorId, 'author', 'Initial',
      );

      // Try to sign with a non-existent key
      await expect(
        signer.signRecord(
          initial as unknown as GitGovRecord,
          'actor:human:nonexistent',
          'approver',
          'Should fail',
        ),
      ).rejects.toThrow(KeyProviderError);

      await expect(
        signer.signRecord(
          initial as unknown as GitGovRecord,
          'actor:human:nonexistent',
          'approver',
          'Should fail',
        ),
      ).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
    });

    it('[RSIG-B3] should replace placeholder signatures instead of appending', async () => {
      const signSpy = jest.fn().mockResolvedValue(new Uint8Array(64).fill(7));
      const mockKp = makeMockKeyProvider({ sign: signSpy });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      // Build a record with a placeholder signature
      const recordWithPlaceholder: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: calculatePayloadChecksum(payload),
          signatures: [
            {
              keyId: 'actor:human:alice',
              role: 'author',
              notes: 'Placeholder',
              signature: 'placeholder',
              timestamp: 1714200000,
            },
          ],
        },
        payload,
      };

      const result = await signer.signRecord(
        recordWithPlaceholder,
        'actor:human:alice',
        'author',
        'Now signed',
      );

      // Total count must NOT increase — placeholder replaced
      expect(result.header.signatures).toHaveLength(1);
      expect(result.header.signatures[0].signature).not.toBe('placeholder');
      expect(result.header.signatures[0].signature).toBeTruthy();
    });

    it('[RSIG-B4] should append new signature to existing signatures', async () => {
      const signSpy = jest.fn().mockResolvedValue(new Uint8Array(64).fill(9));
      const mockKp = makeMockKeyProvider({ sign: signSpy });
      const signer = new RecordSigner({ keyProvider: mockKp });
      const payload = makeTaskPayload();

      // Build a record with a real (non-placeholder) existing signature
      const recordWithRealSig: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: calculatePayloadChecksum(payload),
          signatures: [
            {
              keyId: 'actor:human:alice',
              role: 'author',
              notes: 'Already signed',
              signature: Buffer.from(new Uint8Array(64).fill(3)).toString('base64'),
              timestamp: 1714200000,
            },
          ],
        },
        payload,
      };

      const result = await signer.signRecord(
        recordWithRealSig,
        'actor:human:bob',
        'reviewer',
        'Reviewed',
      );

      // Total count must increase by 1
      expect(result.header.signatures).toHaveLength(2);
      expect(result.header.signatures[0].keyId).toBe('actor:human:alice');
      expect(result.header.signatures[1]!.keyId).toBe('actor:human:bob');
      expect(result.header.signatures[1]!.role).toBe('reviewer');
      expect(result.header.signatures[1]!.notes).toBe('Reviewed');
    });
  });
});
