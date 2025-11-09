import type { AgentRecord, GitGovAgentRecord } from "../types";
import { validateAgentRecordDetailed } from "../validation/agent_validator";
import { validateEmbeddedMetadataDetailed } from "../validation/embedded_metadata_validator";
import { DetailedValidationError } from "../validation/common";

/**
 * Creates a new, fully-formed AgentRecord with validation.
 */
export function createAgentRecord(
  payload: Partial<AgentRecord>
): AgentRecord {
  // Build agent with defaults for optional fields
  const agent: AgentRecord = {
    id: payload.id || '',
    engine: payload.engine || { type: 'local' as const },
    status: payload.status || 'active',
    triggers: payload.triggers || [],
    knowledge_dependencies: payload.knowledge_dependencies || [],
    prompt_engine_requirements: payload.prompt_engine_requirements || {},
    ...payload,
  } as AgentRecord;

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

