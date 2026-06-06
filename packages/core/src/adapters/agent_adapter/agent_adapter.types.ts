import type { RecordStores } from '../../record_store';
import type { IIdentityModule } from '../../identity/identity_module.types';
import type { AgentRecord, AgentPayload, GitGovAgentRecord } from '../../record_types';
import type { IEventStream } from '../../event_bus';
import type { KeyProvider } from '../../key_provider/key_provider';

/**
 * AgentAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface AgentAdapterDependencies {
  // Data Layer - Required store for AgentAdapter
  stores: Required<Pick<RecordStores, 'agents'>>;

  // Identity Layer - For ActorRecord validation and public key
  identity: IIdentityModule;

  // Key Management - For signing AgentRecords
  keyProvider: KeyProvider;

  // Optional: Event Bus for event-driven integration
  eventBus?: IEventStream;
}

/**
 * AgentAdapter Interface - The Agent Manifest Manager
 *
 * Responsible for CRUD operations on AgentRecords.
 * AgentRecord = "What the agent does" (engine, triggers, knowledge_dependencies)
 * ActorRecord = "Who the agent is" (identity, keys, roles)
 *
 * Invariant: Every AgentRecord.id must have a corresponding ActorRecord.id of type 'agent'
 */
export interface IAgentAdapter {
  /**
   * Creates a new AgentRecord.
   * Requires corresponding ActorRecord of type 'agent' to exist.
   *
   * @param payload - Partial AgentPayload (id and engine required)
   * @returns Promise<AgentRecord> - The created AgentRecord
   * @throws Error if id or engine missing
   * @throws Error if corresponding ActorRecord not found
   * @throws Error if ActorRecord type is not 'agent'
   */
  createAgentRecord(payload: Partial<AgentPayload>, options?: { defer?: boolean }): Promise<AgentRecord>;

  /**
   * Gets an AgentRecord by ID.
   *
   * @param agentId - The agent ID (e.g., 'agent:scribe')
   * @returns Promise<AgentRecord | null> - The AgentRecord or null if not found
   */
  getAgentRecord(agentId: string): Promise<AgentRecord | null>;

  /**
   * Lists all AgentRecords.
   *
   * @returns Promise<AgentRecord[]> - Array of all AgentRecords
   */
  listAgentRecords(): Promise<AgentRecord[]>;

  /**
   * Updates an existing AgentRecord.
   * Cannot modify the id field.
   *
   * @param agentId - The agent ID to update
   * @param updates - Fields to update (engine, triggers, knowledge_dependencies, etc.)
   * @returns Promise<AgentRecord> - The updated AgentRecord
   * @throws Error if AgentRecord not found
   */
  updateAgentRecord(agentId: string, updates: Partial<AgentPayload>): Promise<AgentRecord>;

  /**
   * Archives an AgentRecord (sets status to 'archived').
   * Archived agents cannot be invoked.
   *
   * @param agentId - The agent ID to archive
   * @returns Promise<AgentRecord> - The archived AgentRecord
   * @throws Error if AgentRecord not found
   */
  archiveAgentRecord(agentId: string): Promise<AgentRecord>;

  /**
   * [EARS-G1] Builds and signs a complete AgentRecord WITHOUT persisting it and
   * WITHOUT a committed-read. Resolves the signing public key from the KeyProvider
   * (persisted in the DB at actor creation), not from the record store — so it works
   * during atomic init where the corresponding ActorRecord is staged but not yet
   * committed. The caller persists the returned record via `initializer.addAgent`.
   *
   * @param payload - Partial AgentPayload (id and engine required)
   * @returns Promise<GitGovAgentRecord> - The signed, unpersisted record
   * @throws Error if id or engine missing, or private key unavailable in the KeyProvider
   */
  buildSignedAgentRecord(payload: Partial<AgentPayload>): Promise<GitGovAgentRecord>;
}
