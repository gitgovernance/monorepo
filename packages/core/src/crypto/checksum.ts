import { createHash } from "crypto";
import type { GitGovRecordPayload } from "../record_types";

/**
 * Recursively sorts the keys of an object, including nested objects.
 * This is the core of canonical serialization.
 * @param obj The object to sort.
 * @returns A new object with all keys sorted alphabetically.
 */
function sortKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const newObj: Record<string, any> = {};
  for (const key of sortedKeys) {
    newObj[key] = sortKeys(obj[key]);
  }
  return newObj;
}

/**
 * Canonically serializes a payload object.
 * @param payload The object to serialize.
 * @returns A deterministic JSON string.
 */
function canonicalize(payload: object): string {
  const sortedPayload = sortKeys(payload);
  return JSON.stringify(sortedPayload);
}

/**
 * Calculates the SHA-256 checksum of a record's payload.
 */
export function calculatePayloadChecksum(payload: GitGovRecordPayload): string {
  const jsonString = canonicalize(payload);
  return createHash("sha256").update(jsonString, "utf8").digest("hex");
}

/**
 * Computes SHA-256 hex digest of a string input.
 * EARS-7: returns 64-character lowercase hex string.
 * EARS-8: deterministic (same input → same output).
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
} 