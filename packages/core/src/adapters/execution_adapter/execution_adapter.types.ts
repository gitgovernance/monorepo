import type { RecordStores } from '../../record_store';
import type { RecordSigner } from '../../record_signer';
import type { ExecutionRecord } from '../../record_types';
import type { IEventStream } from '../../event_bus';

/**
 * ExecutionAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type ExecutionAdapterDependencies = {
  // Data Layer - Required stores for ExecutionAdapter
  stores: Required<Pick<RecordStores, 'tasks' | 'executions'>>;

  // Infrastructure Layer
  signer: RecordSigner;
  eventBus: IEventStream; // For emitting events
}

/**
 * ExecutionAdapter Interface - The Chronicler of the System
 */
export interface IExecutionAdapter {
  /**
   * Records a new execution event.
   */
  create(payload: Partial<ExecutionRecord>, actorId: string): Promise<ExecutionRecord>;

  /**
   * Gets a specific ExecutionRecord by its ID.
   */
  getExecution(executionId: string): Promise<ExecutionRecord | null>;

  /**
   * Gets all ExecutionRecords for a specific Task.
   */
  getExecutionsByTask(taskId: string): Promise<ExecutionRecord[]>;

  /**
   * Gets all ExecutionRecords in the system.
   */
  getAllExecutions(): Promise<ExecutionRecord[]>;
}
