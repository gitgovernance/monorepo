import { IdentityAdapter } from './index';
import type { ActorRecord, GitGovRecord, GitGovActorRecord } from '../../record_types';
import type { RecordStore } from '../../record_store/record_store';
import { createActorRecord } from '../../factories/actor_factory';
import { validateFullActorRecord } from '../../validation/actor_validator';
import { generateKeys, signPayload, generateMockSignature } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import { generateActorId } from '../../utils/id_generator';
import type { ISessionManager } from '../../session_manager';

// Mock all dependencies
jest.mock('../../factories/actor_factory');
jest.mock('../../validation/actor_validator');
jest.mock('../../crypto/signatures');
jest.mock('../../crypto/checksum');
jest.mock('../../utils/id_generator');

import type { KeyProvider } from '../../key_provider/key_provider';

// Mock KeyProvider
interface MockKeyProvider extends KeyProvider {
  getPrivateKey: jest.MockedFunction<(actorId: string) => Promise<string | null>>;
  setPrivateKey: jest.MockedFunction<(actorId: string, key: string) => Promise<void>>;
  hasPrivateKey: jest.MockedFunction<(actorId: string) => Promise<boolean>>;
  deletePrivateKey: jest.MockedFunction<(actorId: string) => Promise<boolean>>;
}
const mockedCreateActorRecord = createActorRecord as jest.MockedFunction<typeof createActorRecord>;
const mockedValidateFullActorRecord = validateFullActorRecord as jest.MockedFunction<typeof validateFullActorRecord>;
const mockedGenerateKeys = generateKeys as jest.MockedFunction<typeof generateKeys>;
const mockedSignPayload = signPayload as jest.MockedFunction<typeof signPayload>;
const mockedGenerateMockSignature = generateMockSignature as jest.MockedFunction<typeof generateMockSignature>;
const mockedCalculatePayloadChecksum = calculatePayloadChecksum as jest.MockedFunction<typeof calculatePayloadChecksum>;
const mockedGenerateActorId = generateActorId as jest.MockedFunction<typeof generateActorId>;

import type { IEventStream } from '../../event_bus';

// Mock event bus interface
interface MockEventBus extends IEventStream {
  publish: jest.MockedFunction<(event: any) => void>;
  subscribe: jest.MockedFunction<(eventType: string, handler: any) => any>;
  unsubscribe: jest.MockedFunction<(subscriptionId: string) => boolean>;
  getSubscriptions: jest.MockedFunction<() => any[]>;
  clearSubscriptions: jest.MockedFunction<() => void>;
}

// Mock SessionManager interface
interface MockSessionManager {
  loadSession: jest.MockedFunction<() => Promise<any>>;
  getActorState: jest.MockedFunction<(actorId: string) => Promise<any>>;
  updateActorState: jest.MockedFunction<(actorId: string, state: any) => Promise<void>>;
  getLastSession: jest.MockedFunction<() => Promise<any>>;
  getSyncPreferences: jest.MockedFunction<() => Promise<any>>;
  updateSyncPreferences: jest.MockedFunction<(prefs: any) => Promise<void>>;
  getCloudSessionToken: jest.MockedFunction<() => Promise<string | null>>;
  detectActorFromKeyFiles: jest.MockedFunction<() => Promise<string | null>>;
}

