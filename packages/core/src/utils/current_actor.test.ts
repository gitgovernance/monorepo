import { getCurrentActor } from './current_actor';
import type { IIdentityModule } from '../identity/identity_module.types';
import type { ISessionManager } from '../session_manager';
import type { ActorRecord } from '../record_types';

const activeActor: ActorRecord = {
  id: 'human:alice',
  type: 'human',
  displayName: 'Alice',
  publicKey: 'pk-alice',
  roles: ['author'],
  status: 'active',
};

const secondActor: ActorRecord = {
  id: 'human:bob',
  type: 'human',
  displayName: 'Bob',
  publicKey: 'pk-bob',
  roles: ['author'],
  status: 'active',
};

const successorActor: ActorRecord = {
  id: 'human:alice-v2',
  type: 'human',
  displayName: 'Alice',
  publicKey: 'pk-alice-v2',
  roles: ['author'],
  status: 'active',
};

function createMockIdentity(overrides: Partial<IIdentityModule> = {}): IIdentityModule {
  return {
    createActor: jest.fn(),
    getActor: jest.fn().mockResolvedValue(null),
    listActors: jest.fn().mockResolvedValue([]),
    getActorPublicKey: jest.fn().mockResolvedValue(null),
    revokeActor: jest.fn(),
    resolveCurrentActorId: jest.fn().mockImplementation(async (id: string) => id),
    getEffectiveActorForAgent: jest.fn().mockResolvedValue(null),
    rotateActorKey: jest.fn(),
    ...overrides,
  };
}

function createMockSessionManager(actorId?: string): ISessionManager {
  return {
    loadSession: jest.fn().mockResolvedValue(
      actorId ? { lastSession: { actorId } } : null,
    ),
    detectActorFromKeyFiles: jest.fn().mockResolvedValue(null),
    getActorState: jest.fn().mockResolvedValue(null),
    updateActorState: jest.fn(),
    getCloudSessionToken: jest.fn().mockResolvedValue(null),
    getSyncPreferences: jest.fn().mockResolvedValue(null),
    updateSyncPreferences: jest.fn(),
    getLastSession: jest.fn().mockResolvedValue(null),
    setCloudToken: jest.fn(),
    setLastSession: jest.fn(),
    clearCloudToken: jest.fn(),
  };
}

describe('getCurrentActor', () => {
  describe('4.1. Session resolution (GCA-A1 to GCA-A2)', () => {
    it('[GCA-A1] should return actor from session when active', async () => {
      const identity = createMockIdentity({
        getActor: jest.fn().mockResolvedValue(activeActor),
        resolveCurrentActorId: jest.fn().mockResolvedValue('human:alice'),
      });
      const session = createMockSessionManager('human:alice');

      const result = await getCurrentActor(identity, session);

      expect(result).toEqual(activeActor);
      expect(identity.resolveCurrentActorId).toHaveBeenCalledWith('human:alice');
      expect(identity.getActor).toHaveBeenCalledWith('human:alice');
    });

    it('[GCA-A2] should follow succession chain when session actor is revoked', async () => {
      const identity = createMockIdentity({
        resolveCurrentActorId: jest.fn().mockResolvedValue('human:alice-v2'),
        getActor: jest.fn().mockResolvedValue(successorActor),
      });
      const session = createMockSessionManager('human:alice');

      const result = await getCurrentActor(identity, session);

      expect(result).toEqual(successorActor);
      expect(identity.resolveCurrentActorId).toHaveBeenCalledWith('human:alice');
      expect(identity.getActor).toHaveBeenCalledWith('human:alice-v2');
    });
  });

  describe('4.2. Fallback and error (GCA-A3 to GCA-A4)', () => {
    it('[GCA-A3] should return first active actor when no session exists', async () => {
      const identity = createMockIdentity({
        listActors: jest.fn().mockResolvedValue([activeActor, secondActor]),
      });
      const session = createMockSessionManager();

      const result = await getCurrentActor(identity, session);

      expect(result).toEqual(activeActor);
      expect(identity.listActors).toHaveBeenCalled();
    });

    it('[GCA-A4] should throw when no active actors exist', async () => {
      const identity = createMockIdentity({
        listActors: jest.fn().mockResolvedValue([]),
      });
      const session = createMockSessionManager();

      await expect(getCurrentActor(identity, session)).rejects.toThrow(
        "No active actors found. Run 'gitgov init' first.",
      );
    });
  });
});
