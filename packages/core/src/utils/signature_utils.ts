/**
 * Signature Extraction Utilities
 * 
 * Generic helpers for extracting metadata from EmbeddedMetadataRecord signatures.
 * These utilities work with any record type and implement graceful degradation
 * for records without signatures.
 * 
 * @module signature_utils
 */

import type { EmbeddedMetadataRecord } from '../types/embedded.types';
import type { GitGovRecordPayload } from '../types/common.types';

/**
 * Result type for author/lastModifier extraction with timestamp.
 */
export type SignatureInfo = {
  actorId: string;
  timestamp: number;
};

/**
 * Extracts the author (first signer) from a record with timestamp.
 * 
 * The author is defined as the actor who created the first signature in the record.
 * This represents the original creator of the record.
 * 
 * @template T - The payload type of the record
 * @param record - The GitGovernance record with embedded metadata
 * @returns SignatureInfo with actorId and timestamp, or undefined if no signatures
 * 
 * @example
 * ```typescript
 * const author = extractAuthor(taskRecord);
 * if (author) {
 *   console.log(`Created by ${author.actorId} at ${author.timestamp}`);
 * }
 * ```
 */
export function extractAuthor<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>
): SignatureInfo | undefined {
  const signatures = record.header.signatures;

  // Graceful degradation: return undefined for missing/empty signatures
  if (!signatures || signatures.length === 0) {
    return undefined;
  }

  const firstSignature = signatures[0];
  return {
    actorId: firstSignature.keyId,
    timestamp: firstSignature.timestamp
  };
}

/**
 * Extracts the last modifier (last signer) from a record with timestamp.
 * 
 * The last modifier is the actor who added the most recent signature.
 * For records with only one signature, this will be the same as the author.
 * 
 * @template T - The payload type of the record
 * @param record - The GitGovernance record with embedded metadata
 * @returns SignatureInfo with actorId and timestamp, or undefined if no signatures
 * 
 * @example
 * ```typescript
 * const lastModifier = extractLastModifier(taskRecord);
 * if (lastModifier) {
 *   console.log(`Last modified by ${lastModifier.actorId} at ${lastModifier.timestamp}`);
 * }
 * ```
 */
export function extractLastModifier<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>
): SignatureInfo | undefined {
  const signatures = record.header.signatures;

  // Graceful degradation: return undefined for missing/empty signatures
  if (!signatures || signatures.length === 0) {
    return undefined;
  }

  const lastSignature = signatures[signatures.length - 1];
  if (!lastSignature) {
    return undefined;
  }

  return {
    actorId: lastSignature.keyId,
    timestamp: lastSignature.timestamp
  };
}

/**
 * Extracts all unique contributors (signers) from a record.
 * 
 * Returns an array of unique actor IDs (keyIds) who have signed the record.
 * Useful for collaboration analysis and determining who has worked on a record.
 * 
 * @template T - The payload type of the record
 * @param record - The GitGovernance record with embedded metadata
 * @returns Array of unique actor IDs (keyIds), empty array if no signatures
 * 
 * @example
 * ```typescript
 * const contributors = extractContributors(taskRecord);
 * console.log(`${contributors.length} people worked on this task`);
 * ```
 * 
 * @performance O(n) where n = number of signatures (typically 1-3, max ~10)
 */
export function extractContributors<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>
): string[] {
  const signatures = record.header.signatures;

  // Graceful degradation: return empty array for missing/empty signatures
  if (!signatures || signatures.length === 0) {
    return [];
  }

  // Use Set for deduplication, then convert to array
  const uniqueKeyIds = new Set<string>();
  for (const sig of signatures) {
    uniqueKeyIds.add(sig.keyId);
  }

  return Array.from(uniqueKeyIds);
}

/**
 * Extracts the timestamp of the last signature in a record.
 * 
 * This represents when the record was last modified. Useful for sorting
 * and determining activity recency.
 * 
 * @template T - The payload type of the record
 * @param record - The GitGovernance record with embedded metadata
 * @returns Unix timestamp of the last signature, or undefined if no signatures
 * 
 * @example
 * ```typescript
 * const lastActivity = extractLastSignatureTimestamp(taskRecord);
 * if (lastActivity) {
 *   const daysAgo = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
 *   console.log(`Last activity ${daysAgo} days ago`);
 * }
 * ```
 */
export function extractLastSignatureTimestamp<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>
): number | undefined {
  const signatures = record.header.signatures;

  // Graceful degradation: return undefined for missing/empty signatures
  if (!signatures || signatures.length === 0) {
    return undefined;
  }

  const lastSignature = signatures[signatures.length - 1];
  return lastSignature?.timestamp;
}

/**
 * Gets the total count of signatures in a record.
 * 
 * Useful for determining how many times a record has been modified
 * or how many actors have contributed to it.
 * 
 * @template T - The payload type of the record
 * @param record - The GitGovernance record with embedded metadata
 * @returns Number of signatures, or 0 if no signatures
 * 
 * @example
 * ```typescript
 * const signatureCount = getSignatureCount(taskRecord);
 * console.log(`Record has been signed ${signatureCount} times`);
 * ```
 */
export function getSignatureCount<T extends GitGovRecordPayload>(
  record: EmbeddedMetadataRecord<T>
): number {
  const signatures = record.header.signatures;

  // Graceful degradation: return 0 for missing/empty signatures
  if (!signatures || signatures.length === 0) {
    return 0;
  }

  return signatures.length;
}

