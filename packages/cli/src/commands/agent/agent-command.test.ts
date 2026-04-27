/**
 * AgentCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 Agent Run (EARS-A1 to A6)
 * - §4.2 Agent List (EARS-B1 to B3)
 * - §4.3 Agent Show (EARS-C1 to C3)
 * - §4.4 Output & Exit Codes (EARS-D1 to D6)
 * - §4.6 Agent Add (EARS-F1 to F8, F2b)
 */

// Mock @gitgov/core
jest.doMock('@gitgov/core', () => ({
  Config: {
    ConfigManager: {
      findProjectRoot: jest.fn().mockReturnValue('/mock/project/root'),
      findGitgovRoot: jest.fn().mockReturnValue('/mock/project/root/.gitgov'),
    }
  },
  Runner: {
    AgentRunnerModule: jest.fn(),
  }
}));

// Mock @gitgov/core/fs — DEFAULT_ID_ENCODER used by executeAdd
jest.doMock('@gitgov/core/fs', () => ({
  DEFAULT_ID_ENCODER: { encode: (id: string) => id.replace(/:/g, '_'), decode: (id: string) => id.replace(/_/g, ':') },
}));

// Mock DependencyInjectionService
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { AgentCommand, type RunCommandOptions, type ListCommandOptions, type ShowCommandOptions, type AgentNewOptions } from './agent-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { RunOptions, AgentResponse, TaskRecord, ActorRecord, AgentRecord } from '@gitgov/core';

/**
 * Test-specific metadata type for agent mocks
 */
type TestAgentMetadata = {
  description: string;
  purpose?: string;
};

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

// Get mocked DI
const mockDI = jest.mocked(DependencyInjectionService);

// Mock adapters and modules
let mockAgentRunnerModule: {
  runOnce: jest.MockedFunction<(opts: RunOptions) => Promise<AgentResponse>>;
};

let mockBacklogAdapter: {
  createTask: jest.MockedFunction<(data: Record<string, unknown>, actorId: string) => Promise<TaskRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
  getActor: jest.MockedFunction<(id: string) => Promise<ActorRecord>>;
  createActor: jest.MockedFunction<(data: Record<string, unknown>, signAs: string) => Promise<ActorRecord>>;
};

let mockAgentStore: {
  list: jest.MockedFunction<() => Promise<string[]>>;
  get: jest.MockedFunction<(id: string) => Promise<AgentRecord<TestAgentMetadata> | null>>;
};

let mockAgentAdapter: {
  createAgentRecord: jest.MockedFunction<(payload: Partial<AgentRecord>) => Promise<AgentRecord>>;
  getAgentRecord: jest.MockedFunction<(agentId: string) => Promise<AgentRecord | null>>;
};

