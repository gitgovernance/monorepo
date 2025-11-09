// Mock IdentityAdapter before importing
jest.doMock('../adapters/identity_adapter', () => ({
  IdentityAdapter: jest.fn().mockImplementation(() => ({
    getActorPublicKey: jest.fn().mockResolvedValue('mock-public-key'),
    getActor: jest.fn(),
    createActor: jest.fn(),
    listActors: jest.fn(),
    signRecord: jest.fn(),
    rotateActorKey: jest.fn(),
    revokeActor: jest.fn(),
    resolveCurrentActorId: jest.fn(),
    getCurrentActor: jest.fn(),
    getEffectiveActorForAgent: jest.fn(),
    authenticate: jest.fn(),
    createAgentRecord: jest.fn(),
    getAgentRecord: jest.fn(),
    listAgentRecords: jest.fn(),
  }))
}));

import { RecordStore } from './record_store';
import type { FsDependencies } from './record_store';
import type { ActorRecord } from '../types';
import type { AgentRecord } from '../types';
import type { TaskRecord } from '../types';
import type { CycleRecord } from '../types';
import type { ExecutionRecord } from '../types';
import type { ChangelogRecord } from '../types';
import type { FeedbackRecord } from '../types';
import type { GitGovRecord, Signature } from '../types';
import * as path from 'path';
import type { Dirent } from 'fs';
import { createExecutionRecord, createChangelogRecord, createFeedbackRecord } from '../factories';
import { loadActorRecord, loadAgentRecord, loadTaskRecord, loadCycleRecord, loadExecutionRecord, loadChangelogRecord, loadFeedbackRecord } from '../factories';

// This is our hand-made mock for the fs dependencies.
const mockFs: jest.Mocked<FsDependencies> = {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
};


// Helper function to create mock Dirent objects
const createMockDirent = (name: string, isFile = true) => ({
  name,
  isFile: () => isFile,
  isDirectory: () => !isFile,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
}) as any; // Using any here because Jest mocks are complex to type correctly

// Helper function to create mock Signature objects
const createMockSignature = (keyId = 'human:test-user'): Signature => ({
  keyId,
  role: 'author',
  notes: 'RecordStore test signature',
  signature: 'mock-signature-hash',
  timestamp: 1704067200000
});


