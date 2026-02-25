import type { ActorRecord } from "./";
import type { AgentRecord } from "./";
import type { CycleRecord } from "./";
import type { TaskRecord } from "./";
import type { ExecutionRecord } from "./";
import type { FeedbackRecord } from "./";
import type { EmbeddedMetadataRecord } from "./embedded.types";

/**
 * Defines the possible 'type' values for any record in the system.
 */
export type GitGovRecordType =
  | "actor"
  | "agent"
  | "cycle"
  | "task"
  | "execution"
  | "feedback";

/**
 * The canonical payload for any GitGovernance record.
 */
export type GitGovRecordPayload =
  | ActorRecord
  | AgentRecord
  | CycleRecord
  | TaskRecord
  | ExecutionRecord
  | FeedbackRecord;

/**
 * The canonical type for any record in GitGovernance, wrapping a payload with metadata.
 */
export type GitGovRecord = EmbeddedMetadataRecord<GitGovRecordPayload>;

/**
 * Specific GitGov record types with full metadata (header + payload).
 * These types provide clean, type-safe access to records with their signatures and checksums.
 * 
 * @example
 * const taskRecord: GitGovTaskRecord = await taskStore.read(taskId);
 * const authorId = taskRecord.header.signatures[0].keyId;
 */
export type GitGovTaskRecord = EmbeddedMetadataRecord<TaskRecord>;
export type GitGovCycleRecord = EmbeddedMetadataRecord<CycleRecord>;
export type GitGovFeedbackRecord = EmbeddedMetadataRecord<FeedbackRecord>;
export type GitGovExecutionRecord = EmbeddedMetadataRecord<ExecutionRecord>;
export type GitGovActorRecord = EmbeddedMetadataRecord<ActorRecord>;
export type GitGovAgentRecord = EmbeddedMetadataRecord<AgentRecord>;

// Payloads for creating new records
export type ActorPayload = Partial<ActorRecord>;
export type AgentPayload = Partial<AgentRecord>;
export type CyclePayload = Partial<CycleRecord>;
export type TaskPayload = Partial<TaskRecord>;
export type ExecutionPayload = Partial<ExecutionRecord>;
export type FeedbackPayload = Partial<FeedbackRecord>;

/**
 * Base class for all GitGovernance-specific errors.
 * Centralized here as it's used across multiple modules (schemas, validation, etc.)
 */
export class GitGovError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