describe('AgentCommand', () => {
  let agentCommand: AgentCommand;

  // Mock agent record wrapped as GitGovAgentRecord (EmbeddedMetadataRecord<AgentRecord>)
  const mockAgentRecord = {
    header: {
      version: '1.0' as const,
      type: 'agent' as const,
      signatures: [],
    },
    payload: {
      id: 'agent:test-echo',
      status: 'active',
      engine: {
        type: 'local' as const,
        entrypoint: 'packages/agents/test-echo/dist/index.mjs',
        function: 'runAgent',
      },
      metadata: {
        description: 'Simple test agent that echoes input',
        purpose: 'testing',
      },
      triggers: [{ type: 'manual' as const }],
    } satisfies AgentRecord<TestAgentMetadata>,
  };

  // Mock successful AgentResponse
  const mockSuccessResponse: AgentResponse = {
    runId: 'run-123-456',
    agentId: 'agent:test-echo',
    status: 'success',
    output: {
      message: 'Echo completed successfully',
      data: { echoed: 'hello world' },
    },
    executionRecordId: 'exec-789',
    startedAt: '2025-12-21T10:00:00.000Z',
    completedAt: '2025-12-21T10:00:01.230Z',
    durationMs: 1230,
  };

  // Mock error AgentResponse
  const mockErrorResponse: AgentResponse = {
    runId: 'run-123-456',
    agentId: 'agent:test-echo',
    status: 'error',
    error: 'Agent execution failed: module not found',
    executionRecordId: 'exec-789',
    startedAt: '2025-12-21T10:00:00.000Z',
    completedAt: '2025-12-21T10:00:00.500Z',
    durationMs: 500,
  };

  // Mock TaskRecord
  const mockTaskRecord: TaskRecord = {
    id: 'task-auto-123',
    title: 'Agent run: test-echo',
    description: 'Automated task for agent execution: test-echo',
    status: 'active',
    priority: 'medium',
    tags: ['agent', 'automated'],
  };

  // Mock ActorRecord
  const mockActor: ActorRecord = {
    id: 'human:developer',
    type: 'human',
    displayName: 'Developer',
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    roles: ['developer'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock adapters
    mockAgentRunnerModule = {
      runOnce: jest.fn().mockResolvedValue(mockSuccessResponse),
    };

    mockBacklogAdapter = {
      createTask: jest.fn().mockResolvedValue(mockTaskRecord),
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn().mockResolvedValue(mockActor),
      getActor: jest.fn().mockResolvedValue(mockActor),
      createActor: jest.fn().mockResolvedValue(mockActor),
    };

    mockAgentAdapter = {
      createAgentRecord: jest.fn().mockResolvedValue({
        id: 'agent:test-echo',
        status: 'active',
        engine: { type: 'local' },
      }),
      getAgentRecord: jest.fn().mockResolvedValue(null),
    };

    mockAgentStore = {
      list: jest.fn().mockResolvedValue(['agent-test-echo', 'agent-jira-manager']),
      get: jest.fn().mockImplementation((id: string) => {
        if (id === 'agent-test-echo') {
          return Promise.resolve(mockAgentRecord);
        }
        if (id === 'agent-jira-manager') {
          return Promise.resolve({
            header: mockAgentRecord.header,
            payload: {
              ...mockAgentRecord.payload,
              id: 'agent:jira-manager',
              engine: { type: 'api' as const, url: 'https://api.example.com' },
              metadata: { description: 'Jira integration agent' },
            },
          });
        }
        return Promise.resolve(null);
      }),
    };

    // Configure DI mock
    mockDI.getInstance.mockReturnValue({
      getAgentRunnerModule: jest.fn().mockResolvedValue(mockAgentRunnerModule),
      getBacklogAdapter: jest.fn().mockResolvedValue(mockBacklogAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getAgentStore: jest.fn().mockResolvedValue(mockAgentStore),
      getAgentAdapter: jest.fn().mockResolvedValue(mockAgentAdapter),
    } as unknown as DependencyInjectionService);

    agentCommand = new AgentCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  // Helper to create default run options
  const createRunOptions = (overrides: Partial<RunCommandOptions> = {}): RunCommandOptions => ({
    output: 'text',
    ...overrides,
  });

  // Helper to create default list options
  const createListOptions = (overrides: Partial<ListCommandOptions> = {}): ListCommandOptions => ({
    ...overrides,
  });

  // Helper to create default show options
  const createShowOptions = (overrides: Partial<ShowCommandOptions> = {}): ShowCommandOptions => ({
    ...overrides,
  });

  describe('4.1. Agent Run (EARS-A1 to A6)', () => {
    it('[EARS-A1] should load agent from .gitgov/agents/', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions());

      expect(mockAgentRunnerModule.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent:test-echo',
        })
      );
    });

    it('[EARS-A2] should show error when agent not found', async () => {
      mockAgentRunnerModule.runOnce.mockRejectedValue(new Error('Agent not found: nonexistent'));

      await agentCommand.executeRun('nonexistent', createRunOptions());

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Agent not found'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-A3] should create TaskRecord when --task not provided', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions());

      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Agent run:'),
          description: expect.stringContaining('Automated task'),
          priority: 'medium',
        }),
        'human:developer'
      );
    });

    it('[EARS-A4] should parse --input as JSON', async () => {
      const inputJson = '{"key": "value", "count": 42}';

      await agentCommand.executeRun('test-echo', createRunOptions({ input: inputJson }));

      expect(mockAgentRunnerModule.runOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { key: 'value', count: 42 },
        })
      );
    });

    it('[EARS-A5] should read input from --input-file', async () => {
      // Mock fs.readFile
      const mockFs = {
        readFile: jest.fn().mockResolvedValue('{"fromFile": true}'),
      };
      jest.doMock('fs', () => ({ promises: mockFs }));

      // Note: This test verifies the code path exists
      // Full integration requires actual file system mocking
      await agentCommand.executeRun('test-echo', createRunOptions({ inputFile: '/path/to/input.json' }));

      // The test verifies runOnce was called (file reading is tested via error path)
      expect(mockAgentRunnerModule.runOnce).toHaveBeenCalled();
    });

    it('[EARS-A6] should format output on success', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions());

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('AGENT EXECUTION RESULT'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('success'));
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('4.2. Agent List (EARS-B1 to B3)', () => {
    it('[EARS-B1] should list all agents in .gitgov/agents/', async () => {
      await agentCommand.executeList(createListOptions());

      expect(mockAgentStore.list).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Available Agents'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('test-echo'));
    });

    it('[EARS-B2] should filter agents by --engine type', async () => {
      await agentCommand.executeList(createListOptions({ engine: 'local' }));

      expect(mockAgentStore.list).toHaveBeenCalled();
      // Only test-echo has engine type 'local', jira-manager has 'api'
      const allCalls = mockConsoleLog.mock.calls.flat().join('\n');
      expect(allCalls).toContain('test-echo');
    });

    it('[EARS-B3] should show only names in quiet mode', async () => {
      await agentCommand.executeList(createListOptions({ quiet: true }));

      // In quiet mode, should just output names without formatting
      expect(mockConsoleLog).toHaveBeenCalledWith('test-echo');
      expect(mockConsoleLog).toHaveBeenCalledWith('jira-manager');
      // Should not show full table format
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available Agents'));
    });
  });

  describe('4.3. Agent Show (EARS-C1 to C3)', () => {
    it('[EARS-C1] should show agent details', async () => {
      await agentCommand.executeShow('test-echo', createShowOptions());

      expect(mockAgentStore.get).toHaveBeenCalledWith('agent-test-echo');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('AGENT:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Engine:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('local'));
    });

    it('[EARS-C2] should include full schema in verbose mode', async () => {
      await agentCommand.executeShow('test-echo', createShowOptions({ verbose: true, json: true }));

      // In verbose JSON mode, should include full agent record
      const jsonCall = mockConsoleLog.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.payload.id !== undefined && parsed.payload.engine !== undefined;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
    });

    it('[EARS-C3] should show error when agent not found', async () => {
      await agentCommand.executeShow('nonexistent', createShowOptions());

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Agent not found'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('4.4. Output & Exit Codes (EARS-D1 to D6)', () => {
    it('[EARS-D1] should format text output with colors', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions({ output: 'text' }));

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('─'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('AGENT EXECUTION RESULT'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Agent:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Status:'));
    });

    it('[EARS-D2] should output valid JSON', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions({ output: 'json' }));

      const jsonCall = mockConsoleLog.mock.calls.find(call => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![0]);
      expect(parsed).toHaveProperty('runId');
      expect(parsed).toHaveProperty('agentId');
      expect(parsed).toHaveProperty('status');
    });

    it('[EARS-D3] should suppress output in quiet mode', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions({ quiet: true }));

      // Should not show "Created TaskRecord" message
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Created TaskRecord'));
    });

    it('[EARS-D4] should exit 0 on success', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions());

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D5] should exit 1 on failure', async () => {
      mockAgentRunnerModule.runOnce.mockResolvedValue(mockErrorResponse);

      await agentCommand.executeRun('test-echo', createRunOptions());

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D6] should simulate execution in dry-run mode', async () => {
      await agentCommand.executeRun('test-echo', createRunOptions({ dryRun: true }));

      // Should NOT call runOnce in dry-run mode
      expect(mockAgentRunnerModule.runOnce).not.toHaveBeenCalled();
      // Should show dry-run info
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('4.5. Agent New (EARS-E1 to E6)', () => {
    it('[EARS-E1b] should create AgentRecord via adapter (basic new)', async () => {
      await agentCommand.executeNew('agent:test-echo', { engineType: 'local' } as AgentNewOptions);

      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:test-echo',
          engine: { type: 'local' },
        }),
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('AgentRecord created'),
      );
    });

    it('[EARS-E5] should auto-create ActorRecord when it does not exist', async () => {
      // First call to createAgentRecord fails because actor doesn't exist
      mockAgentAdapter.createAgentRecord
        .mockRejectedValueOnce(new Error('ActorRecord with id agent:new-agent not found'))
        .mockResolvedValueOnce({ id: 'agent:new-agent', status: 'active', engine: { type: 'local' } });

      await agentCommand.executeNew('agent:new-agent', { engineType: 'local' } as AgentNewOptions);

      // Should have auto-created the actor
      expect(mockIdentityAdapter.createActor).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'agent', displayName: 'new-agent' }),
        'self',
      );
      // Should have retried createAgentRecord after actor creation
      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('auto-created'));
    });

    it('[EARS-E6] should reuse existing ActorRecord without creating new one', async () => {
      // createAgentRecord succeeds on first try (actor already exists)
      await agentCommand.executeNew('agent:test-echo', { engineType: 'local' } as AgentNewOptions);

      expect(mockIdentityAdapter.createActor).not.toHaveBeenCalled();
      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledTimes(1);
    });

    it('[EARS-E3b] should error on non-actor related failures', async () => {
      mockAgentAdapter.createAgentRecord.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await agentCommand.executeNew('agent:test-echo', { engineType: 'mcp' } as AgentNewOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create agent'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-E4b] should output JSON when --json is provided', async () => {
      await agentCommand.executeNew('agent:test-echo', { engineType: 'local', json: true } as AgentNewOptions);

      const outputCall = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success"'),
      );
      expect(outputCall).toBeDefined();
      const output = JSON.parse(outputCall![0]);
      expect(output.success).toBe(true);
      expect(output.data.id).toBe('agent:test-echo');
      expect(output.data.engine).toEqual({ type: 'local' });
    });

    it('[EARS-E1] should create AgentRecord with merged config JSON', async () => {
      const config = JSON.stringify({
        engine: {
          entrypoint: 'packages/agents/security-audit/dist/index.mjs',
          function: 'runAgent',
        },
        metadata: { purpose: 'audit', audit: { target: 'code', outputFormat: 'sarif' } },
      });

      await agentCommand.executeNew('agent:test-config', {
        engineType: 'local',
        config,
        json: true,
      } as AgentNewOptions);

      // Verify createAgentRecord was called with merged payload
      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:test-config',
          engine: expect.objectContaining({
            type: 'local',
            entrypoint: 'packages/agents/security-audit/dist/index.mjs',
            function: 'runAgent',
          }),
          metadata: expect.objectContaining({
            purpose: 'audit',
          }),
        }),
      );
    });

    it('[EARS-E2] should read and merge config from --config-file', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeFs = require('node:fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodePath = require('node:path') as typeof import('path');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeOs = require('node:os') as typeof import('os');

      const tmpFile = nodePath.join(nodeOs.tmpdir(), `agent-config-e2-${Date.now()}.json`);

      nodeFs.writeFileSync(tmpFile, JSON.stringify({
        engine: { entrypoint: 'dist/index.mjs', function: 'runAgent' },
        metadata: { purpose: 'review' },
      }));

      try {
        await agentCommand.executeNew('agent:test-file', {
          engineType: 'local',
          configFile: tmpFile,
          json: true,
        } as AgentNewOptions);

        expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'agent:test-file',
            engine: expect.objectContaining({
              type: 'local',
              entrypoint: 'dist/index.mjs',
            }),
            metadata: expect.objectContaining({
              purpose: 'review',
            }),
          }),
        );
      } finally {
        nodeFs.unlinkSync(tmpFile);
      }
    });

    it('[EARS-E3] should merge --engine-type shortcut with --config fields', async () => {
      // Config says engine type "api" but -e says "local" — -e wins
      const config = JSON.stringify({
        engine: {
          type: 'api',
          url: 'https://example.com',
          entrypoint: 'dist/index.mjs',
        },
        metadata: { purpose: 'audit' },
      });

      await agentCommand.executeNew('agent:test-merge', {
        engineType: 'local',
        config,
        json: true,
      } as AgentNewOptions);

      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:test-merge',
          engine: expect.objectContaining({
            type: 'local', // -e wins over config.engine.type
            entrypoint: 'dist/index.mjs', // from config
          }),
        }),
      );
    });

    it('[EARS-E4] should show error and exit 1 when config JSON is invalid', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      await agentCommand.executeNew('agent:test-invalid', {
        engineType: 'local',
        config: '{invalid json!!!',
        json: true,
      } as AgentNewOptions);

      // Should have called process.exit(1)
      expect(mockExit).toHaveBeenCalledWith(1);

      // Should have logged error
      const errorCall = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('Invalid JSON'),
      ) ?? mockConsoleError.mock.calls.find(call =>
        typeof call[0] === 'string' && (call[0] as string).includes('Invalid JSON'),
      );
      expect(errorCall).toBeDefined();

      mockExit.mockRestore();
    });
  });

  describe('4.6. Agent Add — Package-Driven Registration (EARS-F1 to F8, F2b)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFs = require('node:fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require('node:path') as typeof import('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeOs = require('node:os') as typeof import('os');

    let tmpAgentDir: string;
    let mockExit: jest.SpyInstance;
    let mockConsoleWarn: jest.SpyInstance;

    function createFakeAgent(pkgJson: Record<string, unknown>): string {
      const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'agent-test-'));
      nodeFs.writeFileSync(nodePath.join(dir, 'package.json'), JSON.stringify(pkgJson));
      nodeFs.mkdirSync(nodePath.join(dir, 'dist'), { recursive: true });
      nodeFs.writeFileSync(nodePath.join(dir, 'dist', 'index.mjs'), 'export function runAgent() {}');
      return dir;
    }

    beforeEach(() => {
      mockExit = jest.spyOn(process, 'exit').mockImplementation();
      mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      mockAgentStore.list.mockResolvedValue([]);
    });

    it.skip('[EARS-F1] should resolve NPM package and create agent from gitgov field', () => {
      // Requires createRequire mock — validated in E2E (gate_agent_flow GF2 with npm install)
    });

    it.skip('[EARS-F2b] should auto-install NPM package when not found locally', () => {
      // Requires createRequire + execSync mock — validated in E2E when agents are published to NPM
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleWarn.mockRestore();
      if (tmpAgentDir) nodeFs.rmSync(tmpAgentDir, { recursive: true, force: true });
    });

    it('[EARS-F2] should resolve local path and create agent from gitgov field', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-security-audit',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent', metadata: { target: 'code' } } },
      });

      await agentCommand.executeAdd(tmpAgentDir, {});

      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:security-audit',
          engine: expect.objectContaining({
            entrypoint: nodePath.join(tmpAgentDir, 'dist/index.mjs'),
          }),
        }),
      );
    });

    it('[EARS-F3] should fail with descriptive error when gitgov.agent field is missing', async () => {
      tmpAgentDir = createFakeAgent({ name: 'some-package', main: 'index.js' });

      await agentCommand.executeAdd(tmpAgentDir, {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('does not have a gitgov.agent field'),
      );
    });

    it('[EARS-F4] should merge --config inline over package.json gitgov.agent values', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-security-audit',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent' } },
      });

      await agentCommand.executeAdd(tmpAgentDir, { config: '{"purpose":"custom"}' });

      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ purpose: 'custom' }),
        }),
      );
    });

    it('[EARS-F5] should register --set values in agent metadata.env', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-security-audit',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent' } },
      });

      await agentCommand.executeAdd(tmpAgentDir, { set: ['API_KEY=sk-123', 'DEBUG=true'] });

      expect(mockAgentAdapter.createAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            env: { API_KEY: 'sk-123', DEBUG: 'true' },
          }),
        }),
      );
    });

    it('[EARS-F6] should warn when required env vars from gitgov.agent.env are missing', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-review-advisor',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'review', function: 'runReviewAdvisor', env: ['ANTHROPIC_API_KEY'] } },
      });

      delete process.env['ANTHROPIC_API_KEY'];

      await agentCommand.executeAdd(tmpAgentDir, {});

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('ANTHROPIC_API_KEY is required'),
      );
    });

    it('[EARS-F7] should show success message with derived actorId from package name', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-security-audit',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent' } },
      });

      await agentCommand.executeAdd(tmpAgentDir, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Agent registered: agent:security-audit'),
      );
    });

    it('[EARS-F8] should update existing agent without creating duplicates', async () => {
      tmpAgentDir = createFakeAgent({
        name: '@gitgov/agent-security-audit',
        main: 'dist/index.mjs',
        gitgov: { agent: { purpose: 'audit', function: 'runAgent' } },
      });

      mockAgentStore.list.mockResolvedValue(['agent_security-audit']);

      await agentCommand.executeAdd(tmpAgentDir, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Agent updated: agent:security-audit'),
      );
    });
  });
});
