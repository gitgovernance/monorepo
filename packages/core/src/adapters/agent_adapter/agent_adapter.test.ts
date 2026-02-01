import { AgentAdapter } from './agent_adapter';
import { createAgentRecord } from '../../record_factories/agent_factory';
import { validateFullAgentRecord } from '../../validation/agent_validator';
import { signPayload } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import type { RecordStore } from '../../record_store';
import type { AgentRecord, ActorRecord, GitGovAgentRecord, Signature } from '../../record_types';
import type { IEventStream, BaseEvent } from '../../event_bus';
import type { IIdentityAdapter } from '../identity_adapter';
import type { KeyProvider } from '../../key_provider/key_provider';

// Mock dependencies
jest.mock('../../record_factories/agent_factory');
jest.mock('../../validation/agent_validator');
jest.mock('../../crypto/signatures');
jest.mock('../../crypto/checksum');

const mockCreateAgentRecord = createAgentRecord as jest.Mock;
const mockValidateFullAgentRecord = validateFullAgentRecord as jest.Mock;
const mockSignPayload = signPayload as jest.Mock;
const mockCalculatePayloadChecksum = calculatePayloadChecksum as jest.Mock;

// Helper to create mock AgentRecord
function createMockAgentRecord(overrides: Partial<AgentRecord> = {}): GitGovAgentRecord {
  return {
    header: {
      version: '1.0',
      type: 'agent',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'agent:test-agent',
        role: 'author',
        notes: 'Agent registration',
        signature: 'mock-sig',
        timestamp: 123
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: 'agent:test-agent',
      engine: { type: 'local', entrypoint: 'index.ts', function: 'run' },
      status: 'active',
      triggers: [],
      knowledge_dependencies: [],
      prompt_engine_requirements: {},
      ...overrides
    }
  };
}

// Helper to create mock ActorRecord
function createMockActorRecord(overrides: Partial<ActorRecord> = {}): ActorRecord {
  return {
    id: 'agent:test-agent',
    type: 'agent',
    displayName: 'Test Agent',
    publicKey: 'mock-public-key',
    roles: ['author'],
    status: 'active',
    ...overrides
  };
}

