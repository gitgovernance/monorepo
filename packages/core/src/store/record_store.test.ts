import { RecordStore } from './record_store';
import type { ActorRecord } from '../types/actor_record';
import type { AgentRecord } from '../types/agent_record';
import type { TaskRecord } from '../types/task_record';
import type { CycleRecord } from '../types/cycle_record';
import type { ExecutionRecord } from '../types/execution_record';
import type { ChangelogRecord } from '../types/changelog_record';
import type { FeedbackRecord } from '../types/feedback_record';
import type { GitGovRecord, Signature } from '../models';
import * as path from 'path';
import { createExecutionRecord, createChangelogRecord, createFeedbackRecord } from '../factories';

// This is our hand-made mock for the fs dependencies.
const mockFs = {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
};

const testRoot = '/tmp/gitgov-test-root';


describe('RecordStore<ActorRecord>', () => {
  // Use a type alias for clarity in the tests
  type ActorStore = RecordStore<ActorRecord>;
  let actorStore: ActorStore;

  const actorsDir = path.join(testRoot, '.gitgov', 'actors');

  beforeAll(() => {
    // Set up mocks once for all tests in this suite
    mockFs.mkdir.mockResolvedValue(undefined as never);
  });

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    jest.restoreAllMocks();
    actorStore = new RecordStore<ActorRecord>('actors', testRoot, mockFs as any);
  });

  const actorPayload: ActorRecord = {
    id: 'human:test-user', type: 'human', displayName: 'Test User',
    publicKey: 'some-key', roles: ['author'], status: 'active',
  };

  const mockHeader = {
    version: '1.0' as const,
    type: 'actor' as const,
    payloadChecksum: 'valid-checksum',
    // Provide a valid signature object to satisfy the type
    signatures: [{ keyId: 'a', role: 'b', signature: 'c', timestamp: 1, timestamp_iso: 'd' }] as [Signature, ...Signature[]],
  };

  const actorRecord: GitGovRecord & { payload: ActorRecord } = {
    header: mockHeader,
    payload: actorPayload,
  };
  const actorFileName = 'human_test-user.json';
  const expectedPath = path.join(actorsDir, actorFileName);

  describe('write', () => {
    it('[EARS-1 & EARS-2] should write a record and create the directory', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      await actorStore.write(actorRecord);
      expect(mockFs.mkdir).toHaveBeenCalledWith(actorsDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining('"id": "human:test-user"'),
        'utf-8'
      );
    });
  });

  describe('read', () => {
    it('[EARS-3] should read an existing record', async () => {
      const mockContent = JSON.stringify(actorRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await actorStore.read(actorPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
      expect(readData).toEqual(actorRecord);
    });

    it('[EARS-4] should return null if the record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await actorStore.read('non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('delete', () => {
    it('[EARS-5] should delete an existing file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      await actorStore.delete(actorPayload.id);
      expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('list', () => {
    it('[EARS-6] should list all record IDs from the directory', async () => {
      // Mock the simplest case: readdir returns Dirent objects with just the properties we need
      const mockFiles = [
        { name: 'human_test-user.json', isFile: () => true },
        { name: 'agent_another.json', isFile: () => true },
        { name: 'not-json.txt', isFile: () => true },
        { name: 'a-directory', isFile: () => false, isDirectory: () => true },
      ];
      mockFs.readdir.mockResolvedValue(mockFiles);
      const ids = await actorStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(actorsDir, { withFileTypes: true });
      expect(ids).toEqual(['human:test-user', 'agent:another']);
    });
  });

  describe('exists', () => {
    it('[EARS-7] should return true if a record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await actorStore.exists(actorPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-8] should return false if a record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await actorStore.exists('non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('RecordStore<AgentRecord>', () => {
  // Use a type alias for clarity in the tests
  type AgentStore = RecordStore<AgentRecord>;
  let agentStore: AgentStore;

  const agentsDir = path.join(testRoot, '.gitgov', 'agents');

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    jest.restoreAllMocks();
    agentStore = new RecordStore<AgentRecord>('agents', testRoot, mockFs as any);
  });

  const agentPayload: AgentRecord = {
    id: 'agent:test-agent', guild: 'design', status: 'active',
    engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
    triggers: [], knowledge_dependencies: [], prompt_engine_requirements: {}
  };

  const mockAgentHeader = {
    version: '1.0' as const,
    type: 'agent' as const,
    payloadChecksum: 'valid-agent-checksum',
    signatures: [{ keyId: 'agent:test-agent', role: 'author', signature: 'sig', timestamp: 1, timestamp_iso: 'd' }] as [Signature, ...Signature[]],
  };

  const agentRecord: GitGovRecord & { payload: AgentRecord } = {
    header: mockAgentHeader,
    payload: agentPayload,
  };
  const agentFileName = 'agent_test-agent.json';
  const expectedAgentPath = path.join(agentsDir, agentFileName);

  describe('write', () => {
    it('[EARS-1 & EARS-2] should write an agent record and create the directory', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      await agentStore.write(agentRecord);
      expect(mockFs.mkdir).toHaveBeenCalledWith(agentsDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedAgentPath,
        expect.stringContaining('"id": "agent:test-agent"'),
        'utf-8'
      );
    });
  });

  describe('read', () => {
    it('[EARS-3] should read an existing agent record', async () => {
      const mockContent = JSON.stringify(agentRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await agentStore.read(agentPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedAgentPath, 'utf-8');
      expect(readData).toEqual(agentRecord);
    });

    it('[EARS-4] should return null if the agent record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await agentStore.read('agent:non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('delete', () => {
    it('[EARS-5] should delete an existing agent file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      await agentStore.delete(agentPayload.id);
      expect(mockFs.unlink).toHaveBeenCalledWith(expectedAgentPath);
    });
  });

  describe('list', () => {
    it('[EARS-6] should list all agent record IDs from the directory', async () => {
      const mockFiles = [
        { name: 'agent_test-agent.json', isFile: () => true },
        { name: 'agent_design-bot.json', isFile: () => true },
        { name: 'not-json.txt', isFile: () => true },
        { name: 'a-directory', isFile: () => false, isDirectory: () => true },
      ];
      mockFs.readdir.mockResolvedValue(mockFiles);
      const ids = await agentStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(agentsDir, { withFileTypes: true });
      expect(ids).toEqual(['agent:test-agent', 'agent:design-bot']);
    });
  });

  describe('exists', () => {
    it('[EARS-7] should return true if an agent record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await agentStore.exists(agentPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-8] should return false if an agent record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await agentStore.exists('agent:non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('RecordStore<TaskRecord>', () => {
  type TaskStore = RecordStore<TaskRecord>;
  let taskStore: TaskStore;

  const tasksDir = path.join(testRoot, '.gitgov', 'tasks');

  beforeEach(() => {
    jest.restoreAllMocks();
    taskStore = new RecordStore<TaskRecord>('tasks', testRoot, mockFs as any);
  });

  const taskPayload: TaskRecord = {
    id: '1752274500-task-test-task', title: 'Test Task',
    status: 'draft', priority: 'medium', description: 'A test task for store validation', tags: ['test']
  };

  const mockTaskHeader = {
    version: '1.0' as const,
    type: 'task' as const,
    payloadChecksum: 'valid-task-checksum',
    signatures: [{ keyId: 'human:test-user', role: 'author', signature: 'sig', timestamp: 1, timestamp_iso: 'd' }] as [Signature, ...Signature[]],
  };

  const taskRecord: GitGovRecord & { payload: TaskRecord } = {
    header: mockTaskHeader,
    payload: taskPayload,
  };
  const taskFileName = '1752274500-task-test-task.json';
  const expectedTaskPath = path.join(tasksDir, taskFileName);

  describe('write', () => {
    it('[EARS-1 & EARS-2] should write a task record and create the directory', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      await taskStore.write(taskRecord);
      expect(mockFs.mkdir).toHaveBeenCalledWith(tasksDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedTaskPath,
        expect.stringContaining('"id": "1752274500-task-test-task"'),
        'utf-8'
      );
    });
  });

  describe('read', () => {
    it('[EARS-3] should read an existing task record', async () => {
      const mockContent = JSON.stringify(taskRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await taskStore.read(taskPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedTaskPath, 'utf-8');
      expect(readData).toEqual(taskRecord);
    });

    it('[EARS-4] should return null if the task record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await taskStore.read('1752274500-task-non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('list', () => {
    it('[EARS-6] should list all task record IDs from the directory', async () => {
      const mockFiles = [
        { name: '1752274500-task-test-task.json', isFile: () => true },
        { name: '1752360900-task-another-task.json', isFile: () => true },
        { name: 'not-json.txt', isFile: () => true },
        { name: 'a-directory', isFile: () => false, isDirectory: () => true },
      ];
      mockFs.readdir.mockResolvedValue(mockFiles);
      const ids = await taskStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(tasksDir, { withFileTypes: true });
      expect(ids).toEqual(['1752274500-task-test-task', '1752360900-task-another-task']);
    });
  });

  describe('exists', () => {
    it('[EARS-7] should return true if a task record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await taskStore.exists(taskPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-8] should return false if a task record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await taskStore.exists('1752274500-task-non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('RecordStore<CycleRecord>', () => {
  type CycleStore = RecordStore<CycleRecord>;
  let cycleStore: CycleStore;

  const cyclesDir = path.join(testRoot, '.gitgov', 'cycles');

  beforeEach(() => {
    jest.restoreAllMocks();
    cycleStore = new RecordStore<CycleRecord>('cycles', testRoot, mockFs as any);
  });

  const cyclePayload: CycleRecord = {
    id: '1754400000-cycle-test-cycle', title: 'Test Cycle',
    status: 'planning', taskIds: ['1752274500-task-test-task'], tags: ['test']
  };

  const mockCycleHeader = {
    version: '1.0' as const,
    type: 'cycle' as const,
    payloadChecksum: 'valid-cycle-checksum',
    signatures: [{ keyId: 'human:test-user', role: 'author', signature: 'sig', timestamp: 1, timestamp_iso: 'd' }] as [Signature, ...Signature[]],
  };

  const cycleRecord: GitGovRecord & { payload: CycleRecord } = {
    header: mockCycleHeader,
    payload: cyclePayload,
  };
  const cycleFileName = '1754400000-cycle-test-cycle.json';
  const expectedCyclePath = path.join(cyclesDir, cycleFileName);

  describe('write', () => {
    it('[EARS-1 & EARS-2] should write a cycle record and create the directory', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      await cycleStore.write(cycleRecord);
      expect(mockFs.mkdir).toHaveBeenCalledWith(cyclesDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedCyclePath,
        expect.stringContaining('"id": "1754400000-cycle-test-cycle"'),
        'utf-8'
      );
    });
  });

  describe('read', () => {
    it('[EARS-3] should read an existing cycle record', async () => {
      const mockContent = JSON.stringify(cycleRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await cycleStore.read(cyclePayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedCyclePath, 'utf-8');
      expect(readData).toEqual(cycleRecord);
    });

    it('[EARS-4] should return null if the cycle record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await cycleStore.read('1754400000-cycle-non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('list', () => {
    it('[EARS-6] should list all cycle record IDs from the directory', async () => {
      const mockFiles = [
        { name: '1754400000-cycle-test-cycle.json', isFile: () => true },
        { name: '1754500000-cycle-another-cycle.json', isFile: () => true },
        { name: 'not-json.txt', isFile: () => true },
        { name: 'a-directory', isFile: () => false, isDirectory: () => true },
      ];
      mockFs.readdir.mockResolvedValue(mockFiles);
      const ids = await cycleStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(cyclesDir, { withFileTypes: true });
      expect(ids).toEqual(['1754400000-cycle-test-cycle', '1754500000-cycle-another-cycle']);
    });
  });

  describe('exists', () => {
    it('[EARS-7] should return true if a cycle record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await cycleStore.exists(cyclePayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-8] should return false if a cycle record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await cycleStore.exists('1754400000-cycle-non-existent');
      expect(result).toBe(false);
    });
  });
});

// --- ExecutionRecord Tests ---
describe('RecordStore<ExecutionRecord>', () => {
  let executionStore: RecordStore<ExecutionRecord>;
  let mockExecutionRecord: any;

  beforeEach(async () => {
    executionStore = new RecordStore('executions', testRoot, mockFs as any);
    mockExecutionRecord = {
      header: { type: 'execution', version: '1.0' },
      payload: await createExecutionRecord({
        id: '1757460000-exec-test-execution',
        title: 'Test Execution',
        taskId: '1757452191-task-implement-workflow-methodology-adapter',
        result: 'Completed successfully.', // Added valid result
      }),
    };
  });

  it('[EARS-9] should write an ExecutionRecord', async () => {
    await executionStore.write(mockExecutionRecord);
    const expectedPath = path.join('/tmp/gitgov-test-root', '.gitgov', 'executions', '1757460000-exec-test-execution.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-10] should read an ExecutionRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockExecutionRecord));
    const record = await executionStore.read(mockExecutionRecord.payload.id);
    expect(record).toEqual(mockExecutionRecord);
  });
});

// --- ChangelogRecord Tests ---
describe('RecordStore<ChangelogRecord>', () => {
  let changelogStore: RecordStore<ChangelogRecord>;
  let mockChangelogRecord: any;

  beforeEach(async () => {
    changelogStore = new RecordStore('changelogs', testRoot, mockFs as any);
    mockChangelogRecord = {
      header: { type: 'changelog', version: '1.0' },
      payload: await createChangelogRecord({
        id: '1757460001-changelog-task-implement-workflow-methodology-adapter',
        entityType: 'task',
        entityId: '1757452191-task-implement-workflow-methodology-adapter',
        changeType: 'completion',
        title: 'Workflow Methodology Adapter Completed',
        description: 'Successfully completed the implementation of workflow methodology adapter with all requirements',
        triggeredBy: 'human:developer',
        reason: 'All acceptance criteria met and code review passed'
      }),
    };
  });

  it('[EARS-11] should write a ChangelogRecord', async () => {
    await changelogStore.write(mockChangelogRecord);
    const expectedPath = path.join('/tmp/gitgov-test-root', '.gitgov', 'changelogs', '1757460001-changelog-task-implement-workflow-methodology-adapter.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-12] should read a ChangelogRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockChangelogRecord));
    const record = await changelogStore.read(mockChangelogRecord.payload.id);
    expect(record).toEqual(mockChangelogRecord);
  });
});

// --- FeedbackRecord Tests ---
describe('RecordStore<FeedbackRecord>', () => {
  let feedbackStore: RecordStore<FeedbackRecord>;
  let mockFeedbackRecord: any;

  beforeEach(async () => {
    feedbackStore = new RecordStore('feedback', testRoot, mockFs as any);
    mockFeedbackRecord = {
      header: { type: 'feedback', version: '1.0' },
      payload: await createFeedbackRecord({
        id: '1757460002-feedback-test-feedback',
        entityId: '1757452191-task-implement-workflow-methodology-adapter',
        content: 'This looks great!'
      }),
    };
  });

  it('[EARS-13] should write a FeedbackRecord', async () => {
    await feedbackStore.write(mockFeedbackRecord);
    const expectedPath = path.join('/tmp/gitgov-test-root', '.gitgov', 'feedback', '1757460002-feedback-test-feedback.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-14] should read a FeedbackRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockFeedbackRecord));
    const record = await feedbackStore.read(mockFeedbackRecord.payload.id);
    expect(record).toEqual(mockFeedbackRecord);
  });
});
