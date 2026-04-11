/**
 * PrismaKeyProvider v2 — 26 EARS (PKP-A1 to G10)
 * Blueprint: prisma_key_provider_module.md (Cycle 2, identity_key_sync)
 *
 * | EARS ID  | Section | Test Case                                                                            |
 * |----------|---------|--------------------------------------------------------------------------------------|
 * | PKP-A1   | 4.1     | should return decrypted private key when active row exists                           |
 * | PKP-A2   | 4.1     | should return null when no active key exists                                         |
 * | PKP-A3   | 4.1     | should derive public key and delegate to storeKey                                    |
 * | PKP-A4   | 4.1     | should archive active key and return true, false if none                             |
 * | PKP-B1   | 4.2     | should not return key from different orgId                                           |
 * | PKP-B2   | 4.2     | should store independent keys for same actorId across orgs                           |
 * | PKP-C1   | 4.3     | should return true or false without reading key content                              |
 * | PKP-D1   | 4.4     | should decrypt stored key, sign with Ed25519, and return signature                   |
 * | PKP-D2   | 4.4     | should throw KEY_NOT_FOUND when signing with no active key                           |
 * | PKP-E1   | 4.5     | should enforce one active key per [actorId, orgId]                                   |
 * | PKP-E2   | 4.5     | should store iv and authTag as separate hex columns                                  |
 * | PKP-E3   | 4.5     | should have status field with active|archived|revoked default active                |
 * | PKP-F1   | 4.6     | should encrypt a random org key with HKDF-derived key and persist as hex             |
 * | PKP-F1   | 4.6     | should produce non-deterministic ciphertext (random IV per call)                     |
 * | PKP-F1   | 4.6     | should throw KeyProviderError STORE_FAILED when MASTER_KEY is missing                |
 * | PKP-F2   | 4.6     | should lazy-load OrgEncryptionKey and cache plaintext in-instance                    |
 * | PKP-F3   | 4.6     | should encrypt ActorKey with org key, never with MASTER_KEY directly                 |
 * | PKP-F4   | 4.6     | should re-encrypt all active actor keys when org key is rotated                      |
 * | PKP-G1   | 4.7     | should encrypt private key with AES-256-GCM and random IV                            |
 * | PKP-G2   | 4.7     | should archive old active row and create new one in a transaction                    |
 * | PKP-G3   | 4.7     | should set lastUsedAt on the new active row                                          |
 * | PKP-G4   | 4.7     | should throw STORE_FAILED when DB or encryption fails                                |
 * | PKP-G5   | 4.7     | should return public key without touching org key or decryption                      |
 * | PKP-G6   | 4.7     | should return null when no active key exists                                         |
 * | PKP-G7   | 4.7     | should set status to archived and record lastUsedAt                                  |
 * | PKP-G8   | 4.7     | should be a no-op when no active key exists                                          |
 * | PKP-G9   | 4.7     | should throw DECRYPTION_FAILED when AES-GCM decryption fails                         |
 * | PKP-G10  | 4.7     | should ignore archived rows in getPrivateKey/sign/getPublicKey                       |
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  verify as cryptoVerify,
} from 'node:crypto';
import {
  PrismaKeyProvider,
  createOrgEncryptionKey,
  rotateOrgEncryptionKey,
} from './prisma_key_provider';
import { KeyProviderError } from '../key_provider';
import type {
  ActorKeyRow,
  ActorKeyStatus,
  ActorKeyDelegate,
  OrgEncryptionKeyRow,
  OrgEncryptionKeyDelegate,
  PrismaClientLike,
} from './prisma_key_provider.types';
import { generateKeys, deriveHkdfKey } from '../../crypto/signatures';

/**
 * Type guard that narrows `string` to `ActorKeyStatus`. The Prisma delegate
 * contract types status fields as `string` (because Prisma's runtime returns
 * plain strings from a `String` schema column), but `ActorKeyRow` narrows
 * it to the union. This guard bridges the two when the mock factory builds
 * a row from `create.data.status`.
 */
function isActorKeyStatus(value: string): value is ActorKeyStatus {
  return value === 'active' || value === 'archived' || value === 'revoked';
}

// ============================================================================
// Test fixtures
// ============================================================================

/**
 * Test MASTER_KEY — 32 bytes of test data, base64. NEVER use in production.
 * Hardcoded for hermeticity; each test that uses it restores the original
 * env var in afterEach.
 */
const TEST_MASTER_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA='; // 32 '0' bytes

/** HKDF info binding — must match the constant in prisma_key_provider.ts */
const MASTER_KEY_HKDF_INFO = 'gitgov-org-key';

/** AES-GCM constants — must match prisma_key_provider.ts */
const AES_GCM_ALGORITHM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12;
const KEY_LENGTH_BYTES = 32;

/** Status literals — must match prisma_key_provider.ts */
const STATUS_ACTIVE = 'active';
const STATUS_ARCHIVED = 'archived';

// ============================================================================
// Mock factories (fully typed — ZERO any)
// ============================================================================

