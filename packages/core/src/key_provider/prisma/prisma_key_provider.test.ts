/**
 * PrismaKeyProvider — 10 EARS (PKP-A1 to D1)
 * Blueprint: prisma_key_provider_module.md
 *
 * | EARS ID | Test Case                                                        | Section |
 * |---------|------------------------------------------------------------------|---------|
 * | PKP-A1  | should return decrypted private key when it exists               | 4.1     |
 * | PKP-A2  | should return null when key does not exist                       | 4.1     |
 * | PKP-A3  | should encrypt and upsert key by actorId and repoId             | 4.1     |
 * | PKP-A4  | should delete key and return true or false if not exists         | 4.1     |
 * | PKP-B1  | should not return key from different repoId                     | 4.2     |
 * | PKP-B2  | should store independent keys for same actorId across repos     | 4.2     |
 * | PKP-C1  | should encrypt key before storing and decrypt on read            | 4.3     |
 * | PKP-C2  | should store key in plaintext when no encryptionSecret           | 4.3     |
 * | PKP-C3  | should throw KEY_READ_ERROR when decryption fails               | 4.3     |
 * | PKP-D1  | should return true or false without reading key content          | 4.4     |
 * | PKP-E1  | should sign data with decrypted key and throw KEY_NOT_FOUND     | 4.5     |
 */

import { verify, createHash } from 'crypto';
import { PrismaKeyProvider } from './prisma_key_provider';
import { KeyProviderError } from '../key_provider';
import type { ActorKeyRow, ActorKeyDelegate } from './prisma_key_provider.types';
import { generateKeys } from '../../crypto/signatures';

// ============================================================================
// Mock factory
// ============================================================================

function createMockPrisma() {
  const store = new Map<string, ActorKeyRow>();

  const actorKey: ActorKeyDelegate = {
    findUnique: jest.fn().mockImplementation(async (args) => {
      const { actorId, repoId } = args.where.actorId_repoId;
      return store.get(`${actorId}:${repoId}`) ?? null;
    }),
    upsert: jest.fn().mockImplementation(async (args) => {
      const { actorId, repoId } = args.where.actorId_repoId;
      const key = `${actorId}:${repoId}`;
      const existing = store.get(key);
      const row: ActorKeyRow = existing
        ? { ...existing, encryptedKey: args.update.encryptedKey, updatedAt: new Date() }
        : { id: `id-${Date.now()}`, actorId, repoId, encryptedKey: args.create.encryptedKey, createdAt: new Date(), updatedAt: new Date() };
      store.set(key, row);
      return row;
    }),
    delete: jest.fn().mockImplementation(async (args) => {
      const { actorId, repoId } = args.where.actorId_repoId;
      const key = `${actorId}:${repoId}`;
      if (!store.has(key)) {
        const err = new Error('Record not found') as Error & { code: string };
        err.code = 'P2025';
        throw err;
      }
      const row = store.get(key)!;
      store.delete(key);
      return row;
    }),
    count: jest.fn().mockImplementation(async (args) => {
      const { actorId, repoId } = args.where;
      return store.has(`${actorId}:${repoId}`) ? 1 : 0;
    }),
  };

  return { prisma: { actorKey }, store };
}

const TEST_SECRET = 'test-encryption-secret-32-bytes!';
const TEST_KEY = 'dGVzdC1wcml2YXRlLWtleS1iYXNlNjQ='; // base64 "test-private-key-base64"

// ============================================================================
// Tests
// ============================================================================

