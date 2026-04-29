import type {
  ActorRecord,
  GitGovActorRecord,
  ActorPayload,
  Signature,
} from '../record_types';
import type {
  ActorCreatedEvent,
  ActorRevokedEvent,
} from '../event_bus';
import type { IdentityModuleDependencies, IIdentityModule } from './identity_module.types';

import { createActorRecord } from '../record_factories/actor_factory';
import { validateFullActorRecord } from '../record_validations/actor_validator';
import { generateKeys, signPayload, buildSignatureDigest } from '../crypto/signatures';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { generateActorId, computeSuccessorActorId } from '../utils/id_generator';

export class IdentityModule implements IIdentityModule {
  private stores: IdentityModuleDependencies['stores'];
  private keyProvider: IdentityModuleDependencies['keyProvider'];
  private eventBus: IdentityModuleDependencies['eventBus'];

  constructor(deps: IdentityModuleDependencies) {
    this.stores = deps.stores;
    this.keyProvider = deps.keyProvider;
    this.eventBus = deps.eventBus;
  }

  // ── getActorPublicKey ──────────────────────────────────────────────

  // [IDM-B5] Return publicKey for existing actor
  // [IDM-B6] Return null for non-existent actor
  async getActorPublicKey(keyId: string): Promise<string | null> {
    try {
      const actor = await this.getActor(keyId);
      return actor?.publicKey || null;
    } catch {
      return null;
    }
  }

  // ── createActor ────────────────────────────────────────────────────

  async createActor(
    payload: ActorPayload,
    _signerId: string,
  ): Promise<ActorRecord> {
    // [IDM-A3] Throw if required fields missing
    if (!payload.type || !payload.displayName) {
      throw new Error('ActorRecord requires type and displayName');
    }

    // [IDM-A1] Generate Ed25519 keypair
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
      ...payload,
    };

    // Validate the payload using the factory
    const validatedPayload = createActorRecord(completePayload);

    // Calculate checksum for the payload
    const payloadChecksum = calculatePayloadChecksum(validatedPayload);

    // [IDM-A1] Self-sign with the new key via signPayload (bootstrap — not RecordSigner nor keyProvider.sign)
    const signature = signPayload(
      validatedPayload,
      privateKey,
      actorId,
      'author',
      'Actor registration',
    );

