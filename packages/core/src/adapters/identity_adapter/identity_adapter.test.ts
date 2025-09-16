import { IdentityAdapter } from './index';
import type { ActorRecord } from '../../types/actor_record';
import type { AgentRecord } from '../../types/agent_record';
import type { GitGovRecord } from '../../models';
import { RecordStore } from '../../store/record_store';
import { createActorRecord } from '../../factories/actor_factory';
import { validateFullActorRecord } from '../../validation/actor_validator';
import { createAgentRecord } from '../../factories/agent_factory';
import { validateFullAgentRecord } from '../../validation/agent_validator';
import { generateKeys, signPayload } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import { generateActorId } from '../../utils/id_generator';

// Mock all dependencies
jest.mock('../../factories/actor_factory');
jest.mock('../../validation/actor_validator');
jest.mock('../../factories/agent_factory');
jest.mock('../../validation/agent_validator');
jest.mock('../../crypto/signatures');
jest.mock('../../crypto/checksum');
jest.mock('../../utils/id_generator');
const mockedCreateActorRecord = createActorRecord as jest.MockedFunction<typeof createActorRecord>;
const mockedValidateFullActorRecord = validateFullActorRecord as jest.MockedFunction<typeof validateFullActorRecord>;
const mockedCreateAgentRecord = createAgentRecord as jest.MockedFunction<typeof createAgentRecord>;
const mockedValidateFullAgentRecord = validateFullAgentRecord as jest.MockedFunction<typeof validateFullAgentRecord>;
const mockedGenerateKeys = generateKeys as jest.MockedFunction<typeof generateKeys>;
const mockedSignPayload = signPayload as jest.MockedFunction<typeof signPayload>;
const mockedCalculatePayloadChecksum = calculatePayloadChecksum as jest.MockedFunction<typeof calculatePayloadChecksum>;
const mockedGenerateActorId = generateActorId as jest.MockedFunction<typeof generateActorId>;

import type { IEventStream } from '../../modules/event_bus_module';

// Mock event bus interface
interface MockEventBus extends IEventStream {
  publish: jest.MockedFunction<(event: any) => void>;
  subscribe: jest.MockedFunction<(eventType: string, handler: any) => any>;
  unsubscribe: jest.MockedFunction<(subscriptionId: string) => boolean>;
  getSubscriptions: jest.MockedFunction<() => any[]>;
  clearSubscriptions: jest.MockedFunction<() => void>;
}

