import type { ChangelogRecord, GitGovChangelogRecord } from '../types';
import { validateChangelogRecordDetailed } from '../validation/changelog_validator';
import { validateEmbeddedMetadataDetailed } from '../validation/embedded_metadata_validator';
import { DetailedValidationError } from '../validation/common';

/**
 * Creates a complete ChangelogRecord with validation (Protocol v2)
 * 
 * @param payload - Partial ChangelogRecord payload
 * @returns ChangelogRecord - The validated ChangelogRecord
 */
export function createChangelogRecord(payload: Partial<ChangelogRecord>): ChangelogRecord {
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

/**
 * Loads and validates an existing ChangelogRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (ChangelogRecord).
 * 
 * @param data - Unknown data to validate as GitGovChangelogRecord
 * @returns GitGovChangelogRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadChangelogRecord(data: unknown): GitGovChangelogRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (ChangelogRecord)', embeddedValidation.errors);
  }

  // Then validate specific ChangelogRecord payload
  const record = data as GitGovChangelogRecord;
  const payloadValidation = validateChangelogRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('ChangelogRecord payload', payloadValidation.errors);
  }

  return record;
}

