import type { ValidateFunction, ErrorObject } from "ajv";
import type { TaskRecord } from "../record_types";
import type { GitGovRecord } from "../record_types";
import { SchemaValidationCache } from "../record_schemas/schema_cache";
import { Schemas } from '../record_schemas';
import {
  DetailedValidationError
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
    const formattedErrors = (errors || []).map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));
    throw new DetailedValidationError('TaskRecord', formattedErrors);
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getActorPublicKey);
}
