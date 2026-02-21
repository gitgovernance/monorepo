import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServer } from '../../server/mcp_server.js';
import {
  createProtocolTestPair,
  createComprehensiveMockContainer,
  callToolAndParse,
} from './protocol_test_helpers.js';
import type { MockContainer } from './protocol_test_helpers.js';

/**
 * MCP Protocol Integration Tests — Level 1.
 *
 * All 40 tools + resources + prompts tested through the real MCP protocol
 * via InMemoryTransport + Client. DI is mocked — the focus is the protocol layer.
 *
 * Blueprint: specs/integration/mcp_protocol_integration.md
 * EARS: MSRV-PA1..PA9, PB1..PB7, PC1..PC3, PD1..PD8, PE1..PE9, PF1..PF6, PG1..PG5
 */

let server: McpServer;
let client: Client;
let setMockDi: (container: MockContainer) => void;
let cleanup: () => Promise<void>;
let container: MockContainer;

beforeAll(async () => {
  const pair = await createProtocolTestPair();
  server = pair.server;
  client = pair.client;
  setMockDi = pair.setMockDi;
  cleanup = pair.cleanup;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  container = createComprehensiveMockContainer();
  setMockDi(container);
});

// ─── Helpers ───

type AnyData = Record<string, unknown>;

async function callTool<T = AnyData>(name: string, args: Record<string, unknown> = {}) {
  return callToolAndParse<T>(client, name, args);
}

