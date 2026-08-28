import type { GitHubRecordStore } from '../../record_store/github';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from '../../record_types';

/**
 * Stores backed by `GitHubRecordStore` for the Block F tests.
 *
 * There is no `changelogs` store: `ChangelogRecord` was removed from the protocol and
 * `record_types` exports six record types (actor, agent, cycle, execution, feedback, task).
 * This file kept importing `GitGovChangelogRecord` for months because `src/integration` was
 * excluded from `tsc` in the same commit that created it (fd1a2bea), so nothing ever checked it.
 */
export type GitHubTestStores = {
  tasks: GitHubRecordStore<GitGovTaskRecord>;
  cycles: GitHubRecordStore<GitGovCycleRecord>;
  feedbacks: GitHubRecordStore<GitGovFeedbackRecord>;
  executions: GitHubRecordStore<GitGovExecutionRecord>;
  actors: GitHubRecordStore<GitGovActorRecord>;
  /** Required by RecordProjector (`RecordStores`). Its absence was masked by an
   *  `as unknown as` cast in `runMockGitHubProjector`, so the projector received a
   *  `stores` object without it and failed at `stores.agents.list()`. */
  agents: GitHubRecordStore<GitGovAgentRecord>;
};
