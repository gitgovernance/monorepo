import type { GitHubRecordStore } from '../../record_store/github';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
  GitGovActorRecord,
} from '../../record_types';

export type GitHubTestStores = {
  tasks: GitHubRecordStore<GitGovTaskRecord>;
  cycles: GitHubRecordStore<GitGovCycleRecord>;
  feedbacks: GitHubRecordStore<GitGovFeedbackRecord>;
  executions: GitHubRecordStore<GitGovExecutionRecord>;
  changelogs: GitHubRecordStore<GitGovChangelogRecord>;
  actors: GitHubRecordStore<GitGovActorRecord>;
};