describe('IdentityAdapter - ActorRecord Operations', () => {
  let identityAdapter: IdentityAdapter;
  let identityAdapterWithEvents: IdentityAdapter;
  let mockActorStore: jest.Mocked<RecordStore<ActorRecord>>;
  let mockAgentStore: jest.Mocked<RecordStore<AgentRecord>>;
  let mockEventBus: MockEventBus;

  const testRoot = '/tmp/test-gitgov';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock store instances
    mockActorStore = {
      read: jest.fn(),
      write: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      exists: jest.fn(),
    } as unknown as jest.Mocked<RecordStore<ActorRecord>>;

    mockAgentStore = {
      read: jest.fn(),
      write: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      exists: jest.fn(),
    } as unknown as jest.Mocked<RecordStore<AgentRecord>>;

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn().mockReturnValue({ id: 'mock-subscription', eventType: '', handler: jest.fn() }),
      unsubscribe: jest.fn().mockReturnValue(true),
      getSubscriptions: jest.fn().mockReturnValue([]),
      clearSubscriptions: jest.fn(),
    };

    // Create IdentityAdapter without events (graceful degradation)
    identityAdapter = new IdentityAdapter({
      actorStore: mockActorStore,
      agentStore: mockAgentStore,
    });

    // Create IdentityAdapter with events
    identityAdapterWithEvents = new IdentityAdapter({
      actorStore: mockActorStore,
      agentStore: mockAgentStore,
      eventBus: mockEventBus,
    });
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
        signature: 'sample-signature',
        timestamp: 1234567890,
        timestamp_iso: '2023-01-01T00:00:00Z'
      }]
    },
    payload: sampleActorPayload
  };

  describe('getActor', () => {
    it('[EARS-1] should return ActorRecord when it exists', async () => {
      mockActorStore.read.mockResolvedValue(sampleRecord);

      const result = await identityAdapter.getActor('human:test-user');

      expect(mockActorStore.read).toHaveBeenCalledWith('human:test-user');
      expect(result).toEqual(sampleActorPayload);
    });

    it('[EARS-2] should return null when ActorRecord does not exist', async () => {
      mockActorStore.read.mockResolvedValue(null);

      const result = await identityAdapter.getActor('non-existent');

      expect(mockActorStore.read).toHaveBeenCalledWith('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listActors', () => {
    it('[EARS-3] should return all ActorRecords', async () => {
      const actorIds = ['human:user1', 'human:user2'];
      const record1 = { ...sampleRecord, payload: { ...sampleActorPayload, id: 'human:user1' } };
      const record2 = { ...sampleRecord, payload: { ...sampleActorPayload, id: 'human:user2' } };

      mockActorStore.list.mockResolvedValue(actorIds);
      mockActorStore.read
        .mockResolvedValueOnce(record1)
        .mockResolvedValueOnce(record2);

      const result = await identityAdapter.listActors();

      expect(mockActorStore.list).toHaveBeenCalled();
      expect(mockActorStore.read).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('human:user1');
      expect(result[1]?.id).toBe('human:user2');
    });

    it('[EARS-4] should return empty array when no actors exist', async () => {
      mockActorStore.list.mockResolvedValue([]);

      const result = await identityAdapter.listActors();

      expect(mockActorStore.list).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('createActor', () => {
    it('[EARS-5] should create a new ActorRecord with generated keys', async () => {
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
      mockedCreateActorRecord.mockResolvedValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        signature: 'generated-signature',
        timestamp: 1234567890,
        timestamp_iso: '2023-01-01T00:00:00Z'
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.write.mockResolvedValue(undefined);

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
      expect(mockActorStore.write).toHaveBeenCalled();
      expect(result).toEqual(sampleActorPayload);

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('[EARS-6] should throw error when required fields are missing', async () => {
      const invalidPayload = {
        type: 'human' as const,
        // Missing displayName
      };

      await expect(identityAdapter.createActor(invalidPayload, 'signer'))
        .rejects.toThrow('ActorRecord requires type and displayName');
    });
  });

  describe('revokeActor', () => {
    it('[EARS-7] should revoke an existing actor', async () => {
      const existingRecord = { ...sampleRecord };
      mockActorStore.read.mockResolvedValue(existingRecord);
      mockActorStore.write.mockResolvedValue(undefined);
      mockedCalculatePayloadChecksum.mockReturnValue('new-checksum');

      const result = await identityAdapter.revokeActor('human:test-user');

      expect(mockActorStore.read).toHaveBeenCalledWith('human:test-user');
      expect(mockActorStore.write).toHaveBeenCalled();
      expect(result.status).toBe('revoked');
    });

    it('[EARS-8] should throw error when actor does not exist', async () => {
      mockActorStore.read.mockResolvedValue(null);

      await expect(identityAdapter.revokeActor('non-existent'))
        .rejects.toThrow('ActorRecord with id non-existent not found');
    });
  });

  describe('signRecord', () => {
    it('[EARS-9] should sign record with mock signature in MVP mode', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'task',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'initial-signer',
            role: 'author',
            signature: 'initial-signature',
            timestamp: 1234567890,
            timestamp_iso: '2023-01-01T00:00:00Z'
          }]
        },
        payload: sampleActorPayload // Use valid ActorRecord payload
      };

      // Mock actor exists
      mockActorStore.read.mockResolvedValue(sampleRecord);

      const signedRecord = await identityAdapter.signRecord(mockRecord, 'human:test-user', 'author');

      // Should have 2 signatures: original + new mock signature
      expect(signedRecord.header.signatures).toHaveLength(2);

      // Check the new signature (second one)
      const newSignature = signedRecord.header.signatures[1];
      expect(newSignature).toBeDefined();
      expect(newSignature!.keyId).toBe('human:test-user');
      expect(newSignature!.role).toBe('author');
      expect(newSignature!.signature).toContain('mock-signature-');
      expect(newSignature!.timestamp).toBeGreaterThan(0);
      expect(newSignature!.timestamp_iso).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Check that payload checksum was updated
      expect(signedRecord.header.payloadChecksum).toBeDefined();
    });

    it('[EARS-9] should throw error when actor not found', async () => {
      const mockRecord: GitGovRecord = {
        header: {
          version: '1.0',
          type: 'actor',
          payloadChecksum: 'test',
          signatures: [{
            keyId: 'initial-signer',
            role: 'author',
            signature: 'initial-signature',
            timestamp: 1234567890,
            timestamp_iso: '2023-01-01T00:00:00Z'
          }]
        },
        payload: sampleActorPayload
      };

      mockActorStore.read.mockResolvedValue(null);

      await expect(identityAdapter.signRecord(mockRecord, 'non-existent', 'author'))
        .rejects.toThrow('Actor not found: non-existent');
    });
  });

  describe('rotateActorKey', () => {
    it('[EARS-10] should throw error indicating complex operation not implemented', async () => {
      await expect(identityAdapter.rotateActorKey('human:test-user'))
        .rejects.toThrow('rotateActorKey not implemented yet - complex operation');
    });
  });

  describe('authenticate', () => {
    it('[EARS-11] should log warning for unimplemented method', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await identityAdapter.authenticate('test-token');

      expect(console.warn).toHaveBeenCalledWith('authenticate not fully implemented yet');
      console.warn = originalWarn;
    });
  });

  describe('AgentRecord operations', () => {
    const sampleAgentPayload: AgentRecord = {
      id: 'agent:test-agent',
      guild: 'design',
      status: 'active',
      engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
      triggers: [{ type: 'manual' }],
      knowledge_dependencies: [],
      prompt_engine_requirements: {}
    };

    const sampleAgentRecord: GitGovRecord & { payload: AgentRecord } = {
      header: {
        version: '1.0',
        type: 'agent',
        payloadChecksum: 'sample-agent-checksum',
        signatures: [{
          keyId: 'agent:test-agent',
          role: 'author',
          signature: 'sample-agent-signature',
          timestamp: 1234567890,
          timestamp_iso: '2023-01-01T00:00:00Z'
        }]
      },
      payload: sampleAgentPayload
    };

    const correspondingActorPayload: ActorRecord = {
      id: 'agent:test-agent',
      type: 'agent',
      displayName: 'Test Agent',
      publicKey: 'agent-public-key',
      roles: ['author'],
      status: 'active'
    };

    const correspondingActorRecord: GitGovRecord & { payload: ActorRecord } = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum: 'actor-checksum',
        signatures: [{ keyId: 'agent:test-agent', role: 'author', signature: 'sig', timestamp: 123, timestamp_iso: '' }]
      },
      payload: correspondingActorPayload
    };

    describe('getAgentRecord', () => {
      it('[EARS-12] should return AgentRecord when it exists', async () => {
        mockAgentStore.read.mockResolvedValue(sampleAgentRecord);

        const result = await identityAdapter.getAgentRecord('agent:test-agent');

        expect(mockAgentStore.read).toHaveBeenCalledWith('agent:test-agent');
        expect(result).toEqual(sampleAgentPayload);
      });

      it('[EARS-13] should return null when AgentRecord does not exist', async () => {
        mockAgentStore.read.mockResolvedValue(null);

        const result = await identityAdapter.getAgentRecord('agent:non-existent');

        expect(mockAgentStore.read).toHaveBeenCalledWith('agent:non-existent');
        expect(result).toBeNull();
      });
    });

    describe('listAgentRecords', () => {
      it('[EARS-14] should return all AgentRecords', async () => {
        const agentIds = ['agent:agent1', 'agent:agent2'];
        const record1 = { ...sampleAgentRecord, payload: { ...sampleAgentPayload, id: 'agent:agent1' } };
        const record2 = { ...sampleAgentRecord, payload: { ...sampleAgentPayload, id: 'agent:agent2' } };

        mockAgentStore.list.mockResolvedValue(agentIds);
        mockAgentStore.read
          .mockResolvedValueOnce(record1)
          .mockResolvedValueOnce(record2);

        const result = await identityAdapter.listAgentRecords();

        expect(mockAgentStore.list).toHaveBeenCalled();
        expect(mockAgentStore.read).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe('agent:agent1');
        expect(result[1]?.id).toBe('agent:agent2');
      });

      it('[EARS-15] should return empty array when no agents exist', async () => {
        mockAgentStore.list.mockResolvedValue([]);

        const result = await identityAdapter.listAgentRecords();

        expect(mockAgentStore.list).toHaveBeenCalled();
        expect(result).toEqual([]);
      });
    });

    describe('createAgentRecord', () => {
      it('[EARS-16] should create a new AgentRecord when corresponding ActorRecord exists', async () => {
        const inputPayload = {
          id: 'agent:test-agent',
          guild: 'design' as const,
          engine: { type: 'local' as const, runtime: 'typescript', entrypoint: 'test.ts', function: 'run' }
        };

        // Mock dependencies
        mockActorStore.read.mockResolvedValue(correspondingActorRecord);
        mockedCreateAgentRecord.mockResolvedValue(sampleAgentPayload);
        mockedCalculatePayloadChecksum.mockReturnValue('calculated-agent-checksum');
        mockedSignPayload.mockReturnValue({
          keyId: 'agent:test-agent',
          role: 'author',
          signature: 'generated-agent-signature',
          timestamp: 1234567890,
          timestamp_iso: '2023-01-01T00:00:00Z'
        });
        mockedValidateFullAgentRecord.mockResolvedValue(undefined);
        mockAgentStore.write.mockResolvedValue(undefined);

        const result = await identityAdapter.createAgentRecord(inputPayload);

        expect(mockActorStore.read).toHaveBeenCalledWith('agent:test-agent');
        expect(mockedCreateAgentRecord).toHaveBeenCalled();
        expect(mockedCalculatePayloadChecksum).toHaveBeenCalled();
        expect(mockedSignPayload).toHaveBeenCalled();
        expect(mockedValidateFullAgentRecord).toHaveBeenCalled();
        expect(mockAgentStore.write).toHaveBeenCalled();
        expect(result).toEqual(sampleAgentPayload);
      });

      it('[EARS-17] should throw error when required fields are missing', async () => {
        const invalidPayload = {
          id: 'agent:test-agent',
          // Missing guild and engine
        };

        await expect(identityAdapter.createAgentRecord(invalidPayload))
          .rejects.toThrow('AgentRecord requires id, guild and engine');
      });

      it('[EARS-18] should throw error when corresponding ActorRecord does not exist', async () => {
        const inputPayload = {
          id: 'agent:non-existent',
          guild: 'design' as const,
          engine: { type: 'local' as const }
        };

        mockActorStore.read.mockResolvedValue(null);

        await expect(identityAdapter.createAgentRecord(inputPayload))
          .rejects.toThrow('ActorRecord with id agent:non-existent not found. AgentRecord can only be created for existing ActorRecord.');
      });

      it('[EARS-19] should throw error when ActorRecord is not of type agent', async () => {
        const inputPayload = {
          id: 'human:test-user',
          guild: 'design' as const,
          engine: { type: 'local' as const }
        };

        const humanActorRecord = {
          ...correspondingActorRecord,
          payload: { ...correspondingActorPayload, id: 'human:test-user', type: 'human' as const }
        } as unknown as GitGovRecord & { payload: ActorRecord };

        mockActorStore.read.mockResolvedValue(humanActorRecord);

        await expect(identityAdapter.createAgentRecord(inputPayload))
          .rejects.toThrow('ActorRecord with id human:test-user must be of type \'agent\' to create AgentRecord.');
      });
    });
  });

  describe('resolveCurrentActorId', () => {
    it('[EARS-20] should return same ID for active actor', async () => {
      const activeActor = { ...sampleActorPayload, status: 'active' as const };
      mockActorStore.read.mockResolvedValue({
        ...sampleRecord,
        payload: activeActor
      });

      const result = await identityAdapter.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user');
      expect(mockActorStore.read).toHaveBeenCalledWith('human:test-user');
    });

    it('[EARS-21] should follow succession chain for revoked actor', async () => {
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

      mockActorStore.read
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
      expect(mockActorStore.read).toHaveBeenCalledTimes(2);
      expect(mockActorStore.read).toHaveBeenNthCalledWith(1, 'human:test-user');
      expect(mockActorStore.read).toHaveBeenNthCalledWith(2, 'human:test-user-v2');
    });

    it('[EARS-22] should follow long succession chain', async () => {
      const actor1 = { ...sampleActorPayload, status: 'revoked' as const, supersededBy: 'human:test-user-v2' };
      const actor2 = { ...sampleActorPayload, id: 'human:test-user-v2', status: 'revoked' as const, supersededBy: 'human:test-user-v3' };
      const actor3 = { ...sampleActorPayload, id: 'human:test-user-v3', status: 'active' as const };

      mockActorStore.read
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor1 })
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor2 })
        .mockResolvedValueOnce({ ...sampleRecord, payload: actor3 });

      const result = await identityAdapter.resolveCurrentActorId('human:test-user');

      expect(result).toBe('human:test-user-v3');
      expect(mockActorStore.read).toHaveBeenCalledTimes(3);
    });
  });

  describe('getEffectiveActorForAgent', () => {
    it('[EARS-23] should return effective actor for agent with succession', async () => {
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
    it('[EARS-24] should return actor from valid session resolving succession chain', async () => {
      // Since the real ConfigManager is being used and returns 'human:camilo',
      // we test with the actual session data
      jest.spyOn(identityAdapter, 'resolveCurrentActorId')
        .mockResolvedValue('human:camilo');
      jest.spyOn(identityAdapter, 'getActor')
        .mockResolvedValue(sampleActorPayload);

      const result = await identityAdapter.getCurrentActor();

      expect(result).toEqual(sampleActorPayload);
      expect(identityAdapter.resolveCurrentActorId).toHaveBeenCalledWith('human:camilo');
      expect(identityAdapter.getActor).toHaveBeenCalledWith('human:camilo');
    });

    it('[EARS-25] should return first active actor when no valid session', async () => {
      // Mock ConfigManager with no session
      const mockConfigManager = {
        loadSession: jest.fn().mockResolvedValue(null)
      };

      jest.doMock('../../config_manager', () => ({
        ConfigManager: jest.fn().mockImplementation(() => mockConfigManager)
      }));

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

    it('[EARS-26] should throw error when no active actors exist', async () => {
      // Mock ConfigManager with no session
      const mockConfigManager = {
        loadSession: jest.fn().mockResolvedValue(null)
      };

      jest.doMock('../../config_manager', () => ({
        ConfigManager: jest.fn().mockImplementation(() => mockConfigManager)
      }));

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

  describe('Event Emission', () => {
    it('should emit actor.created event when creating actor with eventBus', async () => {
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
      mockedCreateActorRecord.mockResolvedValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        signature: 'generated-signature',
        timestamp: 1234567890,
        timestamp_iso: '2023-01-01T00:00:00Z'
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.write.mockResolvedValue(undefined);
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
          actorType: 'human',
          publicKey: 'sample-public-key',
          roles: ['author'],
          isBootstrap: true,
        },
      });

      console.warn = originalWarn;
    });

    it('should emit actor.revoked event when revoking actor with eventBus', async () => {
      const existingRecord = { ...sampleRecord };
      mockActorStore.read.mockResolvedValue(existingRecord);
      mockActorStore.write.mockResolvedValue(undefined);
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

    it('should not emit events when eventBus is not provided (graceful degradation)', async () => {
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
      mockedCreateActorRecord.mockResolvedValue(sampleActorPayload);
      mockedCalculatePayloadChecksum.mockReturnValue('calculated-checksum');
      mockedSignPayload.mockReturnValue({
        keyId: 'human:test-user',
        role: 'author',
        signature: 'generated-signature',
        timestamp: 1234567890,
        timestamp_iso: '2023-01-01T00:00:00Z'
      });
      mockedValidateFullActorRecord.mockResolvedValue(undefined);
      mockActorStore.write.mockResolvedValue(undefined);

      // Suppress console.warn for tests
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Use adapter WITHOUT eventBus
      await identityAdapter.createActor(inputPayload, 'human:test-user');

      // Verify no events were published (graceful degradation)
      expect(mockEventBus.publish).not.toHaveBeenCalled();

      console.warn = originalWarn;
    });
  });
});