    // Create the complete GitGovRecord structure
    const record: GitGovActorRecord = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum,
        signatures: [signature],
      },
      payload: validatedPayload,
    };

    // [IDM-A1] Validate the complete record via validateFullActorRecord
    await validateFullActorRecord(record, async (keyId) => {
      if (keyId === actorId) {
        return publicKey; // Self-referential for bootstrap
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // [IDM-A1] Persist to store
    await this.stores.actors.put(record.payload.id, record);

    // [IDM-A2] Persist private key via KeyProvider (non-blocking failure)
    try {
      await this.keyProvider.setPrivateKey(actorId, privateKey);
    } catch (error) {
      console.warn(
        `Could not persist private key for ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // [IDM-F1] Emit identity.actor.created if eventBus available
    if (this.eventBus) {
      const allActorIds = await this.stores.actors.list();
      const isBootstrap = allActorIds.length === 1;

      const event: ActorCreatedEvent = {
        type: 'identity.actor.created',
        timestamp: Date.now(),
        source: 'identity_module',
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

  // ── getActor ───────────────────────────────────────────────────────

  // [IDM-B1] Return ActorRecord when exists
  // [IDM-B2] Return null when actor not found
  async getActor(actorId: string): Promise<ActorRecord | null> {
    const record = await this.stores.actors.get(actorId);
    return record ? record.payload : null;
  }

  // ── listActors ─────────────────────────────────────────────────────

  // [IDM-B3] Return all ActorRecords
  // [IDM-B4] Return empty array when no actors exist
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

  // ── resolveCurrentActorId ──────────────────────────────────────────

  // [IDM-D1] Return same id for active actor
  // [IDM-D2] Follow succession chain to active actor
  async resolveCurrentActorId(originalActorId: string): Promise<string> {
    let currentId = originalActorId;
    let actor = await this.getActor(currentId);

    while (actor && actor.status === 'revoked' && actor.supersededBy) {
      currentId = actor.supersededBy;
      actor = await this.getActor(currentId);
    }

    return currentId;
  }

  // ── getEffectiveActorForAgent ──────────────────────────────────────

  // [IDM-D3] Return effective actor for agent with succession
  async getEffectiveActorForAgent(agentId: string): Promise<ActorRecord | null> {
    const currentActorId = await this.resolveCurrentActorId(agentId);
    return this.getActor(currentActorId);
  }

  // ── revokeActor ────────────────────────────────────────────────────

  async revokeActor(
    actorId: string,
    revokedBy: string,
    reason: 'compromised' | 'rotation' | 'manual' = 'manual',
    supersededBy?: string,
  ): Promise<ActorRecord> {
    // [IDM-C3] Throw if actor not found
    const existingRecord = await this.stores.actors.get(actorId);
    if (!existingRecord) {
      throw new Error(`ActorRecord with id ${actorId} not found`);
    }

    // [IDM-C1] Change status to revoked, add supersededBy if provided
    const revokedPayload: ActorRecord = {
      ...existingRecord.payload,
      status: 'revoked',
      ...(supersededBy && { supersededBy }),
    };

    // [IDM-C1] Recalculate payloadChecksum
    const payloadChecksum = calculatePayloadChecksum(revokedPayload);

    // [IDM-C1] Sign revocation with revokedBy actor's key via createSignature helper
    const notes = supersededBy
      ? `Revoking after key ${reason} — successor is ${supersededBy}`
      : `Revoking: ${reason}`;
    const revocationSignature = await this.createSignature(
      payloadChecksum,
      revokedBy,
      'author',
      notes,
    );

    // [IDM-C1] Persist updated record with revocation signature REPLACING the original
    // [IDM-C2] Record must pass Three Gates validation offline
    const updatedRecord: GitGovActorRecord = {
      ...existingRecord,
      header: {
        ...existingRecord.header,
        payloadChecksum,
        signatures: [revocationSignature],
      },
      payload: revokedPayload,
    };

    await this.stores.actors.put(updatedRecord.payload.id, updatedRecord);

    // [IDM-F2] Emit identity.actor.revoked if eventBus available
    if (this.eventBus) {
      const eventPayload: ActorRevokedEvent['payload'] = {
        actorId,
        revokedBy,
        revocationReason: reason,
      };

      if (supersededBy) {
        eventPayload.supersededBy = supersededBy;
      }

      const event: ActorRevokedEvent = {
        type: 'identity.actor.revoked',
        timestamp: Date.now(),
        source: 'identity_module',
        payload: eventPayload,
      };
      this.eventBus.publish(event);
    }

    return revokedPayload;
  }

  // ── rotateActorKey ─────────────────────────────────────────────────

  async rotateActorKey(
    actorId: string,
    options?: { newPublicKey?: string; newPrivateKey?: string },
  ): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }> {
    // [IDM-E4] Throw if actor not found
    const oldActor = await this.getActor(actorId);
    if (!oldActor) {
      throw new Error(`ActorRecord with id ${actorId} not found`);
    }

    // [IDM-E5] Throw if actor is revoked
    if (oldActor.status === 'revoked') {
      throw new Error(`Cannot rotate key for revoked actor: ${actorId}`);
    }

    // [IDM-E3] Use provided keys or generate new ones
    let newPublicKey: string;
    let newPrivateKey: string;
    if (options?.newPublicKey && options?.newPrivateKey) {
      newPublicKey = options.newPublicKey;
      newPrivateKey = options.newPrivateKey;
    } else {
      // [IDM-E1] Generate new Ed25519 keypair
      const generated = await generateKeys();
      newPublicKey = generated.publicKey;
      newPrivateKey = generated.privateKey;
    }

    // [IDM-E1] Create new ActorRecord with versioned ID
    const baseId = generateActorId(oldActor.type, oldActor.displayName);
    const newActorId = computeSuccessorActorId(baseId);

    const newActorPayload: ActorRecord = {
      id: newActorId,
      type: oldActor.type,
      displayName: oldActor.displayName,
      publicKey: newPublicKey,
      roles: oldActor.roles,
      status: 'active',
    };

    const validatedNewPayload = createActorRecord(newActorPayload);

    const payloadChecksum = calculatePayloadChecksum(validatedNewPayload);

    // [IDM-E1] Sign new record with OLD key (proof of ownership per RFC-02 §6.3)
    const notes = `Key rotation — successor of ${actorId}`;
    const successorSignature = await this.createSignature(
      payloadChecksum,
      actorId,
      'author',
      notes,
    );

    const newRecord: GitGovActorRecord = {
      header: {
        version: '1.0',
        type: 'actor',
        payloadChecksum,
        signatures: [successorSignature],
      },
      payload: validatedNewPayload,
    };

    // [IDM-E2] Validate the complete new record using old actor's public key
    // [IDM-E6] If validation fails, throw and do NOT create the new actor
    await validateFullActorRecord(newRecord, async (keyId) => {
      if (keyId === actorId) {
        return oldActor.publicKey;
      }
      const signerActor = await this.getActor(keyId);
      return signerActor?.publicKey || null;
    });

    // [IDM-E7] If store write fails, throw and do NOT revoke the old actor
    await this.stores.actors.put(newRecord.payload.id, newRecord);

    // [IDM-E8] If revocation fails after creation, throw (known limitation)
    const revokedOldActor = await this.revokeActor(
      actorId,
      actorId,
      'rotation',
      newActorId,
    );

    // [IDM-E9] Persist new private key — non-blocking failure
    try {
      await this.keyProvider.setPrivateKey(newActorId, newPrivateKey);
    } catch (error) {
      console.warn(
        `Could not persist private key for ${newActorId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return {
      oldActor: revokedOldActor,
      newActor: validatedNewPayload,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  // [IDM-F3] Operations complete without events when no eventBus configured
  // (eventBus checks are inline in createActor, revokeActor — no-op if undefined)

  /**
   * Creates a Signature by building the digest and delegating signing to keyProvider.sign().
   * Used by revokeActor and rotateActorKey — NOT for bootstrap (createActor uses signPayload directly).
   */
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
}
