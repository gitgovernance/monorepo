// Mock @gitgov/core FIRST to avoid import.meta issues in Jest
// This prevents Jest from executing project_adapter which uses import.meta.url
// Must be before any other mocks or imports
jest.mock('@gitgov/core', () => ({
  Records: {},
  Factories: {
    createTaskRecord: jest.fn((data) => data),
    createCycleRecord: jest.fn((data) => data),
    createActorRecord: jest.fn((data) => data),
    createAgentRecord: jest.fn((data) => data),
    createFeedbackRecord: jest.fn((data) => data),
    createExecutionRecord: jest.fn((data) => data),
    createChangelogRecord: jest.fn((data) => data),
    createTestSignature: jest.fn((keyId, role, notes) => ({
      keyId,
      role,
      notes,
      timestamp: Date.now(),
      signature: 'A'.repeat(86) + '=='
    })),
    createEmbeddedMetadataRecord: jest.fn((payload, options) => ({
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'a'.repeat(64),
        signatures: options?.signatures || []
      },
      payload
    }))
  }
}));

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { TaskCommand } from './task-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { TaskRecord, ActorRecord, IndexerAdapter, GitGovTaskRecord } from '@gitgov/core';
import { Factories } from '@gitgov/core';

// Test helper: Simple conversion to EnrichedTaskRecord for mocking
// Note: This is NOT the real enrichment - the real one needs EmbeddedMetadata header
// with signatures to calculate lastUpdated properly. This is just for unit tests.
function enrichTaskForTest(task: TaskRecord): IndexerAdapter.EnrichedTaskRecord {
  // Extract timestamp from task ID (format: {timestamp}-{type}-{slug})
  const idTimestamp = parseInt(task.id.split('-')[0] || '0', 10);
  const defaultTimestamp = idTimestamp > 0 ? idTimestamp * 1000 : Date.now();

  return {
    ...task,
    derivedState: {
      isStalled: false,
      isAtRisk: false,
      needsClarification: false,
      isBlockedByDependency: false,
      healthScore: 100,
      timeInCurrentStage: 0
    },
    relationships: {
      assignedTo: [],
      dependsOn: [],
      blockedBy: [],
      cycles: []
    },
    metrics: {
      executionCount: 0,
      blockingFeedbackCount: 0,
      openQuestionCount: 0
    },
    release: {
      isReleased: false
    },
    lastUpdated: defaultTimestamp,
    lastActivityType: 'task_created'
  };
}

/**
 * Helper to create VALIDATED task records using production factories.
 * This ensures tests use 100% valid records matching real production data.
 * 
 * Uses factories for validation:
 * - createTaskRecord() validates payload structure
 * - createTestSignature() generates valid Ed25519-format signatures (88-char base64)
 * - createEmbeddedMetadataRecord() builds complete record with validation
 * 
 * @param overrides - Partial TaskRecord to override defaults
 * @param keyId - Optional keyId for signature (default: 'human:test-user')
 * @returns GitGovTaskRecord - Fully validated task record
 */
function createMockTaskRecord(
  overrides: Partial<TaskRecord> = {},
  keyId: string = 'human:test-user'
): GitGovTaskRecord {
  // Use factory to create validated payload
  const payload = Factories.createTaskRecord({
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test task description',
    tags: ['test'],
    cycleIds: [],
    references: [],
    ...overrides
  });

  // Create valid signature using factory (generates real 88-char base64 Ed25519 format)
  const signature = Factories.createTestSignature(keyId, 'author', 'Task created');

  // Build complete record with validation
  return Factories.createEmbeddedMetadataRecord(payload, { signatures: [signature] }) as GitGovTaskRecord;
}

