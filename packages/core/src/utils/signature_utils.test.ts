/**
 * Tests for Signature Extraction Utilities
 * 
 * Covers EARS-49 to EARS-69: Generic signature extraction helpers with graceful degradation
 * See: packages/blueprints/03_products/core/specs/adapters/indexer_adapter.md (Section 4.2)
 */
import type { GitGovTaskRecord } from '../types';
import type { Signature } from '../types/embedded.types';
import { createTaskRecord } from '../factories/task_factory';
import { createEmbeddedMetadataRecord, createTestSignature } from '../factories/embedded_metadata_factory';
import {
  extractAuthor,
  extractLastModifier,
  extractContributors,
  extractLastSignatureTimestamp,
  getSignatureCount
} from './signature_utils';

/**
 * Helper to create valid GitGovTaskRecord using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses default test signature from factory (valid 88-char base64 Ed25519 format).
 * 
 * @param keyIds - Array of keyIds to create signatures for
 * @returns Promise<GitGovTaskRecord> - Fully validated task record
 */
async function createValidTaskRecord(keyIds: string[]): Promise<GitGovTaskRecord> {
  const taskPayload = createTaskRecord({
    title: 'Test Task',
    description: 'Test task description for signature extraction',
    status: 'active',
    priority: 'medium'
  });

  // Create signatures using the factory's createTestSignature (valid Ed25519 format)
  const signatures: Signature[] = keyIds.map((keyId, index) =>
    createTestSignature(keyId, index === 0 ? 'author' : 'reviewer', `Signature ${index + 1}`)
  );

  return await createEmbeddedMetadataRecord(taskPayload, { signatures });
}

describe('extractAuthor', () => {
  it('[EARS-49] should extract author from first signature with timestamp', async () => {
    const record = await createValidTaskRecord(['human:camilo', 'agent:architect']);

    const author = extractAuthor(record);

    expect(author).toBeDefined();
    expect(author?.actorId).toBe('human:camilo');
    expect(author?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-50] should return undefined for record without signatures', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    const author = extractAuthor(corruptedRecord);

    expect(author).toBeUndefined();
  });

  it('[EARS-51] should handle single signature record', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const author = extractAuthor(record);

    expect(author).toBeDefined();
    expect(author?.actorId).toBe('human:alice');
    expect(author?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-52] should return first signature even with multiple signatures', async () => {
    const record = await createValidTaskRecord(['human:first', 'human:second', 'human:third']);

    const author = extractAuthor(record);

    expect(author?.actorId).toBe('human:first');
  });
});

describe('extractLastModifier', () => {
  it('[EARS-53] should extract last modifier from last signature with timestamp', async () => {
    const record = await createValidTaskRecord(['human:camilo', 'agent:architect']);

    const lastModifier = extractLastModifier(record);

    expect(lastModifier).toBeDefined();
    expect(lastModifier?.actorId).toBe('agent:architect');
    expect(lastModifier?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-54] should return undefined for record without signatures', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    const lastModifier = extractLastModifier(corruptedRecord);

    expect(lastModifier).toBeUndefined();
  });

  it('[EARS-55] should return same as author if only one signature', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const lastModifier = extractLastModifier(record);
    const author = extractAuthor(record);

    expect(lastModifier).toEqual(author);
    expect(lastModifier?.actorId).toBe('human:alice');
  });

  it('[EARS-56] should return last signature with multiple modifiers', async () => {
    const record = await createValidTaskRecord(['human:first', 'human:second', 'human:third']);

    const lastModifier = extractLastModifier(record);

    expect(lastModifier?.actorId).toBe('human:third');
  });
});

