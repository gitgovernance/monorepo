/**
 * PrismaKeyProvider v2 — Database-backed KeyProvider implementation.
 * Blueprint: prisma_key_provider_module.md (v2 target, Cycle 2 of identity_key_sync)
 *
 * Stores Ed25519 private keys in an `ActorKey` table, encrypted at rest with
 * AES-256-GCM via a 3-level key hierarchy:
 *
 *   MASTER_KEY (env var)
 *       ↓  HKDF-SHA256, info='gitgov-org-key'
 *   wrapping key (in-memory only)
 *       ↓  decrypts OrgEncryptionKey.encryptedOrgKey
 *   org_key (cached per-instance)
 *       ↓  encrypts/decrypts ActorKey.encryptedPrivateKey
 *   actor private key
 *
 * Org-scoped: one `PrismaKeyProvider` instance is scoped to a single `orgId`
 * at construction time. Actor keys are isolated per-org.
 *
 * Append-only lifecycle: `storeKey()` archives the previous active row and
 * creates a new one transactionally. `deletePrivateKey()` delegates to
 * `archiveKey()` — no hard deletes.
 *
 * | EARS ID  | Method / Behavior                          | Section |
 * |----------|--------------------------------------------|---------|
 * | PKP-A1   | getPrivateKey (decrypt + return)           | 4.1     |
 * | PKP-A2   | getPrivateKey returns null when no active  | 4.1     |
 * | PKP-A3   | setPrivateKey derives pub + delegates      | 4.1     |
 * | PKP-A4   | deletePrivateKey → archiveKey              | 4.1     |
 * | PKP-B1   | org-level isolation                        | 4.2     |
 * | PKP-B2   | same actorId across orgs independent       | 4.2     |
 * | PKP-C1   | hasPrivateKey via count                    | 4.3     |
 * | PKP-D1   | sign (decrypt + Ed25519 + lastUsedAt)      | 4.4     |
 * | PKP-D2   | sign throws KEY_NOT_FOUND                  | 4.4     |
 * | PKP-E1-3 | schema invariants (DDL) — enforced by      | 4.5     |
 * |          | Prisma schema + migration SQL (not runtime |         |
 * |          | code). See saas.prisma ActorKey model and  |         |
 * |          | prisma_key_provider.test.ts §4.5 block.    |         |
 * | PKP-E4   | DDL migration runtime — deferred to e2e    | 4.5 🟡  |
 * |          | (actorkey_migration_flow, Task 2.2)        |         |
 * | PKP-F1   | createOrgEncryptionKey bootstrap           | 4.6     |
 * | PKP-F2   | lazy-load + cache org key                  | 4.6     |
 * | PKP-F3   | MASTER_KEY never encrypts actor keys       | 4.6     |
 * | PKP-F4   | rotate org key re-encrypts actor keys      | 4.6     |
 * | PKP-G1   | storeKey random IV per op                  | 4.7     |
 * | PKP-G2   | storeKey archives old active row (tx)      | 4.7     |
 * | PKP-G3   | storeKey updates lastUsedAt                | 4.7     |
 * | PKP-G4   | storeKey throws STORE_FAILED               | 4.7     |
 * | PKP-G5   | getPublicKey without decryption            | 4.7     |
 * | PKP-G6   | getPublicKey null when no active           | 4.7     |
 * | PKP-G7   | archiveKey sets status + lastUsedAt        | 4.7     |
 * | PKP-G8   | archiveKey idempotent                      | 4.7     |
 * | PKP-G9   | decryption failure → DECRYPTION_FAILED     | 4.7     |
 * | PKP-G10  | archived rows ignored by active-only ops   | 4.7     |
 */

import { createCipheriv, createDecipheriv, randomBytes, sign as cryptoSign } from 'node:crypto';
import type { KeyProvider, KeyPair } from '../key_provider';
import { KeyProviderError } from '../key_provider';
import { derivePublicKey, deriveHkdfKey } from '../../crypto/signatures';
import type {
  ActorKeyRow,
  OrgEncryptionKeyClient,
  PrismaClientLike,
} from './prisma_key_provider.types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** AES-256-GCM algorithm identifier for Node's crypto module */
const AES_GCM_ALGORITHM = 'aes-256-gcm';

