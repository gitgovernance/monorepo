import type { ActorRecord } from "../../types";
import type { AgentRecord } from "../../types";
import type {
  GitGovRecord,
  ActorPayload,
  AgentPayload,
} from "../../types";
import { RecordStore } from "../../store/record_store";
import { createActorRecord } from "../../factories/actor_factory";
import { validateFullActorRecord } from "../../validation/actor_validator";
import { createAgentRecord } from "../../factories/agent_factory";
import { validateFullAgentRecord } from "../../validation/agent_validator";
import { generateKeys, signPayload } from "../../crypto/signatures";
import { calculatePayloadChecksum } from "../../crypto/checksum";
import { generateActorId } from "../../utils/id_generator";
import type { Signature } from "../../types";
import type {
  IEventStream,
  ActorCreatedEvent,
  ActorRevokedEvent,
  AgentRegisteredEvent
} from "../../event_bus";
import { ConfigManager } from "../../config_manager";

/**
 * IdentityAdapter Interface - The Identity Management Contract
 */
export interface IIdentityAdapter {
  // ActorRecord Operations
  createActor(payload: ActorPayload, signerId: string): Promise<ActorRecord>;
  getActor(actorId: string): Promise<ActorRecord | null>;
  listActors(): Promise<ActorRecord[]>;
  revokeActor(actorId: string, revokedBy?: string, reason?: "compromised" | "rotation" | "manual", supersededBy?: string): Promise<ActorRecord>;

  // Succession Chain Resolution
  resolveCurrentActorId(originalActorId: string): Promise<string>;
  getCurrentActor(): Promise<ActorRecord>;
  getEffectiveActorForAgent(agentId: string): Promise<ActorRecord | null>;

  // Advanced Operations
  signRecord(record: GitGovRecord, actorId: string, role: string): Promise<GitGovRecord>;
  rotateActorKey(actorId: string): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }>;
  authenticate(sessionToken: string): Promise<void>;
  getActorPublicKey(keyId: string): Promise<string | null>;

  // AgentRecord Operations
  createAgentRecord(payload: Partial<AgentPayload>): Promise<AgentRecord>;
  getAgentRecord(agentId: string): Promise<AgentRecord | null>;
  listAgentRecords(): Promise<AgentRecord[]>;
}

