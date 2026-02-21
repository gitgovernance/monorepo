/**
 * Tests for Signature Extraction Utilities
 * 
 * Covers EARS-L1 to EARS-Q2: Generic signature extraction helpers with graceful degradation
 */
import type { GitGovTaskRecord } from '../record_types';
import type { Signature } from '../record_types/embedded.types';
import { createTaskRecord } from '../record_factories/task_factory';
import { createEmbeddedMetadataRecord, createTestSignature } from '../record_factories/embedded_metadata_factory';
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

describe('4.2. extractAuthor (EARS-L1 a L4)', () => {
  it('[EARS-L1] should extract author from first signature with timestamp', async () => {
    const record = await createValidTaskRecord(['human:camilo', 'agent:architect']);

    const author = extractAuthor(record);

    expect(author).toBeDefined();
    expect(author?.actorId).toBe('human:camilo');
    expect(author?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-L2] should return undefined for record without signatures', async () => {
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

  it('[EARS-L3] should handle single signature record', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const author = extractAuthor(record);

    expect(author).toBeDefined();
    expect(author?.actorId).toBe('human:alice');
    expect(author?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-L4] should return first signature even with multiple signatures', async () => {
    const record = await createValidTaskRecord(['human:first', 'human:second', 'human:third']);

    const author = extractAuthor(record);

    expect(author?.actorId).toBe('human:first');
  });
});

describe('4.2. extractLastModifier (EARS-M1 a M4)', () => {
  it('[EARS-M1] should extract last modifier from last signature with timestamp', async () => {
    const record = await createValidTaskRecord(['human:camilo', 'agent:architect']);

    const lastModifier = extractLastModifier(record);

    expect(lastModifier).toBeDefined();
    expect(lastModifier?.actorId).toBe('agent:architect');
    expect(lastModifier?.timestamp).toBeGreaterThan(0);
  });

  it('[EARS-M2] should return undefined for record without signatures', async () => {
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

  it('[EARS-M3] should return same as author if only one signature', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const lastModifier = extractLastModifier(record);
    const author = extractAuthor(record);

    expect(lastModifier).toEqual(author);
    expect(lastModifier?.actorId).toBe('human:alice');
  });

  it('[EARS-M4] should return last signature with multiple modifiers', async () => {
    const record = await createValidTaskRecord(['human:first', 'human:second', 'human:third']);

    const lastModifier = extractLastModifier(record);

    expect(lastModifier?.actorId).toBe('human:third');
  });
});

describe('4.2. extractContributors (EARS-N1 a N4)', () => {
  it('[EARS-N1] should extract unique contributor keyIds', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob', 'human:charlie']);

    const contributors = extractContributors(record);

    expect(contributors).toHaveLength(3);
    expect(contributors).toContain('human:alice');
    expect(contributors).toContain('human:bob');
    expect(contributors).toContain('human:charlie');
  });

  it('[EARS-N2] should deduplicate repeated contributors', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob', 'human:alice', 'human:bob']);

    const contributors = extractContributors(record);

    expect(contributors).toHaveLength(2);
    expect(contributors).toContain('human:alice');
    expect(contributors).toContain('human:bob');
  });

  it('[EARS-N3] should return empty array for no signatures', async () => {
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

  it('[EARS-N4] should handle single contributor', async () => {
    const record = await createValidTaskRecord(['human:solo']);

    const contributors = extractContributors(record);

    expect(contributors).toEqual(['human:solo']);
  });
});

describe('4.2. extractLastSignatureTimestamp (EARS-O1 a O3)', () => {
  it('[EARS-O1] should return timestamp of last signature', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:bob']);

    const timestamp = extractLastSignatureTimestamp(record);

    expect(timestamp).toBeGreaterThan(0);
  });

  it('[EARS-O2] should return undefined for no signatures', async () => {
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

  it('[EARS-O3] should return same timestamp as author for single signature', async () => {
    const record = await createValidTaskRecord(['human:alice']);

    const timestamp = extractLastSignatureTimestamp(record);
    const author = extractAuthor(record);

    expect(timestamp).toBe(author?.timestamp);
  });
});

describe('4.2. getSignatureCount (EARS-P1 a P4)', () => {
  it('[EARS-P1] should return correct signature count', async () => {
    const record = await createValidTaskRecord(['human:a', 'human:b', 'human:c']);

    const count = getSignatureCount(record);

    expect(count).toBe(3);
  });

  it('[EARS-P2] should return 0 for no signatures', async () => {
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

  it('[EARS-P3] should return 1 for single signature', async () => {
    const record = await createValidTaskRecord(['human:solo']);

    const count = getSignatureCount(record);

    expect(count).toBe(1);
  });

  it('[EARS-P4] should count all signatures including duplicates', async () => {
    const record = await createValidTaskRecord(['human:alice', 'human:alice', 'human:alice']);

    const count = getSignatureCount(record);

    expect(count).toBe(3);
  });
});

describe('4.2. Integration (EARS-Q1 a Q2)', () => {
  it('[EARS-Q1] should work together for typical task workflow', async () => {
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

  it('[EARS-Q2] should handle corrupted/legacy records gracefully', async () => {
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
