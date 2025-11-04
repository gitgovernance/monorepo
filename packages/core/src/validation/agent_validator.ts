import type { ValidateFunction, ErrorObject } from "ajv";
import type { AgentRecord } from "../types";
import type { GitGovRecord } from "../types";
import { DetailedValidationError, SchemaValidationError } from "./common";
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from "../schemas/schema_cache";
import { Schemas } from '../schemas';
import type { ActorRecord } from "../types";

// --- Schema Validation ---
export function validateAgentRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

export function isAgentRecord(data: unknown): data is AgentRecord {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);
  return validateSchema(data) as boolean;
}

/**
 * Validates an AgentRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateAgentRecordDetailed(data: unknown): ValidationResult {
  const [isValid, ajvErrors] = validateAgentRecordSchema(data);

  const formattedErrors = ajvErrors ? ajvErrors.map((error: ErrorObject) => ({
    field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
    message: error.message || 'Unknown validation error',
    value: error.data
  })) : [];

  return {
    isValid,
    errors: formattedErrors
  };
}

// --- Full Validation Orchestrator ---
/**
 * Performs a complete validation of an AgentRecord, including schema,
 * checksum, and signature checks.
 * @param record The full GitGovRecord containing the agent payload.
 * @param getActorPublicKey A function to retrieve the public key for a given actor ID.
 */
export async function validateFullAgentRecord(
  record: GitGovRecord & { payload: AgentRecord },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation
  const [isValidSchema, errors] = validateAgentRecordSchema(record.payload);
  if (!isValidSchema) {
    const formattedErrors = (errors || []).map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));
    throw new DetailedValidationError('AgentRecord', formattedErrors);
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}

/**
 * Validates that an AgentRecord has a valid relationship with its corresponding ActorRecord,
 * including succession chain resolution for key rotation scenarios.
 * 
 * @param agentRecord The AgentRecord to validate
 * @param getEffectiveActor Function to get the effective ActorRecord (with succession resolution)
 */
export async function validateAgentActorRelationship(
  agentRecord: AgentRecord,
  getEffectiveActor: (agentId: string) => Promise<ActorRecord | null>
): Promise<void> {
  const effectiveActor = await getEffectiveActor(agentRecord.id);

  if (!effectiveActor) {
    throw new SchemaValidationError(
      `No active ActorRecord found for AgentRecord ${agentRecord.id}. AgentRecord requires corresponding ActorRecord.`
    );
  }

  if (effectiveActor.type !== 'agent') {
    throw new SchemaValidationError(
      `ActorRecord ${effectiveActor.id} must be of type 'agent' to support AgentRecord ${agentRecord.id}.`
    );
  }

  if (effectiveActor.status !== 'active') {
    throw new SchemaValidationError(
      `ActorRecord succession chain for ${agentRecord.id} does not resolve to an active actor. Current effective actor: ${effectiveActor.id} (status: ${effectiveActor.status}).`
    );
  }
}
