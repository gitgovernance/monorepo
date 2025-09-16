import type { TaskRecord } from "../types/task_record";
import { validateTaskRecordDetailed } from "../validation/task_validator";
import { DetailedValidationError } from "../validation/common";
import { generateTaskId } from "../utils/id_generator";

/**
 * Creates a new, fully-formed TaskRecord with validation.
 */
export async function createTaskRecord(
  payload: Partial<TaskRecord>
): Promise<TaskRecord> {
  // Generate timestamp for ID if not provided
  const timestamp = Math.floor(Date.now() / 1000);

  // Build task with defaults for optional fields
  const task: TaskRecord = {
    id: payload.id || generateTaskId(payload.title || '', timestamp),
    title: payload.title || '',
    status: payload.status || 'draft',
    priority: payload.priority || 'medium',
    description: payload.description || '',
    tags: payload.tags || [],
    cycleIds: payload.cycleIds,
    references: payload.references,
    notes: payload.notes,
    ...payload,
  } as TaskRecord;

  // Use validator to check complete schema with detailed errors
  const validation = validateTaskRecordDetailed(task);
  if (!validation.isValid) {
    throw new DetailedValidationError('TaskRecord', validation.errors);
  }

  return task;
}

