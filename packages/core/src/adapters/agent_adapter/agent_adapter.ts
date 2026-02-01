import type {
  AgentRecord,
  AgentPayload,
  GitGovAgentRecord,
} from '../../record_types';
import type { RecordStores } from '../../record_store';
import type { IEventStream, AgentRegisteredEvent } from '../../event_bus';
import type { KeyProvider } from '../../key_provider/key_provider';
import type { IIdentityAdapter } from '../identity_adapter';
import type { IAgentAdapter, AgentAdapterDependencies } from './agent_adapter.types';

import { createAgentRecord } from '../../factories/agent_factory';
import { validateFullAgentRecord } from '../../validation/agent_validator';
import { signPayload } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';

/**
 * AgentAdapter - Manages the lifecycle of AgentRecords
 *
 * Responsibilities:
 * - CRUD operations for AgentRecords
 * - Validation that corresponding ActorRecord exists
 * - Cryptographic signing via KeyProvider
 * - Event emission via EventBus
 */
export class AgentAdapter implements IAgentAdapter {
  private stores: Required<Pick<RecordStores, 'agents'>>;
  private identity: IIdentityAdapter;
  private keyProvider: KeyProvider;
  private eventBus: IEventStream | undefined;

  constructor(dependencies: AgentAdapterDependencies) {
    this.stores = dependencies.stores;
    this.identity = dependencies.identity;
    this.keyProvider = dependencies.keyProvider;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * [EARS-A1] Creates a new AgentRecord.
   * [EARS-A2] Throws if id or engine missing.
   * [EARS-A3] Throws if ActorRecord not found.
   * [EARS-A4] Throws if ActorRecord type is not 'agent'.
   * [EARS-A5] Emits event on success.
   */
  async createAgentRecord(payload: Partial<AgentPayload>): Promise<AgentRecord> {
    // [EARS-A2] Validate required fields
    if (!payload.id || !payload.engine) {
      throw new Error('AgentRecord requires id and engine');
    }

    // [EARS-A3] Verify that corresponding ActorRecord exists
    const correspondingActor = await this.identity.getActor(payload.id);
    if (!correspondingActor) {
      throw new Error(`ActorRecord with id ${payload.id} not found. AgentRecord can only be created for existing ActorRecord.`);
    }

    // [EARS-A4] Verify ActorRecord is of type 'agent'
    if (correspondingActor.type !== 'agent') {
      throw new Error(`ActorRecord with id ${payload.id} must be of type 'agent' to create AgentRecord.`);
    }

    // [EARS-A1] Create complete AgentRecord payload
    const completePayload: AgentRecord = {
      id: payload.id,
      engine: payload.engine,
      status: payload.status || 'active',
      triggers: payload.triggers || [],
      knowledge_dependencies: payload.knowledge_dependencies || [],
      prompt_engine_requirements: payload.prompt_engine_requirements || {},
      ...payload
    };

    // Validate the payload using the factory
    const validatedPayload = createAgentRecord(completePayload);

    // Calculate checksum for the payload
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // Load private key via KeyProvider for signing
    let privateKey: string;
    try {
      const key = await this.keyProvider.getPrivateKey(payload.id);
      if (!key) {
        throw new Error(`Private key not found for ${payload.id}`);
      }
      privateKey = key;
    } catch (error) {
      throw new Error(
        `Private key not found for actor ${payload.id}. ` +
        `AgentRecord requires a valid private key for cryptographic signing. ` +
        `If this is a legacy actor, you may need to regenerate the actor with 'gitgov actor new'. ` +
        `Original error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Create cryptographic signature
    const signature = signPayload(validatedPayload, privateKey, payload.id, 'author', 'Agent registration');

    // Create the complete GitGovRecord structure
    const record: GitGovAgentRecord = {
      header: {
        version: '1.0',
        type: 'agent',
        payloadChecksum,
        signatures: [signature]
      },
      payload: validatedPayload
    };

    // Validate the complete record
    await validateFullAgentRecord(record, async (keyId) => {
      if (keyId === payload.id) {
        return correspondingActor.publicKey;
      }
      const signerActor = await this.identity.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // Store the record
    await this.stores.agents.put(record.payload.id, record);

    // [EARS-A5] Emit agent registered event
    if (this.eventBus) {
      const event: AgentRegisteredEvent = {
        type: "identity.agent.registered",
        timestamp: Date.now(),
        source: "agent_adapter",
        payload: {
          agentId: validatedPayload.id,
          engine: validatedPayload.engine,
          correspondingActorId: correspondingActor.id,
        },
      };
      this.eventBus.publish(event);
    }

    return validatedPayload;
  }

  /**
   * [EARS-B1] Returns AgentRecord if exists.
   * [EARS-B2] Returns null if not found.
   */
  async getAgentRecord(agentId: string): Promise<AgentRecord | null> {
    const record = await this.stores.agents.get(agentId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-C1] Returns all AgentRecords.
   */
  async listAgentRecords(): Promise<AgentRecord[]> {
    const ids = await this.stores.agents.list();
    const agents: AgentRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.agents.get(id);
      if (record) {
        agents.push(record.payload);
      }
    }

    return agents;
  }

  /**
   * [EARS-D1] Updates AgentRecord fields (except id).
   * [EARS-D2] Throws if AgentRecord not found.
   */
  async updateAgentRecord(agentId: string, updates: Partial<AgentPayload>): Promise<AgentRecord> {
    // [EARS-D2] Verify AgentRecord exists
    const existingRecord = await this.stores.agents.get(agentId);
    if (!existingRecord) {
      throw new Error(`AgentRecord with id ${agentId} not found`);
    }

    // Get corresponding ActorRecord for signing
    const correspondingActor = await this.identity.getActor(agentId);
    if (!correspondingActor) {
      throw new Error(`ActorRecord with id ${agentId} not found`);
    }

    // [EARS-D1] Merge updates (id cannot be changed)
    const updatedPayload: AgentRecord = {
      ...existingRecord.payload,
      ...updates,
      id: agentId, // Ensure id is not changed
    };

    // Validate the updated payload
    const validatedPayload = createAgentRecord(updatedPayload);

    // Calculate new checksum
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // Load private key for signing
    let privateKey: string;
    try {
      const key = await this.keyProvider.getPrivateKey(agentId);
      if (!key) {
        throw new Error(`Private key not found for ${agentId}`);
      }
      privateKey = key;
    } catch (error) {
      throw new Error(`Private key not found for actor ${agentId}`);
    }

    // Create signature for update
    const signature = signPayload(validatedPayload, privateKey, agentId, 'author', 'Agent update');

    // Create updated record
    const record: GitGovAgentRecord = {
      header: {
        version: '1.0',
        type: 'agent',
        payloadChecksum,
        signatures: [signature]
      },
      payload: validatedPayload
    };

    // Store the updated record
    await this.stores.agents.put(record.payload.id, record);

    return validatedPayload;
  }

  /**
   * [EARS-E1] Archives AgentRecord (status='archived').
   * [EARS-E2] Throws if AgentRecord not found.
   */
  async archiveAgentRecord(agentId: string): Promise<AgentRecord> {
    return this.updateAgentRecord(agentId, { status: 'archived' });
  }
}
