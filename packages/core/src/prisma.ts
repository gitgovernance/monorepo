/**
 * Database-backed implementations (Prisma-compatible client)
 *
 * This module exports implementations that persist data via a Prisma-compatible
 * database client. Core does NOT depend on @prisma/client — it defines structural
 * types (ProjectionClient, PrismaClientLike) that any generated PrismaClient
 * satisfies via duck typing.
 */

// RecordProjection (database-backed via Prisma-compatible client)
export { PrismaRecordProjection } from './record_projection/prisma';
export type {
  PrismaRecordProjectionOptions,
  ProjectionClient,
  JsonValue,
} from './record_projection/prisma';

// KeyProvider v2 (Cycle 2, identity_key_sync)
// Org-scoped, 3-level key hierarchy (MASTER_KEY → org_key → actor_key),
// append-only lifecycle.
export {
  PrismaKeyProvider,
  createOrgEncryptionKey,
  rotateOrgEncryptionKey,
} from './key_provider/prisma';
export type {
  ActorKeyStatus,
  ActorKeyRow,
  ActorKeyDelegate,
  OrgEncryptionKeyRow,
  OrgEncryptionKeyDelegate,
  OrgEncryptionKeyClient,
  PrismaClientLike,
} from './key_provider/prisma';