describe('extractContributors', () => {
  it('[EARS-57] should extract unique contributor keyIds', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob', 'human:charlie']);

    const contributors = extractContributors(record);

    expect(contributors).toHaveLength(3);
    expect(contributors).toContain('human:alice');
    expect(contributors).toContain('human:bob');
    expect(contributors).toContain('human:charlie');
  });

  it('[EARS-58] should deduplicate repeated contributors', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob', 'human:alice', 'human:bob']);

    const contributors = extractContributors(record);

    expect(contributors).toHaveLength(2);
    expect(contributors).toContain('human:alice');
    expect(contributors).toContain('human:bob');
  });

  it('[EARS-59] should return empty array for no signatures', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    const contributors = extractContributors(corruptedRecord);

    expect(contributors).toEqual([]);
  });

  it('[EARS-60] should handle single contributor', async () => {
    const record = await createValidTaskRecord(['human:solo']);

    const contributors = extractContributors(record);

    expect(contributors).toEqual(['human:solo']);
  });
});

describe('extractLastSignatureTimestamp', () => {
  it('[EARS-61] should return timestamp of last signature', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob']);

    const timestamp = extractLastSignatureTimestamp(record);

    expect(timestamp).toBeGreaterThan(0);
  });

  it('[EARS-62] should return undefined for no signatures', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    const timestamp = extractLastSignatureTimestamp(corruptedRecord);

    expect(timestamp).toBeUndefined();
  });

  it('[EARS-63] should return same timestamp as author for single signature', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const timestamp = extractLastSignatureTimestamp(record);
    const author = extractAuthor(record);

    expect(timestamp).toBe(author?.timestamp);
  });
});

describe('getSignatureCount', () => {
  it('[EARS-64] should return correct signature count', async () => {
    const record = await createValidTaskRecord(['human:a', 'human:b', 'human:c']);

    const count = getSignatureCount(record);

    expect(count).toBe(3);
  });

  it('[EARS-65] should return 0 for no signatures', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    const count = getSignatureCount(corruptedRecord);

    expect(count).toBe(0);
  });

  it('[EARS-66] should return 1 for single signature', async () => {
    const record = await createValidTaskRecord(['human:solo']);

    const count = getSignatureCount(record);

    expect(count).toBe(1);
  });

  it('[EARS-67] should count all signatures including duplicates', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:alice', 'human:alice']);

    const count = getSignatureCount(record);

    expect(count).toBe(3);
  });
});

describe('Integration: All functions together', () => {
  it('[EARS-68] should work together for typical task workflow', async () => {
    const record = await createValidTaskRecord(['human:product-owner', 'human:developer', 'agent:code-reviewer', 'human:product-owner']);

    const author = extractAuthor(record);
    const lastModifier = extractLastModifier(record);
    const contributors = extractContributors(record);
    const lastTimestamp = extractLastSignatureTimestamp(record);
    const signatureCount = getSignatureCount(record);

    expect(author?.actorId).toBe('human:product-owner');
    expect(author?.timestamp).toBeGreaterThan(0);

    expect(lastModifier?.actorId).toBe('human:product-owner');
    expect(lastModifier?.timestamp).toBeGreaterThan(0);

    expect(contributors).toHaveLength(3);
    expect(contributors).toContain('human:product-owner');
    expect(contributors).toContain('human:developer');
    expect(contributors).toContain('agent:code-reviewer');

    expect(lastTimestamp).toBeGreaterThan(0);
    expect(signatureCount).toBe(4);
  });

  it('[EARS-69] should handle corrupted/legacy records gracefully', async () => {
    const validRecord = await createValidTaskRecord(['human:test']);

    const corruptedRecord = {
      ...validRecord,
      header: {
        ...validRecord.header,
        signatures: [] as unknown as [Signature, ...Signature[]]
      }
    };

    expect(() => {
      const author = extractAuthor(corruptedRecord);
      const lastModifier = extractLastModifier(corruptedRecord);
      const contributors = extractContributors(corruptedRecord);
      const lastTimestamp = extractLastSignatureTimestamp(corruptedRecord);
      const signatureCount = getSignatureCount(corruptedRecord);

      expect(author).toBeUndefined();
      expect(lastModifier).toBeUndefined();
      expect(contributors).toEqual([]);
      expect(lastTimestamp).toBeUndefined();
      expect(signatureCount).toBe(0);
    }).not.toThrow();
  });
});
