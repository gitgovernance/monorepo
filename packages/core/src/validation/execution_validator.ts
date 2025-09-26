import type { ValidateFunction, ErrorObject } from "ajv";
import type { ExecutionRecord } from '../types';
import type { GitGovRecord } from '../types';
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from '../schemas/schema_cache';
import { DetailedValidationError } from './common';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import { Schemas } from '../schemas';

/**
 * Schema-based validation for ExecutionRecord payload
 */
export function validateExecutionRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validator = SchemaValidationCache.getValidatorFromSchema(Schemas.ExecutionRecord);
  const isValid = validator(data);

  return [isValid, validator.errors];
}

/**
 * Type guard to check if data is a valid ExecutionRecord
 */
export function isExecutionRecord(data: unknown): data is ExecutionRecord {
  const [isValid] = validateExecutionRecordSchema(data);
  return isValid;
}

/**
 * Detailed validation with field-level error reporting
 */
export function validateExecutionRecordDetailed(data: unknown): ValidationResult {
  const [isValid, errors] = validateExecutionRecordSchema(data);

  if (!isValid && errors) {
    const formattedErrors = errors.map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));

    return {
      isValid: false,
      errors: formattedErrors
    };
  }

  return {
    isValid: true,
    errors: []
  };
}

/**
 * Full validation including checksum and signature verification
 */
export async function validateFullExecutionRecord(
  record: GitGovRecord & { payload: ExecutionRecord },
  getPublicKey: (keyId: string) => Promise<string>
): Promise<void> {
  // 1. Validate payload schema
  const [isValid, errors] = validateExecutionRecordSchema(record.payload);
  if (!isValid) {
    const formattedErrors = (errors || []).map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));
    throw new DetailedValidationError('ExecutionRecord', formattedErrors);
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getPublicKey);
}
