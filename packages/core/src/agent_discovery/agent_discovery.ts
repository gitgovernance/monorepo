import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentRecord } from '../record_types/generated/agent_record';

type PackageGitgovAgent = {
  purpose: string;
  function: string;
  categories?: string[];
  metadata?: Record<string, unknown>;
};

type PackageJson = {
  name: string;
  gitgov?: { agent?: PackageGitgovAgent };
};

// [DISC-B1] [DISC-B2]
export function packageToAgentRecord(pkg: PackageJson): AgentRecord {
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

// [DISC-A1] [DISC-A2] [DISC-A3]
export function discoverInstalledAgents(projectRoot: string): AgentRecord[] {
  const gitgovDir = path.join(projectRoot, 'node_modules', '@gitgov');

  if (!fs.existsSync(gitgovDir)) return [];

  let entries: string[];
  try {
    entries = fs.readdirSync(gitgovDir);
  } catch {
    return [];
  }

  const discovered: AgentRecord[] = [];

  for (const entry of entries) {
    if (!entry.startsWith('agent-')) continue;

    const pkgPath = path.join(gitgovDir, entry, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    try {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg: PackageJson = JSON.parse(raw);

      if (!pkg.gitgov?.agent) continue;

      discovered.push(packageToAgentRecord(pkg));
    } catch {
      continue;
    }
  }

  return discovered;
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
