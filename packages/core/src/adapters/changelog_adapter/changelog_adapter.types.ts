import type { RecordStores } from '../../record_store';
import type { IdentityAdapter } from '../identity_adapter';
import type { ChangelogRecord } from '../../types';
import type { IEventStream } from '../../event_bus';

/**
 * Options for filtering and sorting changelog lists
 */
export type ChangelogListOptions = {
  tags?: string[]; // Filter by tags (changelogs with ANY of these tags)
  version?: string; // Filter by exact version
  limit?: number; // Limit number of results
  sortBy?: 'completedAt' | 'title'; // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort direction
}

/**
 * ChangelogAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type ChangelogAdapterDependencies = {
  stores: Required<Pick<RecordStores, 'changelogs' | 'tasks' | 'cycles'>>;
  identity: IdentityAdapter;
  eventBus: IEventStream;
}

/**
 * ChangelogAdapter Interface - Release Notes & Deliverables Historian
 */
export interface IChangelogAdapter {
  /**
   * Records a deliverable/release note aggregating multiple tasks.
   */
  create(payload: Partial<ChangelogRecord>, actorId: string): Promise<ChangelogRecord>;

  /**
   * Gets a specific ChangelogRecord by its ID.
   */
  getChangelog(changelogId: string): Promise<ChangelogRecord | null>;

  /**
   * Gets all ChangelogRecords for a specific task.
   */
  getChangelogsByTask(taskId: string): Promise<ChangelogRecord[]>;

  /**
   * Gets all ChangelogRecords in the system with optional filtering.
   */
  getAllChangelogs(options?: ChangelogListOptions): Promise<ChangelogRecord[]>;

  /**
   * Gets recent ChangelogRecords ordered by completedAt.
   */
  getRecentChangelogs(limit: number): Promise<ChangelogRecord[]>;
}
