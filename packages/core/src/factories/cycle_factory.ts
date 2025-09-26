import type { CycleRecord } from "../types";
import { validateCycleRecordDetailed } from "../validation/cycle_validator";
import { DetailedValidationError } from "../validation/common";
import { generateCycleId } from "../utils/id_generator";

/**
 * Creates a new, fully-formed CycleRecord with validation.
 */
export async function createCycleRecord(
  payload: Partial<CycleRecord>
): Promise<CycleRecord> {
  // Generate timestamp for ID if not provided
  const timestamp = Math.floor(Date.now() / 1000);

  // Build cycle with defaults for optional fields
  const cycle: CycleRecord = {
    id: payload.id || generateCycleId(payload.title || '', timestamp),
    title: payload.title || '',
    status: payload.status || 'planning',
    taskIds: payload.taskIds || [], // EARS-21: Default empty array
    childCycleIds: payload.childCycleIds,
    tags: payload.tags,
    notes: payload.notes,
    ...payload,
  } as CycleRecord;

  // Use validator to check complete schema with detailed errors
  const validation = validateCycleRecordDetailed(cycle);
  if (!validation.isValid) {
    throw new DetailedValidationError('CycleRecord', validation.errors);
  }

  return cycle;
}

