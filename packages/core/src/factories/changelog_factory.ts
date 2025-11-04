import type { ChangelogRecord } from '../types';
import { validateChangelogRecordDetailed } from '../validation/changelog_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete ChangelogRecord with validation (Protocol v2)
 * 
 * @param payload - Partial ChangelogRecord payload
 * @returns Promise<ChangelogRecord> - The validated ChangelogRecord
 */
export async function createChangelogRecord(payload: Partial<ChangelogRecord>): Promise<ChangelogRecord> {
  const timestamp = Math.floor(Date.now() / 1000);

  // Build changelog with required fields
  const changelog: ChangelogRecord = {
    // Required fields
    id: payload.id || '',
    title: payload.title || '',
    description: payload.description || '',
    relatedTasks: (payload.relatedTasks || []) as [string, ...string[]],
    completedAt: payload.completedAt || timestamp,

    // Optional fields (only include if provided)
    ...(payload.relatedCycles && { relatedCycles: payload.relatedCycles }),
    ...(payload.relatedExecutions && { relatedExecutions: payload.relatedExecutions }),
    ...(payload.version && { version: payload.version }),
    ...(payload.tags && { tags: payload.tags }),
    ...(payload.commits && { commits: payload.commits }),
    ...(payload.files && { files: payload.files }),
    ...(payload.notes && { notes: payload.notes })
  };

  // Validate the complete changelog record
  const validation = validateChangelogRecordDetailed(changelog);
  if (!validation.isValid) {
    throw new DetailedValidationError('ChangelogRecord', validation.errors);
  }

  return changelog;
}

