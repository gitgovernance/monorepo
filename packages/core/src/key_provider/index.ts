// Core interfaces - backend-agnostic
export * from './key_provider';

// NOTE: Implementations are exported via subpaths, never from here:
// - @gitgov/core/fs     -> FsKeyProvider
// - @gitgov/core/prisma -> PrismaKeyProvider
// - @gitgov/core/memory -> EnvKeyProvider, MockKeyProvider
//
// `prisma` already followed this rule; `fs` and `memory` did not. `export * from
// './fs'` pulls `node:fs` into the main entrypoint, which breaks every consumer
// that is not Node (browser, edge, worker) — the reason the subpath split exists
// at all.
// Guarded by [EARS-CI02] in integration/guardrails/clean_exports.test.ts.
