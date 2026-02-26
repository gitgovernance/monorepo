import type { CycleRecord, GitGovCycleRecord } from "../record_types";
import { validateCycleRecordDetailed } from "../record_validations/cycle_validator";
import { validateEmbeddedMetadataDetailed } from "../record_validations/embedded_metadata_validator";
import { DetailedValidationError } from "../record_validations/common";
import { generateCycleId } from "../utils/id_generator";

/**
 * Creates a new, fully-formed CycleRecord with validation.
 *
 * The factory is generic to preserve the metadata type for compile-time safety.
 *
 * @param payload - Partial CycleRecord payload with optional typed metadata
 * @returns CycleRecord<TMetadata> - The validated CycleRecord with preserved metadata type
 *
 * @example
 * interface EpicCycleMeta { epic: boolean; phase: string; }
 * const record = createCycleRecord<EpicCycleMeta>({
 *   title: 'Sprint Q4 Performance',
 *   metadata: { epic: true, phase: 'active' }
 * });
 * // record.metadata?.epic is typed as boolean
 */
export function createCycleRecord<TMetadata extends object = object>(
  payload: Partial<CycleRecord<TMetadata>>
): CycleRecord<TMetadata> {
  // Generate timestamp for ID if not provided
  const timestamp = Math.floor(Date.now() / 1000);

  // Build cycle with defaults for optional fields
  const cycle = {
    id: payload.id || generateCycleId(payload.title || '', timestamp),
    title: payload.title || '',
    status: payload.status || 'planning',
    taskIds: payload.taskIds || [], // EARS-21: Default empty array
    childCycleIds: payload.childCycleIds,
    tags: payload.tags,
    notes: payload.notes,
    metadata: payload.metadata,
  } as CycleRecord<TMetadata>;

  // Use validator to check complete schema with detailed errors
  const validation = validateCycleRecordDetailed(cycle);
  if (!validation.isValid) {
    throw new DetailedValidationError('CycleRecord', validation.errors);
  }

  return cycle;
}

/**
 * Loads and validates an existing CycleRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (CycleRecord).
 * 
 * @param data - Unknown data to validate as GitGovCycleRecord
 * @returns GitGovCycleRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadCycleRecord(data: unknown): GitGovCycleRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (CycleRecord)', embeddedValidation.errors);
  }

  // Then validate specific CycleRecord payload
  const record = data as GitGovCycleRecord;
  const payloadValidation = validateCycleRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('CycleRecord payload', payloadValidation.errors);
  }

  return record;
}

