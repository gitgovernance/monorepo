/**
 * Lightweight Type Guards for GitGov Record Payloads
 *
 * These type guards are for narrowing already-validated GitGovRecordPayload unions.
 * They check structural properties, NOT schema validation.
 *
 * For schema validation (with AJV), use validators in validation/*.ts:
 * - isTaskRecord(unknown) in task_validator.ts
 * - isCycleRecord(unknown) in cycle_validator.ts
 * etc.
 *
 * @module types/type_guards
 */

import type {
  GitGovRecordPayload,
  TaskRecord,
  CycleRecord,
  ExecutionRecord,
  ActorRecord,
  AgentRecord,
  ChangelogRecord,
  FeedbackRecord
} from './index';

/**
 * Type guard: checks if payload is a TaskRecord.
 * Verifies presence of task-specific fields: title, status, priority, description.
 */
export function isTaskPayload(payload: GitGovRecordPayload): payload is TaskRecord {
  return 'title' in payload && 'status' in payload && 'priority' in payload && 'description' in payload;
}

/**
 * Type guard: checks if payload is a CycleRecord.
 * Verifies presence of cycle-specific fields: title, status (but NOT priority).
 */
export function isCyclePayload(payload: GitGovRecordPayload): payload is CycleRecord {
  return 'title' in payload && 'status' in payload && !('priority' in payload);
}

/**
 * Type guard: checks if payload is an ExecutionRecord.
 * Verifies presence of execution-specific fields: taskId, title, type, result.
 */
export function isExecutionPayload(payload: GitGovRecordPayload): payload is ExecutionRecord {
  return 'taskId' in payload && 'title' in payload && 'type' in payload && 'result' in payload;
}

/**
 * Type guard: checks if payload is an ActorRecord.
 * Verifies presence of actor-specific fields: displayName, publicKey, roles, type.
 */
export function isActorPayload(payload: GitGovRecordPayload): payload is ActorRecord {
  return 'displayName' in payload && 'publicKey' in payload && 'roles' in payload && 'type' in payload;
}

/**
 * Type guard: checks if payload is an AgentRecord (agent manifest).
 * Verifies presence of agent-specific field: engine.
 * Note: AgentRecord is a manifest, different from ActorRecord with type='agent'.
 */
export function isAgentPayload(payload: GitGovRecordPayload): payload is AgentRecord {
  return 'engine' in payload;
}

/**
 * Type guard: checks if payload is a ChangelogRecord.
 * Verifies presence of changelog-specific fields: title, description, relatedTasks, completedAt.
 */
export function isChangelogPayload(payload: GitGovRecordPayload): payload is ChangelogRecord {
  return 'title' in payload && 'description' in payload && 'relatedTasks' in payload && 'completedAt' in payload;
}

/**
 * Type guard: checks if payload is a FeedbackRecord.
 * Verifies presence of feedback-specific fields: entityType, entityId, type, status, content.
 */
export function isFeedbackPayload(payload: GitGovRecordPayload): payload is FeedbackRecord {
  return 'entityType' in payload && 'entityId' in payload && 'type' in payload && 'status' in payload && 'content' in payload;
}