/** AES-GCM IV length: 12 bytes (96 bits, NIST-recommended for GCM) */
const GCM_IV_LENGTH = 12;

/** Raw org key / AES-256 key length in bytes */
const KEY_LENGTH_BYTES = 32;

/**
 * HKDF `info` parameter for deriving the MASTER_KEY wrapping key. Binds the
 * derived key to this specific purpose — MASTER_KEY can be safely reused
 * with different `info` strings for other derivation domains.
 */
const MASTER_KEY_HKDF_INFO = 'gitgov-org-key';

/** Active status literal for ActorKey rows */
const STATUS_ACTIVE = 'active';

/** Archived status literal for ActorKey rows */
const STATUS_ARCHIVED = 'archived';

// ─── Class: PrismaKeyProvider v2 ────────────────────────────────────────────

export class PrismaKeyProvider implements KeyProvider {
  private readonly prisma: PrismaClientLike;
  private readonly orgId: string;

  /**
   * Lazy-loaded + cached org key (plaintext, 32 bytes). Populated on first
   * call to any method that needs to encrypt/decrypt actor keys. NEVER
   * logged, NEVER exposed via getters. Scoped to this instance only.
   *
   * [PKP-F2] lazy-load + cache org key per instance
   */
  private orgKeyCache: Buffer | null = null;

  /**
   * Constructs a key provider scoped to a single organization.
   *
   * @param prisma - Prisma-compatible client (real PrismaClient satisfies this).
   * @param orgId - Organization ID. All keys managed by this instance belong
   *                to this org. The `OrgEncryptionKey` row for this orgId
   *                must exist (created via `createOrgEncryptionKey`).
   */
  constructor(prisma: PrismaClientLike, orgId: string) {
    this.prisma = prisma;
    this.orgId = orgId;
  }

  // ─── IKeyProvider base (6 methods) ─────────────────────────────────────────

