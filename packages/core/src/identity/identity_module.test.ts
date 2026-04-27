import { IdentityModule } from './identity_module';
import type { ActorRecord, GitGovActorRecord } from '../record_types';
import { MemoryRecordStore } from '../record_store/memory/memory_record_store';
import { MockKeyProvider } from '../key_provider/memory/mock_key_provider';
import { verifySignatures } from '../crypto/signatures';
import { calculatePayloadChecksum } from '../crypto/checksum';
import type { IEventStream } from '../event_bus';

function createMockEventBus(): jest.Mocked<IEventStream> {
  return {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getSubscriptions: jest.fn().mockReturnValue([]),
    clearSubscriptions: jest.fn(),
    waitForIdle: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IEventStream>;
}

describe('IdentityModule', () => {
  let store: MemoryRecordStore<GitGovActorRecord>;
  let keyProvider: MockKeyProvider;
  let identityModule: IdentityModule;

  beforeEach(() => {
    store = new MemoryRecordStore<GitGovActorRecord>();
    keyProvider = new MockKeyProvider();
    identityModule = new IdentityModule({
      stores: { actors: store },
      keyProvider,
    });
  });

  // ── 4.1. createActor (IDM-A1 to A3) ──────────────────────────────

  describe('4.1. createActor (IDM-A1 to A3)', () => {
    it('[IDM-A1] should create actor with generated Ed25519 keys', async () => {
      const result = await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );

      expect(result.id).toMatch(/^human:/);
      expect(result.type).toBe('human');
      expect(result.displayName).toBe('Test User');
      expect(result.publicKey).toHaveLength(44);
      expect(result.status).toBe('active');
      expect(result.roles).toContain('author');

      const storedRecord = await store.get(result.id);
      expect(storedRecord).not.toBeNull();
      expect(storedRecord!.header.type).toBe('actor');
      expect(storedRecord!.header.signatures).toHaveLength(1);
      expect(storedRecord!.header.signatures[0].signature).not.toBe('placeholder');
      expect(storedRecord!.header.payloadChecksum).toBe(
        calculatePayloadChecksum(storedRecord!.payload),
      );

      const valid = await verifySignatures(storedRecord!, async (keyId) =>
        keyId === result.id ? result.publicKey : null,
      );
      expect(valid).toBe(true);
    });

    it('[IDM-A2] should persist private key via keyProvider', async () => {
      const result = await identityModule.createActor(
        { type: 'human', displayName: 'Test User' },
        'self',
      );
      const hasKey = await keyProvider.hasPrivateKey(result.id);
      expect(hasKey).toBe(true);
    });

    it('[IDM-A2] should warn and continue when key persistence fails', async () => {
      const failingKp = new MockKeyProvider();
      jest.spyOn(failingKp, 'setPrivateKey').mockRejectedValue(new Error('Permission denied'));
      const mod = new IdentityModule({ stores: { actors: store }, keyProvider: failingKp });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await mod.createActor({ type: 'human', displayName: 'Test' }, 'self');

      expect(result).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not persist private key'));
      warnSpy.mockRestore();
    });

    it('[IDM-A3] should throw when required fields missing', async () => {
      await expect(
        identityModule.createActor({}, 'self'),
      ).rejects.toThrow('ActorRecord requires type and displayName');
      expect(store.size()).toBe(0);
    });

    it('[IDM-A3] should throw when displayName missing', async () => {
      await expect(
        identityModule.createActor({ type: 'human' }, 'self'),
      ).rejects.toThrow('ActorRecord requires type and displayName');
      expect(store.size()).toBe(0);
    });
  });

  // ── 4.2. Actor Queries (IDM-B1 to B6) ─────────────────────────────

  describe('4.2. Actor Queries (IDM-B1 to B6)', () => {
    let seededActor: ActorRecord;

    beforeEach(async () => {
      seededActor = await identityModule.createActor(
        { type: 'human', displayName: 'Seeded' },
        'self',
      );
    });

    it('[IDM-B1] should return ActorRecord when exists', async () => {
      const result = await identityModule.getActor(seededActor.id);
      expect(result).toEqual(seededActor);
    });

    it('[IDM-B2] should return null when actor not found', async () => {
      const result = await identityModule.getActor('human:nonexistent');
      expect(result).toBeNull();
    });

    it('[IDM-B3] should return all ActorRecords', async () => {
      const second = await identityModule.createActor(
        { type: 'human', displayName: 'Second' },
        'self',
      );
      const result = await identityModule.listActors();
      expect(result).toHaveLength(2);
      expect(result.map(a => a.id)).toContain(seededActor.id);
      expect(result.map(a => a.id)).toContain(second.id);
    });

    it('[IDM-B4] should return empty array when no actors exist', async () => {
      const emptyStore = new MemoryRecordStore<GitGovActorRecord>();
      const mod = new IdentityModule({ stores: { actors: emptyStore }, keyProvider });
      const result = await mod.listActors();
      expect(result).toEqual([]);
    });

    it('[IDM-B5] should return publicKey for existing actor', async () => {
      const result = await identityModule.getActorPublicKey(seededActor.id);
      expect(result).toBe(seededActor.publicKey);
      expect(result).toHaveLength(44);
    });

    it('[IDM-B6] should return null for non-existent actor', async () => {
      const result = await identityModule.getActorPublicKey('human:nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── 4.3. revokeActor (IDM-C1 to C3) ──────────────────────────────

  describe('4.3. revokeActor (IDM-C1 to C3)', () => {
    let actor: ActorRecord;

    beforeEach(async () => {
      actor = await identityModule.createActor(
        { type: 'human', displayName: 'Revokable' },
        'self',
      );
    });

    it('[IDM-C1] should revoke actor and sign with revoker key', async () => {
      const result = await identityModule.revokeActor(actor.id, actor.id, 'manual');

      expect(result.status).toBe('revoked');
      const storedRecord = await store.get(actor.id);
      expect(storedRecord!.payload.status).toBe('revoked');
      expect(storedRecord!.header.signatures).toHaveLength(1);
      expect(storedRecord!.header.signatures[0].keyId).toBe(actor.id);
      expect(storedRecord!.header.signatures[0].notes).toContain('Revoking');
    });

    it('[IDM-C1] should add supersededBy when provided', async () => {
      const result = await identityModule.revokeActor(
        actor.id, actor.id, 'rotation', 'human:successor',
      );
      expect(result.supersededBy).toBe('human:successor');
    });

    it('[IDM-C2] should produce record passing Three Gates validation', async () => {
      await identityModule.revokeActor(actor.id, actor.id, 'manual');
      const revokedRecord = await store.get(actor.id);

      expect(calculatePayloadChecksum(revokedRecord!.payload)).toBe(
        revokedRecord!.header.payloadChecksum,
      );
      expect(revokedRecord!.payload.status).toBe('revoked');
      const valid = await verifySignatures(revokedRecord!, async (keyId) =>
        keyId === actor.id ? actor.publicKey : null,
      );
      expect(valid).toBe(true);
    });

    it('[IDM-C3] should throw when actor not found', async () => {
      await expect(
        identityModule.revokeActor('human:nonexistent', actor.id, 'manual'),
      ).rejects.toThrow('ActorRecord with id human:nonexistent not found');
    });
  });

  // ── 4.4. Succession Chain (IDM-D1 to D3) ──────────────────────────

  describe('4.4. Succession Chain (IDM-D1 to D3)', () => {
    it('[IDM-D1] should return same id for active actor', async () => {
      const actor = await identityModule.createActor(
        { type: 'human', displayName: 'Active' },
        'self',
      );
      const result = await identityModule.resolveCurrentActorId(actor.id);
      expect(result).toBe(actor.id);
    });

    it('[IDM-D2] should follow succession chain to active actor', async () => {
      const actor = await identityModule.createActor(
        { type: 'human', displayName: 'Chain' },
        'self',
      );
      const { newActor } = await identityModule.rotateActorKey(actor.id);
      const result = await identityModule.resolveCurrentActorId(actor.id);
      expect(result).toBe(newActor.id);
    });

    it('[IDM-D3] should return effective actor for agent with succession', async () => {
      const actor = await identityModule.createActor(
        { type: 'human', displayName: 'Agent Owner' },
        'self',
      );
      const { newActor } = await identityModule.rotateActorKey(actor.id);
      const effective = await identityModule.getEffectiveActorForAgent(actor.id);
      expect(effective).toBeDefined();
      expect(effective!.id).toBe(newActor.id);
      expect(effective!.status).toBe('active');
    });
  });

  // ── 4.5. Key Rotation (IDM-E1 to E9) ──────────────────────────────

  describe('4.5. Key Rotation (IDM-E1 to E9)', () => {
    let actor: ActorRecord;

    beforeEach(async () => {
      actor = await identityModule.createActor(
        { type: 'human', displayName: 'Rotatable' },
        'self',
      );
    });

    it('[IDM-E1] should rotate key with new actor signed by old key', async () => {
      const { oldActor, newActor } = await identityModule.rotateActorKey(actor.id);

      expect(oldActor.status).toBe('revoked');
      expect(oldActor.supersededBy).toBe(newActor.id);
      expect(newActor.id).toContain('v2');
      expect(newActor.status).toBe('active');
      expect(newActor.publicKey).toHaveLength(44);
      expect(newActor.publicKey).not.toBe(actor.publicKey);

      const newRecord = await store.get(newActor.id);
      expect(newRecord).not.toBeNull();
      expect(newRecord!.header.signatures[0].keyId).toBe(actor.id);
    });

    it('[IDM-E2] should produce records passing Three Gates validation', async () => {
      const { newActor } = await identityModule.rotateActorKey(actor.id);

      const newRecord = await store.get(newActor.id);
      expect(calculatePayloadChecksum(newRecord!.payload)).toBe(newRecord!.header.payloadChecksum);
      const validNew = await verifySignatures(newRecord!, async (keyId) =>
        keyId === actor.id ? actor.publicKey : null,
      );
      expect(validNew).toBe(true);

      const revokedRecord = await store.get(actor.id);
      expect(calculatePayloadChecksum(revokedRecord!.payload)).toBe(revokedRecord!.header.payloadChecksum);
      const validRevoked = await verifySignatures(revokedRecord!, async (keyId) =>
        keyId === actor.id ? actor.publicKey : null,
      );
      expect(validRevoked).toBe(true);
    });

    it('[IDM-E3] should use provided external keys', async () => {
      const { generateKeys } = await import('../crypto/signatures');
      const externalKeys = await generateKeys();

      const { newActor } = await identityModule.rotateActorKey(actor.id, {
        newPublicKey: externalKeys.publicKey,
        newPrivateKey: externalKeys.privateKey,
      });
      expect(newActor.publicKey).toBe(externalKeys.publicKey);
    });

    it('[IDM-E4] should throw for non-existent actor', async () => {
      await expect(
        identityModule.rotateActorKey('human:nonexistent'),
      ).rejects.toThrow('ActorRecord with id human:nonexistent not found');
    });

    it('[IDM-E5] should throw for revoked actor', async () => {
      await identityModule.revokeActor(actor.id, actor.id, 'manual');
      await expect(
        identityModule.rotateActorKey(actor.id),
      ).rejects.toThrow('Cannot rotate key for revoked actor');
    });

    it('[IDM-E6] should not create actor if validation fails', async () => {
      const putSpy = jest.spyOn(store, 'put');
      putSpy.mockRejectedValueOnce(new Error('Simulated store failure'));

      await expect(identityModule.rotateActorKey(actor.id)).rejects.toThrow('Simulated store failure');
      putSpy.mockRestore();
    });

    it('[IDM-E7] should not revoke if store write fails', async () => {
      const putSpy = jest.spyOn(store, 'put');
      putSpy.mockRejectedValueOnce(new Error('Store write failed'));

      await expect(identityModule.rotateActorKey(actor.id)).rejects.toThrow('Store write failed');

      const original = await store.get(actor.id);
      expect(original!.payload.status).toBe('active');
      putSpy.mockRestore();
    });

    it('[IDM-E8] should throw if revocation fails after creation', async () => {
      const putSpy = jest.spyOn(store, 'put');
      const originalPut = store.put.bind(store);
      let callCount = 0;
      putSpy.mockImplementation(async (id: string, value: GitGovActorRecord) => {
        callCount++;
        if (callCount === 2) throw new Error('Revocation store write failed');
        return originalPut(id, value);
      });

      await expect(identityModule.rotateActorKey(actor.id)).rejects.toThrow('Revocation store write failed');
      putSpy.mockRestore();
    });

    it('[IDM-E9] should complete rotation with warning on key persist failure', async () => {
      const failKp = new MockKeyProvider();
      const privKey = await keyProvider.getPrivateKey(actor.id);
      if (privKey) await failKp.setPrivateKey(actor.id, privKey);
      const origSet = failKp.setPrivateKey.bind(failKp);
      jest.spyOn(failKp, 'setPrivateKey').mockImplementation(async (id, key) => {
        if (id !== actor.id) throw new Error('Key persist failed');
        return origSet(id, key);
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mod = new IdentityModule({ stores: { actors: store }, keyProvider: failKp });
      const { oldActor, newActor } = await mod.rotateActorKey(actor.id);

      expect(oldActor.status).toBe('revoked');
      expect(newActor).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not persist private key'));
      warnSpy.mockRestore();
    });
  });

  // ── 4.6. Event Emission (IDM-F1 to F3) ────────────────────────────

  describe('4.6. Event Emission (IDM-F1 to F3)', () => {
    let eventBus: jest.Mocked<IEventStream>;
    let modWithEvents: IdentityModule;

    beforeEach(() => {
      eventBus = createMockEventBus();
      modWithEvents = new IdentityModule({
        stores: { actors: store },
        keyProvider,
        eventBus,
      });
    });

    it('[IDM-F1] should emit actor.created when eventBus configured', async () => {
      await modWithEvents.createActor({ type: 'human', displayName: 'Evented' }, 'self');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'identity.actor.created',
          source: 'identity_module',
          payload: expect.objectContaining({ type: 'human', isBootstrap: true }),
        }),
      );
    });

    it('[IDM-F1] should set isBootstrap false when other actors exist', async () => {
      await modWithEvents.createActor({ type: 'human', displayName: 'First' }, 'self');
      eventBus.publish.mockClear();
      await modWithEvents.createActor({ type: 'human', displayName: 'Second' }, 'self');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ isBootstrap: false }),
        }),
      );
    });

    it('[IDM-F2] should emit actor.revoked when eventBus configured', async () => {
      const actor = await modWithEvents.createActor(
        { type: 'human', displayName: 'ToRevoke' }, 'self',
      );
      eventBus.publish.mockClear();
      await modWithEvents.revokeActor(actor.id, actor.id, 'manual');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'identity.actor.revoked',
          source: 'identity_module',
          payload: expect.objectContaining({
            actorId: actor.id,
            revokedBy: actor.id,
            revocationReason: 'manual',
          }),
        }),
      );
    });

    it('[IDM-F3] should complete without events when no eventBus', async () => {
      await identityModule.createActor({ type: 'human', displayName: 'NoEvents' }, 'self');
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });
});