/**
 * In-memory mock of `OrgEncryptionKeyDelegate` with enforced unique constraint
 * on `orgId`. Used by `createOrgEncryptionKey` + `PrismaKeyProvider.getOrgKey`.
 */
function createMockOrgEncryptionKeyDelegate(): {
  delegate: OrgEncryptionKeyDelegate;
  rows: Map<string, OrgEncryptionKeyRow>;
} {
  const rows = new Map<string, OrgEncryptionKeyRow>();

  const delegate: OrgEncryptionKeyDelegate = {
    findUnique: jest.fn(async (args: { where: { orgId: string } }) => {
      return rows.get(args.where.orgId) ?? null;
    }),
    create: jest.fn(
      async (args: {
        data: { orgId: string; encryptedOrgKey: string; iv: string; authTag: string };
      }) => {
        if (rows.has(args.data.orgId)) {
          const err = new Error('Unique constraint failed on orgId') as Error & {
            code: string;
          };
          err.code = 'P2002';
          throw err;
        }
        const row: OrgEncryptionKeyRow = {
          id: `oek-${rows.size + 1}`,
          orgId: args.data.orgId,
          encryptedOrgKey: args.data.encryptedOrgKey,
          iv: args.data.iv,
          authTag: args.data.authTag,
          createdAt: new Date(),
          rotatedAt: new Date(),
        };
        rows.set(args.data.orgId, row);
        return row;
      },
    ),
    update: jest.fn(
      async (args: {
        where: { orgId: string };
        data: {
          encryptedOrgKey?: string;
          iv?: string;
          authTag?: string;
          rotatedAt?: Date;
        };
      }) => {
        const existing = rows.get(args.where.orgId);
        if (!existing) {
          const err = new Error('Record not found') as Error & { code: string };
          err.code = 'P2025';
          throw err;
        }
        const updated: OrgEncryptionKeyRow = {
          ...existing,
          ...(args.data.encryptedOrgKey !== undefined && {
            encryptedOrgKey: args.data.encryptedOrgKey,
          }),
          ...(args.data.iv !== undefined && { iv: args.data.iv }),
          ...(args.data.authTag !== undefined && { authTag: args.data.authTag }),
          ...(args.data.rotatedAt !== undefined && { rotatedAt: args.data.rotatedAt }),
        };
        rows.set(args.where.orgId, updated);
        return updated;
      },
    ),
  };

  return { delegate, rows };
}

/**
 * In-memory mock of `ActorKeyDelegate` v2 with unique constraint enforcement
 * on `[actorId, orgId, status]`.
 */
function createMockActorKeyDelegate(): {
  delegate: ActorKeyDelegate;
  rows: ActorKeyRow[];
} {
  const rows: ActorKeyRow[] = [];
  let idCounter = 0;

  const delegate: ActorKeyDelegate = {
    findFirst: jest.fn(
      async (args: { where: { actorId: string; orgId: string; status: string } }) => {
        return (
          rows.find(
            (r) =>
              r.actorId === args.where.actorId &&
              r.orgId === args.where.orgId &&
              r.status === args.where.status,
          ) ?? null
        );
      },
    ),
    findMany: jest.fn(
      async (args: { where: { orgId: string; status: string } }) => {
        return rows.filter(
          (r) => r.orgId === args.where.orgId && r.status === args.where.status,
        );
      },
    ),
    count: jest.fn(
      async (args: { where: { actorId: string; orgId: string; status: string } }) => {
        return rows.filter(
          (r) =>
            r.actorId === args.where.actorId &&
            r.orgId === args.where.orgId &&
            r.status === args.where.status,
        ).length;
      },
    ),
    create: jest.fn(
      async (args: {
        data: {
          actorId: string;
          orgId: string;
          publicKey: string;
          encryptedPrivateKey: string;
          iv: string;
          authTag: string;
          status: string;
          lastUsedAt: Date;
        };
      }) => {
        // [PKP-E1] enforce unique [actorId, orgId, status]
        const collision = rows.find(
          (r) =>
            r.actorId === args.data.actorId &&
            r.orgId === args.data.orgId &&
            r.status === args.data.status,
        );
        if (collision) {
          const err = new Error(
            'Unique constraint failed on [actorId, orgId, status]',
          ) as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        idCounter += 1;
        // Narrow status from the delegate's `string` arg to the stricter
        // ActorKeyStatus literal union. Runtime-validated below.
        if (!isActorKeyStatus(args.data.status)) {
          throw new Error(
            `Invalid ActorKey.status: "${args.data.status}" (expected 'active' | 'archived' | 'revoked')`,
          );
        }
        const row: ActorKeyRow = {
          id: `ak-${idCounter}`,
          actorId: args.data.actorId,
          orgId: args.data.orgId,
          publicKey: args.data.publicKey,
          encryptedPrivateKey: args.data.encryptedPrivateKey,
          iv: args.data.iv,
          authTag: args.data.authTag,
          status: args.data.status,
          lastUsedAt: args.data.lastUsedAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.push(row);
        return row;
      },
    ),
    updateMany: jest.fn(
      async (args: {
        where: { actorId: string; orgId: string; status: string };
        data: { status?: string; lastUsedAt?: Date };
      }) => {
        const matches = rows.filter(
          (r) =>
            r.actorId === args.where.actorId &&
            r.orgId === args.where.orgId &&
            r.status === args.where.status,
        );
        for (const row of matches) {
          if (args.data.status !== undefined) {
            if (!isActorKeyStatus(args.data.status)) {
              throw new Error(
                `Invalid ActorKey.status: "${args.data.status}" (expected 'active' | 'archived' | 'revoked')`,
              );
            }
            row.status = args.data.status;
          }
          if (args.data.lastUsedAt !== undefined) row.lastUsedAt = args.data.lastUsedAt;
          row.updatedAt = new Date();
        }
        return { count: matches.length };
      },
    ),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: {
          encryptedPrivateKey?: string;
          iv?: string;
          authTag?: string;
          lastUsedAt?: Date;
        };
      }) => {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) {
          const err = new Error('Record not found') as Error & { code: string };
          err.code = 'P2025';
          throw err;
        }
        if (args.data.encryptedPrivateKey !== undefined)
          row.encryptedPrivateKey = args.data.encryptedPrivateKey;
        if (args.data.iv !== undefined) row.iv = args.data.iv;
        if (args.data.authTag !== undefined) row.authTag = args.data.authTag;
        if (args.data.lastUsedAt !== undefined) row.lastUsedAt = args.data.lastUsedAt;
        row.updatedAt = new Date();
        return row;
      },
    ),
  };

  return { delegate, rows };
}

