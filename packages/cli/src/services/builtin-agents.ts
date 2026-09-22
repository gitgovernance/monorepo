import { runAgent as runSecurityAudit } from '@gitgov/agent-security-audit';
import type { BuiltinAgentRegistry, AgentExecutor } from '@gitgov/core';

/**
 * [EARS-C18] The agents that ship inside the CLI's own bundle.
 *
 * Spec: dependency_injection_module.md §4.3
 *
 * The import is STATIC on purpose: esbuild bundles what it can see, and
 * `@gitgov/agent-security-audit` is not in the `--external` list, so the agent travels
 * inside `gitgov.mjs` (4 KB, its only dependency is `@gitgov/core`, already external).
 * That is what makes `gitgov init` followed by `gitgov audit` work in a repository that
 * installed nothing — the case that used to report `@gitgov/agent-security-audit not
 * found`, 0 agents run, exit 1, because `require.resolve` anchors at the user's repo
 * and nothing ever put the package there.
 *
 * Keys are bare agent names, matching the part after `builtin:` in an AgentRecord
 * entrypoint (ARUN-B1). Only `security-audit` is built in (decision A25): `review-advisor`
 * needs an LLM and `semgrep` needs an external binary, so both stay opt-in and keep
 * resolving by package name from the user's repository.
 */
export function createBuiltinAgentRegistry(): BuiltinAgentRegistry {
  return new Map<string, AgentExecutor>([['security-audit', runSecurityAudit]]);
}
