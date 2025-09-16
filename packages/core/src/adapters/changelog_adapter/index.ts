import { createChangelogRecord } from '../../factories/changelog_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../modules/event_bus_module';
import type { ChangelogRecord } from '../../types/changelog_record';
import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { IEventStream, ChangelogCreatedEvent } from '../../modules/event_bus_module';
import type { GitGovRecord } from '../../models';

/**
 * ChangelogAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface ChangelogAdapterDependencies {
  changelogStore: RecordStore<ChangelogRecord>;
  identity: IdentityAdapter;
  eventBus: IEventStream; // For emitting events
  // Optional: Multi-entity validation (graceful degradation)
  taskStore?: RecordStore<TaskRecord>; // For validating task entities
  cycleStore?: RecordStore<CycleRecord>; // For validating cycle entities
  // Note: system and configuration entities don't require validation (direct IDs)
}

/**
 * ChangelogAdapter Interface - The Enterprise Historian
 */
export interface IChangelogAdapter {
  /**
   * Records a significant change in any system entity.
   */
  create(payload: Partial<ChangelogRecord>, actorId: string): Promise<ChangelogRecord>;

  /**
   * Gets a specific ChangelogRecord by its ID.
   */
  getChangelog(changelogId: string): Promise<ChangelogRecord | null>;

  /**
   * Gets all ChangelogRecords for a specific entity.
   */
  getChangelogsByEntity(entityId: string, entityType?: string): Promise<ChangelogRecord[]>;

  /**
   * Gets all ChangelogRecords in the system.
   */
  getAllChangelogs(): Promise<ChangelogRecord[]>;

  /**
   * Gets recent ChangelogRecords ordered by timestamp.
   */
  getRecentChangelogs(limit: number): Promise<ChangelogRecord[]>;
}

/**
 * ChangelogAdapter - The Enterprise Historian
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between enterprise changelog system and multi-entity data stores.
 */
export class ChangelogAdapter implements IChangelogAdapter {
  private changelogStore: RecordStore<ChangelogRecord>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;
  private taskStore: RecordStore<TaskRecord> | undefined;
  private cycleStore: RecordStore<CycleRecord> | undefined;

  constructor(dependencies: ChangelogAdapterDependencies) {
    this.changelogStore = dependencies.changelogStore;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
    this.taskStore = dependencies.taskStore; // Graceful degradation
    this.cycleStore = dependencies.cycleStore; // Graceful degradation
  }

