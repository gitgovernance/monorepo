/**
 * Protocol Integration Test Helpers — Level 1.
 *
 * Provides shared infrastructure for testing all 36 tools + resources + prompts
 * through the real MCP protocol via InMemoryTransport.
 */

import { vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '../../server/mcp_server.js';
import { registerAllTools } from '../../tools/index.js';
import { createResourceHandler } from '../../resources/index.js';
import { getAllPrompts } from '../../prompts/index.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { MockContainerOverrides } from './mcp_protocol_integration.types.js';

// ─── Mock Store Factory ───

function createMockStore<T>(
  records: Map<string, T> = new Map(),
) {
  return {
    list: vi.fn().mockResolvedValue(Array.from(records.keys())),
    get: vi.fn().mockImplementation(async (id: string) => records.get(id) ?? null),
    put: vi.fn(),
    putMany: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn().mockImplementation(async (id: string) => records.has(id)),
  };
}

// ─── Default Mock Data ───

function defaultTaskRecords() {
  return new Map([
    ['task-1', {
      header: { createdBy: 'actor-1', actorId: 'actor-1' },
      payload: {
        id: 'task-1', title: 'Fix bug', status: 'active', priority: 'high',
        cycleIds: ['cycle-1'], tags: ['bug'], description: 'Fix the login bug',
      },
    }],
  ]);
}

function defaultCycleRecords() {
  return new Map([
    ['cycle-1', {
      header: {},
      payload: {
        id: 'cycle-1', title: 'Sprint 1', status: 'active',
        taskIds: ['task-1'], childCycleIds: [],
      },
    }],
  ]);
}

function defaultActorRecords() {
  return new Map([
    ['actor-1', {
      header: { createdBy: 'actor-1' },
      payload: {
        id: 'actor-1', displayName: 'Alice', type: 'human',
        publicKey: 'pk-test', roles: ['admin'],
      },
    }],
  ]);
}

function defaultAgentRecords() {
  return new Map([
    ['agent-1', {
      header: {},
      payload: {
        id: 'agent-1', engine: { type: 'local', runtime: 'node' },
        status: 'active', triggers: [{ type: 'webhook' }],
      },
    }],
  ]);
}

// ─── Comprehensive Mock Container ───

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createComprehensiveMockContainer(overrides: MockContainerOverrides = {}): Record<string, unknown> {
  const tasks = overrides.tasks ?? defaultTaskRecords();
  const cycles = overrides.cycles ?? defaultCycleRecords();
  const actors = overrides.actors ?? defaultActorRecords();
  const agents = overrides.agents ?? defaultAgentRecords();

  return {
    stores: {
      tasks: createMockStore(tasks),
      cycles: createMockStore(cycles),
      actors: createMockStore(actors),
      agents: createMockStore(agents),
      feedbacks: createMockStore(),
      executions: createMockStore(),
    },
    backlogAdapter: {
      createTask: vi.fn().mockResolvedValue({
        id: 'task-new', title: 'New Task', status: 'draft',
        priority: 'medium', cycleIds: [],
      }),
      getTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Fix bug', status: 'draft', priority: 'high',
      }),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      submitTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Fix bug', status: 'review',
      }),
      approveTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Fix bug', status: 'ready',
      }),
      activateTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Fix bug', status: 'active',
      }),
      completeTask: vi.fn().mockResolvedValue({
        id: 'task-1', title: 'Fix bug', status: 'done',
      }),
      createCycle: vi.fn().mockResolvedValue({
        id: 'cycle-new', title: 'New Sprint', status: 'planning',
      }),
      getCycle: vi.fn().mockResolvedValue({
        id: 'cycle-1', title: 'Sprint 1', status: 'active', childCycleIds: [],
      }),
      updateCycle: vi.fn().mockResolvedValue({
        id: 'cycle-1', title: 'Sprint 1', status: 'active',
      }),
      addTaskToCycle: vi.fn().mockResolvedValue(undefined),
      removeTasksFromCycle: vi.fn().mockResolvedValue(undefined),
      moveTasksBetweenCycles: vi.fn().mockResolvedValue(undefined),
    },
    identityAdapter: {
      getCurrentActor: vi.fn().mockResolvedValue({
        id: 'actor-1', displayName: 'Alice', type: 'human',
      }),
      createActor: vi.fn().mockResolvedValue({
        id: 'new-actor', type: 'agent', displayName: 'Bot', roles: ['contributor'],
      }),
    },
    feedbackAdapter: {
      create: vi.fn().mockResolvedValue({
        id: 'fb-1', entityType: 'task', entityId: 'task-1',
        type: 'suggestion', status: 'open', content: 'Test feedback',
      }),
      getFeedback: vi.fn().mockResolvedValue({
        id: 'fb-1', status: 'open', type: 'suggestion',
      }),
      getFeedbackByEntity: vi.fn().mockResolvedValue([
        { id: 'fb-1', entityType: 'task', entityId: 'task-1', type: 'suggestion', status: 'open', content: 'Test' },
      ]),
      getAllFeedback: vi.fn().mockResolvedValue([
        { id: 'w1', type: 'approval', entityType: 'execution', status: 'resolved', entityId: 'fp1', content: 'False positive' },
      ]),
      resolve: vi.fn().mockResolvedValue({
        id: 'fb-1', status: 'resolved',
      }),
    },
    executionAdapter: {},
    lintModule: {
      lint: vi.fn().mockResolvedValue({
        results: [
          { level: 'warning', filePath: 'tasks/t.json', validator: 'schema', message: 'Minor issue', entity: { type: 'task', id: 't' }, fixable: false },
        ],
        summary: { filesChecked: 5, errors: 0, warnings: 1, fixable: 0, executionTime: 20 },
      }),
      lintFile: vi.fn(),
      fix: vi.fn(),
    },
    syncModule: {
      pushState: vi.fn().mockResolvedValue({ success: true, dryRun: false, filesChanged: 3 }),
      pullState: vi.fn().mockResolvedValue({ success: true, hasChanges: true, filesUpdated: 2 }),
      resolveConflict: vi.fn().mockResolvedValue({ success: true, resolved: true }),
      auditState: vi.fn().mockResolvedValue({ valid: true, violations: [], filesAudited: 15 }),
    },
    sourceAuditorModule: {
      audit: vi.fn().mockResolvedValue({
        findings: [
          { fingerprint: 'fp-1', severity: 'high', file: 'src/foo.ts', line: 42, message: 'Hardcoded secret' },
        ],
        summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0 },
      }),
    },
    agentRunner: {
      runOnce: vi.fn().mockResolvedValue({ status: 'success', output: 'Agent completed successfully' }),
    },
    projector: {
      computeProjection: vi.fn().mockResolvedValue({
        cycles: [{ header: {}, payload: { id: 'cycle-1', title: 'Sprint 1', status: 'active' } }],
        enrichedTasks: [
          { id: 'task-1', title: 'Fix bug', status: 'active', priority: 'high', cycleIds: ['cycle-1'] },
        ],
        metrics: { health: { overallScore: 85 } },
        derivedStates: { stalledTasks: [], atRiskTasks: [] },
      }),
      generateReport: vi.fn(),
    },
    configManager: {
      loadConfig: vi.fn().mockResolvedValue({ projectName: 'TestProject', protocolVersion: '2.0.0' }),
      getRootCycle: vi.fn(),
      getProjectInfo: vi.fn(),
    },
    sessionManager: {
      loadSession: vi.fn().mockResolvedValue({
        lastSession: { actorId: 'actor-1', timestamp: '2024-01-01T00:00:00Z' },
      }),
      detectActorFromKeyFiles: vi.fn(),
      getActorState: vi.fn(),
    },
  };
}