/**
 * Builds a full `PrismaClientLike` mock with both delegates + a synchronous
 * `$transaction` that passes the same delegates to the callback. Suitable for
 * unit tests — mimics transactional semantics in-memory (all-or-nothing is
 * not enforced because there's nothing to roll back, but the callback API
 * matches the real Prisma contract).
 */
function createMockPrismaClient(): {
  client: PrismaClientLike;
  orgKeyRows: Map<string, OrgEncryptionKeyRow>;
  actorKeyRows: ActorKeyRow[];
} {
  const { delegate: orgEncryptionKey, rows: orgKeyRows } =
    createMockOrgEncryptionKeyDelegate();
  const { delegate: actorKey, rows: actorKeyRows } = createMockActorKeyDelegate();

  const client: PrismaClientLike = {
    orgEncryptionKey,
    actorKey,
    $transaction: jest.fn(
      async <T>(
        fn: (tx: {
          orgEncryptionKey: OrgEncryptionKeyDelegate;
          actorKey: ActorKeyDelegate;
        }) => Promise<T>,
      ): Promise<T> => {
        // Simplified mock: just call fn with the same delegates
        // Real Prisma would open a DB transaction, but for unit tests the
        // atomicity guarantees come from the in-memory mock's single-threaded
        // execution.
        return fn({ orgEncryptionKey, actorKey });
      },
    ),
  };

  return { client, orgKeyRows, actorKeyRows };
}

/**
 * Helper: bootstraps MASTER_KEY + OrgEncryptionKey row in the mock + an
 * optional pre-seeded ActorKey row.
 *
 * Returns the provider instance scoped to `orgId`, plus the mock rows for
 * inspection.
 */
async function bootstrapProvider(
  orgId: string,
): Promise<{
  provider: PrismaKeyProvider;
  client: PrismaClientLike;
  orgKeyRows: Map<string, OrgEncryptionKeyRow>;
  actorKeyRows: ActorKeyRow[];
}> {
  const { client, orgKeyRows, actorKeyRows } = createMockPrismaClient();
  process.env['MASTER_KEY'] = TEST_MASTER_KEY;
  await createOrgEncryptionKey(client, orgId);
  const provider = new PrismaKeyProvider(client, orgId);
  return { provider, client, orgKeyRows, actorKeyRows };
}

// ============================================================================
// Tests
// ============================================================================

