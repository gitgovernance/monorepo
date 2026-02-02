import type { ValidateFunction, ErrorObject } from "ajv";
import type { FeedbackRecord } from '../record_types';
import type { GitGovRecord } from '../record_types';
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from '../record_schemas/schema_cache';
import { DetailedValidationError } from './common';
import { validateFullEmbeddedMetadataRecord } from './embedded_metadata_validator';
import { Schemas } from '../record_schemas';

/**
 * Schema-based validation for FeedbackRecord payload
 */
export function validateFeedbackRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validator = SchemaValidationCache.getValidatorFromSchema(Schemas.FeedbackRecord);
  const isValid = validator(data);

  return [isValid, validator.errors];
}

/**
 * Type guard to check if data is a valid FeedbackRecord
 */
export function isFeedbackRecord(data: unknown): data is FeedbackRecord {
  const [isValid] = validateFeedbackRecordSchema(data);
  return isValid;
}

/**
 * Detailed validation with field-level error reporting
 */
export function validateFeedbackRecordDetailed(data: unknown): ValidationResult {
  const [isValid, errors] = validateFeedbackRecordSchema(data);

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
export async function validateFullFeedbackRecord(
  record: GitGovRecord & { payload: FeedbackRecord },
  getPublicKey: (keyId: string) => Promise<string>
): Promise<void> {
  // 1. Validate payload schema
  const [isValid, errors] = validateFeedbackRecordSchema(record.payload);
  if (!isValid) {
    const formattedErrors = (errors || []).map((error: ErrorObject) => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));
    throw new DetailedValidationError('FeedbackRecord', formattedErrors);
  }

  // 2. Embedded Metadata Validation (header + wrapper)
  await validateFullEmbeddedMetadataRecord(record, getPublicKey);
}
