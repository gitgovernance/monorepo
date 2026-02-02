import type { RecordStore } from './record_store';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
  GitGovExecutionRecord,
  GitGovFeedbackRecord,
  GitGovChangelogRecord,
} from '../record_types';

/**
 * RecordStores - Typed container for all stores
 *
 * Allows injecting multiple stores to modules that need them.
 * Keys correspond to directory names in .gitgov/
 *
 * All stores are OPTIONAL.
 * Reason: LintModule.lint(stores) can receive only relevant stores.
 * Example: To validate only tasks, pass { tasks: taskStore }.
 * The module iterates over Object.entries(stores) and skips undefined.
 */
export type RecordStores = {
  actors?: RecordStore<GitGovActorRecord>;
  agents?: RecordStore<GitGovAgentRecord>;
  tasks?: RecordStore<GitGovTaskRecord>;
  cycles?: RecordStore<GitGovCycleRecord>;
  executions?: RecordStore<GitGovExecutionRecord>;
  feedbacks?: RecordStore<GitGovFeedbackRecord>;
  changelogs?: RecordStore<GitGovChangelogRecord>;
}
