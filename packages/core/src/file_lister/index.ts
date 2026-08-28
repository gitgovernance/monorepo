// Core interfaces - backend-agnostic
export * from './file_lister';

// NOTE: Implementations are exported via subpaths, never from here:
// - @gitgov/core/fs     -> FsFileLister
// - @gitgov/core/github -> GitHubFileLister
// - @gitgov/core/memory -> MemoryFileLister
//
// `github` already followed this rule; `fs` and `memory` did not. `export * from
// './fs'` pulls `node:fs` and `node:path` into the main entrypoint, which breaks
// every consumer that is not Node (browser, edge, worker) — the reason the
// subpath split exists at all.
// Guarded by [EARS-CI02] in integration/guardrails/clean_exports.test.ts.
