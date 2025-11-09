import type { FeedbackRecord, GitGovFeedbackRecord } from '../types';
import { generateFeedbackId } from '../utils/id_generator';
import { validateFeedbackRecordDetailed } from '../validation/feedback_validator';
import { validateEmbeddedMetadataDetailed } from '../validation/embedded_metadata_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete FeedbackRecord with validation
 * 
 * @param payload - Partial FeedbackRecord payload
 * @returns FeedbackRecord - The validated FeedbackRecord
 */
export function createFeedbackRecord(payload: Partial<FeedbackRecord>): FeedbackRecord {
  const timestamp = Math.floor(Date.now() / 1000);

  const feedback: FeedbackRecord = {
    id: payload.id || generateFeedbackId(payload.content || 'feedback', timestamp),
    entityType: payload.entityType || 'task',
    entityId: payload.entityId || '',
    type: payload.type || 'question',
    status: payload.status || (payload.type === 'assignment' ? 'resolved' : 'open'),
    content: payload.content || '',
    assignee: payload.assignee,
    resolvesFeedbackId: payload.resolvesFeedbackId,
    ...payload,
  } as FeedbackRecord;

  // Validate the complete feedback record
  const validation = validateFeedbackRecordDetailed(feedback);
  if (!validation.isValid) {
    throw new DetailedValidationError('FeedbackRecord', validation.errors);
  }

  return feedback;
}

/**
 * Loads and validates an existing FeedbackRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (FeedbackRecord).
 * 
 * @param data - Unknown data to validate as GitGovFeedbackRecord
 * @returns GitGovFeedbackRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadFeedbackRecord(data: unknown): GitGovFeedbackRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (FeedbackRecord)', embeddedValidation.errors);
  }
  
  // Then validate specific FeedbackRecord payload
  const record = data as GitGovFeedbackRecord;
  const payloadValidation = validateFeedbackRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('FeedbackRecord payload', payloadValidation.errors);
  }
  
  return record;
}

