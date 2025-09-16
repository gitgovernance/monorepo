import type { ExecutionRecord } from '../types/execution_record';
import { generateExecutionId } from '../utils/id_generator';
import { validateExecutionRecordDetailed } from '../validation/execution_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete ExecutionRecord with validation
 * 
 * @param payload - Partial ExecutionRecord payload
 * @returns Promise<ExecutionRecord> - The validated ExecutionRecord
 */
export async function createExecutionRecord(payload: Partial<ExecutionRecord>): Promise<ExecutionRecord> {
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

