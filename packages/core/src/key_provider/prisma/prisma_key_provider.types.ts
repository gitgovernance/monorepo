/**
 * Types for PrismaKeyProvider v2 — database-backed KeyProvider implementation.
 *
 * Follows the same pattern as PrismaRecordProjection: defines query interfaces
 * instead of depending on @prisma/client directly. The consumer provides a
 * Prisma client that satisfies these interfaces (duck-typing).
 *
 * Cycle 2 v2 target (identity_key_sync epic):
 *   - ActorKey scoped by `orgId` (not `repoId`), with separate encryption
 *     columns (encryptedPrivateKey, iv, authTag) and append-only lifecycle
 *     (status + lastUsedAt).
 *   - OrgEncryptionKey table provides per-org AES-256 wrapping keys.
 *   - MASTER_KEY (env) → HKDF-derived wrapping key → org key → actor key.
 *
 * Spec: prisma_key_provider_module.md §3.2, §3.3
 */

// ─── ActorKey v2 (Cycle 2, identity_key_sync) ────────────────────────────────

/**
 * Lifecycle status of an `ActorKey` row. Default on create is `'active'`.
 * Only `'active'` rows are served by `sign`/`getPrivateKey`/`getPublicKey`.
 *
 * Spec: prisma_key_provider_module.md §3.2
 */
export type ActorKeyStatus = 'active' | 'archived' | 'revoked';

/** Row shape for the ActorKey table (v2). */
export type ActorKeyRow = {
  id: string;
  actorId: string;
  orgId: string;
  publicKey: string;
  /** Hex-encoded AES-256-GCM ciphertext of the private key. Null for verify-only records. */
  encryptedPrivateKey: string | null;
  /** Hex-encoded 12-byte AES-GCM IV. Null when verify-only. */
  iv: string | null;
  /** Hex-encoded 16-byte AES-GCM auth tag. Null when verify-only. */
  authTag: string | null;
  status: ActorKeyStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Prisma-like delegate for ActorKey v2 queries (duck-typed — no @prisma/client
 * dependency in core).
 *
 * Only the methods consumed by PrismaKeyProvider v2 are declared. Adding
 * methods is non-breaking — the real Prisma client delegate has many more.
 */
export type ActorKeyDelegate = {
  findFirst(args: {
    where: { actorId: string; orgId: string; status: string };
  }): Promise<ActorKeyRow | null>;
  findMany(args: {
    where: { orgId: string; status: string };
  }): Promise<ActorKeyRow[]>;
  count(args: {
    where: { actorId: string; orgId: string; status: string };
  }): Promise<number>;
  create(args: {
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
  }): Promise<ActorKeyRow>;
  updateMany(args: {
    where: { actorId: string; orgId: string; status: string };
    data: { status?: string; lastUsedAt?: Date };
  }): Promise<{ count: number }>;
  deleteMany(args: {
    where: { actorId: string; orgId: string; status: string };
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: string };
    data: {
      encryptedPrivateKey?: string;
      iv?: string;
      authTag?: string;
      lastUsedAt?: Date;
    };
  }): Promise<ActorKeyRow>;
};

// ─── OrgEncryptionKey (Cycle 2, identity_key_sync) ──────────────────────────

/**
 * Row shape for the OrgEncryptionKey table.
 *
 * Stores the per-org AES-256 encryption key that wraps ActorKey private keys.
 * The raw 32-byte org key is encrypted at rest with an HKDF(MASTER_KEY,
 * 'gitgov-org-key')-derived key using AES-256-GCM.
 *
 * See: prisma_key_provider_module.md §3.3 (schema), §3.5 (3-level hierarchy),
 * §4.6 (PKP-F1..F4).
 */
export type OrgEncryptionKeyRow = {
  id: string;
  orgId: string;
  /** Hex-encoded AES-256-GCM ciphertext of the raw 32-byte org key */
  encryptedOrgKey: string;
  /** Hex-encoded 12-byte AES-GCM IV */
  iv: string;
  /** Hex-encoded 16-byte AES-GCM auth tag */
  authTag: string;
  createdAt: Date;
  rotatedAt: Date;
};

/**
 * Prisma-like delegate for OrgEncryptionKey queries (duck-typed).
 */
export type OrgEncryptionKeyDelegate = {
  findUnique(args: { where: { orgId: string } }): Promise<OrgEncryptionKeyRow | null>;
  create(args: {
    data: {
      orgId: string;
      encryptedOrgKey: string;
      iv: string;
      authTag: string;
    };
  }): Promise<OrgEncryptionKeyRow>;
  update(args: {
    where: { orgId: string };
    data: {
      encryptedOrgKey?: string;
      iv?: string;
      authTag?: string;
      rotatedAt?: Date;
    };
  }): Promise<OrgEncryptionKeyRow>;
};

// ─── Client shapes (compose delegates) ───────────────────────────────────────

/**
 * Minimal Prisma client surface required by `createOrgEncryptionKey()`.
 * Just the `orgEncryptionKey` delegate is needed for bootstrap.
 */
export type OrgEncryptionKeyClient = {
  orgEncryptionKey: OrgEncryptionKeyDelegate;
};

/**
 * Full Prisma client surface required by `PrismaKeyProvider` v2 instance
 * methods and `rotateOrgEncryptionKey()`.
 *
 * Includes `orgEncryptionKey` + `actorKey` delegates + `$transaction` for
 * atomic multi-table operations (e.g., storeKey archives old + creates new
 * in a single transaction; rotateOrgEncryptionKey re-encrypts all actor keys
 * of an org atomically).
 *
 * The real `PrismaClient` from `@prisma/client` structurally satisfies this
 * type — consumers pass their Prisma instance directly without any cast.
 */
export type PrismaClientLike = {
  orgEncryptionKey: OrgEncryptionKeyDelegate;
  actorKey: ActorKeyDelegate;
  /**
   * Prisma's interactive transaction API. The callback receives a transaction
   * client with the same delegate shape and all operations inside it either
   * all commit or all rollback.
   */
  $transaction<T>(
    fn: (tx: {
      orgEncryptionKey: OrgEncryptionKeyDelegate;
      actorKey: ActorKeyDelegate;
    }) => Promise<T>,
  ): Promise<T>;
};
