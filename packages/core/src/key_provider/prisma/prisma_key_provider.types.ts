/**
 * Types for PrismaKeyProvider — database-backed KeyProvider implementation.
 *
 * Follows the same pattern as PrismaRecordProjection: defines query interfaces
 * instead of depending on @prisma/client directly. The consumer provides a
 * Prisma client that satisfies these interfaces.
 */

/** Row shape for the ActorKey table */
export type ActorKeyRow = {
  id: string;
  actorId: string;
  repoId: string;
  encryptedKey: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Where clause for unique lookup */
export type ActorKeyWhereUnique = {
  actorId_repoId: { actorId: string; repoId: string };
};

/** Prisma-like delegate for ActorKey queries */
export type ActorKeyDelegate = {
  findUnique(args: { where: ActorKeyWhereUnique }): Promise<ActorKeyRow | null>;
  upsert(args: {
    where: ActorKeyWhereUnique;
    create: { actorId: string; repoId: string; encryptedKey: string };
    update: { encryptedKey: string };
  }): Promise<ActorKeyRow>;
  delete(args: { where: ActorKeyWhereUnique }): Promise<ActorKeyRow>;
  count(args: { where: { actorId: string; repoId: string } }): Promise<number>;
};

/** Options for PrismaKeyProvider */
export type PrismaKeyProviderOptions = {
  /** Prisma-compatible client with actorKey delegate */
  prisma: { actorKey: ActorKeyDelegate };
  /** Repository ID for scoping keys (multi-tenant isolation) */
  repoId: string;
  /** Encryption secret for keys at rest. If not provided, keys stored in plaintext (dev only). */
  encryptionSecret?: string;
};