describe('MCP Protocol Integration', () => {
  // ─────────────────────────────────────────────────
  // 4.1. Read Tools via Protocol (MSRV-PA1 to PA9)
  // ─────────────────────────────────────────────────

  describe('4.1. Read Tools via Protocol (MSRV-PA1 to PA9)', () => {
    it('[MSRV-PA1] should return status data via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_status');

      expect(isError).toBe(false);
      expect(data.projectName).toBe('TestProject');
      expect(data.activeCycles).toBeDefined();
      expect(data.recentTasks).toBeDefined();
      expect(data.health).toBeDefined();
    });

    it('[MSRV-PA2] should return context data via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_context');

      expect(isError).toBe(false);
      expect(data.config).toBeDefined();
      expect((data.config as AnyData).projectName).toBe('TestProject');
      expect(data.session).toBeDefined();
    });

    it('[MSRV-PA3] should return lint violations via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_lint');

      expect(isError).toBe(false);
      expect(data.violations).toBeDefined();
      expect(data.totalViolations).toBe(1);
    });

    it('[MSRV-PA4] should return all tasks via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_list');

      expect(isError).toBe(false);
      expect(data.tasks).toBeDefined();
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(data.total).toBe(1);
    });

    it('[MSRV-PA5] should return task detail via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_show', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.id).toBe('task-1');
      expect(data.title).toBe('Fix bug');
      expect(data.status).toBe('active');
    });

    it('[MSRV-PA6] should return all cycles via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_list');

      expect(isError).toBe(false);
      expect(data.cycles).toBeDefined();
      expect(Array.isArray(data.cycles)).toBe(true);
      expect(data.total).toBe(1);
    });

    it('[MSRV-PA7] should return cycle with tasks via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_show', { cycleId: 'cycle-1' });

      expect(isError).toBe(false);
      expect(data.id).toBe('cycle-1');
      expect(data.title).toBe('Sprint 1');
      expect(data.tasks).toBeDefined();
      expect(data.taskCount).toBeDefined();
    });

    it('[MSRV-PA8] should return all agents via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_agent_list');

      expect(isError).toBe(false);
      expect(data.agents).toBeDefined();
      expect(Array.isArray(data.agents)).toBe(true);
      expect(data.total).toBe(1);
    });

    it('[MSRV-PA9] should return agent detail via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_agent_show', { agentId: 'agent-1' });

      expect(isError).toBe(false);
      expect(data.id).toBe('agent-1');
      expect((data.engine as AnyData).type).toBe('local');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.2. Task Lifecycle Tools via Protocol (MSRV-PB1 to PB7)
  // ─────────────────────────────────────────────────

  describe('4.2. Task Lifecycle Tools via Protocol (MSRV-PB1 to PB7)', () => {
    it('[MSRV-PB1] should create task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_new', {
        title: 'Protocol test task',
        description: 'Created via MCP protocol',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('draft');
      expect(data.id).toBeDefined();
    });

    it('[MSRV-PB2] should delete draft task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_delete', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.deleted).toBe(true);
    });

    it('[MSRV-PB3] should submit task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_submit', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.status).toBe('review');
      expect(data.previousStatus).toBe('draft');
    });

    it('[MSRV-PB4] should approve task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_approve', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.status).toBe('ready');
      expect(data.previousStatus).toBe('review');
    });

    it('[MSRV-PB5] should activate task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_activate', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.status).toBe('active');
      expect(data.previousStatus).toBe('ready');
    });

    it('[MSRV-PB6] should complete task via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_task_complete', { taskId: 'task-1' });

      expect(isError).toBe(false);
      expect(data.status).toBe('done');
      expect(data.previousStatus).toBe('active');
    });

    it('[MSRV-PB7] should assign task via MCP protocol', async () => {
      container.backlogAdapter.getTask.mockResolvedValue({
        id: 'task-1', status: 'active', title: 'Fix bug',
      });
      container.stores.actors.get.mockResolvedValue({
        header: {}, payload: { id: 'actor-1', displayName: 'Alice', type: 'human' },
      });
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_task_assign', {
        taskId: 'task-1', actorId: 'actor-1',
      });

      expect(isError).toBe(false);
      expect(data.assigned).toBe(true);
      expect(data.taskId).toBe('task-1');
      expect(data.actorId).toBe('actor-1');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.3. Feedback Tools via Protocol (MSRV-PC1 to PC3)
  // ─────────────────────────────────────────────────

  describe('4.3. Feedback Tools via Protocol (MSRV-PC1 to PC3)', () => {
    it('[MSRV-PC1] should create feedback via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_feedback_create', {
        entityType: 'task',
        entityId: 'task-1',
        type: 'suggestion',
        content: 'Consider refactoring this function',
      });

      expect(isError).toBe(false);
      expect(data.id).toBe('fb-1');
      expect(data.entityType).toBe('task');
      expect(data.status).toBe('open');
    });

    it('[MSRV-PC2] should list feedbacks via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_feedback_list', {
        entityId: 'task-1',
      });

      expect(isError).toBe(false);
      expect(data.feedbacks).toBeDefined();
      expect(Array.isArray(data.feedbacks)).toBe(true);
    });

    it('[MSRV-PC3] should resolve feedback via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_feedback_resolve', {
        feedbackId: 'fb-1',
        content: 'Done',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('resolved');
      expect(data.previousStatus).toBe('open');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.4. Cycle Management Tools via Protocol (MSRV-PD1 to PD8)
  // ─────────────────────────────────────────────────

  describe('4.4. Cycle Management Tools via Protocol (MSRV-PD1 to PD8)', () => {
    it('[MSRV-PD1] should create cycle via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_new', {
        title: 'Sprint 2',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('planning');
      expect(data.title).toBe('New Sprint');
    });

    it('[MSRV-PD2] should activate cycle via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_activate', {
        cycleId: 'cycle-1',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('active');
      expect(data.previousStatus).toBe('planning');
    });

    it('[MSRV-PD3] should complete cycle via MCP protocol', async () => {
      container.backlogAdapter.updateCycle.mockResolvedValue({
        id: 'cycle-1', title: 'Sprint 1', status: 'completed',
      });
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_cycle_complete', {
        cycleId: 'cycle-1',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('completed');
    });

    it('[MSRV-PD4] should edit cycle via MCP protocol', async () => {
      container.backlogAdapter.updateCycle.mockResolvedValue({
        id: 'cycle-1', title: 'Updated Sprint', status: 'active',
      });
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_cycle_edit', {
        cycleId: 'cycle-1',
        title: 'Updated Sprint',
      });

      expect(isError).toBe(false);
      expect(data.title).toBe('Updated Sprint');
    });

    it('[MSRV-PD5] should add task to cycle via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_add_task', {
        cycleId: 'cycle-1',
        taskId: 'task-1',
      });

      expect(isError).toBe(false);
      expect(data.linked).toBe(true);
    });

    it('[MSRV-PD6] should remove task from cycle via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_remove_task', {
        cycleId: 'cycle-1',
        taskId: 'task-1',
      });

      expect(isError).toBe(false);
      expect(data.unlinked).toBe(true);
    });

    it('[MSRV-PD7] should move task between cycles via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_cycle_move_task', {
        taskId: 'task-1',
        fromCycleId: 'cycle-1',
        toCycleId: 'cycle-2',
      });

      expect(isError).toBe(false);
      expect(data.moved).toBe(true);
    });

    it('[MSRV-PD8] should add child cycle via MCP protocol', async () => {
      container.backlogAdapter.getCycle
        .mockResolvedValueOnce({ id: 'parent', title: 'Parent', status: 'active', childCycleIds: [] })
        .mockResolvedValueOnce({ id: 'child', title: 'Child', status: 'planning' });
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_cycle_add_child', {
        parentCycleId: 'parent',
        childCycleId: 'child',
      });

      expect(isError).toBe(false);
      expect(data.linked).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────
  // 4.5. Sync & Audit Tools via Protocol (MSRV-PE1 to PE9)
  // ─────────────────────────────────────────────────

  describe('4.5. Sync & Audit Tools via Protocol (MSRV-PE1 to PE9)', () => {
    it('[MSRV-PE1] should dry-run push via MCP protocol', async () => {
      container.syncModule.pushState.mockResolvedValue({
        success: true, dryRun: true, filesChanged: 0, preview: ['file1.json'],
      });
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_sync_push', { dryRun: true });

      expect(isError).toBe(false);
      expect(data.dryRun).toBe(true);
    });

    it('[MSRV-PE2] should push state via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_sync_push');

      expect(isError).toBe(false);
      expect(data.success).toBe(true);
    });

    it('[MSRV-PE3] should pull state via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_sync_pull');

      expect(isError).toBe(false);
      expect(data.success).toBe(true);
      expect(data.hasChanges).toBe(true);
    });

    it('[MSRV-PE4] should resolve conflict via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_sync_resolve', {
        reason: 'Manual merge preferred',
      });

      expect(isError).toBe(false);
      expect(data.resolved).toBe(true);
    });

    it('[MSRV-PE5] should audit state via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_sync_audit');

      expect(isError).toBe(false);
      expect(data.valid).toBe(true);
    });

    it('[MSRV-PE6] should scan for findings via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_audit_scan', { target: 'code' });

      expect(isError).toBe(false);
      expect(data.findings).toBeDefined();
      expect(Array.isArray(data.findings)).toBe(true);
    });

    it('[MSRV-PE7] should create waiver via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_audit_waive', {
        fingerprint: 'fp-1',
        justification: 'False positive confirmed',
      });

      expect(isError).toBe(false);
      expect(data.waiverId).toBeDefined();
      expect(data.fingerprint).toBe('fp-1');
    });

    it('[MSRV-PE8] should run agent via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_agent_run', {
        agentName: 'agent-1',
        taskId: 'task-1',
      });

      expect(isError).toBe(false);
      expect(data.status).toBe('success');
    });

    it('[MSRV-PE9] should create actor via MCP protocol', async () => {
      // Ensure actor doesn't already exist
      container.stores.actors.get.mockResolvedValue(null);
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_actor_new', {
        id: 'new-bot',
        type: 'agent',
        displayName: 'New Bot',
      });

      expect(isError).toBe(false);
      expect(data.id).toBe('new-actor');
      expect(data.type).toBe('agent');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.6. Resources & Prompts via Protocol (MSRV-PF1 to PF6)
  // ─────────────────────────────────────────────────

  describe('4.6. Resources & Prompts via Protocol (MSRV-PF1 to PF6)', () => {
    it('[MSRV-PF1] should list all resources via MCP protocol', async () => {
      const result = await client.listResources();

      expect(result.resources).toBeDefined();
      expect(Array.isArray(result.resources)).toBe(true);
      // Should have at least task, cycle, and actor resources
      expect(result.resources.length).toBeGreaterThanOrEqual(3);
      const uris = result.resources.map((r) => r.uri);
      expect(uris.some((u) => u.startsWith('gitgov://tasks/'))).toBe(true);
      expect(uris.some((u) => u.startsWith('gitgov://cycles/'))).toBe(true);
      expect(uris.some((u) => u.startsWith('gitgov://actors/'))).toBe(true);
    });

    it('[MSRV-PF2] should read resource by URI via MCP protocol', async () => {
      const result = await client.readResource({ uri: 'gitgov://tasks/task-1' });

      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      expect(result.contents[0].uri).toBe('gitgov://tasks/task-1');
      expect(result.contents[0].mimeType).toBe('application/json');
      // Content should be parseable JSON
      const content = result.contents[0] as { uri: string; text?: string; mimeType?: string };
      const record = JSON.parse(content.text!);
      expect(record).toBeDefined();
    });

    it('[MSRV-PF3] should return error for invalid URI via MCP protocol', async () => {
      await expect(
        client.readResource({ uri: 'invalid://not-a-resource' }),
      ).rejects.toThrow();
    });

    it('[MSRV-PF4] should list all prompts via MCP protocol', async () => {
      const result = await client.listPrompts();

      expect(result.prompts).toBeDefined();
      expect(result.prompts.length).toBe(3);
      const names = result.prompts.map((p) => p.name);
      expect(names).toContain('plan-sprint');
      expect(names).toContain('review-my-tasks');
      expect(names).toContain('prepare-pr-summary');
    });

    it('[MSRV-PF5] should return plan-sprint prompt via MCP protocol', async () => {
      const result = await client.getPrompt({ name: 'plan-sprint' });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      const msgContent = result.messages[0].content as { type: string; text: string };
      expect(msgContent.text).toContain('Sprint Planning');
    });

    it('[MSRV-PF6] should return review-my-tasks prompt via MCP protocol', async () => {
      const result = await client.getPrompt({ name: 'review-my-tasks' });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      // Prompt should reference the actor
      const msgContent = result.messages[0].content as { type: string; text: string };
      expect(msgContent.text).toContain('Alice');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.7. Schema Validation & Error Propagation (MSRV-PG1 to PG5)
  // ─────────────────────────────────────────────────

  describe('4.7. Schema Validation & Error Propagation (MSRV-PG1 to PG5)', () => {
    it('[MSRV-PG1] should reject tool call with missing required fields', async () => {
      // Call gitgov_task_new without required title/description
      // The handler will receive empty input; mock adapter to simulate real behavior
      container.backlogAdapter.createTask.mockRejectedValue(
        new Error('title is required'),
      );
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_task_new', {});

      expect(isError).toBe(true);
      expect(data.error).toBeDefined();
    });

    it('[MSRV-PG2] should handle tool call with extra unknown fields gracefully', async () => {
      // SDK does not enforce additionalProperties:false at protocol level.
      // Extra fields are passed to handler and ignored. Tool should still succeed.
      const { data, isError } = await callTool('gitgov_task_new', {
        title: 'Test',
        description: 'Test desc',
        unknownField: 'should be ignored',
      });

      // Tool should succeed — extra fields don't cause errors
      expect(isError).toBe(false);
      expect(data.status).toBe('draft');
    });

    it('[MSRV-PG3] should return isError when handler throws', async () => {
      // Make the handler throw via mock
      container.syncModule.pushState.mockRejectedValue(
        new Error('Connection refused'),
      );
      setMockDi(container);

      const { data, isError } = await callTool('gitgov_sync_push');

      expect(isError).toBe(true);
      expect(data.error).toBeDefined();
    });

    it('[MSRV-PG4] should list exactly 43 tools via MCP protocol', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBe(43);

      // Each tool should have name, description, and inputSchema
      for (const tool of result.tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
      }

      // Verify all tools start with gitgov_ prefix
      expect(result.tools.every((t) => t.name.startsWith('gitgov_'))).toBe(true);
    });

    it('[MSRV-PG5] should return isError for unknown tool via MCP protocol', async () => {
      const { data, isError } = await callTool('gitgov_nonexistent_tool');

      expect(isError).toBe(true);
      expect(data.error).toContain('Unknown tool');
    });
  });
});
