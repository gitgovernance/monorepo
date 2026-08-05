/**
 * Agent Discovery Module Tests
 *
 * Spec: agent_discovery_module.md (DISC-A1..C3)
 * Tests written BEFORE code (TDD).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverInstalledAgents, mergeAgentSources, packageToAgentRecord } from './agent_discovery';
import type { AgentRecord } from '../record_types/generated/agent_record';

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'disc-test-'));
}

function writePackageJson(dir: string, pkg: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

describe('Agent Discovery (agent_discovery_module.md)', () => {

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

  describe('4.2. Record Mapping (DISC-B1 to B2)', () => {

    it('[DISC-B1] should map package name to agent ID and engine config', () => {
      const pkg = {
        name: '@gitgov/agent-security-audit',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent', categories: ['pii-email'] } },
      };

      const record = packageToAgentRecord(pkg);

      expect(record.id).toBe('agent:security-audit');
      expect(record.engine.type).toBe('local');
      expect((record.engine as { entrypoint?: string }).entrypoint).toBe('@gitgov/agent-security-audit');
      expect((record.engine as { function?: string }).function).toBe('runAgent');
    });

    it('[DISC-B2] should set metadata.discovered true and include categories', () => {
      const pkg = {
        name: '@gitgov/agent-semgrep',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent', categories: ['security-vulnerability', 'code-quality'] } },
      };

      const record = packageToAgentRecord(pkg);
      const meta = record.metadata as Record<string, unknown>;

      expect(meta['discovered']).toBe(true);
      expect(meta['purpose']).toBe('audit');
      expect(meta['categories']).toEqual(['security-vulnerability', 'code-quality']);
    });
  });

  describe('4.3. Source Merging (DISC-C1 to C3)', () => {

    const makeRecord = (id: string, discovered = false): AgentRecord => ({
      id,
      engine: { type: 'local' as const, entrypoint: id, function: 'runAgent' },
      metadata: { purpose: 'audit', discovered },
    });

    it('[DISC-C1] should merge registered and new discovered agents', () => {
      const registered = [makeRecord('agent:security-audit')];
      const discovered = [makeRecord('agent:semgrep', true)];

      const result = mergeAgentSources(registered, discovered);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.id).sort()).toEqual([
        'agent:security-audit',
        'agent:semgrep',
      ]);
    });

    it('[DISC-C2] should keep registered version when IDs collide', () => {
      const registered = [makeRecord('agent:security-audit')];
      const discovered = [makeRecord('agent:security-audit', true)];

      const result = mergeAgentSources(registered, discovered);

      expect(result).toHaveLength(1);
      expect((result[0]!.metadata as Record<string, unknown>)['discovered']).toBeFalsy();
    });

    it('[DISC-C3] should return registered agents when no discovered', () => {
      const registered = [makeRecord('agent:security-audit'), makeRecord('agent:semgrep')];

      const result = mergeAgentSources(registered, []);

      expect(result).toHaveLength(2);
      expect(result).toEqual(registered);
    });
  });
});
