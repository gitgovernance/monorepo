/**
 * Agent Discovery Module Tests
 *
 * Spec: agent_discovery_module.md (DISC-B1..B2, C1..C3)
 * All EARS prefixes map to agent_discovery_module.md §4.2 and §4.3.
 *
 * This file covers the PURE half of the module. It imports nothing from `node:fs` on
 * purpose: DISC-A1..A3 (filesystem scanning) live in fs/fs_agent_discovery.test.ts.
 */

import { mergeAgentSources, packageToAgentRecord } from './agent_discovery';
import type { AgentRecord } from '../record_types/generated/agent_record';

describe('Agent Discovery (agent_discovery_module.md)', () => {

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
