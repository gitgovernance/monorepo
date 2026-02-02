import type { FeedbackRecord, GitGovFeedbackRecord } from '../record_types';
import { generateFeedbackId } from '../utils/id_generator';
import { validateFeedbackRecordDetailed } from '../record_validations/feedback_validator';
import { validateEmbeddedMetadataDetailed } from '../record_validations/embedded_metadata_validator';
import { DetailedValidationError } from '../record_validations/common';

/**
 * Creates a complete FeedbackRecord with validation.
 *
 * The factory is generic to preserve the metadata type for compile-time safety.
 *
 * @param payload - Partial FeedbackRecord payload with optional typed metadata
 * @returns FeedbackRecord<TMetadata> - The validated FeedbackRecord with preserved metadata type
 */
export function createFeedbackRecord<TMetadata extends object = object>(
  payload: Partial<FeedbackRecord<TMetadata>>
): FeedbackRecord<TMetadata> {
  const timestamp = Math.floor(Date.now() / 1000);

  const feedback = {
    id: payload.id || generateFeedbackId(payload.content || 'feedback', timestamp),
    entityType: payload.entityType || 'task',
    entityId: payload.entityId || '',
    type: payload.type || 'question',
    status: payload.status || (payload.type === 'assignment' ? 'resolved' : 'open'),
    content: payload.content || '',
    assignee: payload.assignee,
    resolvesFeedbackId: payload.resolvesFeedbackId,
    metadata: payload.metadata,
  } as FeedbackRecord<TMetadata>;

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

