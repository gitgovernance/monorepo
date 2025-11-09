import type { ExecutionRecord, GitGovExecutionRecord } from '../types';
import { generateExecutionId } from '../utils/id_generator';
import { validateExecutionRecordDetailed } from '../validation/execution_validator';
import { validateEmbeddedMetadataDetailed } from '../validation/embedded_metadata_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete ExecutionRecord with validation
 * 
 * @param payload - Partial ExecutionRecord payload
 * @returns ExecutionRecord - The validated ExecutionRecord
 */
export function createExecutionRecord(payload: Partial<ExecutionRecord>): ExecutionRecord {
  const timestamp = Math.floor(Date.now() / 1000);

  const execution: ExecutionRecord = {
    id: payload.id || generateExecutionId(payload.title || 'execution', timestamp),
    taskId: payload.taskId || '',
    result: payload.result || '',
    type: payload.type,
    title: payload.title,
    notes: payload.notes,
    references: payload.references,
    ...payload,
  } as ExecutionRecord;

  // Validate the complete execution record
  const validation = validateExecutionRecordDetailed(execution);
  if (!validation.isValid) {
    throw new DetailedValidationError('ExecutionRecord', validation.errors);
  }

  return execution;
}

/**
 * Loads and validates an existing ExecutionRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (ExecutionRecord).
 * 
 * @param data - Unknown data to validate as GitGovExecutionRecord
 * @returns GitGovExecutionRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadExecutionRecord(data: unknown): GitGovExecutionRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (ExecutionRecord)', embeddedValidation.errors);
  }
  
  // Then validate specific ExecutionRecord payload
  const record = data as GitGovExecutionRecord;
  const payloadValidation = validateExecutionRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('ExecutionRecord payload', payloadValidation.errors);
  }
  
  return record;
}

