import { createExecutionRecord } from '../../factories/execution_factory';
import type { RecordStores } from '../../record_store';
import { IdentityAdapter } from '../identity_adapter';
import type { ExecutionRecord, GitGovExecutionRecord } from '../../record_types';
import type { IEventStream, ExecutionCreatedEvent } from '../../event_bus';
import type { IExecutionAdapter, ExecutionAdapterDependencies } from './execution_adapter.types';

/**
 * ExecutionAdapter - The Chronicler of the System
 *
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between execution logging and data stores.
 */
export class ExecutionAdapter implements IExecutionAdapter {
  private stores: Required<Pick<RecordStores, 'executions'>> & Pick<RecordStores, 'tasks'>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;

  constructor(dependencies: ExecutionAdapterDependencies) {
    this.stores = dependencies.stores;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * [EARS-A1] Records a new execution event to create an immutable audit log.
   *
   * Description: Records a new execution event to create an immutable audit log.
   * Implementation: Builds record with factory, signs with actorId, persists and emits event.
   * Usage: Invoked by `gitgov exec add` to register work done by actors/agents.
   * Returns: Complete and signed ExecutionRecord.
   */
  async create(payload: Partial<ExecutionRecord>, actorId: string): Promise<ExecutionRecord> {
    // Optional: Validate taskId exists (graceful degradation)
    if (this.stores.tasks && payload.taskId) {
      const taskExists = await this.stores.tasks.get(payload.taskId);
      if (!taskExists) {
        throw new Error(`RecordNotFoundError: Task not found: ${payload.taskId}`);
      }
    }

    try {
      // 1. Build the record with factory (factory validates all required fields)
      const validatedPayload = createExecutionRecord(payload);

      // 2. Create unsigned record structure
      const unsignedRecord: GitGovExecutionRecord = {
        header: {
          version: '1.0',
          type: 'execution',
          payloadChecksum: 'will-be-calculated-by-signRecord',
          signatures: [{
            keyId: actorId,
            role: 'author',
            notes: 'Execution recorded',
            signature: 'placeholder',
            timestamp: Date.now()
          }]
        },
        payload: validatedPayload,
      };

      // 3. Sign the record
      const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author', 'Execution record created');

      // 4. Persist the record
      await this.stores.executions.put(validatedPayload.id, signedRecord);

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
      // Factory will throw DetailedValidationError for schema violations
      // Re-throw as-is to preserve error type and details
      throw error;
    }
  }

  /**
   * [EARS-B1] Gets a specific ExecutionRecord by its ID for query.
   *
   * Description: Gets a specific ExecutionRecord by its ID for query.
   * Implementation: Direct read from record store without modifications.
   * Usage: Invoked by `gitgov exec show` to display execution details.
   * Returns: ExecutionRecord found or null if it doesn't exist.
   */
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    const record = await this.stores.executions.get(executionId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-C1] Gets all ExecutionRecords associated with a specific Task.
   *
   * Description: Gets all ExecutionRecords associated with a specific Task.
   * Implementation: Reads all records and filters by matching taskId.
   * Usage: Invoked by `gitgov exec list` and MetricsAdapter for staleness calculations.
   * Returns: Array of ExecutionRecords filtered for the task.
   */
  async getExecutionsByTask(taskId: string): Promise<ExecutionRecord[]> {
    const ids = await this.stores.executions.list();
    const executions: ExecutionRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.executions.get(id);
      if (record && record.payload.taskId === taskId) {
        executions.push(record.payload);
      }
    }

    return executions;
  }

  /**
   * [EARS-D1] Gets all ExecutionRecords in the system for indexation.
   *
   * Description: Gets all ExecutionRecords in the system for complete indexation.
   * Implementation: Complete read from record store without filters.
   * Usage: Invoked by `gitgov exec list --all` and MetricsAdapter for general calculations.
   * Returns: Complete array of all ExecutionRecords.
   */
  async getAllExecutions(): Promise<ExecutionRecord[]> {
    const ids = await this.stores.executions.list();
    const executions: ExecutionRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.executions.get(id);
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
