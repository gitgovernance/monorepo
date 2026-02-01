import type { ValidateFunction, ErrorObject } from "ajv";
import type { ActorRecord } from "../record_types";
import type { GitGovRecord } from "../record_types";
import { DetailedValidationError } from "./common";
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from "../record_schemas/schema_cache";
import { Schemas } from "../record_schemas";
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
    const formattedErrors = (errors || []).map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));
    throw new DetailedValidationError('ActorRecord', formattedErrors);
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}
