import type { ValidateFunction } from "ajv";
import * as path from "path";
import type { AgentRecord } from "../types/agent_record";
import { ConfigManager } from "../config_manager";
import { calculatePayloadChecksum } from "../crypto/checksum";
import { verifySignatures } from "../crypto/signatures";
import type { GitGovRecord } from "../models";
import { SchemaValidationError, ChecksumMismatchError, SignatureVerificationError, ProjectRootError, DetailedValidationError } from "./common";
import { SchemaValidationCache } from "./schema-cache";
import type { ActorRecord } from "../types/actor_record";

// --- Schema Validation ---
let _schemaPath: string | null = null;

function getSchemaPath(): string {
  if (!_schemaPath) {
    const root = ConfigManager.findProjectRoot();
    if (!root) {
      throw new ProjectRootError();
    }
    _schemaPath = path.join(root, "packages/blueprints/03_products/protocol/03_agent/agent_record_schema.yaml");
  }
  return _schemaPath;
}

export function validateAgentRecordSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

export function isAgentRecord(data: unknown): data is AgentRecord {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  return validateSchema(data) as boolean;
}

/**
 * Validates an AgentRecord and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateAgentRecordDetailed(data: unknown): {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
} {
  const [isValid, ajvErrors] = validateAgentRecordSchema(data);

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
 * Performs a complete validation of an AgentRecord, including schema,
 * checksum, and signature checks.
 * @param record The full GitGovRecord containing the agent payload.
 * @param getActorPublicKey A function to retrieve the public key for a given actor ID.
 */
export async function validateFullAgentRecord(
  record: GitGovRecord & { payload: AgentRecord },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<void> {
  // 1. Schema Validation
  const [isValidSchema, errors] = validateAgentRecordSchema(record.payload);
  if (!isValidSchema) {
    throw new SchemaValidationError(
      `AgentRecord payload failed schema validation: ${JSON.stringify(errors)}`
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

/**
 * Validates that an AgentRecord has a valid relationship with its corresponding ActorRecord,
 * including succession chain resolution for key rotation scenarios.
 * 
 * @param agentRecord The AgentRecord to validate
 * @param getEffectiveActor Function to get the effective ActorRecord (with succession resolution)
 */
export async function validateAgentActorRelationship(
  agentRecord: AgentRecord,
  getEffectiveActor: (agentId: string) => Promise<ActorRecord | null>
): Promise<void> {
  const effectiveActor = await getEffectiveActor(agentRecord.id);

  if (!effectiveActor) {
    throw new SchemaValidationError(
      `No active ActorRecord found for AgentRecord ${agentRecord.id}. AgentRecord requires corresponding ActorRecord.`
    );
  }

  if (effectiveActor.type !== 'agent') {
    throw new SchemaValidationError(
      `ActorRecord ${effectiveActor.id} must be of type 'agent' to support AgentRecord ${agentRecord.id}.`
    );
  }

  if (effectiveActor.status !== 'active') {
    throw new SchemaValidationError(
      `ActorRecord succession chain for ${agentRecord.id} does not resolve to an active actor. Current effective actor: ${effectiveActor.id} (status: ${effectiveActor.status}).`
    );
  }
}
