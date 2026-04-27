import { IdentityModule } from './identity_module';
import type { ActorRecord, GitGovActorRecord } from '../record_types';
import type { RecordStore } from '../record_store/record_store';
import { createActorRecord } from '../record_factories/actor_factory';
import { validateFullActorRecord } from '../record_validations/actor_validator';
import { generateKeys, signPayload } from '../crypto/signatures';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { generateActorId, computeSuccessorActorId } from '../utils/id_generator';
import { FsKeyProvider } from '../key_provider/fs/fs_key_provider';
import type { KeyProvider } from '../key_provider/key_provider';
import type { IEventStream } from '../event_bus';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Mocked unit-test suite ──────────────────────────────────────────

jest.mock('../record_factories/actor_factory');
jest.mock('../record_validations/actor_validator');
jest.mock('../crypto/signatures', () => {
  const actual = jest.requireActual('../crypto/signatures');
  return {
    ...actual,
    generateKeys: jest.fn(),
    signPayload: jest.fn(),
    buildSignatureDigest: jest.fn(),
  };
});
jest.mock('../crypto/checksum');
jest.mock('../utils/id_generator', () => {
  const actual = jest.requireActual('../utils/id_generator');
  return {
    ...actual,
    generateActorId: jest.fn(),
    computeSuccessorActorId: jest.fn(),
  };
});

interface MockKeyProvider extends KeyProvider {
  sign: jest.MockedFunction<(actorId: string, data: Uint8Array) => Promise<Uint8Array>>;
  getPrivateKey: jest.MockedFunction<(actorId: string) => Promise<string | null>>;
  getPublicKey: jest.MockedFunction<(actorId: string) => Promise<string | null>>;
  setPrivateKey: jest.MockedFunction<(actorId: string, key: string) => Promise<void>>;
  hasPrivateKey: jest.MockedFunction<(actorId: string) => Promise<boolean>>;
  deletePrivateKey: jest.MockedFunction<(actorId: string) => Promise<boolean>>;
}

interface MockEventBus extends IEventStream {
  publish: jest.MockedFunction<(event: any) => void>;
  subscribe: jest.MockedFunction<(eventType: string, handler: any) => any>;
  unsubscribe: jest.MockedFunction<(subscriptionId: string) => boolean>;
  getSubscriptions: jest.MockedFunction<() => any[]>;
  clearSubscriptions: jest.MockedFunction<() => void>;
  waitForIdle: jest.MockedFunction<(options?: any) => Promise<void>>;
}

const mockedCreateActorRecord = createActorRecord as jest.MockedFunction<typeof createActorRecord>;
const mockedValidateFullActorRecord = validateFullActorRecord as jest.MockedFunction<typeof validateFullActorRecord>;
const mockedGenerateKeys = generateKeys as jest.MockedFunction<typeof generateKeys>;
const mockedSignPayload = signPayload as jest.MockedFunction<typeof signPayload>;
const mockedCalculatePayloadChecksum = calculatePayloadChecksum as jest.MockedFunction<typeof calculatePayloadChecksum>;
const mockedGenerateActorId = generateActorId as jest.MockedFunction<typeof generateActorId>;
const mockedComputeSuccessorActorId = computeSuccessorActorId as jest.MockedFunction<typeof computeSuccessorActorId>;
const mockedBuildSignatureDigest = (
  jest.requireMock('../crypto/signatures') as { buildSignatureDigest: jest.MockedFunction<typeof import('../crypto/signatures').buildSignatureDigest> }
).buildSignatureDigest;

