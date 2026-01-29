import type {
  ActorRecord,
  GitGovRecord,
  ActorPayload,
} from '../../types';
import type { RecordStores } from '../../record_store';
import type { IEventStream } from '../../event_bus';
import type { KeyProvider } from '../../key_provider/key_provider';
import type { ISessionManager } from '../../session_manager';

/**
 * IdentityAdapter Interface - The Identity Management Contract
 *
 * NOTE: AgentRecord operations have been moved to AgentAdapter.
 * Use AgentAdapter for createAgentRecord, getAgentRecord, listAgentRecords.
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
  signRecord<T extends GitGovRecord>(record: T, actorId: string, role: string, notes: string): Promise<T>;
  rotateActorKey(actorId: string): Promise<{ oldActor: ActorRecord; newActor: ActorRecord }>;
  authenticate(sessionToken: string): Promise<void>;
  getActorPublicKey(keyId: string): Promise<string | null>;
}

/**
 * IdentityAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface IdentityAdapterDependencies {
  // Data Layer - Required stores for IdentityAdapter (ActorRecords only)
  stores: Required<Pick<RecordStores, 'actors'>>;

  // Key Management
  keyProvider: KeyProvider;

  // Session Management - Required for getCurrentActor and rotateActorKey
  sessionManager: ISessionManager;

  // Optional: Event Bus for event-driven integration (optional dependency)
  eventBus?: IEventStream;
}
