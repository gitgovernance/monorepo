import { createExecutionRecord } from '../../factories/execution_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../modules/event_bus_module';
import type { ExecutionRecord } from '../../types/execution_record';
import type { TaskRecord } from '../../types/task_record';
import type { IEventStream, ExecutionCreatedEvent } from '../../modules/event_bus_module';
import type { GitGovRecord } from '../../models';

/**
 * ExecutionAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface ExecutionAdapterDependencies {
  // Data Layer (Protocols)
  executionStore: RecordStore<ExecutionRecord>;

  // Infrastructure Layer
  identity: IdentityAdapter;
  eventBus: IEventStream; // For emitting events

  // Optional: Task validation (graceful degradation)
  taskStore?: RecordStore<TaskRecord>;
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

/**
 * ExecutionAdapter - The Chronicler of the System
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between execution logging and data stores.
 */
export class ExecutionAdapter implements IExecutionAdapter {
  private executionStore: RecordStore<ExecutionRecord>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;
  private taskStore: RecordStore<TaskRecord> | undefined;

  constructor(dependencies: ExecutionAdapterDependencies) {
    this.executionStore = dependencies.executionStore;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
    this.taskStore = dependencies.taskStore; // Graceful degradation
  }

  /**
   * [EARS-1] Records a new execution event to create an immutable audit log.
   * 
   * Description: Records a new execution event to create an immutable audit log.
   * Implementation: Builds record with factory, signs with actorId, persists and emits event.
   * Usage: Invoked by `gitgov exec add` to register work done by actors/agents.
   * Returns: Complete and signed ExecutionRecord.
   */
  async create(payload: Partial<ExecutionRecord>, actorId: string): Promise<ExecutionRecord> {
    // Input validation
    if (!payload.taskId) {
      throw new Error('DetailedValidationError: taskId is required');
    }

    if (!payload.result) {
      throw new Error('DetailedValidationError: result is required');
    }

    if (payload.result && payload.result.length < 10) {
      throw new Error('DetailedValidationError: result must be at least 10 characters');
    }

    // Optional: Validate taskId exists (graceful degradation)
    if (this.taskStore) {
      const taskExists = await this.taskStore.read(payload.taskId);
      if (!taskExists) {
        throw new Error(`RecordNotFoundError: Task not found: ${payload.taskId}`);
      }
    }

    try {
      // 1. Build the record with factory
      const validatedPayload = await createExecutionRecord(payload);

      // 2. Create unsigned record structure
      const unsignedRecord: GitGovRecord & { payload: ExecutionRecord } = {
        header: {
          version: '1.0',
          type: 'execution',
          payloadChecksum: 'will-be-calculated-by-signRecord',
          signatures: [{
            keyId: actorId,
            role: 'author',
            signature: 'placeholder',
            timestamp: Date.now(),
            timestamp_iso: new Date().toISOString()
          }]
        },
        payload: validatedPayload,
      };

      // 3. Sign the record
      const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author');

      // 4. Persist the record
      await this.executionStore.write(signedRecord as GitGovRecord & { payload: ExecutionRecord });

      // 5. Emit event - responsibility ends here
      this.eventBus.publish({
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: {
          executionId: validatedPayload.id,
          taskId: validatedPayload.taskId,
          actorId,
          isFirstExecution: await this.isFirstExecutionForTask(validatedPayload.taskId)
        },
      } as ExecutionCreatedEvent);

      return validatedPayload;
    } catch (error) {
      if (error instanceof Error && error.message.includes('DetailedValidationError')) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * [EARS-4] Gets a specific ExecutionRecord by its ID for query.
   * 
   * Description: Gets a specific ExecutionRecord by its ID for query.
   * Implementation: Direct read from record store without modifications.
   * Usage: Invoked by `gitgov exec show` to display execution details.
   * Returns: ExecutionRecord found or null if it doesn't exist.
   */
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    const record = await this.executionStore.read(executionId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-6] Gets all ExecutionRecords associated with a specific Task.
   * 
   * Description: Gets all ExecutionRecords associated with a specific Task.
   * Implementation: Reads all records and filters by matching taskId.
   * Usage: Invoked by `gitgov exec list` and MetricsAdapter for staleness calculations.
   * Returns: Array of ExecutionRecords filtered for the task.
   */
  async getExecutionsByTask(taskId: string): Promise<ExecutionRecord[]> {
    const ids = await this.executionStore.list();
    const executions: ExecutionRecord[] = [];

    for (const id of ids) {
      const record = await this.executionStore.read(id);
      if (record && record.payload.taskId === taskId) {
        executions.push(record.payload);
      }
    }

    return executions;
  }

  /**
   * [EARS-7] Gets all ExecutionRecords in the system for indexation.
   * 
   * Description: Gets all ExecutionRecords in the system for complete indexation.
   * Implementation: Complete read from record store without filters.
   * Usage: Invoked by `gitgov exec list --all` and MetricsAdapter for general calculations.
   * Returns: Complete array of all ExecutionRecords.
   */
  async getAllExecutions(): Promise<ExecutionRecord[]> {
    const ids = await this.executionStore.list();
    const executions: ExecutionRecord[] = [];

    for (const id of ids) {
      const record = await this.executionStore.read(id);
      if (record) {
        executions.push(record.payload);
      }
    }

    return executions;
  }

  /**
   * Helper method to determine if this is the first execution for a task
   * Used for BacklogAdapter.handleExecutionCreated logic
   */
  private async isFirstExecutionForTask(taskId: string): Promise<boolean> {
    const executions = await this.getExecutionsByTask(taskId);
    return executions.length === 1; // Including the one we just created
  }
}
