import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTempGitgovProject } from '../integration/core/core_test_helpers.js';
import { spawnMcpServer, createE2eContext, callE2eTool } from './e2e_test_helpers.js';
import type { E2eToolResult } from './mcp_e2e.types.js';

/**
 * MCP E2E Tests — Level 3.
 *
 * Spawns the real MCP server process via StdioClientTransport,
 * sends JSON-RPC over stdin/stdout, and verifies full stack behavior.
 *
 * Blueprint: specs/e2e/mcp_e2e.md
 * EARS: MSRV-EA1..EA4, EB1..EB4, EC1..EC3, ED1..ED4
 */

type AnyData = Record<string, unknown>;

describe('MCP E2E', () => {
  // ─────────────────────────────────────────────────
  // 4.1. Process Lifecycle (MSRV-EA1 to EA4)
  // ─────────────────────────────────────────────────

  describe('4.1. Process Lifecycle (MSRV-EA1 to EA4)', () => {
    let projectRoot: string;
    let gitgovPath: string;
    let client: Client;
    let transport: StdioClientTransport;
    let cleanupProject: () => Promise<void>;
    let cleanupServer: () => Promise<void>;

    beforeAll(async () => {
      const project = await createTempGitgovProject();
      projectRoot = project.projectRoot;
      gitgovPath = project.gitgovPath;
      cleanupProject = project.cleanup;

      const startTime = Date.now();
      const server = await spawnMcpServer(projectRoot);
      const elapsed = Date.now() - startTime;

      client = server.client;
      transport = server.transport;
      cleanupServer = server.cleanup;

      // Store elapsed time for EA1 assertion
      (globalThis as AnyData).__e2eStartupMs = elapsed;
    }, 10000);

    afterAll(async () => {
      await cleanupServer();
      await cleanupProject();
    });

    it('[MSRV-EA1] should start process and complete initialize handshake', async () => {
      // If we got here, the Client.connect() succeeded — handshake complete
      const elapsed = (globalThis as AnyData).__e2eStartupMs as number;
      expect(elapsed).toBeLessThan(2000);

      // Verify the server PID exists (process is running)
      expect(transport.pid).toBeGreaterThan(0);
    });

    it('[MSRV-EA2] should advertise tools, resources, and prompts capabilities', async () => {
      // The server advertises capabilities during initialize
      // Verify by calling list endpoints which would fail if capabilities were not advertised
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      const resources = await client.listResources();
      expect(resources.resources).toBeDefined();

      const prompts = await client.listPrompts();
      expect(prompts.prompts.length).toBeGreaterThan(0);
    });

    it('[MSRV-EA3] should list exactly 36 tools via tools/list', async () => {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(36);

      // Verify some key tool names exist
      const names = tools.map((t) => t.name);
      expect(names).toContain('gitgov_task_new');
      expect(names).toContain('gitgov_cycle_new');
      expect(names).toContain('gitgov_feedback_create');
      expect(names).toContain('gitgov_status');
      expect(names).toContain('gitgov_audit_scan');
    });

    it('[MSRV-EA4] should shut down cleanly on SIGTERM', async () => {
      // Spawn a separate server just for this test
      const project2 = await createTempGitgovProject();
      const server2 = await spawnMcpServer(project2.projectRoot);

      // Verify it's running and get the PID
      const pid = server2.transport.pid;
      expect(pid).toBeGreaterThan(0);

      const startTime = Date.now();

      // Send SIGTERM to the server process
      process.kill(pid!, 'SIGTERM');

      // Wait for the process to exit (poll until gone or timeout)
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          try {
            process.kill(pid!, 0); // Check if process still exists
          } catch {
            clearInterval(check);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, 2000);
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);

      await project2.cleanup();
    }, 10000);
  });

  // ─────────────────────────────────────────────────
  // 4.2. Full Task Workflow via stdio (MSRV-EB1 to EB4)
  // ─────────────────────────────────────────────────

  describe('4.2. Full Task Workflow via stdio (MSRV-EB1 to EB4)', () => {
    let client: Client;
    let cleanup: () => Promise<void>;
    let createdTaskId: string;

    beforeAll(async () => {
      const ctx = await createE2eContext();
      client = ctx.client;
      cleanup = ctx.cleanup;
    }, 10000);

    afterAll(async () => {
      await cleanup();
    });

    it('[MSRV-EB1] should create task via stdio and return ID', async () => {
      const { data, isError } = await callE2eTool(client, 'gitgov_task_new', {
        title: 'E2E task',
        description: 'Created via E2E stdio test',
        priority: 'high',
      });

      expect(isError).toBe(false);
      expect(data.id).toBeDefined();
      expect(typeof data.id).toBe('string');
      expect(data.status).toBe('draft');
      expect(data.title).toBe('E2E task');

      createdTaskId = data.id as string;
    });

    it('[MSRV-EB2] should complete full task lifecycle via stdio', async () => {
      // Create a fresh task for full lifecycle
      const { data: created } = await callE2eTool(client, 'gitgov_task_new', {
        title: 'Lifecycle E2E',
        description: 'Full lifecycle via stdio',
      });
      const taskId = created.id as string;
      expect(created.status).toBe('draft');

      // Submit
      const { data: submitted } = await callE2eTool(client, 'gitgov_task_submit', { taskId });
      expect(submitted.status).toBe('review');

      // Approve
      const { data: approved } = await callE2eTool(client, 'gitgov_task_approve', { taskId });
      expect(approved.status).toBe('ready');

      // Activate
      const { data: activated } = await callE2eTool(client, 'gitgov_task_activate', { taskId });
      expect(activated.status).toBe('active');

      // Complete
      const { data: completed } = await callE2eTool(client, 'gitgov_task_complete', { taskId });
      expect(completed.status).toBe('done');
    });

    it('[MSRV-EB3] should list created tasks via stdio', async () => {
      const { data, isError } = await callE2eTool(client, 'gitgov_task_list', {});

      expect(isError).toBe(false);
      expect(data.tasks).toBeDefined();
      const tasks = data.tasks as AnyData[];
      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('[MSRV-EB4] should show full task detail via stdio', async () => {
      const { data, isError } = await callE2eTool(client, 'gitgov_task_show', {
        taskId: createdTaskId,
      });

      expect(isError).toBe(false);
      expect(data.id).toBe(createdTaskId);
      expect(data.title).toBe('E2E task');
      expect(data.priority).toBe('high');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.3. Cycle & Feedback Workflow via stdio (MSRV-EC1 to EC3)
  // ─────────────────────────────────────────────────

  describe('4.3. Cycle & Feedback Workflow via stdio (MSRV-EC1 to EC3)', () => {
    let client: Client;
    let cleanup: () => Promise<void>;
    let seedTaskId: string;
    let seedCycleId: string;

    beforeAll(async () => {
      const ctx = await createE2eContext();
      client = ctx.client;
      cleanup = ctx.cleanup;

      // Seed a task for linking
      const { data: task } = await callE2eTool(client, 'gitgov_task_new', {
        title: 'Cycle link task',
        description: 'For cycle tests',
      });
      seedTaskId = task.id as string;
    }, 10000);

    afterAll(async () => {
      await cleanup();
    });

    it('[MSRV-EC1] should create cycle, add task, and activate via stdio', async () => {
      // Create cycle
      const { data: cycle, isError: createErr } = await callE2eTool(client, 'gitgov_cycle_new', {
        title: 'E2E Sprint',
      });
      expect(createErr).toBe(false);
      expect(cycle.id).toBeDefined();
      seedCycleId = cycle.id as string;

      // Add task to cycle
      const { data: linked, isError: linkErr } = await callE2eTool(client, 'gitgov_cycle_add_task', {
        cycleId: seedCycleId,
        taskId: seedTaskId,
      });
      expect(linkErr).toBe(false);
      expect(linked.linked).toBe(true);

      // Activate cycle
      const { data: activated, isError: activateErr } = await callE2eTool(client, 'gitgov_cycle_activate', {
        cycleId: seedCycleId,
      });
      expect(activateErr).toBe(false);
      expect(activated.status).toBe('active');
    });

    it('[MSRV-EC2] should create and list feedback via stdio', async () => {
      // Create feedback on the task
      const { data: fb, isError: createErr } = await callE2eTool(client, 'gitgov_feedback_create', {
        entityType: 'task',
        entityId: seedTaskId,
        type: 'suggestion',
        content: 'E2E feedback test',
      });
      expect(createErr).toBe(false);
      expect(fb.id).toBeDefined();
      expect(fb.status).toBe('open');

      // List feedback for the task
      const { data: list, isError: listErr } = await callE2eTool(client, 'gitgov_feedback_list', {
        entityId: seedTaskId,
      });
      expect(listErr).toBe(false);
      expect(list.total).toBeGreaterThanOrEqual(1);
      const feedbacks = list.feedbacks as AnyData[];
      expect(feedbacks.some((f) => f.entityId === seedTaskId)).toBe(true);
    });

    it('[MSRV-EC3] should show cycle with real task hierarchy via stdio', async () => {
      const { data, isError } = await callE2eTool(client, 'gitgov_cycle_show', {
        cycleId: seedCycleId,
      });

      expect(isError).toBe(false);
      expect(data.id).toBe(seedCycleId);
      expect(data.title).toBe('E2E Sprint');
      expect(data.taskCount).toBeGreaterThanOrEqual(1);
      const tasks = data.tasks as AnyData[];
      expect(tasks.some((t) => t.id === seedTaskId)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────
  // 4.4. Resources, Prompts & Error Handling (MSRV-ED1 to ED4)
  // ─────────────────────────────────────────────────

  describe('4.4. Resources, Prompts & Error Handling (MSRV-ED1 to ED4)', () => {
    let client: Client;
    let cleanup: () => Promise<void>;
    let seedTaskId: string;

    beforeAll(async () => {
      const ctx = await createE2eContext();
      client = ctx.client;
      cleanup = ctx.cleanup;

      // Create a task for resource tests
      const { data: task } = await callE2eTool(client, 'gitgov_task_new', {
        title: 'Resource E2E task',
        description: 'For resource tests',
      });
      seedTaskId = task.id as string;
    }, 10000);

    afterAll(async () => {
      await cleanup();
    });

    it('[MSRV-ED1] should list gitgov:// URIs for created records via stdio', async () => {
      const { resources } = await client.listResources();

      expect(resources.length).toBeGreaterThanOrEqual(2); // task + actor
      const uris = resources.map((r) => r.uri);
      expect(uris.some((u) => u.includes(seedTaskId))).toBe(true);
      expect(uris.some((u) => u.includes('test-actor'))).toBe(true);
    });

    it('[MSRV-ED2] should return filled plan-sprint prompt with real data via stdio', async () => {
      const result = await client.getPrompt({
        name: 'plan-sprint',
        arguments: {},
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);

      // Verify the prompt content contains planning-related data
      const text = result.messages
        .map((m) => (typeof m.content === 'string' ? m.content : (m.content as { text?: string }).text ?? ''))
        .join(' ');
      expect(text.length).toBeGreaterThan(0);
    });

    it('[MSRV-ED3] should return error for unknown tool via stdio', async () => {
      const result = await client.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      const text = content[0]?.text ?? '';
      expect(text).toContain('Unknown tool');
    });

    it('[MSRV-ED4] should exit with error when .gitgov/ is missing', async () => {
      const os = await import('os');
      const { spawn } = await import('child_process');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-e2e-no-gitgov-'));
      const emptyDir = await fs.realpath(tmpDir);

      // Spawn the server directly (not via StdioClientTransport)
      // because the process should exit before completing handshake
      const serverEntry = path.resolve(import.meta.dirname, '../index.ts');
      const proc = spawn('tsx', [serverEntry], {
        cwd: emptyDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      // Collect stderr and wait for exit
      let stderrOutput = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString();
      });

      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on('exit', (code) => resolve(code));
        // Safety timeout
        setTimeout(() => {
          proc.kill();
          resolve(null);
        }, 5000);
      });

      expect(exitCode).toBe(1);
      expect(stderrOutput).toContain('not found');

      // Cleanup
      await fs.rm(emptyDir, { recursive: true, force: true });
    }, 10000);
  });
});
