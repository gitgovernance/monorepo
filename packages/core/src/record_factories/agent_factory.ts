import type { AgentRecord, GitGovAgentRecord } from "../record_types";
import { validateAgentRecordDetailed } from "../record_validations/agent_validator";
import { validateEmbeddedMetadataDetailed } from "../record_validations/embedded_metadata_validator";
import { DetailedValidationError } from "../record_validations/common";

/**
 * Creates a new, fully-formed AgentRecord with validation.
 *
 * The factory is generic to preserve the metadata type for compile-time safety.
 *
 * @param payload - Partial AgentRecord payload with optional typed metadata
 * @returns AgentRecord<TMetadata> - The validated AgentRecord with preserved metadata type
 */
export function createAgentRecord<TMetadata extends object = object>(
  payload: Partial<AgentRecord<TMetadata>>
): AgentRecord<TMetadata> {
  // Build agent with defaults for optional fields
  const agent = {
    id: payload.id || '',
    engine: payload.engine || { type: 'local' as const },
    status: payload.status || 'active',
    triggers: payload.triggers || [],
    knowledge_dependencies: payload.knowledge_dependencies || [],
    prompt_engine_requirements: payload.prompt_engine_requirements || {},
    metadata: payload.metadata,
    ...payload,
  } as AgentRecord<TMetadata>;

  // Use validator to check complete schema with detailed errors
  const validation = validateAgentRecordDetailed(agent);
  if (!validation.isValid) {
    throw new DetailedValidationError('AgentRecord', validation.errors);
  }

  return agent;
}

/**
 * Loads and validates an existing AgentRecord from untrusted data.
 * Used by RecordStore to validate records when reading from disk.
 * Validates both header (embedded metadata) and payload (AgentRecord).
 * 
 * @param data - Unknown data to validate as GitGovAgentRecord
 * @returns GitGovAgentRecord - The validated complete record
 * @throws DetailedValidationError if validation fails
 */
export function loadAgentRecord(data: unknown): GitGovAgentRecord {
  // First validate complete record structure (header + payload)
  const embeddedValidation = validateEmbeddedMetadataDetailed(data);
  if (!embeddedValidation.isValid) {
    throw new DetailedValidationError('GitGovRecord (AgentRecord)', embeddedValidation.errors);
  }
  
  // Then validate specific AgentRecord payload
  const record = data as GitGovAgentRecord;
  const payloadValidation = validateAgentRecordDetailed(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('AgentRecord payload', payloadValidation.errors);
  }
  
  return record;
}