/**
 * IdentityAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface IdentityAdapterDependencies {
  // Data Layer (Protocols)
  actorStore: RecordStore<ActorRecord>;
  agentStore: RecordStore<AgentRecord>;

  // Optional: Event Bus for event-driven integration (graceful degradation)
  eventBus?: IEventStream;
}

export class IdentityAdapter implements IIdentityAdapter {
  private actorStore: RecordStore<ActorRecord>;
  private agentStore: RecordStore<AgentRecord>;
  private eventBus: IEventStream | undefined;

  constructor(dependencies: IdentityAdapterDependencies) {
    this.actorStore = dependencies.actorStore;
    this.agentStore = dependencies.agentStore;
    this.eventBus = dependencies.eventBus; // Graceful degradation
  }

  /**
   * Get actor public key for validation - used by other adapters
   */
  async getActorPublicKey(keyId: string): Promise<string | null> {
    try {
      const actor = await this.getActor(keyId);
      return actor?.publicKey || null;
    } catch (error) {
      return null;
    }
  }

  async createActor(
    payload: ActorPayload,
    _signerId: string
  ): Promise<ActorRecord> {
    // Validate required fields
    if (!payload.type || !payload.displayName) {
      throw new Error('ActorRecord requires type and displayName');
    }

    // Generate new keys for the actor
    const { publicKey, privateKey } = await generateKeys();

    // Generate ID if not provided
    const actorId = payload.id || generateActorId(payload.type, payload.displayName);

    // Create complete ActorRecord payload
    const completePayload: ActorRecord = {
      id: actorId,
      type: payload.type,
      displayName: payload.displayName,
      publicKey,
      roles: payload.roles || ['author'],
      status: payload.status || 'active',
      ...payload
    };

    // Validate the payload using the factory
    const validatedPayload = await createActorRecord(completePayload);

    // Calculate checksum for the payload
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // Create signature for the record
    const signature = await signPayload(validatedPayload, privateKey, actorId, 'author');

    // Create the complete GitGovRecord structure
    const record: GitGovRecord & { payload: ActorRecord } = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum,
        signatures: [signature]
      },
      payload: validatedPayload
    };

    // Validate the complete record
    await validateFullActorRecord(record, async (keyId) => {
      if (keyId === actorId) {
        return publicKey; // Self-referential for bootstrap
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // Store the record with validation
    await this.actorStore.write(record);

    // Emit actor created event (graceful degradation if no eventBus)
    if (this.eventBus) {
      // Check if this is the first actor (bootstrap)
      const allActorIds = await this.actorStore.list();
      const isBootstrap = allActorIds.length === 1; // Only the actor we just created

      const event: ActorCreatedEvent = {
        type: "identity.actor.created",
        timestamp: Date.now(),
        source: "identity_adapter",
        payload: {
          actorId,
          type: validatedPayload.type,
          publicKey: validatedPayload.publicKey,
          roles: validatedPayload.roles,
          isBootstrap,
        },
      };
      this.eventBus.publish(event);
    }

    // TODO: Store private key securely (outside of this core module)
    // For now, we'll just log it (NOT for production)
    console.warn(`Private key for ${actorId}: ${privateKey} (STORE SECURELY)`);

    return validatedPayload;
  }

  async getActor(actorId: string): Promise<ActorRecord | null> {
    const record = await this.actorStore.read(actorId);
    return record ? record.payload : null;
  }

  async listActors(): Promise<ActorRecord[]> {
    const ids = await this.actorStore.list();
    const actors: ActorRecord[] = [];

    for (const id of ids) {
      const record = await this.actorStore.read(id);
      if (record) {
        actors.push(record.payload);
      }
    }

    return actors;
  }

  async signRecord(
    record: GitGovRecord,
    actorId: string,
    role: string
  ): Promise<GitGovRecord> {
    // MVP MODE: Generate functionally valid mock signature
    // TODO: Replace with real cryptographic signing when key management is implemented

    // Verify actor exists
    const actor = await this.getActor(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    // Calculate payload checksum (real)
    const payloadChecksum = calculatePayloadChecksum(record.payload);

    // Generate mock signature that passes validation
    const mockSignature: Signature = {
      keyId: actorId,
      role: role,
      signature: `mock-signature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Math.floor(Date.now() / 1000),
      timestamp_iso: new Date().toISOString()
    };

    // Create signed record with real checksum + mock signature
    const signedRecord: GitGovRecord = {
      ...record,
      header: {
        ...record.header,
        payloadChecksum,
        signatures: [...(record.header.signatures || []), mockSignature]
      }
    };

    return signedRecord;
  }

  /**
   * Resolves the current active ActorRecord ID by following the succession chain.
   * This is critical for AgentRecord operations after key rotation.
   * 
   * @param originalActorId - The original actor ID (may be revoked)
   * @returns Promise<string> - The current active actor ID
   */
  async resolveCurrentActorId(originalActorId: string): Promise<string> {
    let currentId = originalActorId;
    let actor = await this.getActor(currentId);

    // Follow the succession chain until we find an active actor
    while (actor && actor.status === 'revoked' && actor.supersededBy) {
      currentId = actor.supersededBy;
      actor = await this.getActor(currentId);
    }

    return currentId;
  }

  /**
   * Gets the current ActorRecord of the system based on active session or fallback.
   * This is critical for CLI commands that need to know "who is the current user".
   * 
   * @returns Promise<ActorRecord> - The current active ActorRecord
   */
  async getCurrentActor(): Promise<ActorRecord> {
    // 1. Try to get from session
    const configManager = new ConfigManager();
    const session = await configManager.loadSession();

    if (session?.lastSession?.actorId) {
      // Use resolveCurrentActorId to handle succession chain
      const currentActorId = await this.resolveCurrentActorId(session.lastSession.actorId);
      const actor = await this.getActor(currentActorId);
      if (actor) {
        return actor;
      }
    }

    // 2. Fallback: first active actor in the system
    const actors = await this.listActors();
    const activeActor = actors.find(a => a.status === 'active');
    if (activeActor) {
      return activeActor;
    }

    throw new Error("❌ No active actors found. Run 'gitgov init' first.");
  }

  /**
   * Gets the effective (current active) ActorRecord for an AgentRecord.
   * This resolves the succession chain to get the current cryptographic identity.
   * 
   * @param agentId - The AgentRecord ID (may reference revoked ActorRecord)
   * @returns Promise<ActorRecord | null> - The current active ActorRecord or null
   */
  async getEffectiveActorForAgent(agentId: string): Promise<ActorRecord | null> {
    const currentActorId = await this.resolveCurrentActorId(agentId);
    return this.getActor(currentActorId);
  }

  async rotateActorKey(
    _actorId: string
  ): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }> {
    // TODO: Implement key rotation workflow
    throw new Error('rotateActorKey not implemented yet - complex operation');
  }

  async revokeActor(actorId: string, revokedBy: string = "system", reason: "compromised" | "rotation" | "manual" = "manual", supersededBy?: string): Promise<ActorRecord> {
    // Read the existing actor
    const existingRecord = await this.actorStore.read(actorId);
    if (!existingRecord) {
      throw new Error(`ActorRecord with id ${actorId} not found`);
    }

    // Update the status to revoked
    const revokedPayload: ActorRecord = {
      ...existingRecord.payload,
      status: "revoked",
      ...(supersededBy && { supersededBy })
    };

    // Calculate new checksum for the updated payload
    const payloadChecksum = calculatePayloadChecksum(revokedPayload);

    // Create updated record
    const updatedRecord: GitGovRecord & { payload: ActorRecord } = {
      ...existingRecord,
      header: {
        ...existingRecord.header,
        payloadChecksum
      },
      payload: revokedPayload
    };

    // Store the updated record with validation
    await this.actorStore.write(updatedRecord);

    // Emit actor revoked event (graceful degradation if no eventBus)
    if (this.eventBus) {
      const eventPayload: ActorRevokedEvent["payload"] = {
        actorId,
        revokedBy,
        revocationReason: reason,
      };

      if (supersededBy) {
        eventPayload.supersededBy = supersededBy;
      }

      const event: ActorRevokedEvent = {
        type: "identity.actor.revoked",
        timestamp: Date.now(),
        source: "identity_adapter",
        payload: eventPayload,
      };
      this.eventBus.publish(event);
    }

    return revokedPayload;
  }

  async authenticate(_sessionToken: string): Promise<void> {
    // TODO: Implement session token storage for SaaS mode
    console.warn('authenticate not fully implemented yet');
  }

  async createAgentRecord(payload: Partial<AgentPayload>): Promise<AgentRecord> {
    // Validate required fields
    if (!payload.id || !payload.guild || !payload.engine) {
      throw new Error('AgentRecord requires id, guild and engine');
    }

    // Verify that corresponding ActorRecord exists and is of type 'agent'
    const correspondingActor = await this.getActor(payload.id);
    if (!correspondingActor) {
      throw new Error(`ActorRecord with id ${payload.id} not found. AgentRecord can only be created for existing ActorRecord.`);
    }
    if (correspondingActor.type !== 'agent') {
      throw new Error(`ActorRecord with id ${payload.id} must be of type 'agent' to create AgentRecord.`);
    }

    // Create complete AgentRecord payload
    const completePayload: AgentRecord = {
      id: payload.id,
      guild: payload.guild,
      engine: payload.engine,
      status: payload.status || 'active',
      triggers: payload.triggers || [],
      knowledge_dependencies: payload.knowledge_dependencies || [],
      prompt_engine_requirements: payload.prompt_engine_requirements || {},
      ...payload
    };

    // Validate the payload using the factory
    const validatedPayload = await createAgentRecord(completePayload);

    // Calculate checksum for the payload
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // Create signature for the record using the corresponding actor's key
    // Note: In a real implementation, we would need access to the actor's private key
    // For now, we'll create a placeholder signature structure
    const signature = signPayload(validatedPayload, 'placeholder-private-key', payload.id, 'author');

    // Create the complete GitGovRecord structure
    const record: GitGovRecord & { payload: AgentRecord } = {
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
        return correspondingActor.publicKey; // Use the actor's public key
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // Store the record with validation
    await this.agentStore.write(record);

    // Emit agent registered event (graceful degradation if no eventBus)
    if (this.eventBus) {
      const event: AgentRegisteredEvent = {
        type: "identity.agent.registered",
        timestamp: Date.now(),
        source: "identity_adapter",
        payload: {
          agentId: validatedPayload.id,
          guild: validatedPayload.guild,
          engine: validatedPayload.engine,
          correspondingActorId: correspondingActor.id,
        },
      };
      this.eventBus.publish(event);
    }

    return validatedPayload;
  }

  async getAgentRecord(agentId: string): Promise<AgentRecord | null> {
    const record = await this.agentStore.read(agentId);
    return record ? record.payload : null;
  }

  async listAgentRecords(): Promise<AgentRecord[]> {
    const ids = await this.agentStore.list();
    const agents: AgentRecord[] = [];

    for (const id of ids) {
      const record = await this.agentStore.read(id);
      if (record) {
        agents.push(record.payload);
      }
    }

    return agents;
  }
}
