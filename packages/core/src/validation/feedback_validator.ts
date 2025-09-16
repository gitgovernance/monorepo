import * as path from 'path';
import type { FeedbackRecord } from '../types/feedback_record';
import type { GitGovRecord } from '../models';
/**
 * Validation result interface
 */
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error interface
 */
interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}
import { SchemaValidationCache } from './schema-cache';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { verifySignatures } from '../crypto/signatures';
import { DetailedValidationError, ChecksumMismatchError, SignatureVerificationError } from './common';
import { ConfigManager } from '../config_manager';

/**
 * Schema-based validation for FeedbackRecord payload
 */
export function validateFeedbackRecordSchema(data: unknown): ValidationResult {
  const projectRoot = ConfigManager.findProjectRoot();
  if (!projectRoot) {
    throw new Error('Project root not found. Please run from within a Git repository.');
  }

  const schemaPath = path.join(
    projectRoot,
    'packages/blueprints/03_products/protocol/07_feedback/feedback_record_schema.yaml'
  );

  const validator = SchemaValidationCache.getValidator(schemaPath);
  const isValid = validator(data);

  if (!isValid && validator.errors) {
    const errors: ValidationError[] = validator.errors.map(error => ({
      field: error.instancePath?.replace('/', '') || error.params?.['missingProperty'] || 'root',
      message: error.message || 'Unknown validation error',
      value: error.data
    }));

    return { isValid: false, errors };
  }

  return { isValid: true, errors: [] };
}

/**
 * Type guard to check if data is a valid FeedbackRecord
 */
export function isFeedbackRecord(data: unknown): data is FeedbackRecord {
  const result = validateFeedbackRecordSchema(data);
  return result.isValid;
}

/**
 * Detailed validation with field-level error reporting
 */
export function validateFeedbackRecordDetailed(data: unknown): ValidationResult {
  return validateFeedbackRecordSchema(data);
}

/**
 * Full validation including checksum and signature verification
 */
export async function validateFullFeedbackRecord(
  record: GitGovRecord & { payload: FeedbackRecord },
  getPublicKey: (keyId: string) => Promise<string>
): Promise<void> {
  // 1. Validate payload schema
  const payloadValidation = validateFeedbackRecordSchema(record.payload);
  if (!payloadValidation.isValid) {
    throw new DetailedValidationError('FeedbackRecord', payloadValidation.errors);
  }

  // 2. Verify payload checksum
  const expectedChecksum = calculatePayloadChecksum(record.payload);
  if (record.header.payloadChecksum !== expectedChecksum) {
    throw new ChecksumMismatchError();
  }

  // 3. Verify signatures
  const isSignatureValid = await verifySignatures(record, getPublicKey);
  if (!isSignatureValid) {
    throw new SignatureVerificationError();
  }
}