  /**
   * [EARS-1] Records a significant change in any entity with complete context and conditional validation.
   * 
   * Description: Records a significant change in any entity of the ecosystem with complete context and conditional validation.
   * Implementation: Validates entity existence (optional), builds record with factory, validates conditional fields, signs with actorId, persists and emits event.
   * Usage: Invoked by `gitgov changelog add` to document changes in tasks, cycles, agents, systems, configurations.
   * Returns: Complete and signed ChangelogRecord with 19 fields.
   */
  async create(payload: Partial<ChangelogRecord>, actorId: string): Promise<ChangelogRecord> {
    // Input validation
    if (!payload.entityType) {
      throw new Error('DetailedValidationError: entityType is required');
    }

    if (!payload.entityId) {
      throw new Error('DetailedValidationError: entityId is required');
    }

    // EARS-4: Validate entityType
    if (!['task', 'cycle', 'agent', 'system', 'configuration'].includes(payload.entityType)) {
      throw new Error('DetailedValidationError: entityType must be task, cycle, agent, system, or configuration');
    }

    // EARS-5: Validate changeType
    if (payload.changeType && !['creation', 'completion', 'update', 'deletion', 'hotfix'].includes(payload.changeType)) {
      throw new Error('DetailedValidationError: changeType must be creation, completion, update, deletion, or hotfix');
    }

    // EARS-14: Validate title length
    if (payload.title && payload.title.length < 10) {
      throw new Error('DetailedValidationError: title must be at least 10 characters');
    }

    // EARS-15: Validate description length
    if (payload.description && payload.description.length < 20) {
      throw new Error('DetailedValidationError: description must be at least 20 characters');
    }

    // EARS-6: Validate rollbackInstructions for high risk
    if (payload.riskLevel === 'high' && !payload.rollbackInstructions) {
      throw new Error('DetailedValidationError: rollbackInstructions is required when riskLevel is high');
    }

    // EARS-7: Validate rollbackInstructions for critical risk
    if (payload.riskLevel === 'critical' && !payload.rollbackInstructions) {
      throw new Error('DetailedValidationError: rollbackInstructions is required when riskLevel is critical');
    }

    // EARS-8: Validate references.tasks for completion
    if (payload.changeType === 'completion' && (!payload.references?.tasks || payload.references.tasks.length === 0)) {
      throw new Error('DetailedValidationError: references.tasks is required when changeType is completion');
    }

    // Optional: Validate entityId exists (graceful degradation) - EARS-3
    if (payload.entityType === 'task' && this.taskStore) {
      const taskExists = await this.taskStore.read(payload.entityId);
      if (!taskExists) {
        throw new Error(`RecordNotFoundError: Task not found: ${payload.entityId}`);
      }
    }

    if (payload.entityType === 'cycle' && this.cycleStore) {
      const cycleExists = await this.cycleStore.read(payload.entityId);
      if (!cycleExists) {
        throw new Error(`RecordNotFoundError: Cycle not found: ${payload.entityId}`);
      }
    }

    try {
      // 1. Build the record with factory (handles all conditional validation)
      const validatedPayload = await createChangelogRecord(payload);

      // 2. Create unsigned record structure
      const unsignedRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: {
          version: '1.0',
          type: 'changelog',
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
      await this.changelogStore.write(signedRecord as GitGovRecord & { payload: ChangelogRecord });

      // 5. Emit event - responsibility ends here
      this.eventBus.publish({
        type: 'changelog.created',
        timestamp: Date.now(),
        source: 'changelog_adapter',
        payload: {
          changelogId: validatedPayload.id,
          entityId: validatedPayload.entityId,
          entityType: validatedPayload.entityType,
          changeType: validatedPayload.changeType,
          actorId,
          riskLevel: validatedPayload.riskLevel
        },
      } as ChangelogCreatedEvent);

      return validatedPayload;
    } catch (error) {
      if (error instanceof Error && error.message.includes('DetailedValidationError')) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * [EARS-9] Gets a specific ChangelogRecord by its ID for historical query.
   * 
   * Description: Gets a specific ChangelogRecord by its ID for historical query.
   * Implementation: Direct read from record store without modifications.
   * Usage: Invoked by `gitgov changelog show` to display change details.
   * Returns: ChangelogRecord found or null if it doesn't exist.
   */
  async getChangelog(changelogId: string): Promise<ChangelogRecord | null> {
    const record = await this.changelogStore.read(changelogId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-11] Gets all ChangelogRecords associated with a specific entity.
   * 
   * Description: Gets all ChangelogRecords associated with a specific entity with optional type filtering.
   * Implementation: Reads all records and filters by matching entityId, optionally by entityType.
   * Usage: Invoked by `gitgov changelog list` to display history for any system entity.
   * Returns: Array of ChangelogRecords filtered for the entity.
   */
  async getChangelogsByEntity(entityId: string, entityType?: string): Promise<ChangelogRecord[]> {
    const ids = await this.changelogStore.list();
    const changelogs: ChangelogRecord[] = [];

    for (const id of ids) {
      const record = await this.changelogStore.read(id);
      if (record && record.payload.entityId === entityId) {
        // Optional entityType filter
        if (!entityType || record.payload.entityType === entityType) {
          changelogs.push(record.payload);
        }
      }
    }

    return changelogs;
  }

  /**
   * [EARS-12] Gets all ChangelogRecords in the system for complete indexation.
   * 
   * Description: Gets all ChangelogRecords in the system for complete indexation.
   * Implementation: Complete read from record store without filters.
   * Usage: Invoked by `gitgov changelog list --all` and MetricsAdapter for activity analysis.
   * Returns: Complete array of all ChangelogRecords.
   */
  async getAllChangelogs(): Promise<ChangelogRecord[]> {
    const ids = await this.changelogStore.list();
    const changelogs: ChangelogRecord[] = [];

    for (const id of ids) {
      const record = await this.changelogStore.read(id);
      if (record) {
        changelogs.push(record.payload);
      }
    }

    return changelogs;
  }

  /**
   * [EARS-13] Gets recent ChangelogRecords ordered by timestamp for dashboard and monitoring.
   * 
   * Description: Gets recent ChangelogRecords ordered by timestamp for dashboard and monitoring.
   * Implementation: Reads all records, sorts by timestamp descending and applies limit.
   * Usage: Invoked by `gitgov changelog list --recent` and dashboard for activity monitoring.
   * Returns: Array of ChangelogRecords limited and ordered by timestamp.
   */
  async getRecentChangelogs(limit: number): Promise<ChangelogRecord[]> {
    const allChangelogs = await this.getAllChangelogs();

    // Sort by timestamp descending (most recent first)
    const sortedChangelogs = allChangelogs.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    return sortedChangelogs.slice(0, limit);
  }
}
