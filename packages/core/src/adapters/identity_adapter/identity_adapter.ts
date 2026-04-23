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
import { generateKeys, signPayload, buildSignatureDigest } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import { generateActorId, computeSuccessorActorId } from '../../utils/id_generator';
import type { ISessionManager } from '../../session_manager';

export class IdentityAdapter implements IIdentityAdapter {
  private stores: Required<Pick<RecordStores, 'actors'>>;
  private keyProvider: KeyProvider;
  // Optional as of IKS-A46 pre-P9 cleanup. Only `getCurrentActor()` and
  // `rotateActorKey()` consume it; callers that never use those methods
  // (e.g., GitHubRemoteInitService) can omit it at construction time.
  private sessionManager: ISessionManager | undefined;
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
    // [EARS-E3] Verify actor exists
    const actor = await this.getActor(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    // [EARS-E1] Calculate payload checksum and build digest via crypto primitive
    const payloadChecksum = calculatePayloadChecksum(record.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const digestHash = buildSignatureDigest(payloadChecksum, actorId, role, notes, timestamp);

    // [EARS-E1] [IKS-B7] Delegate signing to keyProvider.sign() — NOT getPrivateKey() + signPayload()
    // [EARS-E2] [IKS-B6] sign() throws KeyProviderError('KEY_NOT_FOUND') if no key exists
    const signatureBytes = await this.keyProvider.sign(actorId, new Uint8Array(digestHash));

    const signature: Signature = {
      keyId: actorId,
      role,
      notes,
      signature: Buffer.from(signatureBytes).toString('base64'),
      timestamp,
    };

    // [EARS-E4] Replace placeholder signatures or add new signature
    const existingSignatures = record.header.signatures || [];
    const hasPlaceholder = existingSignatures.some(sig => sig.signature === 'placeholder');

    let finalSignatures: [Signature, ...Signature[]];
    if (hasPlaceholder) {
      const replaced = existingSignatures.map(sig =>
        sig.signature === 'placeholder' ? signature : sig
      );
      finalSignatures = replaced.length > 0
        ? replaced as [Signature, ...Signature[]]
        : [signature];
    } else {
      finalSignatures = [...existingSignatures, signature] as [Signature, ...Signature[]];
    }

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
    // sessionManager is required for this method — throw if omitted.
    // IdentityAdapter accepts an optional sessionManager (IKS-A46 pre-P9
    // cleanup) because createActor/signRecord/etc. don't need it. But
    // getCurrentActor resolves "who is logged in" — that requires a session.
    if (!this.sessionManager) {
      throw new Error(
        'IdentityAdapter.getCurrentActor requires a sessionManager. ' +
        'Construct the adapter with { sessionManager } to use this method.',
      );
    }
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
    actorId: string,
    options?: { newPublicKey?: string; newPrivateKey?: string }
  ): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }> {
    // Read existing actor
    const oldActor = await this.getActor(actorId);
    if (!oldActor) {
      throw new Error(`ActorRecord with id ${actorId} not found`);
    }

    if (oldActor.status === 'revoked') {
      throw new Error(`Cannot rotate key for revoked actor: ${actorId}`);
    }

    // [IKS-SUC3] Use provided keys or generate new ones
    let newPublicKey: string;
    let newPrivateKey: string;
    if (options?.newPublicKey && options?.newPrivateKey) {
      newPublicKey = options.newPublicKey;
      newPrivateKey = options.newPrivateKey;
    } else {
      const generated = await generateKeys();
      newPublicKey = generated.publicKey;
      newPrivateKey = generated.privateKey;
    }

    // Generate new actor ID following the pattern from actor_protocol_faq.md
    // Pattern: {baseId}-v{N} where N is the version number (using hyphens to match schema pattern)
    const baseId = generateActorId(oldActor.type, oldActor.displayName);
    const newActorId = computeSuccessorActorId(baseId);

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

    // [IKS-SUC2] Sign new actor with OLD key (proof of ownership per RFC-02 §6.3).
    // The old key proves "I, human:camilo, authorize human:camilo-v2 as my successor."
    const notes = `Key rotation — successor of ${actorId}`;
    const successorSignature = await this.createSignature(
      payloadChecksum, actorId, 'author', notes
    );

    // Create the complete GitGovRecord structure for new actor
    const newRecord: GitGovActorRecord = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum,
        signatures: [successorSignature]
      },
      payload: validatedNewPayload
    };

    // Validate the complete new record using old actor's public key
    await validateFullActorRecord(newRecord, async (keyId) => {
      if (keyId === actorId) {
        return oldActor.publicKey;
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // Store the new actor record
    await this.stores.actors.put(newRecord.payload.id, newRecord);

    // Revoke old actor and mark succession — signed with OLD key (still available)
    const revokedOldActor = await this.revokeActor(
      actorId,
      actorId,
      'rotation',
      newActorId
    );

    // Update session to point to the new actor using SessionManager.
    // IKS-A46 pre-P9 cleanup: sessionManager is optional on the adapter. If
    // omitted (e.g., saas-api Remote Init context), skip the state migration
    // entirely — there is no local session store to update. The new keypair
    // still persists via keyProvider.setPrivateKey below, so rotation itself
    // succeeds; only the cached actor state is not migrated.
    if (this.sessionManager) {
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

  async revokeActor(actorId: string, revokedBy: string, reason: "compromised" | "rotation" | "manual" = "manual", supersededBy?: string): Promise<ActorRecord> {
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

    // [IKS-SUC1] Calculate new checksum and sign the revocation with the revoker's key.
    // The original creation signatures remain for historical verification (RFC-02 §10.4).
    const payloadChecksum = calculatePayloadChecksum(revokedPayload);
    const notes = supersededBy
      ? `Revoking after key ${reason} — successor is ${supersededBy}`
      : `Revoking: ${reason}`;
    const revocationSignature = await this.createSignature(
      payloadChecksum, revokedBy, 'author', notes
    );

    // Create updated record with revocation signature. The original creation
    // signatures are preserved in git history (previous commit). The current
    // file state has only the revocation signature, which verifies against
    // the revoked payload's checksum.
    const updatedRecord: GitGovActorRecord = {
      ...existingRecord,
      header: {
        ...existingRecord.header,
        payloadChecksum,
        signatures: [revocationSignature],
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

  private async createSignature(
    payloadChecksum: string,
    signerActorId: string,
    role: string,
    notes: string,
  ): Promise<Signature> {
    const timestamp = Math.floor(Date.now() / 1000);
    const digestHash = buildSignatureDigest(payloadChecksum, signerActorId, role, notes, timestamp);
    const signatureBytes = await this.keyProvider.sign(signerActorId, new Uint8Array(digestHash));

    return {
      keyId: signerActorId,
      role,
      notes,
      signature: Buffer.from(signatureBytes).toString('base64'),
      timestamp,
    };
  }

  async authenticate(_sessionToken: string): Promise<void> {
    // TODO: Implement session token storage for SaaS mode
    console.warn('authenticate not fully implemented yet');
  }
}