describe('IdentityModule', () => {
  let identityModule: IdentityModule;
  let identityModuleWithEvents: IdentityModule;
  let mockActorStore: jest.Mocked<RecordStore<GitGovActorRecord>>;
  let mockKeyProvider: MockKeyProvider;
  let mockEventBus: MockEventBus;

  const mockActorPayload: ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'mock-public-key-base64-44chars-aaaaaaaaaaaaa',
    roles: ['author'],
    status: 'active',
  };

  const mockSignature = {
    keyId: 'human:test-user',
    role: 'author',
    notes: 'Actor registration',
    signature: 'mock-signature-base64',
    timestamp: 1700000000,
  };

  const mockRecord: GitGovActorRecord = {
    header: {
      version: '1.0',
      type: 'actor',
      payloadChecksum: 'mock-checksum',
      signatures: [mockSignature],
    },
    payload: mockActorPayload,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockActorStore = {
      get: jest.fn(),
      put: jest.fn(),
      putMany: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      exists: jest.fn(),
    } as unknown as jest.Mocked<RecordStore<GitGovActorRecord>>;

    mockKeyProvider = {
      sign: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      getPrivateKey: jest.fn().mockResolvedValue(null),
      getPublicKey: jest.fn().mockResolvedValue(null),
      setPrivateKey: jest.fn().mockResolvedValue(undefined),
      hasPrivateKey: jest.fn().mockResolvedValue(false),
      deletePrivateKey: jest.fn().mockResolvedValue(false),
    };

    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn().mockReturnValue([]),
      clearSubscriptions: jest.fn(),
      waitForIdle: jest.fn().mockResolvedValue(undefined),
    };

    identityModule = new IdentityModule({
      stores: { actors: mockActorStore },
      keyProvider: mockKeyProvider,
    });

    identityModuleWithEvents = new IdentityModule({
      stores: { actors: mockActorStore },
      keyProvider: mockKeyProvider,
      eventBus: mockEventBus,
    });

    // Default mock implementations
    mockedGenerateKeys.mockResolvedValue({
      publicKey: 'mock-public-key-base64-44chars-aaaaaaaaaaaaa',
      privateKey: 'mock-private-key-base64',
    });
    mockedGenerateActorId.mockReturnValue('human:test-user');
    mockedCreateActorRecord.mockImplementation((p) => p as ActorRecord);
    mockedValidateFullActorRecord.mockResolvedValue(undefined);
    mockedSignPayload.mockReturnValue(mockSignature);
    mockedCalculatePayloadChecksum.mockReturnValue('mock-checksum');
    mockedBuildSignatureDigest.mockReturnValue(Buffer.from('mock-digest'));
    mockedComputeSuccessorActorId.mockReturnValue('human:test-user-v2');
    mockActorStore.put.mockResolvedValue(undefined as any);
    mockActorStore.list.mockResolvedValue([]);
  });

  // ── 4.1. createActor (IDM-A1 to A3) ──────────────────────────────

  describe('4.1. createActor (IDM-A1 to A3)', () => {
    it('[IDM-A1] should create actor with generated Ed25519 keys', async () => {
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      const result = await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(mockedGenerateKeys).toHaveBeenCalled();
      expect(mockedCreateActorRecord).toHaveBeenCalled();
      expect(mockedCalculatePayloadChecksum).toHaveBeenCalled();
      expect(mockedSignPayload).toHaveBeenCalledWith(
        expect.anything(),
        'mock-private-key-base64',
        'human:test-user',
        'author',
        'Actor registration',
      );
      expect(mockedValidateFullActorRecord).toHaveBeenCalled();
      expect(mockActorStore.put).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          header: expect.objectContaining({
            type: 'actor',
            payloadChecksum: 'mock-checksum',
          }),
        }),
      );
      expect(result).toBeDefined();
      expect(result.id).toBe('human:test-user');
    });

    it('[IDM-A2] should persist private key via keyProvider', async () => {
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(mockKeyProvider.setPrivateKey).toHaveBeenCalledWith(
        'human:test-user',
        'mock-private-key-base64',
      );
    });

    it('[IDM-A2] should warn and continue when key persistence fails', async () => {
      mockKeyProvider.setPrivateKey.mockRejectedValue(new Error('Permission denied'));
      mockActorStore.list.mockResolvedValue(['human:test-user']);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(result).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not persist private key'),
      );
      warnSpy.mockRestore();
    });

    it('[IDM-A3] should throw when required fields missing', async () => {
      await expect(
        identityModule.createActor({ type: undefined as any }, 'self'),
      ).rejects.toThrow('ActorRecord requires type and displayName');

      expect(mockedGenerateKeys).not.toHaveBeenCalled();
      expect(mockActorStore.put).not.toHaveBeenCalled();
    });

    it('[IDM-A3] should throw when displayName missing', async () => {
      await expect(
        identityModule.createActor({ type: 'human' }, 'self'),
      ).rejects.toThrow('ActorRecord requires type and displayName');

      expect(mockedGenerateKeys).not.toHaveBeenCalled();
    });
  });

  // ── 4.2. Actor Queries (IDM-B1 to B6) ─────────────────────────────

  describe('4.2. Actor Queries (IDM-B1 to B6)', () => {
    it('[IDM-B1] should return ActorRecord when exists', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      const result = await identityModule.getActor('human:test-user');

      expect(result).toEqual(mockActorPayload);
      expect(mockActorStore.get).toHaveBeenCalledWith('human:test-user');
    });

    it('[IDM-B2] should return null when actor not found', async () => {
      mockActorStore.get.mockResolvedValue(null);

      const result = await identityModule.getActor('human:nonexistent');

      expect(result).toBeNull();
    });

    it('[IDM-B3] should return all ActorRecords', async () => {
      const actor2: ActorRecord = {
        ...mockActorPayload,
        id: 'human:second-user',
        displayName: 'Second User',
      };
      const record2: GitGovActorRecord = {
        ...mockRecord,
        payload: actor2,
      };

      mockActorStore.list.mockResolvedValue(['human:test-user', 'human:second-user']);
      mockActorStore.get
        .mockResolvedValueOnce(mockRecord)
        .mockResolvedValueOnce(record2);

      const result = await identityModule.listActors();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockActorPayload);
      expect(result[1]).toEqual(actor2);
    });

    it('[IDM-B4] should return empty array when no actors exist', async () => {
      mockActorStore.list.mockResolvedValue([]);

      const result = await identityModule.listActors();

      expect(result).toEqual([]);
    });

    it('[IDM-B5] should return publicKey for existing actor', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      const result = await identityModule.getActorPublicKey('human:test-user');

      expect(result).toBe('mock-public-key-base64-44chars-aaaaaaaaaaaaa');
    });

    it('[IDM-B6] should return null for non-existent actor', async () => {
      mockActorStore.get.mockResolvedValue(null);

      const result = await identityModule.getActorPublicKey('human:nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── 4.3. revokeActor (IDM-C1 to C3) ──────────────────────────────

  describe('4.3. revokeActor (IDM-C1 to C3)', () => {
    it('[IDM-C1] should revoke actor and sign with revoker key', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      const result = await identityModule.revokeActor(
        'human:test-user',
        'human:admin',
        'manual',
      );

      expect(result.status).toBe('revoked');
      expect(mockActorStore.put).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          header: expect.objectContaining({
            signatures: expect.arrayContaining([
              expect.objectContaining({ keyId: 'human:admin' }),
            ]),
          }),
          payload: expect.objectContaining({ status: 'revoked' }),
        }),
      );
      // Verify createSignature was called via keyProvider.sign
      expect(mockKeyProvider.sign).toHaveBeenCalledWith(
        'human:admin',
        expect.any(Uint8Array),
      );
    });

    it('[IDM-C1] should add supersededBy when provided', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      const result = await identityModule.revokeActor(
        'human:test-user',
        'human:admin',
        'rotation',
        'human:test-user-v2',
      );

      expect(result.supersededBy).toBe('human:test-user-v2');
    });

    it('[IDM-C3] should throw when actor not found', async () => {
      mockActorStore.get.mockResolvedValue(null);

      await expect(
        identityModule.revokeActor('human:nonexistent', 'human:admin', 'manual'),
      ).rejects.toThrow('ActorRecord with id human:nonexistent not found');
    });
  });

  // ── 4.4. Succession Chain (IDM-D1 to D3) ──────────────────────────

  describe('4.4. Succession Chain (IDM-D1 to D3)', () => {
    it('[IDM-D1] should return same id for active actor', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      const result = await identityModule.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user');
    });

    it('[IDM-D2] should follow succession chain to active actor', async () => {
      const revokedActor1: GitGovActorRecord = {
        ...mockRecord,
        payload: {
          ...mockActorPayload,
          id: 'human:test-user',
          status: 'revoked',
          supersededBy: 'human:test-user-v2',
        },
      };
      const revokedActor2: GitGovActorRecord = {
        ...mockRecord,
        payload: {
          ...mockActorPayload,
          id: 'human:test-user-v2',
          status: 'revoked',
          supersededBy: 'human:test-user-v3',
        },
      };
      const activeActor: GitGovActorRecord = {
        ...mockRecord,
        payload: {
          ...mockActorPayload,
          id: 'human:test-user-v3',
          status: 'active',
        },
      };

      mockActorStore.get
        .mockResolvedValueOnce(revokedActor1)
        .mockResolvedValueOnce(revokedActor2)
        .mockResolvedValueOnce(activeActor);

      const result = await identityModule.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user-v3');
    });

    it('[IDM-D3] should return effective actor for agent with succession', async () => {
      const revokedAgent: GitGovActorRecord = {
        ...mockRecord,
        payload: {
          ...mockActorPayload,
          id: 'agent:auditor',
          type: 'agent',
          status: 'revoked',
          supersededBy: 'agent:auditor-v2',
        },
      };
      const activeAgent: GitGovActorRecord = {
        ...mockRecord,
        payload: {
          ...mockActorPayload,
          id: 'agent:auditor-v2',
          type: 'agent',
          status: 'active',
        },
      };

      mockActorStore.get
        .mockResolvedValueOnce(revokedAgent)
        .mockResolvedValueOnce(activeAgent)
        .mockResolvedValueOnce(activeAgent);

      const result = await identityModule.getEffectiveActorForAgent('agent:auditor');

      expect(result).toBeDefined();
      expect(result!.id).toBe('agent:auditor-v2');
      expect(result!.status).toBe('active');
    });
  });

  // ── 4.5. Key Rotation (IDM-E1 to E9) ──────────────────────────────

  describe('4.5. Key Rotation (IDM-E1 to E9)', () => {
    beforeEach(() => {
      // Setup for rotation tests: existing active actor
      mockActorStore.get.mockImplementation(async (id) => {
        if (id === 'human:test-user') {
          return mockRecord;
        }
        return null;
      });
    });

    it('[IDM-E1] should rotate key with new actor signed by old key', async () => {
      const result = await identityModule.rotateActorKey('human:test-user');

      // Should generate new keys
      expect(mockedGenerateKeys).toHaveBeenCalled();
      // Should compute successor ID
      expect(mockedComputeSuccessorActorId).toHaveBeenCalled();
      // Should sign with OLD key via keyProvider.sign (createSignature helper)
      expect(mockKeyProvider.sign).toHaveBeenCalledWith(
        'human:test-user',
        expect.any(Uint8Array),
      );
      // Should persist new actor
      expect(mockActorStore.put).toHaveBeenCalledWith(
        'human:test-user-v2',
        expect.objectContaining({
          payload: expect.objectContaining({
            id: 'human:test-user-v2',
            status: 'active',
          }),
        }),
      );
      // Should return old and new actors
      expect(result.newActor).toBeDefined();
      expect(result.oldActor).toBeDefined();
      expect(result.oldActor.status).toBe('revoked');
    });

    it('[IDM-E3] should use provided external keys', async () => {
      const externalPubKey = 'external-public-key-base64-aaaaaaaaaaaaaaa';
      const externalPrivKey = 'external-private-key-base64';

      await identityModule.rotateActorKey('human:test-user', {
        newPublicKey: externalPubKey,
        newPrivateKey: externalPrivKey,
      });

      // Should NOT generate new keys
      expect(mockedGenerateKeys).not.toHaveBeenCalled();
      // Should persist the external private key
      expect(mockKeyProvider.setPrivateKey).toHaveBeenCalledWith(
        'human:test-user-v2',
        externalPrivKey,
      );
    });

    it('[IDM-E4] should throw for non-existent actor', async () => {
      mockActorStore.get.mockResolvedValue(null);

      await expect(
        identityModule.rotateActorKey('human:nonexistent'),
      ).rejects.toThrow('ActorRecord with id human:nonexistent not found');
    });

    it('[IDM-E5] should throw for revoked actor', async () => {
      mockActorStore.get.mockResolvedValue({
        ...mockRecord,
        payload: { ...mockActorPayload, status: 'revoked' },
      });

      await expect(
        identityModule.rotateActorKey('human:test-user'),
      ).rejects.toThrow('Cannot rotate key for revoked actor: human:test-user');
    });

    it('[IDM-E6] should not create actor if validation fails', async () => {
      mockedValidateFullActorRecord.mockRejectedValueOnce(
        new Error('Validation failed'),
      );

      await expect(
        identityModule.rotateActorKey('human:test-user'),
      ).rejects.toThrow('Validation failed');

      // store.put should NOT have been called for the new actor
      expect(mockActorStore.put).not.toHaveBeenCalled();
    });

    it('[IDM-E7] should not revoke if store write fails', async () => {
      // First put (new actor) throws
      mockActorStore.put.mockRejectedValueOnce(new Error('Store write failed'));

      await expect(
        identityModule.rotateActorKey('human:test-user'),
      ).rejects.toThrow('Store write failed');

      // Only one put call (the failed one) — revokeActor never runs
      expect(mockActorStore.put).toHaveBeenCalledTimes(1);
    });

    it('[IDM-E8] should throw if revocation fails after creation', async () => {
      // First put (new actor) succeeds, then get for revokeActor returns the record,
      // then second put (revocation) throws
      mockActorStore.put
        .mockResolvedValueOnce(undefined as any) // new actor put succeeds
        .mockRejectedValueOnce(new Error('Revocation store write failed')); // revoke put fails

      await expect(
        identityModule.rotateActorKey('human:test-user'),
      ).rejects.toThrow('Revocation store write failed');
    });

    it('[IDM-E9] should complete rotation with warning on key persist failure', async () => {
      mockKeyProvider.setPrivateKey.mockRejectedValue(
        new Error('Key persist failed'),
      );
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await identityModule.rotateActorKey('human:test-user');

      expect(result.newActor).toBeDefined();
      expect(result.oldActor).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not persist private key'),
      );
      warnSpy.mockRestore();
    });
  });

  // ── 4.6. Event Emission (IDM-F1 to F3) ────────────────────────────

  describe('4.6. Event Emission (IDM-F1 to F3)', () => {
    it('[IDM-F1] should emit actor.created when eventBus configured', async () => {
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      await identityModuleWithEvents.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'identity.actor.created',
          source: 'identity_module',
          payload: expect.objectContaining({
            actorId: 'human:test-user',
            type: 'human',
            isBootstrap: true,
          }),
        }),
      );
    });

    it('[IDM-F1] should set isBootstrap false when other actors exist', async () => {
      mockActorStore.list.mockResolvedValue([
        'human:existing-actor',
        'human:test-user',
      ]);

      await identityModuleWithEvents.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            isBootstrap: false,
          }),
        }),
      );
    });

    it('[IDM-F2] should emit actor.revoked when eventBus configured', async () => {
      mockActorStore.get.mockResolvedValue(mockRecord);

      await identityModuleWithEvents.revokeActor(
        'human:test-user',
        'human:admin',
        'manual',
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'identity.actor.revoked',
          source: 'identity_module',
          payload: expect.objectContaining({
            actorId: 'human:test-user',
            revokedBy: 'human:admin',
            revocationReason: 'manual',
          }),
        }),
      );
    });

    it('[IDM-F3] should complete without events when no eventBus', async () => {
      mockActorStore.list.mockResolvedValue(['human:test-user']);

      const result = await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(result).toBeDefined();
      // No event bus was provided to identityModule (without events)
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });
});

