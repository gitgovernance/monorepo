import type { AgentRecord } from '../record_types/generated/agent_record';

type PackageGitgovAgent = {
  purpose: string;
  function: string;
  categories?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Minimal shape of the package.json the scanner reads.
 * A missing `gitgov.agent` is what makes a package skippable (DISC-A3).
 */
export type AgentPackageJson = {
  name: string;
  gitgov?: { agent?: PackageGitgovAgent };
};

// [DISC-B1] [DISC-B2]
export function packageToAgentRecord(pkg: AgentPackageJson): AgentRecord {
  const agent = pkg.gitgov!.agent!;
  const agentName = pkg.name.replace('@gitgov/agent-', '');

  return {
    id: `agent:${agentName}`,
    engine: {
      type: 'local' as const,
      entrypoint: pkg.name,
      function: agent.function,
    },
    metadata: {
      purpose: agent.purpose,
      categories: agent.categories ?? [],
      ...agent.metadata,
      discovered: true,
    },
  };
}

// [DISC-C1] [DISC-C2] [DISC-C3]
export function mergeAgentSources(
  registered: AgentRecord[],
  discovered: AgentRecord[],
): AgentRecord[] {
  const registeredIds = new Set(registered.map(r => r.id));
  const newAgents = discovered.filter(d => !registeredIds.has(d.id));
  return [...registered, ...newAgents];
}

// NOTE: `discoverInstalledAgents` (DISC-A1..A3) is NOT here on purpose. It reads the
// filesystem, so it lives in ./fs/fs_agent_discovery.ts and is exported from
// `@gitgov/core/fs`. Importing it from this file would pull `node:fs` and `node:path` into
// the main entrypoint and break every consumer that is not Node.
// Guarded by [EARS-CI02] in integration/guardrails/clean_exports.test.ts.
