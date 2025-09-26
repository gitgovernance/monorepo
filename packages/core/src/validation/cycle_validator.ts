import type { ValidateFunction } from "ajv";
import type { CycleRecord } from "../types";
import type { GitGovRecord } from "../types";
import { SchemaValidationCache } from "../schemas/schema_cache";
import { SchemaValidationError } from "./common";
import type { ValidationResult } from './errors';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import { Schemas } from "../schemas";

// --- Schema Validation ---
const cycleSchema = Schemas.CycleRecord;

export function validateCycleRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(cycleSchema);
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

/**
 * Type guard to check if data is a valid CycleRecord.
 */
export function isCycleRecord(data: unknown): data is CycleRecord {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(cycleSchema);
  return validateSchema(data) as boolean;
}

/**
 * Validates a CycleRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateCycleRecordDetailed(data: unknown): ValidationResult {
  const [isValid, ajvErrors] = validateCycleRecordSchema(data);

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
 * Performs a complete validation of a CycleRecord, including schema,
 * checksum, and signature checks.
 * @param record The full GitGovRecord containing the cycle payload.
 * @param getActorPublicKey A function to retrieve the public key for a given actor ID.
 */
export async function validateFullCycleRecord(
  record: GitGovRecord & { payload: CycleRecord },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation
  const [isValidSchema, errors] = validateCycleRecordSchema(record.payload);
  if (!isValidSchema) {
    throw new SchemaValidationError(
      `CycleRecord payload failed schema validation: ${JSON.stringify(errors)}`
    );
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}
