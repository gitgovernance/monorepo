import type { ActorRecord } from "../types/actor_record";
import { validateActorRecordDetailed } from "../validation/actor_validator";
import { generateActorId } from "../utils/id_generator";
import { DetailedValidationError } from "../validation/common";

/**
 * Creates a new, fully-formed ActorRecord with validation.
 */
export async function createActorRecord(
  payload: Partial<ActorRecord>
): Promise<ActorRecord> {
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
