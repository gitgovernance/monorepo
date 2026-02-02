import type {
  ActorRecord,
  GitGovRecord,
  GitGovActorRecord,
  ActorPayload,
  Signature,
} from '../../record_types';
import type { RecordStores } from '../../record_store';
import type {
  IEventStream,
  ActorCreatedEvent,
  ActorRevokedEvent,
} from '../../event_bus';
import type { KeyProvider } from '../../key_provider/key_provider';
import type { IIdentityAdapter, IdentityAdapterDependencies } from './identity_adapter.types';

import { createActorRecord } from '../../record_factories/actor_factory';
import { validateFullActorRecord } from '../../record_validations/actor_validator';
import { generateKeys, signPayload, generateMockSignature } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import { generateActorId } from '../../utils/id_generator';
import type { ISessionManager } from '../../session_manager';

export class IdentityAdapter implements IIdentityAdapter {
  private stores: Required<Pick<RecordStores, 'actors'>>;
  private keyProvider: KeyProvider;
  private sessionManager: ISessionManager;
  private eventBus: IEventStream | undefined;

  constructor(dependencies: IdentityAdapterDependencies) {
    this.stores = dependencies.stores;
    this.keyProvider = dependencies.keyProvider;
    this.sessionManager = dependencies.sessionManager;
    this.eventBus = dependencies.eventBus; // Optional dependency
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
    await this.stores.actors.put(record.payload.id, record);

    // Persist private key via KeyProvider
    try {
      await this.keyProvider.setPrivateKey(actorId, privateKey);
    } catch (error) {
      // Log warning but don't fail actor creation if key persistence fails
      // This allows fallback behavior in environments where file permissions might be restricted
      console.warn(`⚠️  Could not persist private key for ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Emit actor created event (skipped if no eventBus)
    if (this.eventBus) {
      // Check if this is the first actor (bootstrap)
      const allActorIds = await this.stores.actors.list();
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
    const record = await this.stores.actors.get(actorId);
    return record ? record.payload : null;
  }

  async listActors(): Promise<ActorRecord[]> {
    const ids = await this.stores.actors.list();
    const actors: ActorRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.actors.get(id);
      if (record) {
        actors.push(record.payload);
      }
    }

    return actors;
  }

  async signRecord<T extends GitGovRecord>(
    record: T,
    actorId: string,
    role: string,
    notes: string
  ): Promise<T> {
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
    // Type assertion safe: we only modify header, payload type T is preserved
    const signedRecord = {
      ...record,
      header: {
        ...record.header,
        payloadChecksum,
        signatures: finalSignatures
      }
    } as T;

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
    const session = await this.sessionManager.loadSession();

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
    await this.stores.actors.put(newRecord.payload.id, newRecord);

    // Revoke old actor and mark succession
    const revokedOldActor = await this.revokeActor(
      actorId,
      'system',
      'rotation',
      newActorId // Mark succession
    );

    // Update session to point to the new actor using SessionManager
    try {
      // Migrate actorState from old actor to new actor
      const oldState = await this.sessionManager.getActorState(actorId);
      if (oldState) {
        await this.sessionManager.updateActorState(newActorId, oldState);
      } else {
        // Create initial state for new actor
        await this.sessionManager.updateActorState(newActorId, {});
      }
    } catch (error) {
      // Non-critical: session update failure logged as warning
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
    const existingRecord = await this.stores.actors.get(actorId);
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
    await this.stores.actors.put(updatedRecord.payload.id, updatedRecord);

    // Emit actor revoked event (skipped if no eventBus)
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
}