  /**
   * [PKP-D1] Signs data with the actor's Ed25519 private key.
   * [PKP-D2] Throws KeyProviderError('KEY_NOT_FOUND') if no active key exists.
   *
   * Flow: obtain org key (lazy) → fetch active ActorKey row → AES-GCM decrypt
   * the private key → Ed25519 sign the data → update lastUsedAt → return
   * signature bytes.
   */
  async sign(actorId: string, data: Uint8Array): Promise<Uint8Array> {
    const row = await this.prisma.actorKey.findFirst({
      where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
    });
    if (!row) {
      // [PKP-D2]
      throw new KeyProviderError(
        `No active key for actor ${actorId} in org ${this.orgId}`,
        'KEY_NOT_FOUND',
        {
          actorId,
          orgId: this.orgId,
          hint: 'Call storeKey() or createActor() first, then retry signing',
        },
      );
    }

    // [PKP-D1] Decrypt stored private key using cached org key
    const privateKeyBase64 = await this.decryptActorKeyRow(row, actorId);

    const signature = cryptoSign(null, data, {
      key: Buffer.from(privateKeyBase64, 'base64'),
      type: 'pkcs8',
      format: 'pem',
    });

    // [PKP-D1] Side effect: update lastUsedAt (fire-and-forget, non-blocking)
    void this.prisma.actorKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        /* non-blocking; signing already succeeded */
      });

    return new Uint8Array(signature);
  }

  /**
   * [PKP-A1] Returns the base64-encoded private key for the actor, decrypted
   * from the stored ciphertext using the cached org key.
   * [PKP-A2] Returns `null` if no active ActorKey row exists (fail-safe).
   * [PKP-G10] Archived rows are ignored — only `status='active'` rows are served.
   */
  async getPrivateKey(actorId: string): Promise<string | null> {
    const row = await this.prisma.actorKey.findFirst({
      where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
    });
    if (!row) {
      // [PKP-A2]
      return null;
    }
    return this.decryptActorKeyRow(row, actorId);
  }

  /**
   * [PKP-G5] Returns the public key for the actor from the stored row's
   * `publicKey` column — NO decryption, NO org key access.
   * [PKP-G6] Returns `null` when no active row exists.
   * [PKP-G10] Ignores archived rows.
   */
  async getPublicKey(actorId: string): Promise<string | null> {
    const row = await this.prisma.actorKey.findFirst({
      where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
    });
    // [PKP-G5] No decryption — direct field read
    // [PKP-G6] Null when no active row
    return row?.publicKey ?? null;
  }

  /**
   * [PKP-A3] Stores a private key for an actor by deriving the public key
   * via the `derivePublicKey()` helper from `@gitgov/core/crypto/signatures`
   * (wrapper over `createPublicKey()` + SPKI DER `subarray(-32)`) and
   * delegating to `storeKey()`.
   *
   * This method exists for `IKeyProvider` interface compatibility. Callers
   * that already have a `KeyPair` should prefer `storeKey()` directly — it
   * avoids the public-key derivation round trip.
   */
  async setPrivateKey(actorId: string, privateKey: string): Promise<void> {
    // [PKP-A3] Derive public key and delegate to storeKey
    let publicKey: string;
    try {
      publicKey = derivePublicKey(privateKey);
    } catch (cause) {
      throw new KeyProviderError(
        `Cannot derive public key for ${actorId}: invalid private key format`,
        'INVALID_KEY_FORMAT',
        {
          actorId,
          orgId: this.orgId,
          hint: 'privateKey must be PKCS8 PEM base64-encoded (see crypto/signatures.generateKeys())',
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }
    await this.storeKey(actorId, { publicKey, privateKey });
  }

  /**
   * [PKP-C1] Returns `true` if an active ActorKey row exists for
   * `[actorId, orgId]`, `false` otherwise, via `count()` — without reading
   * or decrypting key content.
   * [PKP-G10] Archived rows are ignored by count.
   */
  async hasPrivateKey(actorId: string): Promise<boolean> {
    const count = await this.prisma.actorKey.count({
      where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
    });
    return count > 0;
  }

  /**
   * [PKP-A4] v2 is append-only — delegates to `archiveKey()`. Returns `true`
   * if an active row existed (and was archived), `false` otherwise.
   *
   * The row is NOT hard-deleted; it remains queryable for audit/history
   * with `status='archived'`.
   */
  async deletePrivateKey(actorId: string): Promise<boolean> {
    const hadActive = await this.hasPrivateKey(actorId);
    if (hadActive) {
      await this.archiveKey(actorId);
    }
    return hadActive;
  }

  // ─── Extensions beyond IKeyProvider ────────────────────────────────────────

  /**
   * [PKP-G1] Stores a complete keypair atomically. Encrypts the private key
   * with AES-256-GCM using the org key and a random 12-byte IV.
   * [PKP-G2] If an active row already exists for `[actorId, orgId]`, archives
   * it (`status='archived'`, `lastUsedAt=now()`) and creates a new active
   * row — both updates committed together in a single `$transaction`.
   * [PKP-G3] Sets `lastUsedAt=now()` on the newly created active row.
   * [PKP-G4] Throws `KeyProviderError('STORE_FAILED', {...})` on failure.
   *
   * Prefer this over `setPrivateKey()` when the caller already has both
   * keys in hand (e.g., right after `generateKeys()`) — avoids public-key
   * re-derivation.
   */
  async storeKey(actorId: string, keypair: KeyPair): Promise<void> {
    const orgKey = await this.getOrgKey();

    // [PKP-G1] Encrypt private key with random IV
    const iv = randomBytes(GCM_IV_LENGTH);
    const cipher = createCipheriv(AES_GCM_ALGORITHM, orgKey, iv);
    const privateKeyBytes = Buffer.from(keypair.privateKey, 'utf-8');
    const encryptedBytes = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const now = new Date();

    // [PKP-G2] Transactional: archive old active + create new active
    try {
      await this.prisma.$transaction(async (tx) => {
        // [PKP-G2] Archive any existing active row for this actor+org
        await tx.actorKey.updateMany({
          where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
          data: { status: STATUS_ARCHIVED, lastUsedAt: now },
        });

        // [PKP-G1][PKP-G3] Create new active row
        await tx.actorKey.create({
          data: {
            actorId,
            orgId: this.orgId,
            publicKey: keypair.publicKey,
            encryptedPrivateKey: encryptedBytes.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            status: STATUS_ACTIVE,
            lastUsedAt: now,
          },
        });
      });
    } catch (cause) {
      // [PKP-G4]
      throw new KeyProviderError(
        `Failed to store key for ${actorId} in org ${this.orgId}`,
        'STORE_FAILED',
        {
          actorId,
          orgId: this.orgId,
          hint: 'Check DB connectivity and that the orgId references an existing Organization',
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }
  }

  /**
   * [PKP-G7] Marks the active key as archived. Idempotent.
   * [PKP-G8] No-op when no active row exists — no throw.
   */
  async archiveKey(actorId: string): Promise<void> {
    // [PKP-G7] Set status to archived + record lastUsedAt
    // [PKP-G8] updateMany is idempotent — matches 0 or 1 row
    await this.prisma.actorKey.updateMany({
      where: { actorId, orgId: this.orgId, status: STATUS_ACTIVE },
      data: { status: STATUS_ARCHIVED, lastUsedAt: new Date() },
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * [PKP-F2] Lazy-loads the org key on first call and caches it in-instance.
   * Subsequent calls return the cached buffer without touching the DB.
   *
   * Flow: fetch OrgEncryptionKey row by orgId → HKDF-derive wrapping key
   * from MASTER_KEY → AES-GCM decrypt encryptedOrgKey → cache result.
   *
   * Throws `STORE_FAILED` if no OrgEncryptionKey row exists for this org
   * (hint: call `createOrgEncryptionKey(prisma, orgId)` first).
   */
  private async getOrgKey(): Promise<Buffer> {
    if (this.orgKeyCache !== null) {
      return this.orgKeyCache;
    }

    const row = await this.prisma.orgEncryptionKey.findUnique({
      where: { orgId: this.orgId },
    });
    if (!row) {
      throw new KeyProviderError(
        `No OrgEncryptionKey for org ${this.orgId}`,
        'STORE_FAILED',
        {
          orgId: this.orgId,
          hint: 'Call createOrgEncryptionKey(prisma, orgId) when the Organization is created',
        },
      );
    }

    const masterKeyBase64 = process.env['MASTER_KEY'];
    if (!masterKeyBase64 || masterKeyBase64.trim() === '') {
      throw new KeyProviderError(
        'MASTER_KEY env var is missing or empty',
        'STORE_FAILED',
        {
          orgId: this.orgId,
          hint: 'Set MASTER_KEY to a base64-encoded 32+ byte value (openssl rand -base64 32)',
        },
      );
    }

    let wrappingKey: Buffer;
    try {
      wrappingKey = await deriveHkdfKey(masterKeyBase64, MASTER_KEY_HKDF_INFO, KEY_LENGTH_BYTES);
    } catch (cause) {
      throw new KeyProviderError(
        'HKDF derivation from MASTER_KEY failed',
        'STORE_FAILED',
        {
          orgId: this.orgId,
          hint: 'MASTER_KEY must be valid base64 of 32+ bytes',
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }

    try {
      const iv = Buffer.from(row.iv, 'hex');
      const authTag = Buffer.from(row.authTag, 'hex');
      const ciphertext = Buffer.from(row.encryptedOrgKey, 'hex');

      const decipher = createDecipheriv(AES_GCM_ALGORITHM, wrappingKey, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      // [PKP-F2] cache and return
      this.orgKeyCache = plaintext;
      return plaintext;
    } catch (cause) {
      throw new KeyProviderError(
        `Failed to decrypt OrgEncryptionKey for ${this.orgId}`,
        'DECRYPTION_FAILED',
        {
          orgId: this.orgId,
          hint: 'OrgEncryptionKey may be tampered or MASTER_KEY changed since it was created',
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }
  }

  /**
   * [PKP-A1] Decrypts an ActorKey row's encrypted private key using the
   * cached org key.
   * [PKP-F3] Uses the org key (level 2) — NEVER the MASTER_KEY-derived key
   * (level 1) directly. The org key was itself decrypted from the
   * OrgEncryptionKey table using MASTER_KEY-derived key in `getOrgKey()`.
   * [PKP-G9] Throws `DECRYPTION_FAILED` on AES-GCM failure.
   */
  private async decryptActorKeyRow(row: ActorKeyRow, actorId: string): Promise<string> {
    if (row.encryptedPrivateKey === null || row.iv === null || row.authTag === null) {
      throw new KeyProviderError(
        `ActorKey row for ${actorId} is verify-only (no encryptedPrivateKey)`,
        'KEY_NOT_FOUND',
        {
          actorId,
          orgId: this.orgId,
          hint: 'This actor has only a public key synced — no private key available for signing/export',
        },
      );
    }

    const orgKey = await this.getOrgKey();

    try {
      const iv = Buffer.from(row.iv, 'hex');
      const authTag = Buffer.from(row.authTag, 'hex');
      const ciphertext = Buffer.from(row.encryptedPrivateKey, 'hex');

      const decipher = createDecipheriv(AES_GCM_ALGORITHM, orgKey, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf-8');
    } catch (cause) {
      // [PKP-G9]
      throw new KeyProviderError(
        `AES-GCM decryption failed for actor ${actorId}`,
        'DECRYPTION_FAILED',
        {
          actorId,
          orgId: this.orgId,
          hint: 'Key may be tampered or org key was rotated without re-encryption',
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }
  }

  // ─── Test helper (internal — not part of public API) ───────────────────────

  /**
   * For tests only: clears the cached org key to force a fresh lazy-load.
   * Not exposed in the public API; called by tests via a type assertion.
   *
   * @internal
   */
  _clearOrgKeyCacheForTesting(): void {
    this.orgKeyCache = null;
  }
}

// ─── Org Key Hierarchy — bootstrap helper (PKP-F1, Cycle 2) ─────────────────

/**
 * [PKP-F1] Bootstraps the per-org encryption key for a freshly-created
 * Organization.
 *
 * Called ONCE per Organization at creation time (e.g., from the GitHub App
 * install webhook handler). Generates a random AES-256 org key, encrypts it
 * with an HKDF(MASTER_KEY, 'gitgov-org-key')-derived wrapping key, and
 * persists the ciphertext in the `OrgEncryptionKey` table with IV and auth
 * tag as separate hex columns.
 *
 * This is the entry point to the 3-level key hierarchy:
 *
 *     MASTER_KEY (env var)
 *         ↓  HKDF-SHA256, info='gitgov-org-key'
 *     wrapping key (32 bytes, in-memory only)
 *         ↓  AES-256-GCM encrypt
 *     OrgEncryptionKey.encryptedOrgKey (hex, persisted)
 *         ↓  (later) used by PrismaKeyProvider to encrypt ActorKey rows
 *
 * Spec: prisma_key_provider_module.md §3.5 (encryption strategy),
 *       §4.6 PKP-F1 (requirement).
 *
 * @param prisma - Prisma-compatible client with `orgEncryptionKey` delegate.
 * @param orgId - The `Organization.id` this key belongs to.
 * @throws {KeyProviderError} with code `STORE_FAILED` if MASTER_KEY missing,
 *                 invalid, or the DB write fails.
 */
export async function createOrgEncryptionKey(
  prisma: OrgEncryptionKeyClient,
  orgId: string,
): Promise<void> {
  // [PKP-F1] Read MASTER_KEY from environment — fail fast if missing.
  const masterKeyBase64 = process.env['MASTER_KEY'];
  if (!masterKeyBase64 || masterKeyBase64.trim() === '') {
    throw new KeyProviderError(
      'Cannot create OrgEncryptionKey: MASTER_KEY env var is missing or empty',
      'STORE_FAILED',
      {
        orgId,
        hint: 'Set MASTER_KEY to a base64-encoded 32+ byte value. Generate with: openssl rand -base64 32',
      },
    );
  }

  // [PKP-F1][PKP-F3] Derive the 32-byte wrapping key via HKDF-SHA256. This is
  // the LEVEL-1 key that wraps the org key — it NEVER encrypts actor keys
  // directly (that would be PKP-F3 violation).
  let wrappingKey: Buffer;
  try {
    wrappingKey = await deriveHkdfKey(masterKeyBase64, MASTER_KEY_HKDF_INFO, KEY_LENGTH_BYTES);
  } catch (cause) {
    throw new KeyProviderError(
      'Cannot create OrgEncryptionKey: HKDF derivation from MASTER_KEY failed',
      'STORE_FAILED',
      {
        orgId,
        hint: 'MASTER_KEY must be valid base64 of 32+ bytes. Generate with: openssl rand -base64 32',
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      },
    );
  }

  // [PKP-F1] Generate a fresh 32-byte random org key. Each org gets its own
  // AES-256 key — blast radius of a compromise is contained to that org only.
  const orgKeyPlaintext = randomBytes(KEY_LENGTH_BYTES);

  // [PKP-F1] Encrypt the org key with AES-256-GCM, random IV per operation.
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv(AES_GCM_ALGORITHM, wrappingKey, iv);
  const encryptedOrgKey = Buffer.concat([
    cipher.update(orgKeyPlaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // [PKP-F1] Persist with iv, authTag, encryptedOrgKey as SEPARATE hex columns
  // (not a concatenated base64 blob) — facilitates debugging and forensics.
  try {
    await prisma.orgEncryptionKey.create({
      data: {
        orgId,
        encryptedOrgKey: encryptedOrgKey.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      },
    });
  } catch (cause) {
    throw new KeyProviderError(
      `Failed to persist OrgEncryptionKey for ${orgId}`,
      'STORE_FAILED',
      {
        orgId,
        hint: 'Check DB connectivity and that the Organization row exists for this orgId',
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      },
    );
  }
}

// ─── Org Key Hierarchy — rotation helper (PKP-F4, Cycle 2) ──────────────────

/**
 * [PKP-F4] Rotates the `OrgEncryptionKey` for a given org. Generates a new
 * random AES-256 org key, re-encrypts all active `ActorKey` rows of that
 * org with the new org key, and updates the `OrgEncryptionKey` row. The
 * entire operation runs in a single transaction — either all rows are
 * re-encrypted and the new org key is stored, or nothing changes.
 *
 * This is a migration-script-grade operation — NOT called from the hot path.
 * Typical trigger: suspected key compromise or scheduled rotation policy.
 *
 * Runtime: proportional to the number of active actor keys in the org
 * (each requires decrypt-with-old + encrypt-with-new).
 *
 * @param prisma - Full Prisma client with `orgEncryptionKey` + `actorKey`
 *                 delegates + `$transaction` support.
 * @param orgId - Organization to rotate.
 * @throws {KeyProviderError} on MASTER_KEY issues, DB errors, or decryption
 *                 failures of existing rows.
 */
export async function rotateOrgEncryptionKey(
  prisma: PrismaClientLike,
  orgId: string,
): Promise<void> {
  // Read MASTER_KEY
  const masterKeyBase64 = process.env['MASTER_KEY'];
  if (!masterKeyBase64 || masterKeyBase64.trim() === '') {
    throw new KeyProviderError(
      `Cannot rotate OrgEncryptionKey for ${orgId}: MASTER_KEY env var is missing`,
      'STORE_FAILED',
      { orgId, hint: 'Set MASTER_KEY before running key rotation' },
    );
  }

  // Derive wrapping key (same for old and new org key — only the org key itself changes)
  let wrappingKey: Buffer;
  try {
    wrappingKey = await deriveHkdfKey(masterKeyBase64, MASTER_KEY_HKDF_INFO, KEY_LENGTH_BYTES);
  } catch (cause) {
    throw new KeyProviderError(
      `HKDF derivation failed during rotation for ${orgId}`,
      'STORE_FAILED',
      {
        orgId,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      },
    );
  }

  // Fetch current org key row
  const oldRow = await prisma.orgEncryptionKey.findUnique({ where: { orgId } });
  if (!oldRow) {
    throw new KeyProviderError(
      `No OrgEncryptionKey to rotate for ${orgId}`,
      'STORE_FAILED',
      {
        orgId,
        hint: 'Call createOrgEncryptionKey() first to bootstrap the org key before rotating',
      },
    );
  }

  // Decrypt old org key
  let oldOrgKey: Buffer;
  try {
    const oldIv = Buffer.from(oldRow.iv, 'hex');
    const oldAuthTag = Buffer.from(oldRow.authTag, 'hex');
    const oldCiphertext = Buffer.from(oldRow.encryptedOrgKey, 'hex');
    const decipher = createDecipheriv(AES_GCM_ALGORITHM, wrappingKey, oldIv);
    decipher.setAuthTag(oldAuthTag);
    oldOrgKey = Buffer.concat([decipher.update(oldCiphertext), decipher.final()]);
  } catch (cause) {
    throw new KeyProviderError(
      `Failed to decrypt old OrgEncryptionKey for ${orgId} during rotation`,
      'DECRYPTION_FAILED',
      {
        orgId,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      },
    );
  }

  // Generate new org key + encrypt with the same wrapping key (but fresh IV)
  const newOrgKey = randomBytes(KEY_LENGTH_BYTES);
  const newIv = randomBytes(GCM_IV_LENGTH);
  const newCipher = createCipheriv(AES_GCM_ALGORITHM, wrappingKey, newIv);
  const newEncryptedOrgKey = Buffer.concat([
    newCipher.update(newOrgKey),
    newCipher.final(),
  ]);
  const newAuthTag = newCipher.getAuthTag();

  // [PKP-F4] Transactional rotation: re-encrypt all active actor keys + update org key row
  try {
    await prisma.$transaction(async (tx) => {
      // Fetch all active actor keys of this org
      const activeKeys = await tx.actorKey.findMany({
        where: { orgId, status: STATUS_ACTIVE },
      });

      // Re-encrypt each one with the new org key
      for (const row of activeKeys) {
        if (row.encryptedPrivateKey === null || row.iv === null || row.authTag === null) {
          // Verify-only row — no private key to re-encrypt, skip
          continue;
        }

        // Decrypt with OLD org key
        const oldActorIv = Buffer.from(row.iv, 'hex');
        const oldActorAuthTag = Buffer.from(row.authTag, 'hex');
        const oldActorCiphertext = Buffer.from(row.encryptedPrivateKey, 'hex');
        const decipher = createDecipheriv(AES_GCM_ALGORITHM, oldOrgKey, oldActorIv);
        decipher.setAuthTag(oldActorAuthTag);
        const plaintext = Buffer.concat([
          decipher.update(oldActorCiphertext),
          decipher.final(),
        ]);

        // Re-encrypt with NEW org key (fresh IV per row)
        const newActorIv = randomBytes(GCM_IV_LENGTH);
        const newActorCipher = createCipheriv(AES_GCM_ALGORITHM, newOrgKey, newActorIv);
        const newActorCiphertext = Buffer.concat([
          newActorCipher.update(plaintext),
          newActorCipher.final(),
        ]);
        const newActorAuthTag = newActorCipher.getAuthTag();

        await tx.actorKey.update({
          where: { id: row.id },
          data: {
            encryptedPrivateKey: newActorCiphertext.toString('hex'),
            iv: newActorIv.toString('hex'),
            authTag: newActorAuthTag.toString('hex'),
          },
        });
      }

      // Update the OrgEncryptionKey row with the new ciphertext + bump rotatedAt
      await tx.orgEncryptionKey.update({
        where: { orgId },
        data: {
          encryptedOrgKey: newEncryptedOrgKey.toString('hex'),
          iv: newIv.toString('hex'),
          authTag: newAuthTag.toString('hex'),
          rotatedAt: new Date(),
        },
      });
    });
  } catch (cause) {
    throw new KeyProviderError(
      `Failed to rotate OrgEncryptionKey for ${orgId}`,
      'STORE_FAILED',
      {
        orgId,
        hint: 'Rotation rolled back — all actor keys remain encrypted with the previous org key',
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      },
    );
  }
}
