import type { EmbeddedMetadataRecord, GitGovRecordPayload } from '../types';
import type { Signature, EmbeddedMetadataHeader } from '../types/embedded.types';
import { validateEmbeddedMetadataDetailed } from '../validation/embedded_metadata_validator';
import { DetailedValidationError } from '../validation/common';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { signPayload } from '../crypto/signatures';

/**
 * Configuration for signature generation
 * Extends Signature with privateKey for signing
 */
export type SignatureConfig = Partial<Pick<Signature, 'keyId' | 'role' | 'notes'>> & {
  /** Private key for signing (if not provided, creates unsigned test signature) */
  privateKey?: string;
};

/**
 * Options for creating an EmbeddedMetadataRecord
 */
export type CreateEmbeddedMetadataOptions = {
  /** Header configuration (partial override, excludes auto-generated fields) */
  header?: Partial<Pick<EmbeddedMetadataHeader, 'version' | 'type' | 'schemaUrl' | 'schemaChecksum'>>;
  /** Signature configuration (if not provided, uses default test signature) */
  signature?: SignatureConfig;
  /** Custom signatures array (if provided, overrides signature config) */
  signatures?: Signature[];
};

/**
 * Creates a test signature for development/testing purposes (unsigned)
 * Use this only for testing when you don't have a real private key
 * 
 * @param keyId - The key ID for the signature (default: 'human:test-user')
 * @param role - The role for the signature (default: 'author')
 * @param notes - Notes for the signature (default: 'Test signature - unsigned')
 * @returns Signature object (with dummy signature value)
 */
export function createTestSignature(
  keyId: string = 'human:test-user',
  role: string = 'author',
  notes: string = 'Test signature - unsigned'
): Signature {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    keyId,
    role,
    notes,
    signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==', // Dummy 88-char base64 for testing (86 chars + ==, matches Ed25519 signature format)
    timestamp
  };
}

/**
 * Infers the header type from the payload structure
 * 
 * @param payload - The record payload
 * @returns The inferred type string
 */
function inferTypeFromPayload(payload: GitGovRecordPayload): string {
  // Check for distinctive properties of each record type
  if ('engine' in payload) return 'agent';
  if ('taskId' in payload && 'result' in payload) return 'execution';
  if ('relatedTasks' in payload && 'completedAt' in payload) return 'changelog';
  if ('entityType' in payload && 'entityId' in payload) return 'feedback';
  if ('status' in payload && 'taskIds' in payload) return 'cycle';
  if ('priority' in payload && 'description' in payload) return 'task';
  if ('displayName' in payload && 'publicKey' in payload) return 'actor';

  return 'custom';
}


/**
 * Creates a complete EmbeddedMetadataRecord with validation
 * 
 * @param payload - The record payload (ActorRecord, TaskRecord, etc.)
 * @param options - Optional configuration for the embedded metadata
 * @returns Promise<EmbeddedMetadataRecord<T>> - The validated embedded metadata record
 * 
 * @example
 * ```typescript
 * const actorPayload: ActorRecord = {
 *   id: 'human:john-doe',
 *   type: 'human',
 *   displayName: 'John Doe',
 *   publicKey: 'abc123...',
 *   roles: ['developer']
 * };
 * 
 * const embedded = createEmbeddedMetadataRecord(actorPayload);
 * ```
 */
export function createEmbeddedMetadataRecord<T extends GitGovRecordPayload>(
  payload: T,
  options: CreateEmbeddedMetadataOptions = {}
): EmbeddedMetadataRecord<T> {
  const inferredType = inferTypeFromPayload(payload);
  const type = options.header?.type || inferredType;

  // Calculate real payload checksum using crypto module
  const payloadChecksum = calculatePayloadChecksum(payload);

  // Generate signature(s)
  let signatures: Signature[];
  if (options.signatures) {
    // Use provided signatures array
    signatures = options.signatures;
  } else if (options.signature?.privateKey) {
    // Sign with provided private key
    const keyId = options.signature.keyId || 'human:test-user';
    const role = options.signature.role || 'author';
    const notes = options.signature.notes || 'Created via factory';
    signatures = [signPayload(payload, options.signature.privateKey, keyId, role, notes)];
  } else {
    // Create unsigned test signature
    const keyId = options.signature?.keyId || 'human:test-user';
    const role = options.signature?.role || 'author';
    const notes = options.signature?.notes || 'Test signature - unsigned';
    signatures = [createTestSignature(keyId, role, notes)];
  }

  // Build header (using Record for flexibility, will be validated)
  const header: Record<string, unknown> = {
    version: '1.0', // Always 1.0 (schema enforces this)
    type: type,
    payloadChecksum,
    signatures,
    ...(type === 'custom' && {
      schemaUrl: options.header?.schemaUrl,
      schemaChecksum: options.header?.schemaChecksum
    })
  };

  const embeddedRecord = {
    header,
    payload
  } as EmbeddedMetadataRecord<T>;

  // Validate the complete embedded metadata record
  const validation = validateEmbeddedMetadataDetailed(embeddedRecord);
  if (!validation.isValid) {
    throw new DetailedValidationError('EmbeddedMetadataRecord', validation.errors);
  }

  return embeddedRecord;
}

