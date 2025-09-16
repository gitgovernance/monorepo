import type { ValidateFunction } from "ajv";
import * as path from "path";
import type { CycleRecord } from "../types/cycle_record";
import type { GitGovRecord } from "../models";
import { ConfigManager } from "../config_manager";
import { SchemaValidationCache } from "./schema-cache";
import {
  SchemaValidationError,
  ChecksumMismatchError,
  SignatureVerificationError,
  ProjectRootError
} from "./common";
import { calculatePayloadChecksum } from "../crypto/checksum";
import { verifySignatures } from "../crypto/signatures";

// --- Schema Validation ---
const root = ConfigManager.findProjectRoot();
if (!root) {
  throw new ProjectRootError();
}

const schemaPath = path.join(root, "packages/blueprints/03_products/protocol/08_cycle/cycle_record_schema.yaml");

export function validateCycleRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidator(schemaPath);
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

/**
 * Type guard to check if data is a valid CycleRecord.
 */
export function isCycleRecord(data: unknown): data is CycleRecord {
  const validateSchema = SchemaValidationCache.getValidator(schemaPath);
  return validateSchema(data) as boolean;
}

/**
 * Validates a CycleRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateCycleRecordDetailed(data: unknown): {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
} {
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
