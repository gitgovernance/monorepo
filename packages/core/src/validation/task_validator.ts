import type { ValidateFunction } from "ajv";
import type { TaskRecord } from "../types";
import type { GitGovRecord } from "../types";
import { SchemaValidationCache } from "../schemas/schema_cache";
import { Schemas } from '../schemas';
import {
  SchemaValidationError
} from "./common";
import type { ValidationResult } from './errors';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';

// --- Schema Validation ---
export function validateTaskRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(Schemas.TaskRecord);
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

/**
 * Type guard to check if data is a valid TaskRecord.
 */
export function isTaskRecord(data: unknown): data is TaskRecord {
  const validateSchema = SchemaValidationCache.getValidatorFromSchema(Schemas.TaskRecord);
  return validateSchema(data) as boolean;
}

/**
 * Validates a TaskRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateTaskRecordDetailed(data: unknown): ValidationResult {
  const [isValid, ajvErrors] = validateTaskRecordSchema(data);

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
 * Performs a complete validation of a TaskRecord, including schema,
 * checksum, and signature checks.
 * @param record The full GitGovRecord containing the task payload.
 * @param getActorPublicKey A function to retrieve the public key for a given actor ID.
 */
export async function validateFullTaskRecord(
  record: GitGovRecord & { payload: TaskRecord },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation
  const [isValidSchema, errors] = validateTaskRecordSchema(record.payload);
  if (!isValidSchema) {
    throw new SchemaValidationError(
      `TaskRecord payload failed schema validation: ${JSON.stringify(errors)}`
    );
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}