// ─── Protocol Test Pair ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockContainer = any;

/**
 * Creates a fully-wired McpServer + Client pair for protocol integration testing.
 * All 36 tools + resources + prompts are registered.
 */
export async function createProtocolTestPair(): Promise<{
  server: McpServer;
  client: Client;
  cleanup: () => Promise<void>;
  setMockDi: (container: MockContainer) => void;
}> {
  const server = new McpServer({ name: 'test-protocol', version: '1.0.0' });

  // Register all 36 tools
  registerAllTools(server);

  // Register resources handler
  server.registerResourceHandler(createResourceHandler());

  // Register all prompts
  for (const prompt of getAllPrompts()) {
    server.registerPrompt(prompt);
  }

  // Set default mock DI
  const defaultContainer = createComprehensiveMockContainer();
  server.setDI({
    getContainer: vi.fn().mockResolvedValue(defaultContainer),
  } as unknown as McpDependencyInjectionService);

  // Connect via InMemoryTransport
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connectTransport(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  const setMockDi = (container: MockContainer) => {
    server.setDI({
      getContainer: vi.fn().mockResolvedValue(container),
    } as unknown as McpDependencyInjectionService);
  };

  const cleanup = async () => {
    await client.close();
  };

  return { server, client, cleanup, setMockDi };
}

/**
 * Call a tool via MCP protocol and parse the JSON response.
 */
export async function callToolAndParse<T>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ data: T; isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content[0]?.text ?? '{}';
  const data = JSON.parse(text) as T;
  return { data, isError: (result.isError as boolean) ?? false };
}