describe('IdentityAdapter - ActorRecord Operations', () => {
  let identityAdapter: IdentityAdapter;
  let identityAdapterWithEvents: IdentityAdapter;
  let mockActorStore: jest.Mocked<RecordStore<GitGovActorRecord>>;
  let mockKeyProvider: MockKeyProvider;
  let mockSessionManager: MockSessionManager;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock store instances
    mockActorStore = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      list: jest.fn().mockResolvedValue([]), // Default to empty array to avoid "not iterable" errors
      exists: jest.fn(),
    } as unknown as jest.Mocked<RecordStore<GitGovActorRecord>>;

    // Create mock KeyProvider
    mockKeyProvider = {
      getPrivateKey: jest.fn().mockResolvedValue('mock-private-key'),
      setPrivateKey: jest.fn().mockResolvedValue(undefined),
      hasPrivateKey: jest.fn().mockResolvedValue(true),
      deletePrivateKey: jest.fn().mockResolvedValue(true),
    } as MockKeyProvider;

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn().mockReturnValue({ id: 'mock-subscription', eventType: '', handler: jest.fn() }),
      unsubscribe: jest.fn().mockReturnValue(true),
      getSubscriptions: jest.fn().mockReturnValue([]),
      clearSubscriptions: jest.fn(),
      waitForIdle: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventStream>;

    // Create mock SessionManager
    mockSessionManager = {
      loadSession: jest.fn().mockResolvedValue(null),
      getActorState: jest.fn().mockResolvedValue(null),
      updateActorState: jest.fn().mockResolvedValue(undefined),
      getLastSession: jest.fn().mockResolvedValue(null),
      getSyncPreferences: jest.fn().mockResolvedValue(null),
      updateSyncPreferences: jest.fn().mockResolvedValue(undefined),
      getCloudSessionToken: jest.fn().mockResolvedValue(null),
      detectActorFromKeyFiles: jest.fn().mockResolvedValue(null),
    };

    // Create IdentityAdapter without events (optional dependency)
    identityAdapter = new IdentityAdapter({
      stores: { actors: mockActorStore },
      keyProvider: mockKeyProvider,
      sessionManager: mockSessionManager as unknown as ISessionManager,
    });

    // Create IdentityAdapter with events
    identityAdapterWithEvents = new IdentityAdapter({
      stores: { actors: mockActorStore },
      keyProvider: mockKeyProvider,
      sessionManager: mockSessionManager as unknown as ISessionManager,
      eventBus: mockEventBus,
    });

    // Mock generateMockSignature to return valid Ed25519-like signature (64 bytes = 86 chars + ==)
    mockedGenerateMockSignature.mockReturnValue('oro1j+DqU3XtJrkW4eNqP4gXqHtygAgSaRfuBuW19YAxAAR083ktaWpSBJk4AIof13gO3butj5L4n30XTn+Spg==');
  });

  const sampleActorPayload: ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'sample-public-key',
    roles: ['author'],
    status: 'active'
  };

  const sampleRecord: GitGovRecord & { payload: ActorRecord } = {
    header: {
      version: '1.0',
      type: 'actor',
      payloadChecksum: 'sample-checksum',
      signatures: [{
        keyId: 'human:test-user',
        role: 'author',
        notes: 'Sample actor record for testing',
        signature: 'sample-signature',
        timestamp: 1234567890
      }]
    },
    payload: sampleActorPayload
  };

  describe('getActor', () => {
    it('[EARS-A1] should return ActorRecord when it exists', async () => {
      mockActorStore.get.mockResolvedValue(sampleRecord);

      const result = await identityAdapter.getActor('human:test-user');

      expect(mockActorStore.get).toHaveBeenCalledWith('human:test-user');
      expect(result).toEqual(sampleActorPayload);
    });

    it('[EARS-A2] should return null when ActorRecord does not exist', async () => {
      mockActorStore.get.mockResolvedValue(null);

      const result = await identityAdapter.getActor('non-existent');

      expect(mockActorStore.get).toHaveBeenCalledWith('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listActors', () => {
    it('[EARS-B1] should return all ActorRecords', async () => {
      const actorIds = ['human:user1', 'human:user2'];
      const record1 = { ...sampleRecord, payload: { ...sampleActorPayload, id: 'human:user1' } };
      const record2 = { ...sampleRecord, payload: { ...sampleActorPayload, id: 'human:user2' } };

      mockActorStore.list.mockResolvedValue(actorIds);
      mockActorStore.get
        .mockResolvedValueOnce(record1)
        .mockResolvedValueOnce(record2);

      const result = await identityAdapter.listActors();

      expect(mockActorStore.list).toHaveBeenCalled();
      expect(mockActorStore.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('human:user1');
      expect(result[1]?.id).toBe('human:user2');
    });

    it('[EARS-B2] should return empty array when no actors exist', async () => {
      mockActorStore.list.mockResolvedValue([]);

      const result = await identityAdapter.listActors();

      expect(mockActorStore.list).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('createActor', () => {
    it('[EARS-C1] should create a new ActorRecord with generated keys', async () => {
      const inputPayload = {
        type: 'human' as const,
        displayName: 'Test User',
        roles: ['author'] as [string, ...string[]]
      };

      // Mock all dependencies
      mockedGenerateKeys.mockResolvedValue({
        publicKey: 'generated-public-key',
        privateKey: 'generated-private-key'
      });
      mockedGenerateActorId.mockReturnValue('human:test-user');
      mockedCreateActorRecord.mockReturnValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        notes: '',
        signature: 'generated-signature',
        timestamp: 1234567890
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.put.mockResolvedValue(undefined);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const result = await identityAdapter.createActor(inputPayload, 'human:test-user');

      expect(mockedGenerateKeys).toHaveBeenCalled();
      expect(mockedGenerateActorId).toHaveBeenCalledWith('human', 'Test User');
      expect(mockedCreateActorRecord).toHaveBeenCalled();
      expect(mockedCalculatePayloadChecksum).toHaveBeenCalled();
      expect(mockedSignPayload).toHaveBeenCalled();
      expect(mockedValidateFullActorRecord).toHaveBeenCalled();
      expect(mockActorStore.put).toHaveBeenCalled();
      expect(result).toEqual(sampleActorPayload);

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('[EARS-C3] should persist private key via KeyProvider', async () => {
      const inputPayload = {
        type: 'human' as const,
        displayName: 'Test User',
        roles: ['author'] as [string, ...string[]]
      };

      const testPrivateKey = 'test-private-key-base64';

      // Mock all dependencies
      mockedGenerateKeys.mockResolvedValue({
        publicKey: 'generated-public-key',
        privateKey: testPrivateKey
      });
      mockedGenerateActorId.mockReturnValue('human:test-user');
      mockedCreateActorRecord.mockReturnValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        notes: '',
        signature: 'generated-signature',
        timestamp: 1234567890
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.put.mockResolvedValue(undefined);
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await identityAdapter.createActor(inputPayload, 'human:test-user');

      // Verify private key was persisted via KeyProvider
      expect(mockKeyProvider.setPrivateKey).toHaveBeenCalledWith(
        'human:test-user',
        testPrivateKey
      );

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('[EARS-C2] should throw error when required fields are missing', async () => {
      const invalidPayload = {
        type: 'human' as const,
        // Missing displayName
      };

      await expect(identityAdapter.createActor(invalidPayload, 'signer'))
        .rejects.toThrow('ActorRecord requires type and displayName');
    });
  });

  describe('revokeActor', () => {
    it('[EARS-D1] should revoke an existing actor', async () => {
      const existingRecord = { ...sampleRecord };
      mockActorStore.get.mockResolvedValue(existingRecord);
      mockActorStore.put.mockResolvedValue(undefined);
      mockedCalculatePayloadChecksum.mockReturnValue('new-checksum');

      const result = await identityAdapter.revokeActor('human:test-user');

      expect(mockActorStore.get).toHaveBeenCalledWith('human:test-user');
      expect(mockActorStore.put).toHaveBeenCalled();
      expect(result.status).toBe('revoked');
    });

    it('[EARS-D2] should throw error when actor does not exist', async () => {
      mockActorStore.get.mockResolvedValue(null);

      await expect(identityAdapter.revokeActor('non-existent'))
        .rejects.toThrow('ActorRecord with id non-existent not found');
    });
  });

  describe('signRecord', () => {
    it('[EARS-E1] should sign record with real cryptographic signature when private key is available', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'initial-signer',
            role: 'author',
            notes: 'Initial signature for test',
            signature: 'initial-signature',
            timestamp: 1234567890
          }]
        },
        payload: sampleActorPayload // Use valid ActorRecord payload
      };

      const testPrivateKey = 'test-private-key-base64';

      // Mock actor exists
      mockActorStore.get.mockResolvedValue(sampleRecord);

      // Mock KeyProvider to return private key
      mockKeyProvider.getPrivateKey.mockResolvedValue(testPrivateKey);

      // Mock signPayload to return real signature
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        notes: 'Record signed',
        signature: 'real-cryptographic-signature',
        timestamp: Math.floor(Date.now() / 1000)
      });
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');

      const signedRecord = await identityAdapter.signRecord(mockRecord, 'human:test-user', 'author', 'Record signed');

      // Should have 2 signatures: original + new real signature
      expect(signedRecord.header.signatures).toHaveLength(2);

      // Check the new signature (second one) - should be real, not mock
      const newSignature = signedRecord.header.signatures[1];
      expect(newSignature).toBeDefined();
      expect(newSignature!.keyId).toBe('human:test-user');
      expect(newSignature!.role).toBe('author');
      expect(newSignature!.signature).toBe('real-cryptographic-signature');
      expect(newSignature!.signature).not.toContain('mock-signature-');
      expect(newSignature!.timestamp).toBeGreaterThan(0);

      // Verify private key was loaded via KeyProvider
      expect(mockKeyProvider.getPrivateKey).toHaveBeenCalledWith('human:test-user');
      expect(mockedSignPayload).toHaveBeenCalledWith(
        sampleActorPayload,
        testPrivateKey,
        'human:test-user',
        'author',
        'Record signed'
      );
    });

    it('[EARS-E2] should sign record with mock signature as fallback when private key is not available', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'initial-signer',
            role: 'author',
            notes: 'Initial signature for test',
            signature: 'initial-signature',
            timestamp: 1234567890
          }]
        },
        payload: sampleActorPayload // Use valid ActorRecord payload
      };

      // Mock actor exists
      mockActorStore.get.mockResolvedValue(sampleRecord);

      // Mock KeyProvider to return null (no private key)
      mockKeyProvider.getPrivateKey.mockResolvedValue(null);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const signedRecord = await identityAdapter.signRecord(mockRecord, 'human:test-user', 'author', 'Record signed');

      // Should have 2 signatures: original + new mock signature
      expect(signedRecord.header.signatures).toHaveLength(2);

      // Check the new signature (second one) - should be mock
      const newSignature = signedRecord.header.signatures[1];
      expect(newSignature).toBeDefined();
      expect(newSignature!.keyId).toBe('human:test-user');
      expect(newSignature!.role).toBe('author');
      // Mock signature should be valid base64 Ed25519 format (86 chars + ==)
      expect(newSignature!.signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
      expect(newSignature!.timestamp).toBeGreaterThan(0);

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('[EARS-E3] should throw error when actor not found', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'initial-signer',
            role: 'author',
            notes: 'Initial signature for test',
            signature: 'initial-signature',
            timestamp: 1234567890
          }]
        },
        payload: sampleActorPayload
      };

      mockActorStore.get.mockResolvedValue(null);

      await expect(identityAdapter.signRecord(mockRecord, 'non-existent', 'author', 'Test signature'))
        .rejects.toThrow('Actor not found: non-existent');
    });

    it('[EARS-E4] should replace placeholder signatures instead of adding new ones', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'human:test-user',
            role: 'author',
            notes: 'Task created',
            signature: 'placeholder',
            timestamp: 1234567890
          }]
        },
        payload: sampleActorPayload
      };

      // Mock actor exists
      mockActorStore.get.mockResolvedValue(sampleRecord);

      // Mock KeyProvider to return null (no private key) - will use mock signature
      mockKeyProvider.getPrivateKey.mockResolvedValue(null);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const signedRecord = await identityAdapter.signRecord(mockRecord, 'human:test-user', 'author', 'Placeholder replacement');

      // Should have only 1 signature (placeholder replaced, not added)
      expect(signedRecord.header.signatures).toHaveLength(1);

      // The signature should be replaced (not placeholder)
      const finalSignature = signedRecord.header.signatures[0];
      expect(finalSignature).toBeDefined();
      expect(finalSignature!.keyId).toBe('human:test-user');
      expect(finalSignature!.role).toBe('author');
      expect(finalSignature!.signature).not.toBe('placeholder');
      // Mock signature should be valid base64 Ed25519 format (86 chars + ==)
      expect(finalSignature!.signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
      expect(finalSignature!.timestamp).toBeGreaterThan(0);

      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  describe('rotateActorKey', () => {
    it('[EARS-F1] should rotate keys by creating new actor and revoking old one', async () => {
      const existingActor = sampleActorPayload;
      const baseActorId = 'human:new-test-user';
      const newActorId = 'human:new-test-user-v2'; // rotateActorKey adds -v2 suffix
      const newPublicKey = 'NEW_PUBLIC_KEY_BASE64_44_CHARS_LONG_AAAAAAAAAAA=';
      const newPrivateKey = 'new-private-key-base64';

      // Mock getActor to return existing actor
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(existingActor);

      // Mock generateKeys to return new keys
      mockedGenerateKeys.mockResolvedValueOnce({
        publicKey: newPublicKey,
        privateKey: newPrivateKey
      });

      // Mock generateActorId to return base ID (rotateActorKey will add -v2 suffix)
      mockedGenerateActorId.mockReturnValueOnce(baseActorId);

      // Mock createActorRecord for new actor
      const newActorPayload: ActorRecord = {
        ...existingActor,
        id: newActorId,
        publicKey: newPublicKey
      };
      mockedCreateActorRecord.mockReturnValueOnce(newActorPayload);

      // Mock calculatePayloadChecksum
      mockedCalculatePayloadChecksum.mockReturnValueOnce('new-checksum');

      // Mock signPayload
      mockedSignPayload.mockReturnValueOnce({
        keyId: newActorId,
        role: 'author',
        notes: 'Key rotation',
        signature: 'new-signature',
        timestamp: Date.now()
      });

      // Mock validateFullActorRecord
      mockedValidateFullActorRecord.mockResolvedValueOnce(undefined);

      // Mock actorStore.write for new actor
      mockActorStore.put.mockResolvedValue(undefined);
      mockActorStore.list.mockResolvedValue(['human:test-user']); // For bootstrap check

      // Mock revokeActor by mocking the internal calls
      mockActorStore.get
        .mockResolvedValueOnce(sampleRecord) // Read for revoke
        .mockResolvedValueOnce(sampleRecord); // Read for revoke (second call)

      const result = await identityAdapter.rotateActorKey('human:test-user');

      expect(result.oldActor.status).toBe('revoked');
      expect(result.oldActor.supersededBy).toBe(newActorId);
      expect(result.newActor.id).toBe(newActorId);
      expect(result.newActor.publicKey).toBe(newPublicKey);
      expect(mockActorStore.put).toHaveBeenCalled(); // New actor written
      expect(mockKeyProvider.setPrivateKey).toHaveBeenCalledWith(
        newActorId,
        newPrivateKey
      );
    });

    it('[EARS-F2] should throw error if actor not found', async () => {
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(null);

      await expect(identityAdapter.rotateActorKey('non-existent'))
        .rejects.toThrow('ActorRecord with id non-existent not found');
    });

    it('[EARS-F3] should throw error if actor already revoked', async () => {
      const revokedActor = { ...sampleActorPayload, status: 'revoked' as const };
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(revokedActor);

      await expect(identityAdapter.rotateActorKey('human:test-user'))
        .rejects.toThrow('Cannot rotate key for revoked actor: human:test-user');
    });

    it('[EARS-F4] should throw error if validateFullActorRecord fails', async () => {
      const existingActor = sampleActorPayload;
      const newActorId = 'human:new-test-user';
      const newPublicKey = 'NEW_PUBLIC_KEY_BASE64_44_CHARS_LONG_AAAAAAAAAAA=';
      const newPrivateKey = 'new-private-key-base64';

      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(existingActor);
      mockedGenerateKeys.mockResolvedValueOnce({
        publicKey: newPublicKey,
        privateKey: newPrivateKey
      });
      mockedGenerateActorId.mockReturnValueOnce(newActorId);
      mockedCreateActorRecord.mockReturnValueOnce({
        ...existingActor,
        id: newActorId,
        publicKey: newPublicKey
      });
      mockedCalculatePayloadChecksum.mockReturnValueOnce('new-checksum');
      mockedSignPayload.mockReturnValueOnce({
        keyId: newActorId,
        role: 'author',
        notes: 'Key rotation',
        signature: 'new-signature',
        timestamp: Date.now()
      });

      // Mock validateFullActorRecord to throw error
      mockedValidateFullActorRecord.mockRejectedValueOnce(
        new Error('Validation failed: invalid public key format')
      );

      await expect(identityAdapter.rotateActorKey('human:test-user'))
        .rejects.toThrow('Validation failed: invalid public key format');

      // Verify new actor was NOT written
      expect(mockActorStore.put).not.toHaveBeenCalled();
    });

    it('[EARS-F5] should throw error if actorStore.write fails (rollback scenario)', async () => {
      const existingActor = sampleActorPayload;
      const newActorId = 'human:new-test-user';
      const newPublicKey = 'NEW_PUBLIC_KEY_BASE64_44_CHARS_LONG_AAAAAAAAAAA=';
      const newPrivateKey = 'new-private-key-base64';

      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(existingActor);
      mockedGenerateKeys.mockResolvedValueOnce({
        publicKey: newPublicKey,
        privateKey: newPrivateKey
      });
      mockedGenerateActorId.mockReturnValueOnce(newActorId);
      mockedCreateActorRecord.mockReturnValueOnce({
        ...existingActor,
        id: newActorId,
        publicKey: newPublicKey
      });
      mockedCalculatePayloadChecksum.mockReturnValueOnce('new-checksum');
      mockedSignPayload.mockReturnValueOnce({
        keyId: newActorId,
        role: 'author',
        notes: 'Key rotation',
        signature: 'new-signature',
        timestamp: Date.now()
      });
      mockedValidateFullActorRecord.mockResolvedValueOnce(undefined);

      // Mock actorStore.write to fail
      mockActorStore.put.mockRejectedValueOnce(new Error('Disk full: cannot write'));

      await expect(identityAdapter.rotateActorKey('human:test-user'))
        .rejects.toThrow('Disk full: cannot write');

      // Verify revokeActor was NOT called (rollback)
      expect(mockActorStore.get).not.toHaveBeenCalledWith('human:test-user');
    });

    it('[EARS-F6] should handle failure when revokeActor fails after new actor is created', async () => {
      const existingActor = sampleActorPayload;
      const newActorId = 'human:new-test-user';
      const newPublicKey = 'NEW_PUBLIC_KEY_BASE64_44_CHARS_LONG_AAAAAAAAAAA=';
      const newPrivateKey = 'new-private-key-base64';

      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(existingActor);
      mockedGenerateKeys.mockResolvedValueOnce({
        publicKey: newPublicKey,
        privateKey: newPrivateKey
      });
      mockedGenerateActorId.mockReturnValueOnce(newActorId);
      mockedCreateActorRecord.mockReturnValueOnce({
        ...existingActor,
        id: newActorId,
        publicKey: newPublicKey
      });
      mockedCalculatePayloadChecksum.mockReturnValueOnce('new-checksum');
      mockedSignPayload.mockReturnValueOnce({
        keyId: newActorId,
        role: 'author',
        notes: 'Key rotation',
        signature: 'new-signature',
        timestamp: Date.now()
      });
      mockedValidateFullActorRecord.mockResolvedValueOnce(undefined);
      mockActorStore.put.mockResolvedValue(undefined);
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      // Mock revokeActor to fail directly
      jest.spyOn(identityAdapter, 'revokeActor').mockRejectedValueOnce(
        new Error('Cannot revoke actor: database error')
      );

      await expect(identityAdapter.rotateActorKey('human:test-user'))
        .rejects.toThrow('Cannot revoke actor: database error');

      // NOTE: This is a known limitation - if revokeActor fails, the new actor
      // is already created. This could leave two active actors. In production,
      // this should be handled with transactions or cleanup logic.
      expect(mockActorStore.put).toHaveBeenCalled(); // New actor was written
    });

    it('[EARS-F7] should handle private key persistence failure with warning only', async () => {
      const existingActor = sampleActorPayload;
      const newActorId = 'human:new-test-user';
      const newPublicKey = 'NEW_PUBLIC_KEY_BASE64_44_CHARS_LONG_AAAAAAAAAAA=';
      const newPrivateKey = 'new-private-key-base64';

      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(existingActor);
      mockedGenerateKeys.mockResolvedValueOnce({
        publicKey: newPublicKey,
        privateKey: newPrivateKey
      });
      mockedGenerateActorId.mockReturnValueOnce(newActorId);
      mockedCreateActorRecord.mockReturnValueOnce({
        ...existingActor,
        id: newActorId,
        publicKey: newPublicKey
      });
      mockedCalculatePayloadChecksum.mockReturnValueOnce('new-checksum');
      mockedSignPayload.mockReturnValueOnce({
        keyId: newActorId,
        role: 'author',
        notes: 'Key rotation',
        signature: 'new-signature',
        timestamp: Date.now()
      });
      mockedValidateFullActorRecord.mockResolvedValueOnce(undefined);
      mockActorStore.put.mockResolvedValue(undefined);
      mockActorStore.list.mockResolvedValue(['human:test-user']);
      mockActorStore.get
        .mockResolvedValueOnce(sampleRecord)
        .mockResolvedValueOnce(sampleRecord);

      // Mock KeyProvider to fail on setPrivateKey
      mockKeyProvider.setPrivateKey.mockRejectedValue(new Error('Permission denied'));

      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Should NOT throw error - warning only (non-blocking failure)
      const result = await identityAdapter.rotateActorKey('human:test-user');

      expect(result.oldActor.status).toBe('revoked');
      expect(result.newActor.id).toBe(newActorId);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not persist private key')
      );

      console.warn = originalWarn;
    });
  });

  describe('authenticate', () => {
    it('[EARS-G1] should log warning for unimplemented method', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await identityAdapter.authenticate('test-token');

      expect(console.warn).toHaveBeenCalledWith('authenticate not fully implemented yet');
      console.warn = originalWarn;
    });
  });

  describe('resolveCurrentActorId', () => {
    it('[EARS-K1] should return same ID for active actor', async () => {
      const activeActor = { ...sampleActorPayload, status: 'active' as const };
      mockActorStore.get.mockResolvedValue({
        ...sampleRecord,
        payload: activeActor
      });

      const result = await identityAdapter.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user');
      expect(mockActorStore.get).toHaveBeenCalledWith('human:test-user');
    });

    it('[EARS-K2] should follow succession chain for revoked actor', async () => {
      const revokedActor = {
        ...sampleActorPayload,
        status: 'revoked' as const,
        supersededBy: 'human:test-user-v2'
      };
      const newActiveActor = {
        ...sampleActorPayload,
        id: 'human:test-user-v2',
        status: 'active' as const
      };

      mockActorStore.get
        .mockResolvedValueOnce({
          ...sampleRecord,
          payload: revokedActor
        })
        .mockResolvedValueOnce({
          ...sampleRecord,
          payload: newActiveActor
        });

      const result = await identityAdapter.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user-v2');
      expect(mockActorStore.get).toHaveBeenCalledTimes(2);
      expect(mockActorStore.get).toHaveBeenNthCalledWith(1, 'human:test-user');
      expect(mockActorStore.get).toHaveBeenNthCalledWith(2, 'human:test-user-v2');
    });

    it('[EARS-K3] should follow long succession chain', async () => {
      const actor1 = { ...sampleActorPayload, status: 'revoked' as const, supersededBy: 'human:test-user-v2' };
      const actor2 = { ...sampleActorPayload, id: 'human:test-user-v2', status: 'revoked' as const, supersededBy: 'human:test-user-v3' };
      const actor3 = { ...sampleActorPayload, id: 'human:test-user-v3', status: 'active' as const };

      mockActorStore.get
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor1 })
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor2 })
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor3 });

      const result = await identityAdapter.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user-v3');
      expect(mockActorStore.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('getEffectiveActorForAgent', () => {
    it('[EARS-L1] should return effective actor for agent with succession', async () => {
      // Test the method by mocking resolveCurrentActorId and getActor separately
      const newActiveAgentActor = {
        ...sampleActorPayload,
        id: 'agent:test-agent-v2',
        type: 'agent' as const,
        status: 'active' as const
      };

      // Spy on the methods to control their behavior
      jest.spyOn(identityAdapter, 'resolveCurrentActorId')
        .mockResolvedValue('agent:test-agent-v2');

      jest.spyOn(identityAdapter, 'getActor')
        .mockResolvedValue(newActiveAgentActor);

      const result = await identityAdapter.getEffectiveActorForAgent('agent:test-agent');

      expect(result).toEqual(newActiveAgentActor);
      expect(result?.id).toBe('agent:test-agent-v2');
      expect(result?.status).toBe('active');

      // Verify the method calls
      expect(identityAdapter.resolveCurrentActorId).toHaveBeenCalledWith('agent:test-agent');
      expect(identityAdapter.getActor).toHaveBeenCalledWith('agent:test-agent-v2');
    });
  });

  describe('getCurrentActor', () => {
    it('[EARS-M1] should return actor from valid session resolving succession chain', async () => {
      // Mock SessionManager to simulate existing session (testing the primary path)
      mockSessionManager.loadSession.mockResolvedValue({
        lastSession: {
          actorId: 'human:camilo',
          timestamp: '2025-09-15T17:21:00Z'
        }
      });

      jest.spyOn(identityAdapter, 'resolveCurrentActorId')
        .mockResolvedValue('human:camilo');
      jest.spyOn(identityAdapter, 'getActor')
        .mockResolvedValue(sampleActorPayload);

      const result = await identityAdapter.getCurrentActor();

      expect(result).toEqual(sampleActorPayload);
      expect(identityAdapter.resolveCurrentActorId).toHaveBeenCalledWith('human:camilo');
      expect(identityAdapter.getActor).toHaveBeenCalledWith('human:camilo');
    });

    it('[EARS-M2] should return first active actor when no valid session', async () => {
      // Mock SessionManager to simulate no session (testing the fallback path)
      mockSessionManager.loadSession.mockResolvedValue(null);

      // Mock listActors to return active actor
      jest.spyOn(identityAdapter, 'listActors')
        .mockResolvedValue([
          { ...sampleActorPayload, status: 'revoked' },
          { ...sampleActorPayload, id: 'human:active-user', status: 'active' }
        ]);

      const result = await identityAdapter.getCurrentActor();

      expect(result.id).toBe('human:active-user');
      expect(result.status).toBe('active');
    });

    it('[EARS-M3] should throw error when no active actors exist', async () => {
      // Mock SessionManager to simulate no session
      mockSessionManager.loadSession.mockResolvedValue(null);

      // Mock listActors to return only revoked actors
      jest.spyOn(identityAdapter, 'listActors')
        .mockResolvedValue([
          { ...sampleActorPayload, status: 'revoked' },
          { ...sampleActorPayload, id: 'human:revoked-2', status: 'revoked' }
        ]);

      await expect(identityAdapter.getCurrentActor())
        .rejects.toThrow("❌ No active actors found. Run 'gitgov init' first.");
    });
  });

  describe('Event Emission (EARS-N1 to N3)', () => {
    it('[EARS-N1] should emit actor.created event when creating actor with eventBus', async () => {
      const inputPayload = {
        type: 'human' as const,
        displayName: 'Test User',
        roles: ['author'] as [string, ...string[]]
      };

      // Mock dependencies
      mockedGenerateKeys.mockResolvedValue({
        publicKey: 'generated-public-key',
        privateKey: 'generated-private-key'
      });
      mockedGenerateActorId.mockReturnValue('human:test-user');
      mockedCreateActorRecord.mockReturnValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        notes: '',
        signature: 'generated-signature',
        timestamp: 1234567890
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.put.mockResolvedValue(undefined);
      mockActorStore.list.mockResolvedValue(['human:test-user']); // Only one actor (bootstrap)

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await identityAdapterWithEvents.createActor(inputPayload, 'human:test-user');

      // Verify event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith({
        type: 'identity.actor.created',
        timestamp: expect.any(Number),
        source: 'identity_adapter',
        payload: {
          actorId: 'human:test-user',
          type: 'human',
          publicKey: 'sample-public-key',
          roles: ['author'],
          isBootstrap: true,
        },
      });

      console.warn = originalWarn;
    });

    it('[EARS-N2] should emit actor.revoked event when revoking actor with eventBus', async () => {
      const existingRecord = { ...sampleRecord };
      mockActorStore.get.mockResolvedValue(existingRecord);
      mockActorStore.put.mockResolvedValue(undefined);
      mockedCalculatePayloadChecksum.mockReturnValue('new-checksum');

      await identityAdapterWithEvents.revokeActor('human:test-user', 'admin', 'manual', 'human:test-user-v2');

      // Verify event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith({
        type: 'identity.actor.revoked',
        timestamp: expect.any(Number),
        source: 'identity_adapter',
        payload: {
          actorId: 'human:test-user',
          revokedBy: 'admin',
          supersededBy: 'human:test-user-v2',
          revocationReason: 'manual',
        },
      });
    });

    it('[EARS-N3] should not emit events when eventBus is not provided (optional dependency)', async () => {
      const inputPayload = {
        type: 'human' as const,
        displayName: 'Test User',
        roles: ['author'] as [string, ...string[]]
      };

      // Mock dependencies
      mockedGenerateKeys.mockResolvedValue({
        publicKey: 'generated-public-key',
        privateKey: 'generated-private-key'
      });
      mockedGenerateActorId.mockReturnValue('human:test-user');
      mockedCreateActorRecord.mockReturnValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        notes: '',
        signature: 'generated-signature',
        timestamp: 1234567890
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.put.mockResolvedValue(undefined);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Use adapter WITHOUT eventBus
      await identityAdapter.createActor(inputPayload, 'human:test-user');

      // Verify no events were published (optional dependency)
      expect(mockEventBus.publish).not.toHaveBeenCalled();

      console.warn = originalWarn;
    });
  });
});