describe('AgentAdapter', () => {
  let agentAdapter: AgentAdapter;
  let mockAgentStore: jest.Mocked<RecordStore<GitGovAgentRecord>>;
  let mockIdentityAdapter: jest.Mocked<IIdentityAdapter>;
  let mockKeyProvider: jest.Mocked<KeyProvider>;
  let mockEventBus: jest.Mocked<IEventStream>;
  let emittedEvents: BaseEvent[];

  beforeEach(() => {
    jest.clearAllMocks();
    emittedEvents = [];

    // Mock agent store
    mockAgentStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovAgentRecord>>;

    // Mock identity adapter
    mockIdentityAdapter = {
      getActor: jest.fn().mockResolvedValue(createMockActorRecord()),
      createActor: jest.fn(),
      listActors: jest.fn(),
      revokeActor: jest.fn(),
      resolveCurrentActorId: jest.fn(),
      getCurrentActor: jest.fn(),
      getEffectiveActorForAgent: jest.fn(),
      signRecord: jest.fn(),
      rotateActorKey: jest.fn(),
      authenticate: jest.fn(),
      getActorPublicKey: jest.fn(),
      createAgentRecord: jest.fn(),
      getAgentRecord: jest.fn(),
      listAgentRecords: jest.fn(),
    } as unknown as jest.Mocked<IIdentityAdapter>;

    // Mock key provider
    mockKeyProvider = {
      getPrivateKey: jest.fn().mockResolvedValue('mock-private-key'),
      setPrivateKey: jest.fn().mockResolvedValue(undefined),
      deletePrivateKey: jest.fn().mockResolvedValue(undefined),
      listKeys: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<KeyProvider>;

    // Mock event bus
    mockEventBus = {
      publish: jest.fn().mockImplementation((event) => {
        emittedEvents.push(event);
      }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn(),
      clearSubscriptions: jest.fn(),
      waitForIdle: jest.fn(),
    } as unknown as jest.Mocked<IEventStream>;

    // Setup default mocks
    mockCreateAgentRecord.mockImplementation((payload) => payload);
    mockValidateFullAgentRecord.mockResolvedValue(undefined);
    mockSignPayload.mockReturnValue({
      keyId: 'agent:test-agent',
      role: 'author',
      notes: 'Agent registration',
      signature: 'mock-signature',
      timestamp: Date.now()
    });
    mockCalculatePayloadChecksum.mockReturnValue('mock-checksum');

    // Create adapter
    agentAdapter = new AgentAdapter({
      stores: { agents: mockAgentStore },
      identity: mockIdentityAdapter,
      keyProvider: mockKeyProvider,
      eventBus: mockEventBus,
    });
  });

  describe('4.1. createAgentRecord (EARS-A1 to EARS-A6)', () => {
    it('[EARS-A1] should create AgentRecord with valid payload', async () => {
      const payload = {
        id: 'agent:test-agent',
        engine: { type: 'local' as const, entrypoint: 'index.ts', function: 'run' },
      };

      const result = await agentAdapter.createAgentRecord(payload);

      expect(result.id).toBe('agent:test-agent');
      expect(result.engine).toEqual(payload.engine);
      expect(result.status).toBe('active');
      expect(result.triggers).toEqual([]);
      expect(mockAgentStore.put).toHaveBeenCalled();
    });

    it('[EARS-A2] should throw error if id or engine missing', async () => {
      // Missing id
      await expect(
        agentAdapter.createAgentRecord({ engine: { type: 'local' } })
      ).rejects.toThrow('AgentRecord requires id and engine');

      // Missing engine
      await expect(
        agentAdapter.createAgentRecord({ id: 'agent:test' })
      ).rejects.toThrow('AgentRecord requires id and engine');
    });

    it('[EARS-A3] should throw error if ActorRecord not found', async () => {
      mockIdentityAdapter.getActor.mockResolvedValue(null);

      await expect(
        agentAdapter.createAgentRecord({
          id: 'agent:nonexistent',
          engine: { type: 'local' },
        })
      ).rejects.toThrow('ActorRecord with id agent:nonexistent not found');
    });

    it('[EARS-A4] should throw error if ActorRecord type is not agent', async () => {
      mockIdentityAdapter.getActor.mockResolvedValue(
        createMockActorRecord({ type: 'human' })
      );

      await expect(
        agentAdapter.createAgentRecord({
          id: 'agent:test-agent',
          engine: { type: 'local' },
        })
      ).rejects.toThrow("ActorRecord with id agent:test-agent must be of type 'agent'");
    });

    it('[EARS-A5] should emit identity.agent.registered event', async () => {
      await agentAdapter.createAgentRecord({
        id: 'agent:test-agent',
        engine: { type: 'local' as const, entrypoint: 'index.ts' },
      });

      expect(mockEventBus.publish).toHaveBeenCalled();
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.type).toBe('identity.agent.registered');
      expect(emittedEvents[0]?.payload).toMatchObject({
        agentId: 'agent:test-agent',
        correspondingActorId: 'agent:test-agent',
      });
    });

    it('[EARS-A6] should throw error when private key is not available', async () => {
      // Mock KeyProvider to return null (no private key)
      mockKeyProvider.getPrivateKey.mockResolvedValue(null);

      await expect(
        agentAdapter.createAgentRecord({
          id: 'agent:test-agent',
          engine: { type: 'local' as const, entrypoint: 'index.ts' },
        })
      ).rejects.toThrow('Private key not found for actor agent:test-agent');

      // Verify private key was attempted to be loaded
      expect(mockKeyProvider.getPrivateKey).toHaveBeenCalledWith('agent:test-agent');

      // Should NOT store (operation should fail before that)
      expect(mockAgentStore.put).not.toHaveBeenCalled();
    });
  });

  describe('4.2. getAgentRecord (EARS-B1 to EARS-B2)', () => {
    it('[EARS-B1] should return AgentRecord when exists', async () => {
      const mockRecord = createMockAgentRecord({ id: 'agent:existing' });
      mockAgentStore.get.mockResolvedValue(mockRecord);

      const result = await agentAdapter.getAgentRecord('agent:existing');

      expect(result).toEqual(mockRecord.payload);
      expect(mockAgentStore.get).toHaveBeenCalledWith('agent:existing');
    });

    it('[EARS-B2] should return null when AgentRecord not found', async () => {
      mockAgentStore.get.mockResolvedValue(null);

      const result = await agentAdapter.getAgentRecord('agent:nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('4.3. listAgentRecords (EARS-C1 to EARS-C2)', () => {
    it('[EARS-C1] should return all AgentRecords', async () => {
      const mockRecord1 = createMockAgentRecord({ id: 'agent:agent1' });
      const mockRecord2 = createMockAgentRecord({ id: 'agent:agent2' });

      mockAgentStore.list.mockResolvedValue(['agent:agent1', 'agent:agent2']);
      mockAgentStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2);

      const result = await agentAdapter.listAgentRecords();

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('agent:agent1');
      expect(result[1]?.id).toBe('agent:agent2');
    });

    it('[EARS-C2] should return empty array when no agents exist', async () => {
      mockAgentStore.list.mockResolvedValue([]);

      const result = await agentAdapter.listAgentRecords();

      expect(mockAgentStore.list).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('4.4. updateAgentRecord (EARS-D1 to EARS-D2)', () => {
    it('[EARS-D1] should update AgentRecord fields', async () => {
      const existingRecord = createMockAgentRecord({ id: 'agent:test-agent' });
      mockAgentStore.get.mockResolvedValue(existingRecord);

      const result = await agentAdapter.updateAgentRecord('agent:test-agent', {
        engine: { type: 'api', url: 'https://api.example.com' },
        triggers: [{ type: 'webhook', event: 'task.ready' }],
      });

      expect(result.engine).toEqual({ type: 'api', url: 'https://api.example.com' });
      expect(result.triggers).toEqual([{ type: 'webhook', event: 'task.ready' }]);
      expect(result.id).toBe('agent:test-agent'); // ID unchanged
      expect(mockAgentStore.put).toHaveBeenCalled();
    });

    it('[EARS-D2] should throw error if AgentRecord not found', async () => {
      mockAgentStore.get.mockResolvedValue(null);

      await expect(
        agentAdapter.updateAgentRecord('agent:nonexistent', {
          engine: { type: 'local' },
        })
      ).rejects.toThrow('AgentRecord with id agent:nonexistent not found');
    });
  });

  describe('4.5. archiveAgentRecord (EARS-E1 to EARS-E2)', () => {
    it('[EARS-E1] should archive AgentRecord (status=archived)', async () => {
      const existingRecord = createMockAgentRecord({
        id: 'agent:test-agent',
        status: 'active',
      });
      mockAgentStore.get.mockResolvedValue(existingRecord);

      const result = await agentAdapter.archiveAgentRecord('agent:test-agent');

      expect(result.status).toBe('archived');
      expect(mockAgentStore.put).toHaveBeenCalled();
    });

    it('[EARS-E2] should throw error if AgentRecord not found', async () => {
      mockAgentStore.get.mockResolvedValue(null);

      await expect(
        agentAdapter.archiveAgentRecord('agent:nonexistent')
      ).rejects.toThrow('AgentRecord with id agent:nonexistent not found');
    });
  });
});
