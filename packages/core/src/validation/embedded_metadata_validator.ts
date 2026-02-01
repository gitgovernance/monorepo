import type { ValidateFunction, ErrorObject } from "ajv";
import type { EmbeddedMetadataRecord } from '../types/embedded.types';
import type { GitGovRecordPayload } from '../types/common.types';
import type { ValidationResult } from './errors';
import { SchemaValidationCache } from '../record_schemas/schema_cache';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { verifySignatures } from '../crypto/signatures';
import { DetailedValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';
import { Schemas } from '../record_schemas';

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

