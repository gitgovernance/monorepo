import type { RecordStores } from '../../record_store';
import type { IIdentityAdapter } from '../identity_adapter';
import type { AgentRecord, AgentPayload } from '../../types';
import type { IEventStream } from '../../event_bus';
import type { KeyProvider } from '../../key_provider/key_provider';

/**
 * AgentAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface AgentAdapterDependencies {
  // Data Layer - Required store for AgentAdapter
  stores: Required<Pick<RecordStores, 'agents'>>;

  // Identity Layer - For ActorRecord validation and public key
  identity: IIdentityAdapter;

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
  createAgentRecord(payload: Partial<AgentPayload>): Promise<AgentRecord>;

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
}
