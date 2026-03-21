/**
 * Database-backed implementations (Prisma-compatible client)
 *
 * This module exports implementations that persist data via a Prisma-compatible
 * database client. Core does NOT depend on @prisma/client — it defines structural
 * types (ProjectionClient) that any generated PrismaClient satisfies via duck typing.
 */

// RecordProjection (database-backed via Prisma-compatible client)
export { PrismaRecordProjection } from './record_projection/prisma';
export type {
  PrismaRecordProjectionOptions,
  ProjectionClient,
  JsonValue,
} from './record_projection/prisma';

// KeyProvider (database-backed via Prisma-compatible client)
export { PrismaKeyProvider } from './key_provider/prisma';
export type {
  PrismaKeyProviderOptions,
  ActorKeyDelegate,
  ActorKeyRow,
} from './key_provider/prisma';