describe('PrismaKeyProvider', () => {
  // ==========================================
  // 4.1. Key CRUD (PKP-A1 to A4)
  // ==========================================

  describe('4.1. Key CRUD (PKP-A1 to A4)', () => {
    it('[PKP-A1] should return decrypted private key when it exists', async () => {
      const { prisma } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      await provider.setPrivateKey('human:alice', TEST_KEY);
      const result = await provider.getPrivateKey('human:alice');

      expect(result).toBe(TEST_KEY);
    });

    it('[PKP-A2] should return null when key does not exist', async () => {
      const { prisma } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      const result = await provider.getPrivateKey('human:nobody');

      expect(result).toBeNull();
    });

    it('[PKP-A3] should encrypt and upsert key by actorId and repoId', async () => {
      const { prisma } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      await provider.setPrivateKey('human:alice', TEST_KEY);

      expect(prisma.actorKey.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { actorId_repoId: { actorId: 'human:alice', repoId: 'repo-1' } },
          create: expect.objectContaining({ actorId: 'human:alice', repoId: 'repo-1' }),
        }),
      );

      // The stored value should NOT be the plaintext key (it's encrypted)
      const upsertCall = (prisma.actorKey.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertCall.create.encryptedKey).not.toBe(TEST_KEY);
    });

    it('[PKP-A4] should delete key and return true or false if not exists', async () => {
      const { prisma } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      await provider.setPrivateKey('human:alice', TEST_KEY);

      const deleted = await provider.deletePrivateKey('human:alice');
      expect(deleted).toBe(true);

      const deletedAgain = await provider.deletePrivateKey('human:alice');
      expect(deletedAgain).toBe(false);
    });
  });

  // ==========================================
  // 4.2. Multi-Tenant Isolation (PKP-B1 to B2)
  // ==========================================

  describe('4.2. Multi-Tenant Isolation (PKP-B1 to B2)', () => {
    it('[PKP-B1] should not return key from different repoId', async () => {
      const { prisma } = createMockPrisma();
      const providerA = new PrismaKeyProvider({ prisma, repoId: 'repo-A', encryptionSecret: TEST_SECRET });
      const providerB = new PrismaKeyProvider({ prisma, repoId: 'repo-B', encryptionSecret: TEST_SECRET });

      await providerA.setPrivateKey('human:alice', TEST_KEY);

      const result = await providerB.getPrivateKey('human:alice');
      expect(result).toBeNull();
    });

    it('[PKP-B2] should store independent keys for same actorId across repos', async () => {
      const { prisma } = createMockPrisma();
      const providerA = new PrismaKeyProvider({ prisma, repoId: 'repo-A', encryptionSecret: TEST_SECRET });
      const providerB = new PrismaKeyProvider({ prisma, repoId: 'repo-B', encryptionSecret: TEST_SECRET });

      const keyA = 'a2V5LWZvci1yZXBvLUE=';
      const keyB = 'a2V5LWZvci1yZXBvLUI=';

      await providerA.setPrivateKey('human:alice', keyA);
      await providerB.setPrivateKey('human:alice', keyB);

      expect(await providerA.getPrivateKey('human:alice')).toBe(keyA);
      expect(await providerB.getPrivateKey('human:alice')).toBe(keyB);
    });
  });

  // ==========================================
  // 4.3. Encryption (PKP-C1 to C3)
  // ==========================================

  describe('4.3. Encryption (PKP-C1 to C3)', () => {
    it('[PKP-C1] should encrypt key before storing and decrypt on read', async () => {
      const { prisma, store } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      await provider.setPrivateKey('human:alice', TEST_KEY);

      // The raw stored value should be encrypted (not plaintext)
      const raw = store.get('human:alice:repo-1');
      expect(raw).toBeDefined();
      expect(raw!.encryptedKey).not.toBe(TEST_KEY);
      expect(raw!.encryptedKey.length).toBeGreaterThan(TEST_KEY.length); // encrypted + IV + tag

      // But reading it back should return the original
      const decrypted = await provider.getPrivateKey('human:alice');
      expect(decrypted).toBe(TEST_KEY);
    });

    it('[PKP-C2] should store key in plaintext when no encryptionSecret', async () => {
      const { prisma, store } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1' }); // no secret

      await provider.setPrivateKey('human:alice', TEST_KEY);

      const raw = store.get('human:alice:repo-1');
      expect(raw!.encryptedKey).toBe(TEST_KEY); // plaintext!

      const result = await provider.getPrivateKey('human:alice');
      expect(result).toBe(TEST_KEY);
    });

    it('[PKP-C3] should throw KEY_READ_ERROR when decryption fails', async () => {
      const { prisma } = createMockPrisma();

      // Store with one secret
      const provider1 = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: 'secret-1-aaaaaa' });
      await provider1.setPrivateKey('human:alice', TEST_KEY);

      // Try to read with a different secret
      const provider2 = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: 'secret-2-bbbbbb' });

      let caught: unknown;
      try {
        await provider2.getPrivateKey('human:alice');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(KeyProviderError);
      expect((caught as KeyProviderError).code).toBe('KEY_READ_ERROR');
    });
  });

  // ==========================================
  // 4.4. hasPrivateKey (PKP-D1)
  // ==========================================

  describe('4.4. hasPrivateKey (PKP-D1)', () => {
    it('[PKP-D1] should return true or false without reading key content', async () => {
      const { prisma } = createMockPrisma();
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1', encryptionSecret: TEST_SECRET });

      expect(await provider.hasPrivateKey('human:alice')).toBe(false);

      await provider.setPrivateKey('human:alice', TEST_KEY);

      expect(await provider.hasPrivateKey('human:alice')).toBe(true);

      // Verify it used count, not findUnique (doesn't read content)
      expect(prisma.actorKey.count).toHaveBeenCalledWith({
        where: { actorId: 'human:alice', repoId: 'repo-1' },
      });
    });
  });

  // ==========================================
  // 4.5. Signing (PKP-E1)
  // ==========================================

  describe('4.5. Signing (PKP-E1)', () => {
    it('[PKP-E1] should sign data with decrypted key and throw KEY_NOT_FOUND when missing', async () => {
      const { prisma } = createMockPrisma();
      const { publicKey, privateKey } = await generateKeys();

      // Store real Ed25519 key (plaintext mode — no encryption secret for simplicity)
      const provider = new PrismaKeyProvider({ prisma, repoId: 'repo-1' });
      await provider.setPrivateKey('human:alice', privateKey);

      // Sign data
      const data = new Uint8Array(createHash('sha256').update('test-payload').digest());
      const signature = await provider.sign('human:alice', data);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      // Verify Ed25519 signature
      const algorithmId = Buffer.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);
      const spki = Buffer.concat([algorithmId, Buffer.from(publicKey, 'base64')]);
      const isValid = verify(null, data, { key: spki, type: 'spki', format: 'der' }, Buffer.from(signature));
      expect(isValid).toBe(true);

      // Throws KEY_NOT_FOUND for missing actor
      await expect(provider.sign('human:nonexistent', data))
        .rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
    });
  });
});