describe('RecordStore<ActorRecord>', () => {
  // Use a type alias for clarity in the tests
  type ActorStore = RecordStore<ActorRecord>;
  let actorStore: ActorStore;
  let testRoot: string;
  let actorsDir: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    actorsDir = path.join(testRoot, '.gitgov', 'actors');
    expectedPath = path.join(actorsDir, actorFileName);
    // Set up mocks once for all tests in this suite
    mockFs.mkdir.mockResolvedValue(undefined as never);
  });

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    jest.restoreAllMocks();
    actorStore = new RecordStore<ActorRecord>('actors', loadActorRecord, testRoot, mockFs);
  });

  const actorPayload: ActorRecord = {
    id: 'human:test-user', type: 'human', displayName: 'Test User',
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Valid 44-char base64
    roles: ['author'], status: 'active',
  };

  const mockHeader = {
    version: '1.0' as const,
    type: 'actor' as const,
    payloadChecksum: 'valid-checksum',
    // Provide a valid signature object to satisfy the type
    signatures: [{ keyId: 'a', role: 'b', notes: '', signature: 'c', timestamp: 1 }] as [Signature, ...Signature[]],
  };

  const actorRecord: GitGovRecord & { payload: ActorRecord } = {
    header: mockHeader,
    payload: actorPayload,
  };
  const actorFileName = 'human_test-user.json';
  let expectedPath: string;

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
    it('[EARS-5] should read an existing record', async () => {
      const mockContent = JSON.stringify(actorRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await actorStore.read(actorPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
      expect(readData).toEqual(actorRecord);
    });

    it('[EARS-6] should return null if the record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await actorStore.read('non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('delete', () => {
    it('[EARS-10] should delete an existing file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      await actorStore.delete(actorPayload.id);
      expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('list', () => {
    it('[EARS-11] should list all record IDs from the directory', async () => {
      // Mock the simplest case: readdir returns Dirent objects with just the properties we need
      const mockFiles = [
        createMockDirent('human_test-user.json'),
        createMockDirent('agent_another.json'),
        createMockDirent('not-json.txt'),
        createMockDirent('a-directory', false),
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      const ids = await actorStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(actorsDir, { withFileTypes: true });
      expect(ids).toEqual(['human:test-user', 'agent:another']);
    });
  });

  describe('exists', () => {
    it('[EARS-12] should return true if a record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await actorStore.exists(actorPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-13] should return false if a record does not exist', async () => {
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
  let testRoot: string;
  let agentsDir: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    agentsDir = path.join(testRoot, '.gitgov', 'agents');
    expectedAgentPath = path.join(agentsDir, agentFileName);
  });

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    jest.restoreAllMocks();
    agentStore = new RecordStore<AgentRecord>('agents', loadAgentRecord, testRoot, mockFs);
  });

  const agentPayload: AgentRecord = {
    id: 'agent:test-agent', status: 'active',
    engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
    triggers: [], knowledge_dependencies: [], prompt_engine_requirements: {}
  };

  const mockAgentHeader = {
    version: '1.0' as const,
    type: 'agent' as const,
    payloadChecksum: 'valid-agent-checksum',
    signatures: [{ keyId: 'agent:test-agent', role: 'author', notes: '', signature: 'sig', timestamp: 1 }] as [Signature, ...Signature[]],
  };

  const agentRecord: GitGovRecord & { payload: AgentRecord } = {
    header: mockAgentHeader,
    payload: agentPayload,
  };
  const agentFileName = 'agent_test-agent.json';
  let expectedAgentPath: string;

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
    it('[EARS-5] should read an existing agent record', async () => {
      const mockContent = JSON.stringify(agentRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await agentStore.read(agentPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedAgentPath, 'utf-8');
      expect(readData).toEqual(agentRecord);
    });

    it('[EARS-6] should return null if the agent record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await agentStore.read('agent:non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('delete', () => {
    it('[EARS-10] should delete an existing agent file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      await agentStore.delete(agentPayload.id);
      expect(mockFs.unlink).toHaveBeenCalledWith(expectedAgentPath);
    });
  });

  describe('list', () => {
    it('[EARS-11] should list all agent record IDs from the directory', async () => {
      const mockFiles = [
        createMockDirent('agent_test-agent.json'),
        createMockDirent('agent_design-bot.json'),
        createMockDirent('not-json.txt'),
        createMockDirent('a-directory', false),
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      const ids = await agentStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(agentsDir, { withFileTypes: true });
      expect(ids).toEqual(['agent:test-agent', 'agent:design-bot']);
    });
  });

  describe('exists', () => {
    it('[EARS-12] should return true if an agent record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await agentStore.exists(agentPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-13] should return false if an agent record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await agentStore.exists('agent:non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('RecordStore<TaskRecord>', () => {
  type TaskStore = RecordStore<TaskRecord>;
  let taskStore: TaskStore;
  let testRoot: string;
  let tasksDir: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tasksDir = path.join(testRoot, '.gitgov', 'tasks');
    expectedTaskPath = path.join(tasksDir, taskFileName);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    taskStore = new RecordStore<TaskRecord>('tasks', loadTaskRecord, testRoot, mockFs);
  });

  const taskPayload: TaskRecord = {
    id: '1752274500-task-test-task', title: 'Test Task',
    status: 'draft', priority: 'medium', description: 'A test task for store validation', tags: ['test']
  };

  const mockTaskHeader = {
    version: '1.0' as const,
    type: 'task' as const,
    payloadChecksum: 'valid-task-checksum',
    signatures: [{ keyId: 'human:test-user', role: 'author', notes: '', signature: 'sig', timestamp: 1 }] as [Signature, ...Signature[]],
  };

  const taskRecord: GitGovRecord & { payload: TaskRecord } = {
    header: mockTaskHeader,
    payload: taskPayload,
  };
  const taskFileName = '1752274500-task-test-task.json';
  let expectedTaskPath: string;

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
    it('[EARS-5] should read an existing task record', async () => {
      const mockContent = JSON.stringify(taskRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await taskStore.read(taskPayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedTaskPath, 'utf-8');
      expect(readData).toEqual(taskRecord);
    });

    it('[EARS-6] should return null if the task record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await taskStore.read('1752274500-task-non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('list', () => {
    it('[EARS-11] should list all task record IDs from the directory', async () => {
      const mockFiles = [
        createMockDirent('1752274500-task-test-task.json'),
        createMockDirent('1752360900-task-another-task.json'),
        createMockDirent('not-json.txt'),
        createMockDirent('a-directory', false),
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      const ids = await taskStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(tasksDir, { withFileTypes: true });
      expect(ids).toEqual(['1752274500-task-test-task', '1752360900-task-another-task']);
    });
  });

  describe('exists', () => {
    it('[EARS-12] should return true if a task record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await taskStore.exists(taskPayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-13] should return false if a task record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await taskStore.exists('1752274500-task-non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('RecordStore<CycleRecord>', () => {
  type CycleStore = RecordStore<CycleRecord>;
  let cycleStore: CycleStore;
  let testRoot: string;
  let cyclesDir: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cyclesDir = path.join(testRoot, '.gitgov', 'cycles');
    expectedCyclePath = path.join(cyclesDir, cycleFileName);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    cycleStore = new RecordStore<CycleRecord>('cycles', loadCycleRecord, testRoot, mockFs);
  });

  const cyclePayload: CycleRecord = {
    id: '1754400000-cycle-test-cycle', title: 'Test Cycle',
    status: 'planning', taskIds: ['1752274500-task-test-task'], tags: ['test']
  };

  const mockCycleHeader = {
    version: '1.0' as const,
    type: 'cycle' as const,
    payloadChecksum: 'valid-cycle-checksum',
    signatures: [{ keyId: 'human:test-user', role: 'author', notes: '', signature: 'sig', timestamp: 1 }] as [Signature, ...Signature[]],
  };

  const cycleRecord: GitGovRecord & { payload: CycleRecord } = {
    header: mockCycleHeader,
    payload: cyclePayload,
  };
  const cycleFileName = '1754400000-cycle-test-cycle.json';
  let expectedCyclePath: string;

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
    it('[EARS-5] should read an existing cycle record', async () => {
      const mockContent = JSON.stringify(cycleRecord);
      mockFs.readFile.mockResolvedValue(mockContent);
      const readData = await cycleStore.read(cyclePayload.id);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedCyclePath, 'utf-8');
      expect(readData).toEqual(cycleRecord);
    });

    it('[EARS-6] should return null if the cycle record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      const readData = await cycleStore.read('1754400000-cycle-non-existent');
      expect(readData).toBeNull();
    });
  });

  describe('list', () => {
    it('[EARS-11] should list all cycle record IDs from the directory', async () => {
      const mockFiles = [
        createMockDirent('1754400000-cycle-test-cycle.json'),
        createMockDirent('1754500000-cycle-another-cycle.json'),
        createMockDirent('not-json.txt'),
        createMockDirent('a-directory', false),
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      const ids = await cycleStore.list();
      expect(mockFs.readdir).toHaveBeenCalledWith(cyclesDir, { withFileTypes: true });
      expect(ids).toEqual(['1754400000-cycle-test-cycle', '1754500000-cycle-another-cycle']);
    });
  });

  describe('exists', () => {
    it('[EARS-12] should return true if a cycle record exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const result = await cycleStore.exists(cyclePayload.id);
      expect(mockFs.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('[EARS-13] should return false if a cycle record does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const result = await cycleStore.exists('1754400000-cycle-non-existent');
      expect(result).toBe(false);
    });
  });
});

// --- Validation Methods Tests ---
// Mock the validation module at the top level
jest.mock('../validation/embedded_metadata_validator', () => ({
  validateFullEmbeddedMetadataRecord: jest.fn().mockResolvedValue(undefined),
  validateEmbeddedMetadataDetailed: jest.fn().mockReturnValue({ isValid: true, errors: [] })
}));

import { validateFullEmbeddedMetadataRecord, validateEmbeddedMetadataDetailed } from '../validation/embedded_metadata_validator';
const mockValidateFullEmbeddedMetadataRecord = validateFullEmbeddedMetadataRecord as jest.MockedFunction<typeof validateFullEmbeddedMetadataRecord>;
const mockValidateEmbeddedMetadataDetailed = validateEmbeddedMetadataDetailed as jest.MockedFunction<typeof validateEmbeddedMetadataDetailed>;

// Global beforeEach to reset validation mocks
beforeEach(() => {
  mockValidateFullEmbeddedMetadataRecord.mockResolvedValue(undefined);
  mockValidateEmbeddedMetadataDetailed.mockReturnValue({ isValid: true, errors: [] });
});

describe('RecordStore Validation Methods', () => {
  let actorStore: RecordStore<ActorRecord>;
  let testRoot: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    actorStore = new RecordStore<ActorRecord>('actors', loadActorRecord, testRoot, mockFs);
  });

  const validActorRecord: GitGovRecord & { payload: ActorRecord } = {
    header: {
      version: '1.0' as const,
      type: 'actor' as const,
      payloadChecksum: 'valid-checksum',
      signatures: [{ keyId: 'human:test-user', role: 'author', notes: '', signature: 'sig', timestamp: 1 }] as [Signature, ...Signature[]],
    },
    payload: {
      id: 'human:test-user', type: 'human', displayName: 'Test User',
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Valid 44-char base64
      roles: ['author'], status: 'active',
    }
  };

  describe('write (dumb storage)', () => {
    it('[EARS-3] should persist record without validation (validation is adapter responsibility)', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await actorStore.write(validActorRecord);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('human_test-user.json'),
        JSON.stringify(validActorRecord, null, 2),
        'utf-8'
      );
      // RecordStore should NOT call validation - that's adapter responsibility
      expect(mockValidateFullEmbeddedMetadataRecord).not.toHaveBeenCalled();
    });

    it('[EARS-4] should persist any record without validation (even invalid ones)', async () => {
      const invalidRecord = { ...validActorRecord, payload: { ...validActorRecord.payload, id: '' } };
      mockFs.writeFile.mockResolvedValue(undefined);

      await actorStore.write(invalidRecord);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        JSON.stringify(invalidRecord, null, 2),
        'utf-8'
      );
      // RecordStore should NOT validate - it's "dumb storage"
      expect(mockValidateFullEmbeddedMetadataRecord).not.toHaveBeenCalled();
    });
  });

  describe('read (dumb storage)', () => {
    it('[EARS-7] should return record WITH validation using loader', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(validActorRecord));

      const result = await actorStore.read('human:test-user');

      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('human_test-user.json'),
        'utf-8'
      );
      expect(result).toEqual(validActorRecord);
      // RecordStore NOW validates using the loader
    });

    it('[EARS-8] should return null for invalid records (validation catches them)', async () => {
      const invalidRecord = { ...validActorRecord, payload: { ...validActorRecord.payload, id: '' } };
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidRecord));

      // Spy on console.warn to verify it logs the warning
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await actorStore.read('human:test-user');

      expect(mockFs.readFile).toHaveBeenCalled();
      expect(result).toBeNull(); // Invalid records return null
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid actors record'),
        expect.anything()
      );

      warnSpy.mockRestore();
    });

    it('[EARS-9] should return null when record does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await actorStore.read('non-existent');

      expect(result).toBeNull();
      expect(mockFs.readFile).toHaveBeenCalled();
      // Should not call validation for non-existent records
      expect(mockValidateFullEmbeddedMetadataRecord).not.toHaveBeenCalled();
    });
  });
});

// --- ExecutionRecord Tests ---
describe('RecordStore<ExecutionRecord>', () => {
  let executionStore: RecordStore<ExecutionRecord>;
  let mockExecutionRecord: GitGovRecord & { payload: ExecutionRecord };
  let testRoot: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  beforeEach(async () => {
    executionStore = new RecordStore('executions', loadExecutionRecord, testRoot, mockFs);
    mockExecutionRecord = {
      header: {
        type: 'execution',
        version: '1.0',
        payloadChecksum: 'a'.repeat(64), // Mock SHA-256 hash
        signatures: [createMockSignature()]
      },
      payload: await createExecutionRecord({
        id: '1757460000-exec-test-execution',
        type: 'progress',
        title: 'Test Execution',
        taskId: '1757452191-task-implement-workflow-methodology-adapter',
        result: 'Completed successfully.',
      }),
    };
  });

  it('[EARS-1 & EARS-2] should write an ExecutionRecord', async () => {
    await executionStore.write(mockExecutionRecord);
    const expectedPath = path.join(testRoot, '.gitgov', 'executions', '1757460000-exec-test-execution.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-5] should read an ExecutionRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockExecutionRecord));
    const record = await executionStore.read(mockExecutionRecord.payload.id);
    expect(record).toEqual(mockExecutionRecord);
  });

  it('[EARS-6] should return null if ExecutionRecord does not exist', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockFs.readFile.mockRejectedValue(error);
    const readData = await executionStore.read('non-existent');
    expect(readData).toBeNull();
  });

  it('[EARS-10] should delete an ExecutionRecord', async () => {
    mockFs.unlink.mockResolvedValue(undefined);
    await executionStore.delete(mockExecutionRecord.payload.id);
    const expectedPath = path.join(testRoot, '.gitgov', 'executions', '1757460000-exec-test-execution.json');
    expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath);
  });

  it('[EARS-11] should list ExecutionRecord IDs', async () => {
    const mockFiles = [
      createMockDirent('1757460000-exec-test-execution.json'),
      createMockDirent('1757460001-exec-another.json'),
    ] as Dirent[];
    mockFs.readdir.mockResolvedValue(mockFiles as any);
    const ids = await executionStore.list();
    expect(ids).toEqual(['1757460000-exec-test-execution', '1757460001-exec-another']);
  });

  it('[EARS-12] should return true if ExecutionRecord exists', async () => {
    mockFs.access.mockResolvedValue(undefined);
    const result = await executionStore.exists(mockExecutionRecord.payload.id);
    expect(result).toBe(true);
  });

  it('[EARS-13] should return false if ExecutionRecord does not exist', async () => {
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    const result = await executionStore.exists('non-existent');
    expect(result).toBe(false);
  });
});

// --- ChangelogRecord Tests ---
describe('RecordStore<ChangelogRecord>', () => {
  let changelogStore: RecordStore<ChangelogRecord>;
  let mockChangelogRecord: GitGovRecord & { payload: ChangelogRecord };
  let testRoot: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  beforeEach(async () => {
    changelogStore = new RecordStore('changelogs', loadChangelogRecord, testRoot, mockFs);
    mockChangelogRecord = {
      header: {
        type: 'changelog',
        version: '1.0',
        payloadChecksum: 'b'.repeat(64), // Mock SHA-256 hash
        signatures: [createMockSignature()]
      },
      payload: await createChangelogRecord({
        id: '1757460001-changelog-task-implement-workflow-methodology-adapter',
        title: 'Workflow Methodology Adapter Completed',
        description: 'Successfully completed the implementation of workflow methodology adapter with all requirements',
        relatedTasks: ['1757452191-task-implement-workflow-methodology-adapter'],
        completedAt: 1757460001
      }),
    };
  });

  it('[EARS-1 & EARS-2] should write a ChangelogRecord', async () => {
    await changelogStore.write(mockChangelogRecord);
    const expectedPath = path.join(testRoot, '.gitgov', 'changelogs', '1757460001-changelog-task-implement-workflow-methodology-adapter.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-5] should read a ChangelogRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockChangelogRecord));
    const record = await changelogStore.read(mockChangelogRecord.payload.id);
    expect(record).toEqual(mockChangelogRecord);
  });

  it('[EARS-6] should return null if ChangelogRecord does not exist', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockFs.readFile.mockRejectedValue(error);
    const readData = await changelogStore.read('non-existent');
    expect(readData).toBeNull();
  });

  it('[EARS-10] should delete a ChangelogRecord', async () => {
    mockFs.unlink.mockResolvedValue(undefined);
    await changelogStore.delete(mockChangelogRecord.payload.id);
    const expectedPath = path.join(testRoot, '.gitgov', 'changelogs', '1757460001-changelog-task-implement-workflow-methodology-adapter.json');
    expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath);
  });

  it('[EARS-11] should list ChangelogRecord IDs', async () => {
    const mockFiles = [
      createMockDirent('1757460001-changelog-task-implement-workflow-methodology-adapter.json'),
      createMockDirent('1757460002-changelog-another.json'),
    ] as Dirent[];
    mockFs.readdir.mockResolvedValue(mockFiles as any);
    const ids = await changelogStore.list();
    expect(ids).toEqual(['1757460001-changelog-task-implement-workflow-methodology-adapter', '1757460002-changelog-another']);
  });

  it('[EARS-12] should return true if ChangelogRecord exists', async () => {
    mockFs.access.mockResolvedValue(undefined);
    const result = await changelogStore.exists(mockChangelogRecord.payload.id);
    expect(result).toBe(true);
  });

  it('[EARS-13] should return false if ChangelogRecord does not exist', async () => {
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    const result = await changelogStore.exists('non-existent');
    expect(result).toBe(false);
  });
});

