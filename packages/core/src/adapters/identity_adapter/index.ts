import type { ActorRecord, GitGovActorRecord, GitGovAgentRecord } from "../../types";
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
import { generateKeys, signPayload, generateMockSignature } from "../../crypto/signatures";
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
import type { KeyProvider } from "../../key_provider/key_provider";

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
  signRecord(record: GitGovRecord, actorId: string, role: string, notes: string): Promise<GitGovRecord>;
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

  // Key Management
  keyProvider: KeyProvider;

  // Optional: Event Bus for event-driven integration (graceful degradation)
  eventBus?: IEventStream;
}

export class IdentityAdapter implements IIdentityAdapter {
  private actorStore: RecordStore<ActorRecord>;
  private agentStore: RecordStore<AgentRecord>;
  private keyProvider: KeyProvider;
  private eventBus: IEventStream | undefined;

  constructor(dependencies: IdentityAdapterDependencies) {
    this.actorStore = dependencies.actorStore;
    this.agentStore = dependencies.agentStore;
    this.keyProvider = dependencies.keyProvider;
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
    const validatedPayload = createActorRecord(completePayload);

    // Calculate checksum for the payload
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // Create signature for the record
    const signature = signPayload(validatedPayload, privateKey, actorId, 'author', 'Actor registration');

    // Create the complete GitGovRecord structure
    const record: GitGovActorRecord = {
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

    // Persist private key via KeyProvider
    try {
      await this.keyProvider.setPrivateKey(actorId, privateKey);
    } catch (error) {
      // Log warning but don't fail actor creation if key persistence fails
      // This allows graceful degradation in environments where file permissions might be restricted
      console.warn(`⚠️  Could not persist private key for ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

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
    role: string,
    notes: string
  ): Promise<GitGovRecord> {
    // Verify actor exists
    const actor = await this.getActor(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    // Calculate payload checksum (real)
    const payloadChecksum = calculatePayloadChecksum(record.payload);

    // Try to load private key via KeyProvider for real signing
    let privateKey: string | null = null;
    try {
      privateKey = await this.keyProvider.getPrivateKey(actorId);
    } catch (error) {
      // Private key not found - fallback to mock signature for backward compatibility
      console.warn(`⚠️  Private key not found for ${actorId}, using mock signature`);
    }

    // Create signature (real if private key available, mock otherwise)
    let signature: Signature;
    if (privateKey) {
      // Real cryptographic signing
      signature = signPayload(record.payload, privateKey, actorId, role, notes);
    } else {
      // Fallback to mock signature for backward compatibility
      signature = {
        keyId: actorId,
        role: role,
        notes: notes,
        signature: generateMockSignature(),
        timestamp: Math.floor(Date.now() / 1000)
      };
    }

    // Replace placeholder signatures or add new signature if no placeholders exist
    const existingSignatures = record.header.signatures || [];
    const hasPlaceholder = existingSignatures.some(sig => sig.signature === 'placeholder');

    let finalSignatures: [Signature, ...Signature[]];
    if (hasPlaceholder) {
      // Replace placeholder signatures with the real signature
      const replaced = existingSignatures.map(sig =>
        sig.signature === 'placeholder' ? signature : sig
      );
      // Ensure at least one signature (should always be true after replacement)
      finalSignatures = replaced.length > 0
        ? replaced as [Signature, ...Signature[]]
        : [signature];
    } else {
      // No placeholders: append new signature (multi-signature scenario)
      finalSignatures = [...existingSignatures, signature] as [Signature, ...Signature[]];
    }

    // Create signed record with real checksum + signature
    const signedRecord: GitGovRecord = {
      ...record,
      header: {
        ...record.header,
        payloadChecksum,
        signatures: finalSignatures
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
    actorId: string
  ): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }> {
    // Read existing actor
    const oldActor = await this.getActor(actorId);
    if (!oldActor) {
      throw new Error(`ActorRecord with id ${actorId} not found`);
    }

    if (oldActor.status === 'revoked') {
      throw new Error(`Cannot rotate key for revoked actor: ${actorId}`);
    }

    // Generate new keys for the new actor
    const { publicKey: newPublicKey, privateKey: newPrivateKey } = await generateKeys();

    // Generate new actor ID following the pattern from actor_protocol_faq.md
    // Pattern: {baseId}-v{N} where N is the version number (using hyphens to match schema pattern)
    // Schema pattern: ^(human|agent)(:[a-z0-9-]+)+$ (only allows hyphens, not underscores)
    const baseId = generateActorId(oldActor.type, oldActor.displayName);
    let newActorId: string;

    // Check if baseId already has a version suffix (e.g., human:camilo-v2)
    const versionMatch = baseId.match(/^(.+)-v(\d+)$/);
    if (versionMatch && versionMatch[1] && versionMatch[2]) {
      const baseWithoutVersion = versionMatch[1];
      const currentVersion = parseInt(versionMatch[2], 10);
      newActorId = `${baseWithoutVersion}-v${currentVersion + 1}`;
    } else {
      // First rotation: add -v2
      newActorId = `${baseId}-v2`;
    }

    // Create new actor with same metadata but new keys
    const newActorPayload: ActorRecord = {
      id: newActorId,
      type: oldActor.type,
      displayName: oldActor.displayName,
      publicKey: newPublicKey,
      roles: oldActor.roles,
      status: 'active'
    };

    // Validate the new payload
    const validatedNewPayload = createActorRecord(newActorPayload);

    // Calculate checksum for the new payload
    const payloadChecksum = calculatePayloadChecksum(validatedNewPayload);

    // Create signature for the new record (self-signed for bootstrap)
    const signature = signPayload(validatedNewPayload, newPrivateKey, newActorId, 'author', 'Key rotation');

    // Create the complete GitGovRecord structure for new actor
    const newRecord: GitGovActorRecord = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum,
        signatures: [signature]
      },
      payload: validatedNewPayload
    };

    // Validate the complete new record
    await validateFullActorRecord(newRecord, async (keyId) => {
      if (keyId === newActorId) {
        return newPublicKey; // Self-referential for bootstrap
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // Store the new actor record
    await this.actorStore.write(newRecord);

    // Revoke old actor and mark succession
    const revokedOldActor = await this.revokeActor(
      actorId,
      'system',
      'rotation',
      newActorId // Mark succession
    );

    // Update session to point to the new actor using ConfigManager
    try {
      const configManager = new ConfigManager();

      // Migrate actorState from old actor to new actor
      const oldState = await configManager.getActorState(actorId);
      if (oldState) {
        await configManager.updateActorState(newActorId, oldState);
      } else {
        // Create initial state for new actor
        await configManager.updateActorState(newActorId, {});
      }
    } catch (error) {
      // Graceful degradation: session update is not critical
      console.warn(`⚠️  Could not update session for ${newActorId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Persist new private key via KeyProvider
    try {
      await this.keyProvider.setPrivateKey(newActorId, newPrivateKey);
    } catch (error) {
      console.warn(`⚠️  Could not persist private key for ${newActorId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      oldActor: revokedOldActor,
      newActor: validatedNewPayload
    };
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
    const updatedRecord: GitGovActorRecord = {
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
    if (!payload.id || !payload.engine) {
      throw new Error('AgentRecord requires id and engine');
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

    // Load private key via KeyProvider for real signing
    // Since createActor() always persists the private key, it should be available
    // If not found, this indicates a problem (legacy actor, key deleted, or I/O error)
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

    // Create real cryptographic signature
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
