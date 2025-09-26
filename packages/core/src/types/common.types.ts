import type { ActorRecord } from "../types";
import type { AgentRecord } from "../types";
import type { CycleRecord } from "../types";
import type { TaskRecord } from "../types";
import type { ExecutionRecord } from "../types";
import type { ChangelogRecord } from "../types";
import type { FeedbackRecord } from "../types";
import type { EmbeddedMetadataRecord } from "./embedded.types";

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