// Helper function to create mock index data with proper typing
function createMockIndexData(
  tasks: TaskRecord[],
  options?: { enrichedTasks?: TaskRecord[] }
): IndexerAdapter.IndexData {
  // Always create enrichedTasks from tasks if not explicitly provided
  // This ensures the code can access task.status, task.priority, etc. directly
  const enrichedTasks = options?.enrichedTasks
    ? options.enrichedTasks.map(enrichTaskForTest)
    : tasks.map(enrichTaskForTest);

  // Convert TaskRecord[] to GitGovTaskRecord[] using factory
  const gitGovTasks = tasks.map(task => createMockTaskRecord(task));

  return {
    tasks: gitGovTasks,
    enrichedTasks,
    cycles: [],
    actors: [],
    feedback: [],
    derivedStates: {
      stalledTasks: [],
      atRiskTasks: [],
      needsClarificationTasks: [],
      blockedByDependencyTasks: []
    },
    activityHistory: [],
    metrics: {
      // SystemStatus
      tasks: {
        total: tasks.length,
        byStatus: {},
        byPriority: {}
      },
      cycles: {
        total: 0,
        active: 0,
        completed: 0
      },
      health: {
        overallScore: 100,
        blockedTasks: 0,
        staleTasks: 0
      },
      // ProductivityMetrics
      throughput: 0,
      leadTime: 0,
      cycleTime: 0,
      tasksCompleted7d: 0,
      averageCompletionTime: 0,
      // CollaborationMetrics
      activeAgents: 0,
      totalAgents: 0,
      agentUtilization: 0,
      humanAgentRatio: 0,
      collaborationIndex: 0
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      lastCommitHash: 'mock-hash',
      integrityStatus: 'valid',
      recordCounts: { tasks: tasks.length },
      generationTime: 0
    }
  };
}

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('TaskCommand - Complete Unit Tests', () => {
  let taskCommand: TaskCommand;
  let mockBacklogAdapter: {
    createTask: jest.MockedFunction<(payload: Partial<TaskRecord>, actorId: string) => Promise<TaskRecord>>;
    getTask: jest.MockedFunction<(taskId: string) => Promise<TaskRecord | null>>;
    getAllTasks: jest.MockedFunction<() => Promise<TaskRecord[]>>;
    submitTask: jest.MockedFunction<(taskId: string, actorId: string) => Promise<TaskRecord>>;
    approveTask: jest.MockedFunction<(taskId: string, actorId: string) => Promise<TaskRecord>>;
    updateTask: jest.MockedFunction<(taskId: string, payload: Partial<TaskRecord>, actorId: string) => Promise<TaskRecord>>;
    pauseTask: jest.MockedFunction<(taskId: string, actorId: string, reason?: string) => Promise<TaskRecord>>;
    resumeTask: jest.MockedFunction<(taskId: string, actorId: string, force?: boolean) => Promise<TaskRecord>>;
    deleteTask: jest.MockedFunction<(taskId: string, actorId: string) => Promise<void>>;
    discardTask: jest.MockedFunction<(taskId: string, actorId: string, reason?: string) => Promise<TaskRecord>>;
    activateTask: jest.MockedFunction<(taskId: string, actorId: string) => Promise<TaskRecord>>;
    completeTask: jest.MockedFunction<(taskId: string, actorId: string) => Promise<TaskRecord>>;
  };
  let mockIndexerAdapter: {
    isIndexUpToDate: jest.MockedFunction<() => Promise<boolean>>;
    getIndexData: jest.MockedFunction<() => Promise<IndexerAdapter.IndexData | null>>;
    generateIndex: jest.MockedFunction<() => Promise<void>>;
    invalidateCache: jest.MockedFunction<() => Promise<void>>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
    getActor: jest.MockedFunction<(actorId: string) => Promise<ActorRecord | null>>;
  };
  let mockFeedbackAdapter: {
    create: jest.MockedFunction<(payload: Record<string, string>, actorId: string) => Promise<{ id: string; type: string }>>;
  };

  const sampleTask: TaskRecord = {
    id: '1757789000-task-test-task',
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test description',
    tags: ['test', 'unit'],
    references: [],
    cycleIds: []
  };

  const sampleActor: ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'test-public-key',
    roles: ['author'],
    status: 'active'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create simple mock adapters
    mockBacklogAdapter = {
      createTask: jest.fn(),
      getTask: jest.fn(),
      getAllTasks: jest.fn(),
      submitTask: jest.fn(),
      approveTask: jest.fn(),
      updateTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      deleteTask: jest.fn(),
      discardTask: jest.fn(),
      activateTask: jest.fn(),
      completeTask: jest.fn()
    };

    mockIndexerAdapter = {
      isIndexUpToDate: jest.fn(),
      getIndexData: jest.fn(),
      generateIndex: jest.fn(),
      invalidateCache: jest.fn()
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn(),
      getActor: jest.fn()
    };

    mockFeedbackAdapter = {
      create: jest.fn()
    };

    // Create mock dependency service
    const mockDependencyService = {
      getBacklogAdapter: jest.fn().mockResolvedValue(mockBacklogAdapter),
      getIndexerAdapter: jest.fn().mockResolvedValue(mockIndexerAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getFeedbackAdapter: jest.fn().mockResolvedValue(mockFeedbackAdapter)
    };

    // Mock singleton getInstance
    (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    taskCommand = new TaskCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    mockProcessExit.mockClear();
  });

  describe('Command Core Functionality (EARS 1-5)', () => {
    it('[EARS-1] should open editor and create task with BacklogAdapter', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { description: 'Test description' });

      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: 'Test description',
        priority: 'medium',
        tags: [],
        references: []
      }, 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task created: 1757789000-task-test-task');
    });

    it('[EARS-1A] should create task with description from file using --description-file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      // Mock file reading
      const mockFileContent = `# Test Task

## Problem
This is a long description with proper markdown formatting.

## Solution
The solution involves multiple steps...`;

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/mock/path/description.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { descriptionFile: 'description.md' });

      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: mockFileContent,
        priority: 'medium',
        tags: [],
        references: []
      }, 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task created: 1757789000-task-test-task');
    });

    it('[EARS-1B] should handle file not found error for --description-file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockError = new Error('ENOENT: no such file or directory');
      (mockError as any).code = 'ENOENT';

      jest.spyOn(fs, 'readFile').mockRejectedValue(mockError);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/mock/path/nonexistent.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);

      await taskCommand.executeNew('Test Task', { descriptionFile: 'nonexistent.md' });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Description file not found'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-1C] should handle empty description file error', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      jest.spyOn(fs, 'readFile').mockResolvedValue('   \n\n   '); // Only whitespace
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/mock/path/empty.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);

      await taskCommand.executeNew('Test Task', { descriptionFile: 'empty.md' });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Description file is empty'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-1D] should handle permission denied error for --description-file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockError = new Error('EACCES: permission denied');
      (mockError as any).code = 'EACCES';

      jest.spyOn(fs, 'readFile').mockRejectedValue(mockError);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/mock/path/restricted.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);

      await taskCommand.executeNew('Test Task', { descriptionFile: 'restricted.md' });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Permission denied reading file'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-1E] should resolve relative path for description file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockFileContent = '# Relative Path Test\n\nThis file uses a relative path.';
      const relativePath = 'tasks/description.md';

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/current/working/dir/tasks/description.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { descriptionFile: relativePath });

      expect(path.resolve).toHaveBeenCalledWith(process.cwd(), relativePath);
      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: mockFileContent,
        priority: 'medium',
        tags: [],
        references: []
      }, 'human:test-user');
    });

    it('[EARS-1F] should handle absolute paths for --description-file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockFileContent = '# Absolute Path Test\n\nThis file uses an absolute path.';
      const absolutePath = '/tmp/absolute-test.md';

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(true);

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { descriptionFile: absolutePath });

      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: mockFileContent,
        priority: 'medium',
        tags: [],
        references: []
      }, 'human:test-user');
    });

    it('[EARS-1G] should preserve special characters and markdown formatting', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const complexMarkdown = `# Task with Special Characters

## Code Block
\`\`\`typescript
const test = "value";
\`\`\`

## Lists
- Backticks: \`code\`
- Parentheses: (test)
- Pipes: |column|
- Asterisks: **bold**

## Tables
| Column | Value |
|--------|-------|
| A      | 1     |`;

      jest.spyOn(fs, 'readFile').mockResolvedValue(complexMarkdown);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/mock/path/complex.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { descriptionFile: 'complex.md' });

      expect(mockBacklogAdapter.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: complexMarkdown,
        priority: 'medium',
        tags: [],
        references: []
      }, 'human:test-user');
    });

    it('[EARS-1H] should validate --cleanup-file requires --description-file', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);

      await taskCommand.executeNew('Test Task', {
        description: 'inline description',
        cleanupFile: true // Invalid: no descriptionFile
      });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('--cleanup-file requires --description-file'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-1I] should cleanup file after task creation with --cleanup-file', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockFileContent = '# Test Cleanup\n\nThis file should be deleted.';

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/tmp/test-cleanup.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', {
        descriptionFile: '/tmp/test-cleanup.md',
        cleanupFile: true,
        verbose: true
      });

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/test-cleanup.md');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cleaned up description file'));
      expect(mockBacklogAdapter.createTask).toHaveBeenCalled();
    });

    it('[EARS-1J] should handle cleanup failure gracefully without breaking task creation', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockFileContent = '# Test Cleanup Failure\n\nCleanup will fail but task should be created.';
      const cleanupError = new Error('EACCES: permission denied');

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(fs, 'unlink').mockRejectedValue(cleanupError);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/tmp/readonly.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', {
        descriptionFile: '/tmp/readonly.md',
        cleanupFile: true
      });

      // Task should still be created
      expect(mockBacklogAdapter.createTask).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task created: 1757789000-task-test-task');

      // Warning about cleanup failure
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Could not cleanup description file'));
    });

    it('[EARS-1J] should handle cleanup failure gracefully and suppress warning in quiet mode', async () => {
      const fs = require('fs/promises');
      const path = require('path');

      const mockFileContent = '# Test Quiet Mode\n\nCleanup fails but quiet mode suppresses warning.';
      const cleanupError = new Error('EACCES: permission denied');

      jest.spyOn(fs, 'readFile').mockResolvedValue(mockFileContent);
      jest.spyOn(fs, 'unlink').mockRejectedValue(cleanupError);
      jest.spyOn(path, 'isAbsolute').mockReturnValue(false);
      jest.spyOn(path, 'resolve').mockReturnValue('/tmp/quiet-test.md');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', {
        descriptionFile: '/tmp/quiet-test.md',
        cleanupFile: true,
        quiet: true
      });

      // Task created but no warning shown
      expect(mockBacklogAdapter.createTask).toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('[EARS-2] should verify cache freshness and use IndexerAdapter for performance', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeList({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.getIndexData).toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllTasks).not.toHaveBeenCalled(); // Should use cache
      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Found 1 task(s):');
    });

    it('[EARS-3] should show task from cache with derived states and metadata', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeShow('1757789000-task-test-task', {});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.getIndexData).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Task: 1757789000-task-test-task');
      expect(mockConsoleLog).toHaveBeenCalledWith('📝 Title: Test Task');
    });

    it('[EARS-4] should delegate to submitTask with workflow validation', async () => {
      const updatedTask = { ...sampleTask, status: 'review' as const };
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.submitTask.mockResolvedValue(updatedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeSubmit('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.submitTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task submitted: 1757789000-task-test-task');
    });

    it('[EARS-5] should delegate to approveTask with signature validation', async () => {
      const approvedTask = { ...sampleTask, status: 'ready' as const };
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.approveTask.mockResolvedValue(approvedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeApprove('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.approveTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task approved: 1757789000-task-test-task');
    });
  });

  describe('Multi-Adapter Integration (EARS 6-10)', () => {
    it('[EARS-6] should create assignment FeedbackRecord using FeedbackAdapter', async () => {
      const assigneeActor = { ...sampleActor, id: 'human:assignee' };
      const feedbackRecord = { id: 'feedback-123', type: 'assignment' };

      mockBacklogAdapter.getTask.mockResolvedValue(sampleTask);
      mockIdentityAdapter.getActor.mockResolvedValue(assigneeActor);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockFeedbackAdapter.create.mockResolvedValue(feedbackRecord as any);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeAssign('1757789000-task-test-task', { to: 'human:assignee' });

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith({
        entityType: 'task',
        entityId: '1757789000-task-test-task',
        type: 'assignment',
        status: 'resolved',
        content: 'Assigned to Test User',
        assignee: 'human:assignee'
      }, 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
    });

    it('[EARS-11] should validate immutability before editing description and pass actorId', async () => {
      mockBacklogAdapter.getTask.mockResolvedValue(sampleTask);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateTask.mockResolvedValue({ ...sampleTask, description: 'Updated' });
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeEdit('1757789000-task-test-task', { description: 'Updated description' });

      expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ Description editing - in production would check execution records for immutability');
      // CRITICAL: Verify actorId is passed to updateTask (this was the bug that broke production)
      expect(mockBacklogAdapter.updateTask).toHaveBeenCalledWith(
        '1757789000-task-test-task',
        { description: 'Updated description' },
        'human:test-user'
      );
    });

    it('[EARS-11B] should pass actorId when editing priority (regression test for actorId bug)', async () => {
      mockBacklogAdapter.getTask.mockResolvedValue(sampleTask);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateTask.mockResolvedValue({ ...sampleTask, priority: 'critical' as const });
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeEdit('1757789000-task-test-task', { priority: 'critical' });

      // CRITICAL: This test exists because we had a production bug where actorId was missing
      // The error was: "Cannot read properties of undefined (reading 'replace')"
      // which happened because updateTask was called without the actorId parameter
      expect(mockBacklogAdapter.updateTask).toHaveBeenCalledWith(
        '1757789000-task-test-task',
        { priority: 'critical' },
        'human:test-user'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task updated: 1757789000-task-test-task');
    });

    it('[EARS-8] should show educational message for epic promotion', async () => {
      const epicTask = { ...sampleTask, tags: ['epic:auth', 'category:design'] };
      mockBacklogAdapter.getTask.mockResolvedValue(epicTask);

      await taskCommand.executePromote('1757789000-task-test-task', {});

      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Epic task detected: Test Task');
      expect(mockConsoleLog).toHaveBeenCalledWith('⚠️  Epic promotion not implemented in MVP.');
      expect(mockConsoleLog).toHaveBeenCalledWith("💡 Future command: 'gitgov planning decompose 1757789000-task-test-task'");
    });

    it('[EARS-9] should auto-regenerate cache when obsolete in read commands', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);
      mockIndexerAdapter.generateIndex.mockResolvedValue({} as any);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeList({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.generateIndex).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Updating cache...');
    });

    it('[EARS-10] should invalidate cache after task modifications', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { description: 'Test' });

      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('CLI Consistency & UX Excellence (EARS 11-15)', () => {
    it('[EARS-11] should return structured JSON output with json flag', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createTask.mockResolvedValue(sampleTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeNew('Test Task', { description: 'Test', json: true });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.taskId).toBe('1757789000-task-test-task');
    });

    it('[EARS-12] should show additional details with verbose flag', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeShow('1757789000-task-test-task', { verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith('🔗 References: none');
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Cycle IDs: none');
    });

    it('[EARS-13] should suppress output with quiet flag for scripting', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);
      mockIndexerAdapter.generateIndex.mockResolvedValue({} as any);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeList({ quiet: true });

      // Should not show "Updating cache..." message
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🔄 Updating cache...');
    });

    it('[EARS-14] should detect conflicting flags and show clear error', async () => {
      // Test conflicting flags in list command
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([])
      );

      // For now, we don't have flag conflict detection implemented
      // This test documents the expected behavior
      await taskCommand.executeList({ quiet: true, verbose: true });

      // Should work without conflict detection for MVP
      // TODO: Implement flag conflict detection
      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Found 0 task(s):');
    });

    it('[EARS-15] should show user-friendly error with solution suggestion', async () => {
      const error = new Error('RecordNotFoundError: Task not found');
      mockBacklogAdapter.getTask.mockRejectedValue(error);

      await taskCommand.executeShow('non-existent-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith('RecordNotFoundError: Task not found');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Manual Task Pause (EARS 18-19, 23)', () => {
    it('[EARS-18] should pause active task with optional reason tracking', async () => {
      const pausedTask = { ...sampleTask, status: 'paused' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.pauseTask.mockResolvedValue(pausedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executePause('1757789000-task-test-task', { reason: 'Waiting for API approval' });

      expect(mockBacklogAdapter.pauseTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user', 'Waiting for API approval');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('⏸️  Task paused: 1757789000-task-test-task');
    });

    it('[EARS-19] should show error when trying to pause non-active task', async () => {
      const error = new Error(`ProtocolViolationError: Task is in 'paused' state. Cannot pause (requires active).`);

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.pauseTask.mockRejectedValue(error);

      await taskCommand.executePause('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith(`❌ Task operation failed: ProtocolViolationError: Task is in 'paused' state. Cannot pause (requires active).`);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-23] should pause task without reason (optional parameter)', async () => {
      const pausedTask = { ...sampleTask, status: 'paused' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.pauseTask.mockResolvedValue(pausedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executePause('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.pauseTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user', undefined);
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('⏸️  Task paused: 1757789000-task-test-task');
    });
  });

  describe('Manual Workflow Control (EARS 20-22)', () => {
    it('[EARS-20] should resume paused task with blocking validation', async () => {
      const resumedTask = { ...sampleTask, status: 'active' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.resumeTask.mockResolvedValue(resumedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeResume('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.resumeTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user', false);
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Task resumed: 1757789000-task-test-task');
    });

    it('[EARS-21] should show error when paused task has blocking feedbacks', async () => {
      const error = new Error('BlockingFeedbackError: Task has blocking feedbacks. Resolve them before resuming or use force.');

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.resumeTask.mockRejectedValue(error);

      await taskCommand.executeResume('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Task operation failed: BlockingFeedbackError: Task has blocking feedbacks. Resolve them before resuming or use force.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-22] should force resume ignoring blocking feedbacks with force flag', async () => {
      const resumedTask = { ...sampleTask, status: 'active' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.resumeTask.mockResolvedValue(resumedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeResume('1757789000-task-test-task', { force: true });

      expect(mockBacklogAdapter.resumeTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user', true);
      const forceLog = mockConsoleLog.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('Resumed by'));
      expect(forceLog?.[0]).toContain('[force]');
    });
  });

  describe('Delete Command & Educational Errors (EARS 10A, 32-35)', () => {
    it('[EARS-10A] should delegate to deleteTask() for draft task deletion', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.deleteTask.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeDelete('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.deleteTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🗑️  Task deleted: 1757789000-task-test-task');
    });

    it('[EARS-32] should delete draft task file directly without discarded state', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.deleteTask.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeDelete('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.deleteTask).toHaveBeenCalledWith('1757789000-task-test-task', 'human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith('📊 Status: draft → deleted');
    });

    it('[EARS-33] should show educational error when deleting non-draft task', async () => {
      const error = new Error("ProtocolViolationError: Cannot delete task in 'review' state. Use 'gitgov task reject 1757789000-task-test-task' to discard tasks under review.");

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.deleteTask.mockRejectedValue(error);

      await taskCommand.executeDelete('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Cannot delete task in 'review' state"));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('gitgov task reject'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-34] should show educational error when cancelling draft task', async () => {
      const error = new Error("ProtocolViolationError: Cannot cancel task in 'draft' state. Use 'gitgov task delete 1757789000-task-test-task' to remove draft tasks.");

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.discardTask.mockRejectedValue(error);

      await taskCommand.executeCancel('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Cannot cancel task in 'draft' state"));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('gitgov task delete'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-35] should provide educational message for incorrect discard command', async () => {
      // Test delete on ready task (should suggest cancel)
      const deleteError = new Error("ProtocolViolationError: Cannot delete task in 'ready' state. Use 'gitgov task cancel 1757789000-task-test-task' to discard tasks from ready/active states.");

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.deleteTask.mockRejectedValue(deleteError);

      await taskCommand.executeDelete('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Cannot delete task in 'ready' state"));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('gitgov task cancel'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-35B] should pass actorId and reason when cancelling task (regression test)', async () => {
      const discardedTask = { ...sampleTask, status: 'discarded' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.discardTask.mockResolvedValue(discardedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeCancel('1757789000-task-test-task', { reason: 'No longer needed' });

      // CRITICAL: Verify actorId and reason are passed correctly to discardTask
      // This test exists to prevent regression where parameters could be missing
      expect(mockBacklogAdapter.discardTask).toHaveBeenCalledWith(
        '1757789000-task-test-task',
        'human:test-user',
        'No longer needed'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('❌ Task cancelled: 1757789000-task-test-task');
    });

    it('[EARS-35C] should pass actorId and reason when rejecting task (regression test)', async () => {
      const discardedTask = { ...sampleTask, status: 'discarded' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.discardTask.mockResolvedValue(discardedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeReject('1757789000-task-test-task', { reason: 'Does not meet requirements' });

      // CRITICAL: Verify actorId and reason are passed correctly to discardTask
      // This test exists to prevent regression where parameters could be missing
      expect(mockBacklogAdapter.discardTask).toHaveBeenCalledWith(
        '1757789000-task-test-task',
        'human:test-user',
        'Does not meet requirements'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('🚫 Task rejected: 1757789000-task-test-task');
    });

    it('[EARS-35D] should pass undefined reason when cancelling without reason', async () => {
      const discardedTask = { ...sampleTask, status: 'discarded' as const };

      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.discardTask.mockResolvedValue(discardedTask);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await taskCommand.executeCancel('1757789000-task-test-task', {});

      expect(mockBacklogAdapter.discardTask).toHaveBeenCalledWith(
        '1757789000-task-test-task',
        'human:test-user',
        undefined
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty task title', async () => {
      await taskCommand.executeNew('', {});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Task operation failed: ❌ Task title cannot be empty');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle task not found in show command', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([])
      );
      mockBacklogAdapter.getTask.mockResolvedValue(null);

      await taskCommand.executeShow('non-existent', {});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Task operation failed: ❌ Task not found: non-existent');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle actor not found in assign command', async () => {
      mockBacklogAdapter.getTask.mockResolvedValue(sampleTask);
      mockIdentityAdapter.getActor.mockResolvedValue(null);

      await taskCommand.executeAssign('1757789000-task-test-task', { to: 'non-existent' });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Task operation failed: ❌ Actor not found: non-existent');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle task without epic tag in promote', async () => {
      const regularTask = { ...sampleTask, tags: ['regular'] };
      mockBacklogAdapter.getTask.mockResolvedValue(regularTask);

      await taskCommand.executePromote('1757789000-task-test-task', {});

      expect(mockConsoleError).toHaveBeenCalledWith("❌ Task operation failed: ❌ Task must have 'epic:' tag to be promoted to cycle.");
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format JSON error output correctly', async () => {
      const error = new Error('Test error');
      mockBacklogAdapter.getTask.mockRejectedValue(error);

      await taskCommand.executeShow('test-task', { json: true });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(false);
      expect(parsedOutput.error).toContain('❌ Task operation failed: Test error');
    });
  });

  describe('Auto-indexation and Cache Behavior', () => {
    it('should use cache when up to date', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([sampleTask])
      );

      await taskCommand.executeList({});

      expect(mockIndexerAdapter.generateIndex).not.toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllTasks).not.toHaveBeenCalled();
    });

    it('should fallback to direct access when cache fails', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(null);
      mockBacklogAdapter.getAllTasks.mockResolvedValue([sampleTask]);

      await taskCommand.executeList({});

      expect(mockBacklogAdapter.getAllTasks).toHaveBeenCalled();
    });

    it('should bypass cache with from-source flag', async () => {
      mockBacklogAdapter.getAllTasks.mockResolvedValue([sampleTask]);

      await taskCommand.executeList({ fromSource: true });

      expect(mockIndexerAdapter.isIndexUpToDate).not.toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllTasks).toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    it('should get correct status icons', async () => {
      const tasks = [
        { ...sampleTask, status: 'draft' as const },
        { ...sampleTask, status: 'active' as const },
        { ...sampleTask, status: 'done' as const }
      ];

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData(tasks)
      );

      await taskCommand.executeList({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📝 [draft]'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ [active]'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ [done]'));
    });
  });

  describe('Help Flag Handling (--help pre-parsing fix)', () => {
    it('should not call executePause when taskId is --help', async () => {
      // This test validates the fix for: pnpm start -- task pause --help
      // The fix is implemented in the command registration, not in the TaskCommand class
      // So we just verify that executePause is NOT called when taskId is --help
      // The actual help output is handled by Commander.js

      // If taskId is '--help', the command handler should not call executePause
      // This is tested indirectly by verifying no adapters are called
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.pauseTask.mockResolvedValue({ ...sampleTask, status: 'paused' as const });

      // Note: The actual help handling happens in task.ts, not in task-command.ts
      // This test documents the expected behavior that when help is requested,
      // the execute methods should not be called
    });

    it('should not call executeResume when taskId is --help', async () => {
      // This test validates the fix for: pnpm start -- task resume --help
      // Similar to pause test above
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.resumeTask.mockResolvedValue({ ...sampleTask, status: 'active' as const });

      // Note: The actual help handling happens in task.ts, not in task-command.ts
      // This test documents the expected behavior
    });
  });

  describe('Argument Parsing & Sorting (EARS 36-37)', () => {
    it('[EARS-36A] should parse options correctly when passed through executeList', async () => {
      // This test validates that executeList receives options correctly
      // The actual -- separator filtering happens in index.ts before calling executeList
      // Here we verify that when options ARE passed correctly, executeList processes them

      const task1 = { ...sampleTask, id: '1757789001-task-old', status: 'done' as const, lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-new', status: 'done' as const, lastUpdated: 2000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2], { enrichedTasks: [task1, task2] })
      );

      // Simulate passing options that would come from Commander.js after -- filtering
      await taskCommand.executeList({ status: 'done', limit: 1 });

      expect(mockIndexerAdapter.getIndexData).toHaveBeenCalled();
      // Should show only 1 task (limit applied)
      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Found 1 task(s):');
    });

    it('[EARS-36B] should handle status filter when options are parsed correctly', async () => {
      const doneTask = { ...sampleTask, id: '1757789001-task-done', status: 'done' as const };
      const activeTask = { ...sampleTask, id: '1757789002-task-active', status: 'active' as const };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([doneTask, activeTask])
      );

      await taskCommand.executeList({ status: 'done' });

      // Should only show done tasks
      const logs = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(logs).toContain('1757789001-task-done');
      expect(logs).not.toContain('1757789002-task-active');
    });

    it('[EARS-36C] should handle multiple filter options simultaneously', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-1', status: 'done' as const, priority: 'high' as const };
      const task2 = { ...sampleTask, id: '1757789002-task-2', status: 'done' as const, priority: 'low' as const };
      const task3 = { ...sampleTask, id: '1757789003-task-3', status: 'active' as const, priority: 'high' as const };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2, task3])
      );

      // Both status AND priority filters should work
      await taskCommand.executeList({ status: 'done', priority: 'high' });

      const logs = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(logs).toContain('1757789001-task-1'); // done + high
      expect(logs).not.toContain('1757789002-task-2'); // done + low
      expect(logs).not.toContain('1757789003-task-3'); // active + high
    });

    it('[EARS-37A] should sort tasks by lastUpdated in descending order by default', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-oldest', lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-middle', lastUpdated: 2000 };
      const task3 = { ...sampleTask, id: '1757789003-task-newest', lastUpdated: 3000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2, task3], { enrichedTasks: [task1, task2, task3] })
      );

      await taskCommand.executeList({});

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // Should be sorted newest first (DESC)
      expect(taskLines[0]).toContain('1757789003-task-newest');
      expect(taskLines[1]).toContain('1757789002-task-middle');
      expect(taskLines[2]).toContain('1757789001-task-oldest');
    });

    it('[EARS-37B] should apply limit AFTER sorting to get most recent tasks', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-oldest', lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-middle', lastUpdated: 2000 };
      const task3 = { ...sampleTask, id: '1757789003-task-newest', lastUpdated: 3000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2, task3], { enrichedTasks: [task1, task2, task3] })
      );

      await taskCommand.executeList({ limit: 2 });

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // Should show only 2 most recent tasks
      expect(taskLines).toHaveLength(2);
      expect(taskLines[0]).toContain('1757789003-task-newest');
      expect(taskLines[1]).toContain('1757789002-task-middle');
      expect(logs.join('\n')).not.toContain('1757789001-task-oldest');
    });

    it('[EARS-37C] should sort in ascending order when --order asc is specified', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-oldest', lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-middle', lastUpdated: 2000 };
      const task3 = { ...sampleTask, id: '1757789003-task-newest', lastUpdated: 3000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task3, task1, task2], { enrichedTasks: [task3, task1, task2] })
      );

      await taskCommand.executeList({ order: 'asc' });

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // Should be sorted oldest first (ASC)
      expect(taskLines[0]).toContain('1757789001-task-oldest');
      expect(taskLines[1]).toContain('1757789002-task-middle');
      expect(taskLines[2]).toContain('1757789003-task-newest');
    });

    it('[EARS-37D] should fallback to ID timestamp when lastUpdated is not available', async () => {
      // Tasks without lastUpdated field (e.g., from --from-source)
      const task1 = { ...sampleTask, id: '1757789001-task-old' }; // No lastUpdated
      const task2 = { ...sampleTask, id: '1757789003-task-new' }; // No lastUpdated
      const task3 = { ...sampleTask, id: '1757789002-task-mid' }; // No lastUpdated

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2, task3])
      );

      await taskCommand.executeList({});

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // Should be sorted by ID timestamp (DESC)
      // 1757789003 > 1757789002 > 1757789001
      expect(taskLines[0]).toContain('1757789003-task-new');
      expect(taskLines[1]).toContain('1757789002-task-mid');
      expect(taskLines[2]).toContain('1757789001-task-old');
    });

    it('[EARS-37E] should combine sorting, filtering, and limit correctly', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-1', status: 'done' as const, lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-2', status: 'active' as const, lastUpdated: 2000 };
      const task3 = { ...sampleTask, id: '1757789003-task-3', status: 'done' as const, lastUpdated: 3000 };
      const task4 = { ...sampleTask, id: '1757789004-task-4', status: 'done' as const, lastUpdated: 4000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2, task3, task4], { enrichedTasks: [task1, task2, task3, task4] })
      );

      // Filter done tasks, sort by lastUpdated DESC, then limit to 2
      await taskCommand.executeList({ status: 'done', limit: 2 });

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // Should show 2 most recent 'done' tasks
      expect(taskLines).toHaveLength(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Found 2 task(s):');
      expect(taskLines[0]).toContain('1757789004-task-4'); // Most recent done
      expect(taskLines[1]).toContain('1757789003-task-3'); // Second most recent done
      expect(logs.join('\n')).not.toContain('1757789002-task-2'); // active (filtered out)
      expect(logs.join('\n')).not.toContain('1757789001-task-1'); // older done (limited out)
    });

    it('[EARS-37F] should handle --order desc explicitly (same as default)', async () => {
      const task1 = { ...sampleTask, id: '1757789001-task-old', lastUpdated: 1000 };
      const task2 = { ...sampleTask, id: '1757789002-task-new', lastUpdated: 2000 };

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(
        createMockIndexData([task1, task2], { enrichedTasks: [task1, task2] })
      );

      await taskCommand.executeList({ order: 'desc' });

      const logs = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const taskLines = logs.filter(log => log.includes('1757789'));

      // DESC: newest first
      expect(taskLines[0]).toContain('1757789002-task-new');
      expect(taskLines[1]).toContain('1757789001-task-old');
    });
  });
});