// ── Three Gates integration tests (real crypto) ────────────────────

describe('IdentityModule — Three Gates with REAL crypto', () => {
  let tmpDir: string;
  let keyProvider: InstanceType<typeof FsKeyProvider>;
  let actorStore: Record<string, GitGovActorRecord>;
  let store: {
    get: jest.Mock;
    put: jest.Mock;
    putMany: jest.Mock;
    list: jest.Mock;
    delete: jest.Mock;
    exists: jest.Mock;
  };
  let oldKeys: { publicKey: string; privateKey: string };

  // Restore real modules for this describe block
  beforeAll(async () => {
    // Unmock for real crypto
    jest.restoreAllMocks();

    // Re-import real modules (they were mocked at file level, so we need requireActual)
    const realCrypto = jest.requireActual('../crypto/signatures');
    const realChecksum = jest.requireActual('../crypto/checksum');
    const realIdGen = jest.requireActual('../utils/id_generator');
    const realFactory = jest.requireActual('../record_factories/actor_factory');
    const realValidator = jest.requireActual('../record_validations/actor_validator');

    // Restore the mocked functions to their real implementations
    (generateKeys as jest.Mock).mockImplementation(realCrypto.generateKeys);
    (signPayload as jest.Mock).mockImplementation(realCrypto.signPayload);
    const buildSigDigest = jest.requireMock('../crypto/signatures') as any;
    buildSigDigest.buildSignatureDigest.mockImplementation(realCrypto.buildSignatureDigest);
    (calculatePayloadChecksum as jest.Mock).mockImplementation(realChecksum.calculatePayloadChecksum);
    (generateActorId as jest.Mock).mockImplementation(realIdGen.generateActorId);
    (computeSuccessorActorId as jest.Mock).mockImplementation(realIdGen.computeSuccessorActorId);
    (createActorRecord as jest.Mock).mockImplementation(realFactory.createActorRecord);
    (validateFullActorRecord as jest.Mock).mockImplementation(realValidator.validateFullActorRecord);
    // Also restore internal validator functions used by createActorRecord
    const mockedValidatorModule = jest.requireMock('../record_validations/actor_validator') as any;
    mockedValidatorModule.validateActorRecordDetailed.mockImplementation(realValidator.validateActorRecordDetailed);
    mockedValidatorModule.validateActorRecordSchema.mockImplementation(realValidator.validateActorRecordSchema);
    mockedValidatorModule.isActorRecord.mockImplementation(realValidator.isActorRecord);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idm-3gates-'));
    keyProvider = new FsKeyProvider({ keysDir: path.join(tmpDir, 'keys') });
    oldKeys = await realCrypto.generateKeys();
    await keyProvider.setPrivateKey('human:three-gates', oldKeys.privateKey);

    actorStore = {};
    store = {
      get: jest.fn(async (id: string) => actorStore[id] || null),
      put: jest.fn(async (id: string, record: GitGovActorRecord) => { actorStore[id] = record; }),
      putMany: jest.fn(),
      list: jest.fn(async () => Object.keys(actorStore)),
      delete: jest.fn(),
      exists: jest.fn(async (id: string) => id in actorStore),
    };

    // Seed initial actor record with real crypto
    const actorPayload: ActorRecord = {
      id: 'human:three-gates',
      type: 'human',
      displayName: 'Three Gates',
      publicKey: oldKeys.publicKey,
      roles: ['developer'],
      status: 'active',
    };
    const checksum = realChecksum.calculatePayloadChecksum(actorPayload);
    const creationSig = realCrypto.signPayload(
      actorPayload,
      oldKeys.privateKey,
      'human:three-gates',
      'author',
      'Genesis',
    );
    actorStore['human:three-gates'] = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum: checksum,
        signatures: [creationSig],
      },
      payload: actorPayload,
    };
  });

  afterAll(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('[IDM-C2] should produce record passing Three Gates validation', async () => {
    const realVerify = jest.requireActual('../crypto/signatures');

    const identityMod = new IdentityModule({
      stores: { actors: store as any },
      keyProvider,
    });

    const revokedResult = await identityMod.revokeActor(
      'human:three-gates',
      'human:three-gates',
      'manual',
    );

    const revokedRecord = actorStore['human:three-gates']!;
    expect(revokedRecord).toBeDefined();
    expect(revokedResult.status).toBe('revoked');

    // Gate 1: Integrity — payload checksum matches
    const realChecksum = jest.requireActual('../crypto/checksum');
    expect(realChecksum.calculatePayloadChecksum(revokedRecord.payload)).toBe(
      revokedRecord.header.payloadChecksum,
    );

    // Gate 2: Schema — required revocation fields
    expect(revokedRecord.payload.status).toBe('revoked');
    expect(revokedRecord.header.signatures).toHaveLength(1);

    // Gate 3: Authentication — signature verifies with revoker's key
    const valid = await realVerify.verifySignatures(
      revokedRecord,
      async (keyId: string) =>
        keyId === 'human:three-gates' ? oldKeys.publicKey : null,
    );
    expect(valid).toBe(true);
  });

  it('[IDM-E2] should produce records passing Three Gates validation', async () => {
    const realCrypto = jest.requireActual('../crypto/signatures');
    const realChecksumMod = jest.requireActual('../crypto/checksum');

    // Re-seed an active actor since C2 test revoked it
    const freshKeys = await realCrypto.generateKeys();
    const freshTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idm-e2-'));
    const freshKeyProvider = new FsKeyProvider({
      keysDir: path.join(freshTmpDir, 'keys'),
    });
    await freshKeyProvider.setPrivateKey('human:e2-test', freshKeys.privateKey);

    const freshStore: Record<string, GitGovActorRecord> = {};
    const fStore = {
      get: jest.fn(async (id: string) => freshStore[id] || null),
      put: jest.fn(async (id: string, record: GitGovActorRecord) => { freshStore[id] = record; }),
      putMany: jest.fn(),
      list: jest.fn(async () => Object.keys(freshStore)),
      delete: jest.fn(),
      exists: jest.fn(async (id: string) => id in freshStore),
    };

    const seedPayload: ActorRecord = {
      id: 'human:e2-test',
      type: 'human',
      displayName: 'E2 Test',
      publicKey: freshKeys.publicKey,
      roles: ['developer'],
      status: 'active',
    };
    const seedChecksum = realChecksumMod.calculatePayloadChecksum(seedPayload);
    const seedSig = realCrypto.signPayload(
      seedPayload,
      freshKeys.privateKey,
      'human:e2-test',
      'author',
      'Genesis',
    );
    freshStore['human:e2-test'] = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum: seedChecksum,
        signatures: [seedSig],
      },
      payload: seedPayload,
    };

    const identityMod = new IdentityModule({
      stores: { actors: fStore as any },
      keyProvider: freshKeyProvider,
    });

    const { newActor } = await identityMod.rotateActorKey('human:e2-test');

    // ── New actor: Three Gates ──
    const newRecord = freshStore[newActor.id]!;
    expect(newRecord).toBeDefined();

    // Gate 1: Integrity
    expect(realChecksumMod.calculatePayloadChecksum(newRecord.payload)).toBe(
      newRecord.header.payloadChecksum,
    );

    // Gate 2: Schema
    expect(newRecord.payload.id).toContain('v2');
    expect(newRecord.payload.status).toBe('active');
    expect(newRecord.payload.publicKey).toHaveLength(44);

    // Gate 3: Authentication — signed with OLD key
    expect(newRecord.header.signatures[0]!.keyId).toBe('human:e2-test');
    const validNew = await realCrypto.verifySignatures(
      newRecord,
      async (keyId: string) =>
        keyId === 'human:e2-test' ? freshKeys.publicKey : null,
    );
    expect(validNew).toBe(true);

    // ── Revoked actor: Three Gates ──
    const revokedRecord = freshStore['human:e2-test']!;
    expect(revokedRecord.payload.status).toBe('revoked');
    expect(revokedRecord.payload.supersededBy).toContain('v2');
    expect(revokedRecord.header.signatures).toHaveLength(1);

    // Gate 1: Integrity
    expect(realChecksumMod.calculatePayloadChecksum(revokedRecord.payload)).toBe(
      revokedRecord.header.payloadChecksum,
    );

    // Gate 3: Authentication
    const validRevoked = await realCrypto.verifySignatures(
      revokedRecord,
      async (keyId: string) =>
        keyId === 'human:e2-test' ? freshKeys.publicKey : null,
    );
    expect(validRevoked).toBe(true);

    // Cleanup
    fs.rmSync(freshTmpDir, { recursive: true, force: true });
  });
});
