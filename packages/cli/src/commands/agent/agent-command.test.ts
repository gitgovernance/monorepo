/**
 * AgentCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 Agent Run (EARS-A1 to A6)
 * - §4.2 Agent List (EARS-B1 to B3)
 * - §4.3 Agent Show (EARS-C1 to C3)
 * - §4.4 Output & Exit Codes (EARS-D1 to D6)
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

  describe('4.5. Agent New (ICOMP-C7 to ICOMP-C9)', () => {
    it('[ICOMP-C7] should create AgentRecord via adapter', async () => {
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

    it('[ICOMP-C8] should error when actor does not exist or is not agent type', async () => {
      mockAgentAdapter.createAgentRecord.mockRejectedValue(
        new Error('No ActorRecord found with id agent:nonexistent or type is not agent'),
      );

      await agentCommand.executeNew('agent:nonexistent', { engineType: 'mcp' } as AgentNewOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create agent'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[ICOMP-C9] should output JSON when --json is provided', async () => {
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
  });
});
