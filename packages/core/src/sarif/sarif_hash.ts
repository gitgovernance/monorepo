import { createHash } from 'node:crypto';
import type { GetLineContentFn, OccurrenceContext } from './sarif.types';

/**
 * Normalizes line content for stable hashing.
 * - Trims leading/trailing whitespace
 * - Collapses consecutive whitespace to a single space
 * @param line - Raw line content
 * @returns Normalized line (deterministic)
 */
export function normalizeLineContent(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * Computes the primaryLocationLineHash for a normalized line.
 * Format: "hexHash:occurrence" (e.g., "39fa2ee980eb94b0:1")
 * Uses first 16 hex chars of SHA256 for compactness.
 *
 * @param normalizedLine - Line content after normalizeLineContent()
 * @param occurrence - 1-based counter for same hash in same file
 * @returns Hash string in format "hexHash:occurrence"
 */
export function computePrimaryLocationLineHash(
  normalizedLine: string,
  occurrence: number
): string {
  const hash = createHash('sha256').update(normalizedLine, 'utf8').digest('hex').slice(0, 16);
  return `${hash}:${occurrence}`;
}

/**
 * Builds partialFingerprints for a finding by fetching line content.
 * Returns an empty object if getLineContent is not provided or returns null.
 *
 * IMPORTANT: The `context` parameter MUST be shared across all findings
 * within the same file to correctly track occurrence counts.
 *
 * @param file - File path
 * @param line - 1-based line number
 * @param getLineContent - Callback to get line content
 * @param context - Shared occurrence context for this file
 * @returns Record with "primaryLocationLineHash/v1" or empty object
 */
export async function buildPartialFingerprints(
  file: string,
  line: number,
  getLineContent: GetLineContentFn | undefined,
  context: OccurrenceContext
): Promise<Record<string, string>> {
  if (!getLineContent) {
    return {};
  }

  const rawContent = await getLineContent(file, line);
  if (rawContent === null) {
    return {};
  }

  const normalized = normalizeLineContent(rawContent);
  const current = context.get(normalized) ?? 0;
  const occurrence = current + 1;
  context.set(normalized, occurrence);

  const hash = computePrimaryLocationLineHash(normalized, occurrence);
  return { 'primaryLocationLineHash/v1': hash };
}

/**
 * Creates a new OccurrenceContext for a file.
 * Must be created per-file, not shared across files.
 */
export function createOccurrenceContext(): OccurrenceContext {
  return new Map<string, number>();
}
