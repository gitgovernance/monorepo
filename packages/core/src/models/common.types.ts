import type { ActorRecord } from "../types/actor_record";
import type { AgentRecord } from "../types/agent_record";
import type { CycleRecord } from "../types/cycle_record";
import type { TaskRecord } from "../types/task_record";
import type { ExecutionRecord } from "../types/execution_record";
import type { ChangelogRecord } from "../types/changelog_record";
import type { FeedbackRecord } from "../types/feedback_record";
import type { EmbeddedMetadataRecord, Signature } from "../models";

/**
 * A custom record type for testing purposes.
 */
export type CustomRecord = {
  type: 'custom';
  data: unknown;
}

/**
 * Defines the possible 'type' values for any record in the system.
 */
export type GitGovRecordType =
  | "actor"
  | "agent"
  | "cycle"
  | "task"
  | "execution"
  | "changelog"
  | "feedback"
  | "custom";

/**
 * The canonical payload for any GitGovernance record.
 */
export type GitGovRecordPayload =
  | ActorRecord
  | AgentRecord
  | CycleRecord
  | TaskRecord
  | ExecutionRecord
  | ChangelogRecord
  | FeedbackRecord
  | CustomRecord;

/**
 * The canonical type for any record in GitGovernance, wrapping a payload with metadata.
 */
export type GitGovRecord = EmbeddedMetadataRecord<GitGovRecordPayload>;

// Payloads for creating new records
export type ActorPayload = Partial<ActorRecord>;
export type AgentPayload = Partial<AgentRecord>;
export type CyclePayload = Partial<CycleRecord>;
export type TaskPayload = Partial<TaskRecord>;
export type ExecutionPayload = Partial<ExecutionRecord>;
export type ChangelogPayload = Partial<ChangelogRecord>;
export type FeedbackPayload = Partial<FeedbackRecord>;

