import { createChangelogRecord } from '../../factories/changelog_factory';
import type { RecordStores } from '../../record_store';
import { IdentityAdapter } from '../identity_adapter';
import { generateChangelogId } from '../../utils/id_generator';
import type { ChangelogRecord } from '../../types';
import type { IEventStream, ChangelogCreatedEvent } from '../../event_bus';
import type { GitGovRecord } from '../../types';
import type {
  IChangelogAdapter,
  ChangelogAdapterDependencies,
  ChangelogListOptions,
} from './changelog_adapter.types';

/**
 * ChangelogAdapter - Release Notes & Deliverables Historian
 *
 * Protocol v2: Aggregates N tasks into 1 release note/deliverable.
 * Focus: Executive communication of delivered value.
 */
export class ChangelogAdapter implements IChangelogAdapter {
  private stores: Required<Pick<RecordStores, 'changelogs' | 'tasks' | 'cycles'>>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;

  constructor(dependencies: ChangelogAdapterDependencies) {
    this.stores = dependencies.stores;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * [EARS-A1] Records a deliverable/release note.
   *
   * Description: Aggregates multiple tasks into a single deliverable/release note.
   * Implementation: Validates required fields, builds record with factory, signs, persists and emits event.
   * Usage: Invoked by `gitgov changelog add` to document deliverables.
   * Returns: Complete and signed ChangelogRecord.
   */
  async create(payload: Partial<ChangelogRecord>, actorId: string): Promise<ChangelogRecord> {
    // Input validation
    if (!payload.title || payload.title.length < 10) {
      throw new Error('DetailedValidationError: title is required and must be at least 10 characters');
    }

    if (!payload.description || payload.description.length < 20) {
      throw new Error('DetailedValidationError: description is required and must be at least 20 characters');
    }

    if (!payload.relatedTasks || payload.relatedTasks.length === 0) {
      throw new Error('DetailedValidationError: relatedTasks is required and must contain at least one task ID');
    }

    // [EARS-A5] Validate that related tasks exist
    if (payload.relatedTasks) {
      for (const taskId of payload.relatedTasks) {
        const taskExists = await this.stores.tasks.get(taskId);
        if (!taskExists) {
          throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
        }
      }
    }

    // Validate that related cycles exist
    if (payload.relatedCycles) {
      for (const cycleId of payload.relatedCycles) {
        const cycleExists = await this.stores.cycles.get(cycleId);
        if (!cycleExists) {
          throw new Error(`RecordNotFoundError: Cycle not found: ${cycleId}`);
        }
      }
    }

    try {
      // 1. Generate ID if not provided (EARS-A6)
      const timestamp = payload.completedAt || Math.floor(Date.now() / 1000);
      if (!payload.id) {
        payload.id = generateChangelogId(payload.title!, timestamp);
      }

      // 2. Build the record with factory
      const validatedPayload = createChangelogRecord(payload);

      // 3. Create unsigned record structure
      const unsignedRecord: GitGovRecord & { payload: ChangelogRecord } = {
        header: {
          version: '1.0',
          type: 'changelog',
          payloadChecksum: 'will-be-calculated-by-signRecord',
          signatures: [{
            keyId: actorId,
            role: 'author',
            notes: 'Changelog entry created',
            signature: 'placeholder',
            timestamp: Date.now()
          }]
        },
        payload: validatedPayload,
      };

      // 3. Sign the record
      const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author', 'Changelog record created');

      // 4. Persist the record
      await this.stores.changelogs.put(validatedPayload.id, signedRecord as GitGovRecord & { payload: ChangelogRecord });

      // 5. Emit event
      this.eventBus.publish({
        type: 'changelog.created',
        timestamp: Date.now(),
        source: 'changelog_adapter',
        payload: {
          changelogId: validatedPayload.id,
          relatedTasks: validatedPayload.relatedTasks,
          title: validatedPayload.title,
          version: validatedPayload.version
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
   * [EARS-B1] Gets a specific ChangelogRecord by its ID.
   */
  async getChangelog(changelogId: string): Promise<ChangelogRecord | null> {
    const record = await this.stores.changelogs.get(changelogId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-C1] Gets all ChangelogRecords that include a specific task.
   */
  async getChangelogsByTask(taskId: string): Promise<ChangelogRecord[]> {
    const ids = await this.stores.changelogs.list();
    const changelogs: ChangelogRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.changelogs.get(id);
      if (record && record.payload.relatedTasks.includes(taskId)) {
        changelogs.push(record.payload);
      }
    }

    return changelogs;
  }

  /**
   * [EARS-D1] Gets all ChangelogRecords with optional filtering and sorting.
   */
  async getAllChangelogs(options?: ChangelogListOptions): Promise<ChangelogRecord[]> {
    const ids = await this.stores.changelogs.list();
    let changelogs: ChangelogRecord[] = [];

    // Read all changelogs
    for (const id of ids) {
      const record = await this.stores.changelogs.get(id);
      if (record) {
        changelogs.push(record.payload);
      }
    }

    // [EARS-D2] Filter by tags if provided
    if (options?.tags && options.tags.length > 0) {
      changelogs = changelogs.filter(changelog => {
        if (!changelog.tags) return false;
        // Return true if changelog has ANY of the requested tags
        return options.tags!.some(tag => changelog.tags!.includes(tag));
      });
    }

    // Filter by version if provided
    if (options?.version) {
      changelogs = changelogs.filter(changelog => changelog.version === options.version);
    }

    // [EARS-D3] Sort by specified field (default: completedAt desc)
    const sortBy = options?.sortBy || 'completedAt';
    const sortOrder = options?.sortOrder || 'desc';

    changelogs.sort((a, b) => {
      let compareValue = 0;

      if (sortBy === 'completedAt') {
        compareValue = a.completedAt - b.completedAt;
      } else if (sortBy === 'title') {
        compareValue = a.title.localeCompare(b.title);
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    // [EARS-D4] Apply limit if provided
    if (options?.limit && options.limit > 0) {
      changelogs = changelogs.slice(0, options.limit);
    }

    return changelogs;
  }

  /**
   * [EARS-E1] Gets recent ChangelogRecords ordered by completedAt.
   */
  async getRecentChangelogs(limit: number): Promise<ChangelogRecord[]> {
    const allChangelogs = await this.getAllChangelogs();

    // Sort by completedAt descending (most recent first)
    const sortedChangelogs = allChangelogs.sort((a, b) => b.completedAt - a.completedAt);

    // Apply limit
    return sortedChangelogs.slice(0, limit);
  }

  /**
   * Legacy method for backwards compatibility - maps to getChangelogsByTask
   * @deprecated Use getChangelogsByTask instead
   */
  async getChangelogsByEntity(entityId: string, _entityType?: string): Promise<ChangelogRecord[]> {
    return this.getChangelogsByTask(entityId);
  }
}