describe('PrismaKeyProvider v2', () => {
  const originalMasterKey = process.env['MASTER_KEY'];

  afterEach(() => {
    if (originalMasterKey === undefined) {
      delete process.env['MASTER_KEY'];
    } else {
      process.env['MASTER_KEY'] = originalMasterKey;
    }
  });

  // ==========================================================================
  // 4.1. Key CRUD by Org (PKP-A1 to A4)
  // ==========================================================================

  describe('4.1. Key CRUD by Org (PKP-A1 to A4)', () => {
    it('[PKP-A1] should return decrypted private key when active row exists', async () => {
      const { provider } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      await provider.storeKey('human:alice', { publicKey, privateKey });

      const retrieved = await provider.getPrivateKey('human:alice');
      expect(retrieved).toBe(privateKey);
    });

    it('[PKP-A2] should return null when no active key exists', async () => {
      const { provider } = await bootstrapProvider('org-1');

      const result = await provider.getPrivateKey('human:ghost');

      expect(result).toBeNull();
    });

    it('[PKP-A3] should derive public key and delegate to storeKey', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      await provider.setPrivateKey('human:alice', privateKey);

      // Verify: one active row exists with the *derived* public key
      // (same as generateKeys returned, since derivation is deterministic)
      expect(actorKeyRows).toHaveLength(1);
      expect(actorKeyRows[0]).toBeDefined();
      const row = actorKeyRows[0];
      if (!row) throw new Error('unreachable');
      expect(row.actorId).toBe('human:alice');
      expect(row.orgId).toBe('org-1');
      expect(row.status).toBe(STATUS_ACTIVE);
      expect(row.publicKey).toBe(publicKey); // derived === generated
      // Round-trip: the private key can be recovered
      expect(await provider.getPrivateKey('human:alice')).toBe(privateKey);
    });

    it('[PKP-A4] should archive active key and return true, false if none', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      // First delete: active row existed → true
      const result1 = await provider.deletePrivateKey('human:alice');
      expect(result1).toBe(true);

      // Row is ARCHIVED, not hard-deleted
      expect(actorKeyRows).toHaveLength(1);
      expect(actorKeyRows[0]?.status).toBe(STATUS_ARCHIVED);

      // Second delete: no active row → false
      const result2 = await provider.deletePrivateKey('human:alice');
      expect(result2).toBe(false);
    });
  });

  // ==========================================================================
  // 4.2. Org-Level Isolation (PKP-B1 to B2)
  // ==========================================================================

  describe('4.2. Org-Level Isolation (PKP-B1 to B2)', () => {
    it('[PKP-B1] should not return key from different orgId', async () => {
      const { client, orgKeyRows: orgKeysA } = createMockPrismaClient();
      process.env['MASTER_KEY'] = TEST_MASTER_KEY;
      await createOrgEncryptionKey(client, 'org-a');
      await createOrgEncryptionKey(client, 'org-b');

      const providerA = new PrismaKeyProvider(client, 'org-a');
      const providerB = new PrismaKeyProvider(client, 'org-b');
      const { privateKey, publicKey } = await generateKeys();

      await providerA.storeKey('human:alice', { publicKey, privateKey });

      // Same actorId, different org → must NOT be visible
      expect(await providerB.getPrivateKey('human:alice')).toBeNull();
      expect(await providerB.hasPrivateKey('human:alice')).toBe(false);
      // OrgEncryptionKey rows confirm both orgs were bootstrapped
      expect(orgKeysA.size).toBe(2);
    });

    it('[PKP-B2] should store independent keys for same actorId across orgs', async () => {
      const { client } = createMockPrismaClient();
      process.env['MASTER_KEY'] = TEST_MASTER_KEY;
      await createOrgEncryptionKey(client, 'org-a');
      await createOrgEncryptionKey(client, 'org-b');

      const providerA = new PrismaKeyProvider(client, 'org-a');
      const providerB = new PrismaKeyProvider(client, 'org-b');
      const keysA = await generateKeys();
      const keysB = await generateKeys();

      await providerA.storeKey('human:alice', keysA);
      await providerB.storeKey('human:alice', keysB);

      expect(await providerA.getPrivateKey('human:alice')).toBe(keysA.privateKey);
      expect(await providerB.getPrivateKey('human:alice')).toBe(keysB.privateKey);
      expect(keysA.privateKey).not.toBe(keysB.privateKey);
    });
  });

  // ==========================================================================
  // 4.3. hasPrivateKey (PKP-C1)
  // ==========================================================================

  describe('4.3. hasPrivateKey (PKP-C1)', () => {
    it('[PKP-C1] should return true or false without reading key content', async () => {
      const { provider, client } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      expect(await provider.hasPrivateKey('human:alice')).toBe(false);
      await provider.storeKey('human:alice', { publicKey, privateKey });
      expect(await provider.hasPrivateKey('human:alice')).toBe(true);

      // Verify: count() was used, not findFirst (count doesn't read content)
      expect(client.actorKey.count).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4.4. Signing (PKP-D1 to D2)
  // ==========================================================================

  describe('4.4. Signing (PKP-D1 to D2)', () => {
    it('[PKP-D1] should decrypt stored key, sign with Ed25519, and return signature', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      const data = new Uint8Array(Buffer.from('test-payload-for-signing', 'utf-8'));
      const signature = await provider.sign('human:alice', data);

      // Ed25519 signatures are 64 bytes
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      // Verify cryptographically: reconstruct SPKI DER from raw public key
      const algorithmId = Buffer.from([
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
      ]);
      const spki = Buffer.concat([algorithmId, Buffer.from(publicKey, 'base64')]);
      const isValid = cryptoVerify(
        null,
        data,
        { key: spki, type: 'spki', format: 'der' },
        Buffer.from(signature),
      );
      expect(isValid).toBe(true);

      // Side effect: lastUsedAt was updated on the active row.
      // (Non-blocking fire-and-forget update — flush microtasks to observe.)
      await new Promise((resolve) => setImmediate(resolve));
      const row = actorKeyRows.find(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ACTIVE,
      );
      expect(row).toBeDefined();
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
    });

    it('[PKP-D2] should throw KEY_NOT_FOUND when signing with no active key', async () => {
      const { provider } = await bootstrapProvider('org-1');

      const data = new Uint8Array(Buffer.from('test', 'utf-8'));

      await expect(provider.sign('human:nonexistent', data)).rejects.toBeInstanceOf(
        KeyProviderError,
      );
      await expect(provider.sign('human:nonexistent', data)).rejects.toMatchObject({
        code: 'KEY_NOT_FOUND',
        context: expect.objectContaining({
          actorId: 'human:nonexistent',
          orgId: 'org-1',
        }),
      });
    });
  });

  // ==========================================================================
  // 4.5. Schema Migration invariants (PKP-E1 to E3)
  //
  // PKP-E4 (migration populates orgId from Repository.organizationId) is a
  // DDL-level concern validated by running the Prisma migration against a
  // real DB — covered by integration tests in packages/e2e/, not here.
  // ==========================================================================

  describe('4.5. Schema Migration invariants (PKP-E1 to E3)', () => {
    it('[PKP-E1] should enforce one active key per [actorId, orgId]', async () => {
      // The mock ActorKeyDelegate enforces the unique constraint defined in
      // the spec §3.3 schema: @@unique([actorId, orgId, status])
      const { provider, client, actorKeyRows } = await bootstrapProvider('org-1');
      const keys1 = await generateKeys();
      const keys2 = await generateKeys();

      await provider.storeKey('human:alice', keys1);
      // Second storeKey: must archive the first one BEFORE creating the second,
      // otherwise the unique constraint blocks the insert.
      await provider.storeKey('human:alice', keys2);

      const activeRows = actorKeyRows.filter(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ACTIVE,
      );
      const archivedRows = actorKeyRows.filter(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ARCHIVED,
      );

      // Exactly one active row at any time
      expect(activeRows).toHaveLength(1);
      expect(archivedRows).toHaveLength(1);
      // Old row is still queryable for audit (not hard-deleted)
      expect(actorKeyRows).toHaveLength(2);
      // The transactional archive+create path was used
      expect(client.$transaction).toHaveBeenCalled();
    });

    it('[PKP-E2] should store iv and authTag as separate hex columns', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      await provider.storeKey('human:alice', { publicKey, privateKey });

      const row = actorKeyRows[0];
      if (!row) throw new Error('row missing');

      // iv: 12 bytes = 24 hex chars
      expect(row.iv).toMatch(/^[0-9a-f]{24}$/);
      // authTag: 16 bytes = 32 hex chars
      expect(row.authTag).toMatch(/^[0-9a-f]{32}$/);
      // encryptedPrivateKey: hex, non-empty, distinct from iv/authTag (separate columns)
      expect(row.encryptedPrivateKey).toMatch(/^[0-9a-f]+$/);
      expect(row.encryptedPrivateKey).not.toBe(row.iv);
      expect(row.encryptedPrivateKey).not.toBe(row.authTag);
    });

    it('[PKP-E3] should have status field with active|archived|revoked default active', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      await provider.storeKey('human:alice', { publicKey, privateKey });

      const row = actorKeyRows[0];
      if (!row) throw new Error('row missing');
      // Default for a freshly-created row is 'active' (spec §3.3)
      expect(row.status).toBe(STATUS_ACTIVE);

      // Archiving transitions to 'archived' — documents the allowed state
      // transition from `active` to `archived`. The third literal `revoked`
      // is a valid target for future revocation flows (not exercised here).
      await provider.archiveKey('human:alice');
      expect(row.status).toBe(STATUS_ARCHIVED);
    });
  });

  // ==========================================================================
  // 4.6. Org Key Hierarchy (PKP-F1 to F4)
  // ==========================================================================

  describe('4.6. Org Key Hierarchy (PKP-F1 to F4)', () => {
    it('[PKP-F1] should encrypt a random org key with HKDF-derived key and persist as hex', async () => {
      process.env['MASTER_KEY'] = TEST_MASTER_KEY;
      const { client, orgKeyRows } = createMockPrismaClient();

      await createOrgEncryptionKey(client, 'org-test-f1');

      expect(client.orgEncryptionKey.create).toHaveBeenCalledTimes(1);
      const row = orgKeyRows.get('org-test-f1');
      expect(row).toBeDefined();
      if (!row) throw new Error('row missing');

      expect(row.iv).toMatch(/^[0-9a-f]{24}$/); // 12 bytes
      expect(row.authTag).toMatch(/^[0-9a-f]{32}$/); // 16 bytes
      // AES-GCM is a stream cipher: ciphertext length === plaintext length.
      // Plaintext is the 32-byte random org key.
      expect(row.encryptedOrgKey).toMatch(/^[0-9a-f]{64}$/);

      // Round-trip: the caller should be able to decrypt with the same HKDF
      // derivation and recover a 32-byte plaintext.
      const wrappingKey = await deriveHkdfKey(
        TEST_MASTER_KEY,
        MASTER_KEY_HKDF_INFO,
        KEY_LENGTH_BYTES,
      );
      const iv = Buffer.from(row.iv, 'hex');
      const authTag = Buffer.from(row.authTag, 'hex');
      const ciphertext = Buffer.from(row.encryptedOrgKey, 'hex');
      const decipher = createDecipheriv(AES_GCM_ALGORITHM, wrappingKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      expect(decrypted.length).toBe(KEY_LENGTH_BYTES);
    });

    it('[PKP-F1] should produce non-deterministic ciphertext (random IV per call)', async () => {
      process.env['MASTER_KEY'] = TEST_MASTER_KEY;
      const { client: clientA, orgKeyRows: rowsA } = createMockPrismaClient();
      const { client: clientB, orgKeyRows: rowsB } = createMockPrismaClient();

      await createOrgEncryptionKey(clientA, 'org-a');
      await createOrgEncryptionKey(clientB, 'org-b');

      const rowA = rowsA.get('org-a');
      const rowB = rowsB.get('org-b');
      if (!rowA || !rowB) throw new Error('rows missing');

      expect(rowA.iv).not.toBe(rowB.iv);
      expect(rowA.encryptedOrgKey).not.toBe(rowB.encryptedOrgKey);
      expect(rowA.authTag).not.toBe(rowB.authTag);
    });

    it('[PKP-F1] should throw KeyProviderError STORE_FAILED when MASTER_KEY is missing', async () => {
      delete process.env['MASTER_KEY'];
      const { client } = createMockPrismaClient();

      await expect(createOrgEncryptionKey(client, 'org-f1-missing')).rejects.toBeInstanceOf(
        KeyProviderError,
      );
      await expect(createOrgEncryptionKey(client, 'org-f1-missing')).rejects.toMatchObject({
        code: 'STORE_FAILED',
        context: expect.objectContaining({
          orgId: 'org-f1-missing',
          hint: expect.stringContaining('MASTER_KEY'),
        }),
      });

      expect(client.orgEncryptionKey.create).not.toHaveBeenCalled();
    });

    it('[PKP-F2] should lazy-load OrgEncryptionKey and cache plaintext in-instance', async () => {
      const { provider, client } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      // First call: triggers lazy-load of org key
      await provider.storeKey('human:alice', { publicKey, privateKey });
      const firstCallCount = (client.orgEncryptionKey.findUnique as jest.Mock).mock.calls
        .length;
      expect(firstCallCount).toBeGreaterThanOrEqual(1);

      // Second and third calls: should NOT re-fetch OrgEncryptionKey (cache hit)
      await provider.getPrivateKey('human:alice');
      await provider.storeKey('human:bob', {
        publicKey: (await generateKeys()).publicKey,
        privateKey: (await generateKeys()).privateKey,
      });

      const finalCallCount = (client.orgEncryptionKey.findUnique as jest.Mock).mock.calls
        .length;
      // Cache hit: count didn't increase on subsequent operations
      expect(finalCallCount).toBe(firstCallCount);
    });

    it('[PKP-F3] should encrypt ActorKey with org key, never with MASTER_KEY directly', async () => {
      // Structural invariant: if we bypass the org_key (by storing ActorKey
      // with a MASTER_KEY-derived ciphertext), decryption via PrismaKeyProvider
      // must FAIL because the provider expects the org_key wrapping.
      //
      // This test validates PKP-F3 by the contrapositive: using MASTER_KEY
      // directly to encrypt an actor key produces ciphertext that the
      // provider cannot decrypt — proving the provider uses org_key, not
      // MASTER_KEY.
      const { provider, client, orgKeyRows, actorKeyRows } = await bootstrapProvider(
        'org-1',
      );
      const { privateKey, publicKey } = await generateKeys();

      // Manually insert a row encrypted with MASTER_KEY-derived key (WRONG)
      const masterDerived = await deriveHkdfKey(
        TEST_MASTER_KEY,
        MASTER_KEY_HKDF_INFO,
        KEY_LENGTH_BYTES,
      );
      const iv = randomBytes(GCM_IV_LENGTH);
      const cipher = createCipheriv(AES_GCM_ALGORITHM, masterDerived, iv);
      const ct = Buffer.concat([
        cipher.update(Buffer.from(privateKey, 'utf-8')),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      await client.actorKey.create({
        data: {
          actorId: 'human:wrong',
          orgId: 'org-1',
          publicKey,
          encryptedPrivateKey: ct.toString('hex'),
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex'),
          status: STATUS_ACTIVE,
          lastUsedAt: new Date(),
        },
      });

      // Attempt to decrypt via provider (which uses org_key, not MASTER_KEY-derived)
      await expect(provider.getPrivateKey('human:wrong')).rejects.toBeInstanceOf(
        KeyProviderError,
      );
      await expect(provider.getPrivateKey('human:wrong')).rejects.toMatchObject({
        code: 'DECRYPTION_FAILED',
      });

      // Sanity: the org_key and the master-derived key are DIFFERENT buffers
      const orgRow = orgKeyRows.get('org-1');
      if (!orgRow) throw new Error('org row missing');
      const orgIv = Buffer.from(orgRow.iv, 'hex');
      const orgAuthTag = Buffer.from(orgRow.authTag, 'hex');
      const orgCipher = Buffer.from(orgRow.encryptedOrgKey, 'hex');
      const dec = createDecipheriv(AES_GCM_ALGORITHM, masterDerived, orgIv);
      dec.setAuthTag(orgAuthTag);
      const actualOrgKey = Buffer.concat([dec.update(orgCipher), dec.final()]);
      expect(actualOrgKey.equals(masterDerived)).toBe(false);

      // Clean up the wrong row
      expect(actorKeyRows).toHaveLength(1);
    });

    it('[PKP-F4] should re-encrypt all active actor keys when org key is rotated', async () => {
      const { provider, client, orgKeyRows, actorKeyRows } = await bootstrapProvider(
        'org-1',
      );

      // Seed multiple actor keys
      const alice = await generateKeys();
      const bob = await generateKeys();
      await provider.storeKey('human:alice', alice);
      await provider.storeKey('human:bob', bob);

      // Capture old ciphertexts
      const aliceRowBefore = actorKeyRows.find(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ACTIVE,
      );
      const bobRowBefore = actorKeyRows.find(
        (r) => r.actorId === 'human:bob' && r.status === STATUS_ACTIVE,
      );
      if (!aliceRowBefore || !bobRowBefore) throw new Error('rows missing');
      const aliceOldCt = aliceRowBefore.encryptedPrivateKey;
      const bobOldCt = bobRowBefore.encryptedPrivateKey;
      const orgKeyBefore = orgKeyRows.get('org-1')?.encryptedOrgKey;

      // Rotate
      await rotateOrgEncryptionKey(client, 'org-1');

      // Org key row was updated
      const orgKeyAfter = orgKeyRows.get('org-1')?.encryptedOrgKey;
      expect(orgKeyAfter).not.toBe(orgKeyBefore);

      // Actor key ciphertexts changed (re-encrypted)
      const aliceRowAfter = actorKeyRows.find(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ACTIVE,
      );
      const bobRowAfter = actorKeyRows.find(
        (r) => r.actorId === 'human:bob' && r.status === STATUS_ACTIVE,
      );
      expect(aliceRowAfter?.encryptedPrivateKey).not.toBe(aliceOldCt);
      expect(bobRowAfter?.encryptedPrivateKey).not.toBe(bobOldCt);

      // After rotation, force the provider to reload the org key cache
      // and verify plaintext round-trip still works.
      const providerAfter = new PrismaKeyProvider(client, 'org-1');
      expect(await providerAfter.getPrivateKey('human:alice')).toBe(alice.privateKey);
      expect(await providerAfter.getPrivateKey('human:bob')).toBe(bob.privateKey);
    });
  });

  // ==========================================================================
  // 4.7. Key Lifecycle v2 — storeKey / archive / getPublicKey (PKP-G1 to G10)
  // ==========================================================================

  describe('4.7. Key Lifecycle v2 (PKP-G1 to G10)', () => {
    it('[PKP-G1] should encrypt private key with AES-256-GCM and random IV', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      await provider.storeKey('human:alice', { publicKey, privateKey });

      const row = actorKeyRows[0];
      if (!row) throw new Error('row missing');

      // IV: 12 bytes hex → 24 chars
      expect(row.iv).toMatch(/^[0-9a-f]{24}$/);
      // Store another actor — IV MUST be different (random per op)
      const bob = await generateKeys();
      await provider.storeKey('human:bob', bob);
      const bobRow = actorKeyRows.find(
        (r) => r.actorId === 'human:bob' && r.status === STATUS_ACTIVE,
      );
      if (!bobRow) throw new Error('bob row missing');
      expect(bobRow.iv).not.toBe(row.iv);
      // Ciphertexts differ (trivially from IV difference, even if plaintext collided)
      expect(bobRow.encryptedPrivateKey).not.toBe(row.encryptedPrivateKey);
    });

    it('[PKP-G2] should archive old active row and create new one in a transaction', async () => {
      const { provider, client, actorKeyRows } = await bootstrapProvider('org-1');
      const keys1 = await generateKeys();
      const keys2 = await generateKeys();

      await provider.storeKey('human:alice', keys1);
      await provider.storeKey('human:alice', keys2);

      // transaction was invoked for each storeKey call (2 total)
      expect(client.$transaction).toHaveBeenCalledTimes(2);

      // One active + one archived row for human:alice
      const aliceRows = actorKeyRows.filter((r) => r.actorId === 'human:alice');
      expect(aliceRows).toHaveLength(2);
      const activeCount = aliceRows.filter((r) => r.status === STATUS_ACTIVE).length;
      const archivedCount = aliceRows.filter((r) => r.status === STATUS_ARCHIVED).length;
      expect(activeCount).toBe(1);
      expect(archivedCount).toBe(1);

      // Active row has the newest keys
      expect(await provider.getPrivateKey('human:alice')).toBe(keys2.privateKey);
    });

    it('[PKP-G3] should set lastUsedAt on the new active row', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      const before = Date.now();

      await provider.storeKey('human:alice', { publicKey, privateKey });

      const row = actorKeyRows.find(
        (r) => r.actorId === 'human:alice' && r.status === STATUS_ACTIVE,
      );
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
      expect(row!.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('[PKP-G4] should throw STORE_FAILED when DB or encryption fails', async () => {
      const { provider, client } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();

      // Force the underlying transaction to throw persistently (not just once,
      // because the test asserts twice on the same rejection shape).
      (client.$transaction as jest.Mock).mockImplementation(async () => {
        throw new Error('DB connection lost');
      });

      // Capture the thrown error once, then assert its shape.
      let caught: unknown;
      try {
        await provider.storeKey('human:alice', { publicKey, privateKey });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(KeyProviderError);
      expect(caught).toMatchObject({
        code: 'STORE_FAILED',
        context: expect.objectContaining({
          actorId: 'human:alice',
          orgId: 'org-1',
        }),
      });
    });

    it('[PKP-G5] should return public key without touching org key or decryption', async () => {
      const { provider, client } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      // Clear the cache to force a fresh lazy-load on next org_key access
      (provider as unknown as { _clearOrgKeyCacheForTesting(): void })._clearOrgKeyCacheForTesting();

      const orgKeyFetchesBefore = (client.orgEncryptionKey.findUnique as jest.Mock).mock
        .calls.length;

      const result = await provider.getPublicKey('human:alice');

      expect(result).toBe(publicKey);
      // getPublicKey MUST NOT fetch the OrgEncryptionKey row (no decryption)
      const orgKeyFetchesAfter = (client.orgEncryptionKey.findUnique as jest.Mock).mock
        .calls.length;
      expect(orgKeyFetchesAfter).toBe(orgKeyFetchesBefore);
    });

    it('[PKP-G6] should return null when no active key exists', async () => {
      const { provider } = await bootstrapProvider('org-1');

      const result = await provider.getPublicKey('human:ghost');

      expect(result).toBeNull();
    });

    it('[PKP-G7] should set status to archived and record lastUsedAt', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      const beforeArchive = Date.now();
      await provider.archiveKey('human:alice');

      const row = actorKeyRows.find((r) => r.actorId === 'human:alice');
      expect(row?.status).toBe(STATUS_ARCHIVED);
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
      expect(row!.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(beforeArchive);
    });

    it('[PKP-G8] should be a no-op when no active key exists', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');

      // No throw, no side effect
      await expect(provider.archiveKey('human:ghost')).resolves.toBeUndefined();
      expect(actorKeyRows).toHaveLength(0);

      // Calling archiveKey twice is also a no-op the second time
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });
      await provider.archiveKey('human:alice');
      await expect(provider.archiveKey('human:alice')).resolves.toBeUndefined();

      // Still exactly 1 row (archived), no duplicates from the double archive
      expect(actorKeyRows).toHaveLength(1);
      expect(actorKeyRows[0]?.status).toBe(STATUS_ARCHIVED);
    });

    it('[PKP-G9] should throw DECRYPTION_FAILED when AES-GCM decryption fails', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      // Tamper the ciphertext directly in the mock
      const row = actorKeyRows[0];
      if (!row || !row.encryptedPrivateKey) throw new Error('row missing');
      // Flip last hex char to guarantee ciphertext is invalid
      const tampered = row.encryptedPrivateKey.slice(0, -2) + '00';
      row.encryptedPrivateKey = tampered;

      await expect(provider.getPrivateKey('human:alice')).rejects.toBeInstanceOf(
        KeyProviderError,
      );
      await expect(provider.getPrivateKey('human:alice')).rejects.toMatchObject({
        code: 'DECRYPTION_FAILED',
        context: expect.objectContaining({
          actorId: 'human:alice',
          orgId: 'org-1',
        }),
      });
    });

    it('[PKP-G10] should ignore archived rows in getPrivateKey/sign/getPublicKey', async () => {
      const { provider, actorKeyRows } = await bootstrapProvider('org-1');
      const { privateKey, publicKey } = await generateKeys();
      await provider.storeKey('human:alice', { publicKey, privateKey });

      // Archive the active row
      await provider.archiveKey('human:alice');

      // Archived row still exists in the table
      expect(actorKeyRows).toHaveLength(1);
      expect(actorKeyRows[0]?.status).toBe(STATUS_ARCHIVED);

      // But getPrivateKey/getPublicKey/hasPrivateKey all ignore it
      expect(await provider.getPrivateKey('human:alice')).toBeNull();
      expect(await provider.getPublicKey('human:alice')).toBeNull();
      expect(await provider.hasPrivateKey('human:alice')).toBe(false);

      // And sign throws KEY_NOT_FOUND
      const data = new Uint8Array(Buffer.from('test', 'utf-8'));
      await expect(provider.sign('human:alice', data)).rejects.toMatchObject({
        code: 'KEY_NOT_FOUND',
      });
    });
  });
});
