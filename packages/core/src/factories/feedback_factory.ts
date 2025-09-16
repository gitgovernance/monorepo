import type { FeedbackRecord } from '../types/feedback_record';
import { generateFeedbackId } from '../utils/id_generator';
import { validateFeedbackRecordDetailed } from '../validation/feedback_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete FeedbackRecord with validation
 * 
 * @param payload - Partial FeedbackRecord payload
 * @returns Promise<FeedbackRecord> - The validated FeedbackRecord
 */
export async function createFeedbackRecord(payload: Partial<FeedbackRecord>): Promise<FeedbackRecord> {
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

