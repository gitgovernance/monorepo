import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentRecord } from '../../record_types/generated/agent_record';
import { packageToAgentRecord, type AgentPackageJson } from '../agent_discovery';

/**
 * Node-only implementation of agent discovery.
 *
 * Spec: fs_agent_discovery_module.md §4.1 (DISC-A1..A3).
 * Exported from `@gitgov/core/fs`, never from the main barrel: it reads the filesystem.
 *
 * The mapping `package.json -> AgentRecord` is NOT duplicated here — it is delegated to
 * `packageToAgentRecord()` (DISC-B1), the pure half of the module.
 */

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
      const pkg: AgentPackageJson = JSON.parse(raw);

      if (!pkg.gitgov?.agent) continue;

      discovered.push(packageToAgentRecord(pkg));
    } catch {
      continue;
    }
  }

  return discovered;
}
