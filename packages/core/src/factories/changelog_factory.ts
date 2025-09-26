import type { ChangelogRecord } from '../types';
import { generateChangelogId } from '../utils/id_generator';
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

  // Generate ID if not provided
  let id = payload.id;
  if (!id && payload.entityType && payload.entityId) {
    id = generateChangelogId(payload.entityType, payload.entityId, timestamp);
  }

  const changelog: ChangelogRecord = {
    // Required fields
    id: id || '',
    entityType: payload.entityType || 'task',
    entityId: payload.entityId || '',
    changeType: payload.changeType || 'completion',
    title: payload.title || '',
    description: payload.description || '',
    timestamp: payload.timestamp || timestamp,
    trigger: payload.trigger || 'manual',
    triggeredBy: payload.triggeredBy || '',
    reason: payload.reason || '',
    riskLevel: payload.riskLevel || 'low',

    // Optional fields (preserve if provided)
    ...(payload.affectedSystems && { affectedSystems: payload.affectedSystems }),
    ...(payload.usersAffected !== undefined && { usersAffected: payload.usersAffected }),
    ...(payload.downtime !== undefined && { downtime: payload.downtime }),
    ...(payload.files && { files: payload.files }),
    ...(payload.commits && { commits: payload.commits }),
    ...(payload.rollbackInstructions && { rollbackInstructions: payload.rollbackInstructions }),
    ...(payload.references && { references: payload.references })
  };

  // Validate the complete changelog record
  const validation = validateChangelogRecordDetailed(changelog);
  if (!validation.isValid) {
    throw new DetailedValidationError('ChangelogRecord', validation.errors);
  }

  return changelog;
}

