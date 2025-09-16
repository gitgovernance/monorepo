import type { AgentRecord } from "../types/agent_record";
import { validateAgentRecordDetailed } from "../validation/agent_validator";
import { DetailedValidationError } from "../validation/common";

/**
 * Creates a new, fully-formed AgentRecord with validation.
 */
export async function createAgentRecord(
  payload: Partial<AgentRecord>
): Promise<AgentRecord> {
  // Build agent with defaults for optional fields
  const agent: AgentRecord = {
    id: payload.id || '',
    guild: payload.guild || 'design' as const,
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
