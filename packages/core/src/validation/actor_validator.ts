import type { ValidateFunction } from "ajv";
import type { ActorRecord } from "../types";
import type { GitGovRecord } from "../types";
import { SchemaValidationError } from "./common";
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from "../schemas/schema_cache";
import { Schemas } from "../schemas";
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';

// --- Schema Validation ---
const actorSchema = Schemas.ActorRecord;

export function validateActorRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(actorSchema);
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

export function isActorRecord(data: unknown): data is ActorRecord {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(actorSchema);
  return validateSchema(data) as boolean;
}

/**
 * Validates an ActorRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateActorRecordDetailed(data: unknown): ValidationResult {
  const [isValid, ajvErrors] = validateActorRecordSchema(data);

  const formattedErrors = ajvErrors ? ajvErrors.map(error => ({
    field: error.instancePath || error.schemaPath || 'root',
    message: error.message || 'Validation failed',
    value: error.data
  })) : [];

  return {
    isValid,
    errors: formattedErrors
  };
}

// --- Full Validation Orchestrator ---
/**
 * Performs a complete validation of an ActorRecord, including schema,
 * checksum, and signature checks.
 * @param record The full GitGovRecord containing the actor payload.
 * @param getActorPublicKey A function to retrieve the public key for a given actor ID.
 */
export async function validateFullActorRecord(
  record: GitGovRecord & { payload: ActorRecord },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation
  const [isValidSchema, errors] = validateActorRecordSchema(record.payload);
  if (!isValidSchema) {
    throw new SchemaValidationError(
      `ActorRecord payload failed schema validation: ${JSON.stringify(errors)}`
    );
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}