// --- FeedbackRecord Tests ---
describe('RecordStore<FeedbackRecord>', () => {
  let feedbackStore: RecordStore<FeedbackRecord>;
  let mockFeedbackRecord: GitGovRecord & { payload: FeedbackRecord };
  let testRoot: string;

  beforeAll(() => {
    // Create unique temp directory for this test suite
    testRoot = `/tmp/gitgov-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  beforeEach(async () => {
    feedbackStore = new RecordStore('feedback', loadFeedbackRecord, testRoot, mockFs);
    mockFeedbackRecord = {
      header: {
        type: 'feedback',
        version: '1.0',
        payloadChecksum: 'c'.repeat(64), // Mock SHA-256 hash
        signatures: [createMockSignature()]
      },
      payload: await createFeedbackRecord({
        id: '1757460002-feedback-test-feedback',
        entityId: '1757452191-task-implement-workflow-methodology-adapter',
        content: 'This looks great!'
      }),
    };
  });

  it('[EARS-1 & EARS-2] should write a FeedbackRecord', async () => {
    await feedbackStore.write(mockFeedbackRecord);
    const expectedPath = path.join(testRoot, '.gitgov', 'feedback', '1757460002-feedback-test-feedback.json');
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('[EARS-5] should read a FeedbackRecord', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockFeedbackRecord));
    const record = await feedbackStore.read(mockFeedbackRecord.payload.id);
    expect(record).toEqual(mockFeedbackRecord);
  });

  it('[EARS-6] should return null if FeedbackRecord does not exist', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockFs.readFile.mockRejectedValue(error);
    const readData = await feedbackStore.read('non-existent');
    expect(readData).toBeNull();
  });

  it('[EARS-10] should delete a FeedbackRecord', async () => {
    mockFs.unlink.mockResolvedValue(undefined);
    await feedbackStore.delete(mockFeedbackRecord.payload.id);
    const expectedPath = path.join(testRoot, '.gitgov', 'feedback', '1757460002-feedback-test-feedback.json');
    expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath);
  });

  it('[EARS-11] should list FeedbackRecord IDs', async () => {
    const mockFiles = [
      createMockDirent('1757460002-feedback-test-feedback.json'),
      createMockDirent('1757460003-feedback-another.json'),
    ] as Dirent[];
    mockFs.readdir.mockResolvedValue(mockFiles as any);
    const ids = await feedbackStore.list();
    expect(ids).toEqual(['1757460002-feedback-test-feedback', '1757460003-feedback-another']);
  });

  it('[EARS-12] should return true if FeedbackRecord exists', async () => {
    mockFs.access.mockResolvedValue(undefined);
    const result = await feedbackStore.exists(mockFeedbackRecord.payload.id);
    expect(result).toBe(true);
  });

  it('[EARS-13] should return false if FeedbackRecord does not exist', async () => {
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    const result = await feedbackStore.exists('non-existent');
    expect(result).toBe(false);
  });
});
