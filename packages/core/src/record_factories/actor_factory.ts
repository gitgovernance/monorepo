import type { ActorRecord, GitGovActorRecord } from "../record_types";
import { validateActorRecordDetailed } from "../record_validations/actor_validator";
import { validateEmbeddedMetadataDetailed } from "../record_validations/embedded_metadata_validator";
import { generateActorId } from "../utils/id_generator";
import { DetailedValidationError } from "../record_validations/common";

/**
 * Creates a new, fully-formed ActorRecord with validation.
 */
export function createActorRecord(
  payload: Partial<ActorRecord>
): ActorRecord {
  // Build actor with defaults for optional fields
  const actor: ActorRecord = {
    id: payload.id || generateActorId(payload.type || 'human', payload.displayName || ''),
    type: payload.type || 'human' as const,
    displayName: payload.displayName || '',
    publicKey: payload.publicKey || '',
    roles: payload.roles || ['author'] as [string, ...string[]],
    status: payload.status || 'active',
    ...payload,
  } as ActorRecord;

  // Use validator to check complete schema with detailed errors
  const validation = validateActorRecordDetailed(actor);
  if (!validation.isValid) {
    throw new DetailedValidationError('ActorRecord', validation.errors);
  }

  return actor;
}

/**
 * Loads and validates an existing ActorRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (ActorRecord).
 * 
 * @param data - Unknown data to validate as GitGovActorRecord
 * @returns GitGovActorRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadActorRecord(data: unknown): GitGovActorRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (ActorRecord)', embeddedValidation.errors);
  }
  
  // Then validate specific ActorRecord payload
  const record = data as GitGovActorRecord;
  const payloadValidation = validateActorRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('ActorRecord payload', payloadValidation.errors);
  }
  
  return record;
}

