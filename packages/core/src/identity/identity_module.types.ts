import type { RecordStores } from '../record_store';
import type { IEventStream } from '../event_bus';
import type { KeyProvider } from '../key_provider/key_provider';
import type { ActorRecord, ActorPayload } from '../record_types';

/** IdentityModule Dependencies — sin sessionManager, sin RecordSigner. */
export type IdentityModuleDependencies = {
  /** RecordStore para ActorRecords. */
  stores: Required<Pick<RecordStores, 'actors'>>;
  /** KeyProvider para firma Ed25519 y persistencia de keys. Usado directamente para bootstrap, revocacion, y rotacion. */
  keyProvider: KeyProvider;
  /** EventBus opcional — si omitido, operaciones completan sin emitir eventos. */
  eventBus?: IEventStream;
};

/** Contrato publico de IdentityModule. */
export interface IIdentityModule {
  createActor(payload: ActorPayload, signerId: string): Promise<ActorRecord>;
  getActor(actorId: string): Promise<ActorRecord | null>;
  listActors(): Promise<ActorRecord[]>;
  getActorPublicKey(keyId: string): Promise<string | null>;
  revokeActor(
    actorId: string,
    revokedBy: string,
    reason?: 'compromised' | 'rotation' | 'manual',
    supersededBy?: string,
  ): Promise<ActorRecord>;
  resolveCurrentActorId(originalActorId: string): Promise<string>;
  getEffectiveActorForAgent(agentId: string): Promise<ActorRecord | null>;
  rotateActorKey(
    actorId: string,
    options?: { newPublicKey?: string; newPrivateKey?: string },
  ): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }>;
}
