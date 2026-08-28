/**
 * FS Agent Discovery Module Tests
 *
 * Spec: fs_agent_discovery_module.md (DISC-A1..A3)
 * All EARS prefixes map to fs_agent_discovery_module.md §4.1.
 *
 * These three EARS moved here from agent_discovery.test.ts when the module was split into
 * interface (pure) and implementation (Node-only). Their ids did not change: the code and
 * these tests cite them by id.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverInstalledAgents } from './fs_agent_discovery';

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'disc-test-'));
}

function writePackageJson(dir: string, pkg: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

describe('FS Agent Discovery (fs_agent_discovery_module.md)', () => {

  describe('4.1. Package Scanning (DISC-A1 to A3)', () => {

    it('[DISC-A1] should discover agents from node_modules/@gitgov/agent-*', () => {
      const root = createTmpDir();
      const nmGitgov = path.join(root, 'node_modules', '@gitgov');

      writePackageJson(path.join(nmGitgov, 'agent-security-audit'), {
        name: '@gitgov/agent-security-audit',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent', categories: ['pii-email'] } },
      });

      writePackageJson(path.join(nmGitgov, 'agent-semgrep'), {
        name: '@gitgov/agent-semgrep',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent', categories: ['security-vulnerability'] } },
      });

      const result = discoverInstalledAgents(root);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.id).sort()).toEqual([
        'agent:security-audit',
        'agent:semgrep',
      ]);

      fs.rmSync(root, { recursive: true });
    });

    it('[DISC-A2] should return empty array when node_modules does not exist', () => {
      const root = createTmpDir();
      const result = discoverInstalledAgents(root);
      expect(result).toEqual([]);
      fs.rmSync(root, { recursive: true });
    });

    it('[DISC-A3] should skip packages without gitgov.agent field', () => {
      const root = createTmpDir();
      const nmGitgov = path.join(root, 'node_modules', '@gitgov');

      writePackageJson(path.join(nmGitgov, 'agent-valid'), {
        name: '@gitgov/agent-valid',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent' } },
      });

      writePackageJson(path.join(nmGitgov, 'agent-no-gitgov'), {
        name: '@gitgov/agent-no-gitgov',
      });

      writePackageJson(path.join(nmGitgov, 'core'), {
        name: '@gitgov/core',
      });

      const result = discoverInstalledAgents(root);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('agent:valid');

      fs.rmSync(root, { recursive: true });
    });
  });
});
