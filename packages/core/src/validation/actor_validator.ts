import type { ValidateFunction } from "ajv";
import * as path from "path";
import type { ActorRecord } from "../types/actor_record";
import { ConfigManager } from "../config_manager";
import { calculatePayloadChecksum } from "../crypto/checksum";
import { verifySignatures } from "../crypto/signatures";
import type { GitGovRecord } from "../models";
import { SchemaValidationError, ChecksumMismatchError, SignatureVerificationError, ProjectRootError, DetailedValidationError } from "./common";
import { SchemaValidationCache } from "./schema-cache";

// --- Schema Validation ---
let _schemaPath: string | null = null;

function getSchemaPath(): string {
  if (!_schemaPath) {
    const root = ConfigManager.findProjectRoot();
    if (!root) {
      throw new ProjectRootError();
    }
    _schemaPath = path.join(root, "packages/blueprints/03_products/protocol/02_actor/actor_record_schema.yaml");
  }
  return _schemaPath;
}

export function validateActorRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

export function isActorRecord(data: unknown): data is ActorRecord {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  return validateSchema(data) as boolean;
}

/**
 * Validates an ActorRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateActorRecordDetailed(data: unknown): {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
} {
  const [isValid, ajvErrors] = validateActorRecordSchema(data);

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
    throw new SchemaValidationError(
      `ActorRecord payload failed schema validation: ${JSON.stringify(errors)}`
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
