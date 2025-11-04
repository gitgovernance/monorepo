import type { ValidateFunction, ErrorObject } from "ajv";
import type { EmbeddedMetadataRecord } from '../types/embedded.types';
import type { GitGovRecordPayload } from '../types/common.types';
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from '../schemas/schema_cache';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { verifySignatures } from '../crypto/signatures';
import { DetailedValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';
import { Schemas } from '../schemas';

/**
 * Schema-based validation for EmbeddedMetadata wrapper
 */
export function validateEmbeddedMetadataSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validator = SchemaValidationCache.getValidatorFromSchema(Schemas.EmbeddedMetadata);
  const isValid = validator(data);

  return [isValid, validator.errors];
}

/**
 * Type guard to check if data is a valid EmbeddedMetadataRecord
 */
export function isEmbeddedMetadataRecord<T extends GitGovRecordPayload>(data: unknown): data is EmbeddedMetadataRecord<T> {
  const [isValid] = validateEmbeddedMetadataSchema(data);
  return isValid;
}

/**
 * Detailed validation for EmbeddedMetadataRecord with formatted errors
 */
export function validateEmbeddedMetadataDetailed(data: unknown): ValidationResult {
  const [isValid, ajvErrors] = validateEmbeddedMetadataSchema(data);

  const formattedErrors = ajvErrors?.map((error: ErrorObject) => ({
    field: error.instancePath || error.schemaPath,
    message: error.message || 'Validation failed',
    value: error.data
  })) || [];

  return {
    isValid,
    errors: formattedErrors
  };
}

/**
 * Full validation for EmbeddedMetadataRecord including schema, checksum, and signatures
 */
export async function validateFullEmbeddedMetadataRecord<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>,
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation - validate the entire record structure
  const [isValidSchema, errors] = validateEmbeddedMetadataSchema(record);
  if (!isValidSchema) {
    const formattedErrors = errors?.map(error => ({
      field: error.instancePath || error.schemaPath,
      message: error.message || 'Validation failed',
      value: error.data
    })) || [];

    throw new DetailedValidationError('EmbeddedMetadata', formattedErrors);
  }

  // 2. Checksum Validation
  const expectedChecksum = calculatePayloadChecksum(record.payload);
  if (expectedChecksum !== record.header.payloadChecksum) {
    throw new ChecksumMismatchError();
  }

  // 3. Signature Verification
  const areSignaturesValid = await verifySignatures(
    record,
    getActorPublicKey
  );
  if (!areSignaturesValid) {
    throw new SignatureVerificationError();
  }
}

/**
 * Business rules validation for EmbeddedMetadata
 * Validates conditional requirements based on header.type
 */
export function validateEmbeddedMetadataBusinessRules<T extends GitGovRecordPayload>(data: EmbeddedMetadataRecord<T>): ValidationResult {
  const errors: Array<{ field: string; message: string; value: unknown }> = [];

  // Rule 1: If header.type is "custom", schemaUrl and schemaChecksum are required
  if (data.header.type === 'custom') {
    if (!data.header.schemaUrl) {
      errors.push({
        field: 'header.schemaUrl',
        message: 'schemaUrl is required when header.type is "custom"',
        value: data.header.schemaUrl
      });
    }

    if (!data.header.schemaChecksum) {
      errors.push({
        field: 'header.schemaChecksum',
        message: 'schemaChecksum is required when header.type is "custom"',
        value: data.header.schemaChecksum
      });
    }
  }

  // Rule 2: Validate payloadChecksum format (SHA-256)
  const sha256Pattern = /^[a-fA-F0-9]{64}$/;
  if (!sha256Pattern.test(data.header.payloadChecksum)) {
    errors.push({
      field: 'header.payloadChecksum',
      message: 'payloadChecksum must be a valid SHA-256 hash (64 hex characters)',
      value: data.header.payloadChecksum
    });
  }

  // Rule 3: Validate schemaChecksum format if present
  if (data.header.schemaChecksum && !sha256Pattern.test(data.header.schemaChecksum)) {
    errors.push({
      field: 'header.schemaChecksum',
      message: 'schemaChecksum must be a valid SHA-256 hash (64 hex characters)',
      value: data.header.schemaChecksum
    });
  }

  // Rule 4: Validate signatures array is not empty
  if (!data.header.signatures || data.header.signatures.length === 0) {
    errors.push({
      field: 'header.signatures',
      message: 'At least one signature is required',
      value: data.header.signatures
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
