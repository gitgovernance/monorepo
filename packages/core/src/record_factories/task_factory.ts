import type { TaskRecord, GitGovTaskRecord } from "../record_types";
import { validateTaskRecordDetailed } from "../record_validations/task_validator";
import { validateEmbeddedMetadataDetailed } from "../record_validations/embedded_metadata_validator";
import { DetailedValidationError } from "../record_validations/common";
import { generateTaskId } from "../utils/id_generator";

/**
 * Creates a new, fully-formed TaskRecord with validation.
 *
 * The factory is generic to preserve the metadata type for compile-time safety.
 *
 * @param payload - Partial TaskRecord payload with optional typed metadata
 * @returns TaskRecord<TMetadata> - The validated TaskRecord with preserved metadata type
 *
 * @example
 * interface EpicMeta { jira: string; storyPoints: number; }
 * const record = createTaskRecord<EpicMeta>({
 *   title: 'Implement OAuth',
 *   description: 'Full OAuth2 implementation',
 *   metadata: { jira: 'AUTH-42', storyPoints: 5 }
 * });
 * // record.metadata?.jira is typed as string
 */
export function createTaskRecord<TMetadata extends object = object>(
  payload: Partial<TaskRecord<TMetadata>>
): TaskRecord<TMetadata> {
  // Generate timestamp for ID if not provided
  const timestamp = Math.floor(Date.now() / 1000);

  // Build task with defaults for optional fields
  const task = {
    id: payload.id || generateTaskId(payload.title || '', timestamp),
    title: payload.title || '',
    status: payload.status || 'draft',
    priority: payload.priority || 'medium',
    description: payload.description || '',
    tags: payload.tags || [],
    cycleIds: payload.cycleIds,
    references: payload.references,
    notes: payload.notes,
    metadata: payload.metadata,
  } as TaskRecord<TMetadata>;

  // Use validator to check complete schema with detailed errors
  const validation = validateTaskRecordDetailed(task);
  if (!validation.isValid) {
    throw new DetailedValidationError('TaskRecord', validation.errors);
  }

  return task;
}

/**
 * Loads and validates an existing TaskRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (TaskRecord).
 * 
 * @param data - Unknown data to validate as GitGovTaskRecord
 * @returns GitGovTaskRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadTaskRecord(data: unknown): GitGovTaskRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (TaskRecord)', embeddedValidation.errors);
  }

  // Then validate specific TaskRecord payload
  const record = data as GitGovTaskRecord;
  const payloadValidation = validateTaskRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('TaskRecord payload', payloadValidation.errors);
  }

  return record;
}

