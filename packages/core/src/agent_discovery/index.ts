// Core — pure, backend-agnostic
export { mergeAgentSources, packageToAgentRecord } from './agent_discovery';
export type { AgentPackageJson } from './agent_discovery';

// NOTE: The implementation is exported via subpath, never from here:
// - @gitgov/core/fs -> discoverInstalledAgents
//
// It reads `node_modules/@gitgov/` with `fs.readdirSync` + `fs.readFileSync`, so
// re-exporting it here would pull `node:fs` and `node:path` into the main entrypoint and
// break every consumer that is not Node (browser, edge, worker).
// Guarded by [EARS-CI02] in integration/guardrails/clean_exports.test.ts.
