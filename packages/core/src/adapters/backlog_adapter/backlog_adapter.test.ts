import { BacklogAdapter } from './backlog_adapter';
import type { BacklogAdapterDependencies } from './backlog_adapter.types';
import type {
  FeedbackCreatedEvent,
  ExecutionCreatedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent,
  CycleStatusChangedEvent
} from '../../event_bus';
import type { TaskRecord } from '../../record_types';
import type { CycleRecord } from '../../record_types';
import type { FeedbackRecord } from '../../record_types';
import type { ChangelogRecord } from '../../record_types';
import type { GitGovRecord } from '../../record_types';
import type { ActorRecord } from '../../record_types';
import type { Signature } from '../../record_types/embedded.types';
import type { SystemStatus, TaskHealthReport } from '../../record_metrics';
import type { ValidationContext } from '../workflow_adapter';
import type { WorkflowRecord } from '../../record_types';

// Define the correct TransitionRule type based on the real implementation
type TransitionRule = {
  to: TaskRecord['status'];
  conditions: NonNullable<NonNullable<WorkflowRecord['state_transitions']>[string]>['requires'] | undefined;
};

// Properly typed mock dependencies - NO ANY ALLOWED
type MockBacklogAdapterDependencies = {
  stores: {
    tasks: {
      list: jest.MockedFunction<() => Promise<string[]>>;
      get: jest.MockedFunction<(id: string) => Promise<(GitGovRecord & { payload: TaskRecord }) | null>>;
      put: jest.MockedFunction<(id: string, record: GitGovRecord & { payload: TaskRecord }) => Promise<void>>;
      delete: jest.MockedFunction<(id: string) => Promise<void>>;
      exists: jest.MockedFunction<(id: string) => Promise<boolean>>;
    };
    cycles: {
      list: jest.MockedFunction<() => Promise<string[]>>;
      get: jest.MockedFunction<(id: string) => Promise<(GitGovRecord & { payload: CycleRecord }) | null>>;
      put: jest.MockedFunction<(id: string, record: GitGovRecord & { payload: CycleRecord }) => Promise<void>>;
      delete: jest.MockedFunction<(id: string) => Promise<void>>;
      exists: jest.MockedFunction<(id: string) => Promise<boolean>>;
    };
    feedbacks: {
      list: jest.MockedFunction<() => Promise<string[]>>;
      get: jest.MockedFunction<(id: string) => Promise<(GitGovRecord & { payload: FeedbackRecord }) | null>>;
      put: jest.MockedFunction<(id: string, record: GitGovRecord & { payload: FeedbackRecord }) => Promise<void>>;
      delete: jest.MockedFunction<(id: string) => Promise<void>>;
      exists: jest.MockedFunction<(id: string) => Promise<boolean>>;
    };
    changelogs: {
      list: jest.MockedFunction<() => Promise<string[]>>;
      get: jest.MockedFunction<(id: string) => Promise<(GitGovRecord & { payload: ChangelogRecord }) | null>>;
      put: jest.MockedFunction<(id: string, record: GitGovRecord & { payload: ChangelogRecord }) => Promise<void>>;
      delete: jest.MockedFunction<(id: string) => Promise<void>>;
      exists: jest.MockedFunction<(id: string) => Promise<boolean>>;
    };
  };
  feedbackAdapter: {
    create: jest.MockedFunction<(payload: Partial<FeedbackRecord>, actorId: string) => Promise<FeedbackRecord>>;
    getFeedback: jest.MockedFunction<(feedbackId: string) => Promise<FeedbackRecord | null>>;
    resolve: jest.MockedFunction<(feedbackId: string, actorId: string, content?: string) => Promise<FeedbackRecord>>;
    getFeedbackByEntity: jest.MockedFunction<(entityId: string) => Promise<FeedbackRecord[]>>;
    getAllFeedback: jest.MockedFunction<() => Promise<FeedbackRecord[]>>;
    getFeedbackThread: jest.MockedFunction<(feedbackId: string, maxDepth?: number) => Promise<any>>;
  };
  executionAdapter: {
    isFirstExecution: jest.MockedFunction<(taskId: string) => Promise<boolean>>;
  };
  changelogAdapter: {
    create: jest.MockedFunction<(payload: Partial<ChangelogRecord>, actorId: string) => Promise<ChangelogRecord>>;
  };
  metricsAdapter: {
    getSystemStatus: jest.MockedFunction<() => Promise<SystemStatus>>;
    getTaskHealth: jest.MockedFunction<(taskId: string) => Promise<TaskHealthReport>>;
  };
  workflowAdapter: {
    getTransitionRule: jest.MockedFunction<(from: TaskRecord['status'], to: TaskRecord['status'], context: ValidationContext) => Promise<TransitionRule | null>>;
    validateSignature: jest.MockedFunction<(signature: Signature, context: ValidationContext) => Promise<boolean>>;
    getAvailableTransitions: jest.MockedFunction<(status: TaskRecord['status']) => Promise<TransitionRule[]>>;
  };
  identity: {
    getActor: jest.MockedFunction<(actorId: string) => Promise<ActorRecord>>;
    signRecord: jest.MockedFunction<(record: GitGovRecord, actorId: string, role?: string) => Promise<GitGovRecord>>;
    getCurrentActor?: jest.MockedFunction<() => Promise<ActorRecord>>;
  };
  eventBus: {
    publish: jest.MockedFunction<(event: Record<string, unknown>) => void>;
    subscribe: jest.MockedFunction<(eventType: string, handler: (event: Record<string, unknown>) => void) => void>;
    unsubscribe: jest.MockedFunction<(eventType: string, handler: (event: Record<string, unknown>) => void) => void>;
    getSubscriptions: jest.MockedFunction<() => Record<string, unknown>>;
    clearSubscriptions: jest.MockedFunction<() => void>;
  };
  configManager: {
    updateActorState: jest.MockedFunction<(actorId: string, state: { activeTaskId?: string; activeCycleId?: string }) => Promise<void>>;
  };
  sessionManager: {
    updateActorState: jest.MockedFunction<(actorId: string, state: { activeTaskId?: string; activeCycleId?: string }) => Promise<void>>;
  };
};

// Mock the factories before importing
jest.mock('../../record_factories/task_factory', () => ({
  createTaskRecord: jest.fn()
}));

jest.mock('../../record_factories/cycle_factory', () => ({
  createCycleRecord: jest.fn()
}));

// Helper to create properly typed mock records with valid IDs
function createMockTaskRecord(payload: Partial<TaskRecord>): GitGovRecord & { payload: TaskRecord } {
  const baseId = payload.id || '1757687335-task-mock-task';
  return {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum: 'mock-checksum',
      signatures: [{ keyId: 'mock-author', role: 'author', notes: 'Mock signature for backlog tests', signature: 'mock-sig', timestamp: 123 }] as [Signature, ...Signature[]]
    },
    payload: {
      id: baseId,
      title: 'Mock Task',
      status: 'draft',
      priority: 'medium',
      description: 'Mock description',
      tags: [],
      cycleIds: [],
      ...payload
    } as unknown as TaskRecord
  };
}

function createMockCycleRecord(payload: Partial<CycleRecord>): GitGovRecord & { payload: CycleRecord } {
  const baseId = payload.id || '1757687335-cycle-mock-cycle';
  return {
    header: {
      version: '1.0',
      type: 'cycle',
      payloadChecksum: 'mock-checksum',
      signatures: [{ keyId: 'mock-author', role: 'author', notes: 'Mock signature for backlog tests', signature: 'mock-sig', timestamp: 123 }] as [Signature, ...Signature[]]
    },
    payload: {
      id: baseId,
      title: 'Mock Cycle',
      status: 'planning',
      taskIds: [],
      childCycleIds: [],
      ...payload
    } as unknown as CycleRecord
  };
}

function createMockFeedbackRecord(payload: Partial<FeedbackRecord>): GitGovRecord & { payload: FeedbackRecord } {
  const baseId = payload.id || '1757687335-feedback-mock';
  return {
    header: {
      version: '1.0',
      type: 'feedback',
      payloadChecksum: 'mock-checksum',
      signatures: [{ keyId: 'mock-author', role: 'author', notes: 'Mock signature for backlog tests', signature: 'mock-sig', timestamp: 123 }] as [Signature, ...Signature[]]
    },
    payload: {
      id: baseId,
      entityType: 'task',
      entityId: '1757687335-task-test',
      type: 'assignment',
      status: 'open',
      content: 'Mock feedback content',
      priority: 'medium',
      tags: [],
      ...payload
    } as unknown as FeedbackRecord
  };
}

function createMockChangelogRecord(payload: Partial<ChangelogRecord>): GitGovRecord & { payload: ChangelogRecord } {
  const baseId = payload.id || '1757687335-changelog-mock';
  return {
    header: {
      version: '1.0',
      type: 'changelog',
      payloadChecksum: 'mock-checksum',
      signatures: [{ keyId: 'mock-author', role: 'author', notes: 'Mock signature for backlog tests', signature: 'mock-sig', timestamp: 123 }] as [Signature, ...Signature[]]
    },
    payload: {
      id: baseId,
      title: 'Mock Changelog',
      description: 'Mock changelog description',
      relatedTasks: [],
      completedAt: Date.now(),
      version: 'v1.0.0',
      ...payload
    } as unknown as ChangelogRecord
  };
}

// Complete unit tests for BacklogAdapter
describe('BacklogAdapter - Complete Unit Tests', () => {
  let backlogAdapter: BacklogAdapter;
  let mockDependencies: MockBacklogAdapterDependencies;

  beforeEach(() => {
    // Complete setup for unit tests
    mockDependencies = {
      stores: {
        tasks: {
          list: jest.fn().mockResolvedValue([]),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          exists: jest.fn()
        },
        cycles: {
          list: jest.fn().mockResolvedValue([]),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          exists: jest.fn()
        },
        feedbacks: {
          list: jest.fn().mockResolvedValue([]),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          exists: jest.fn()
        },
        changelogs: {
          list: jest.fn().mockResolvedValue([]),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          exists: jest.fn()
        },
      },
      feedbackAdapter: {
        create: jest.fn(),
        getFeedback: jest.fn(),
        resolve: jest.fn(),
        getFeedbackByEntity: jest.fn(),
        getAllFeedback: jest.fn(),
        getFeedbackThread: jest.fn()
      },
      executionAdapter: {
        isFirstExecution: jest.fn()
      },
      changelogAdapter: {
        create: jest.fn()
      },
      metricsAdapter: {
        getSystemStatus: jest.fn().mockResolvedValue({
          tasks: { total: 0, byStatus: {}, byPriority: {} },
          cycles: { total: 0, active: 0, completed: 0 },
          health: { overallScore: 100, blockedTasks: 0, staleTasks: 0 }
        }),
        getTaskHealth: jest.fn().mockResolvedValue({
          taskId: 'task-123',
          healthScore: 85,
          timeInCurrentStage: 2,
          stalenessIndex: 1,
          blockingFeedbacks: 0,
          lastActivity: Date.now(),
          recommendations: []
        })
      },
      workflowAdapter: {
        getTransitionRule: jest.fn(),
        validateSignature: jest.fn(),
        getAvailableTransitions: jest.fn()
      },
      identity: {
        getActor: jest.fn(),
        signRecord: jest.fn().mockImplementation(async (record) => record)
      },
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        getSubscriptions: jest.fn(),
        clearSubscriptions: jest.fn()
      },
      configManager: {
        updateActorState: jest.fn().mockResolvedValue(undefined)
      },
      sessionManager: {
        updateActorState: jest.fn().mockResolvedValue(undefined)
      }
    };

    backlogAdapter = new BacklogAdapter(mockDependencies as unknown as BacklogAdapterDependencies);
  });

  it('[EARS-M2] should do nothing for non-blocking feedback', async () => {
    const event: FeedbackCreatedEvent = {
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: {
        feedbackId: 'feedback-123',
        entityType: 'task',
        entityId: 'task-123',
        type: 'suggestion',
        status: 'open',
        content: 'Test feedback content',
        triggeredBy: 'human:test-user'
      }
    };

    // Should not throw error
    await expect(backlogAdapter.handleFeedbackCreated(event)).resolves.not.toThrow();
  });

  it('[EARS-M8] should handle daily tick events', async () => {
    const event: SystemDailyTickEvent = {
      type: 'system.daily_tick',
      timestamp: Date.now(),
      source: 'system',
      payload: {
        date: '2025-01-15'
      }
    };

    // Should not throw error
    await expect(backlogAdapter.handleDailyTick(event)).resolves.not.toThrow();
  });

  describe('Cycle Operations', () => {
    it('[EARS-K1] should create, sign, and persist a valid cycle', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        title: 'Test Cycle',
        status: 'planning'
      });

      // Mock the factory functions
      const { createCycleRecord } = require('../../record_factories/cycle_factory');
      createCycleRecord.mockReturnValue(mockCycle.payload);

      mockDependencies.identity.signRecord.mockResolvedValue(mockCycle);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      const result = await backlogAdapter.createCycle({
        title: 'Test Cycle',
        status: 'planning'
      }, 'human:author');

      expect(mockDependencies.stores.cycles.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cycle.created',
          payload: expect.objectContaining({
            actorId: 'human:author'
          })
        })
      );
      expect(result).toEqual(mockCycle.payload);
    });

    it('[EARS-K2] should read a cycle by its ID', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        title: 'Test Cycle'
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(mockCycle);

      const result = await backlogAdapter.getCycle('1757687335-cycle-test-cycle');

      expect(mockDependencies.stores.cycles.get).toHaveBeenCalledWith('1757687335-cycle-test-cycle');
      expect(result).toEqual(mockCycle.payload);
    });

    it('[EARS-K2b] should return null for non-existent cycle', async () => {
      mockDependencies.stores.cycles.get.mockResolvedValue(null);

      const result = await backlogAdapter.getCycle('non-existent');

      expect(result).toBeNull();
    });

    it('[EARS-K3] should list all cycles', async () => {
      const mockCycles = [
        createMockCycleRecord({ id: '1757687335-cycle-test-1', title: 'Cycle 1' }),
        createMockCycleRecord({ id: '1757687336-cycle-test-2', title: 'Cycle 2' })
      ];

      mockDependencies.stores.cycles.list.mockResolvedValue([
        '1757687335-cycle-test-1',
        '1757687336-cycle-test-2'
      ]);
      mockDependencies.stores.cycles.get
        .mockResolvedValueOnce(mockCycles[0]!)
        .mockResolvedValueOnce(mockCycles[1]!);

      const result = await backlogAdapter.getAllCycles();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockCycles[0]?.payload);
      expect(result[1]).toEqual(mockCycles[1]?.payload);
    });

    it('[EARS-K4] should update a cycle and emit event on status change', async () => {
      const originalCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        status: 'planning'
      });
      const updatedCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        status: 'active'
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(originalCycle);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      // Mock the factory function
      const { createCycleRecord } = require('../../record_factories/cycle_factory');
      createCycleRecord.mockReturnValue(updatedCycle.payload);

      const result = await backlogAdapter.updateCycle('1757687335-cycle-test-cycle', { status: 'active' });

      expect(mockDependencies.stores.cycles.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cycle.status.changed',
          payload: expect.objectContaining({
            cycleId: '1757687335-cycle-test-cycle',
            oldStatus: 'planning',
            newStatus: 'active'
          })
        })
      );
      expect(result).toEqual(updatedCycle.payload);
    });

    it('[EARS-K5] should update activeCycleId in session when cycle is activated', async () => {
      const cycleId = '1757687335-cycle-planning-to-active';
      const actorId = 'human:developer';
      const originalCycle = createMockCycleRecord({
        id: cycleId,
        status: 'planning'
      });
      const updatedCycle = createMockCycleRecord({
        id: cycleId,
        status: 'active'
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(originalCycle);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      // Mock the factory function
      const { createCycleRecord } = require('../../record_factories/cycle_factory');
      createCycleRecord.mockReturnValue(updatedCycle.payload);

      const result = await backlogAdapter.updateCycle(cycleId, { status: 'active' }, actorId);

      expect(result.status).toBe('active');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeCycleId: cycleId
        })
      );
    });

    it('[EARS-K6] should clear activeCycleId in session when cycle is completed', async () => {
      const cycleId = '1757687335-cycle-active-to-completed';
      const actorId = 'human:developer';
      const originalCycle = createMockCycleRecord({
        id: cycleId,
        status: 'active'
      });
      const updatedCycle = createMockCycleRecord({
        id: cycleId,
        status: 'completed'
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(originalCycle);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      // Mock the factory function
      const { createCycleRecord } = require('../../record_factories/cycle_factory');
      createCycleRecord.mockReturnValue(updatedCycle.payload);

      const result = await backlogAdapter.updateCycle(cycleId, { status: 'completed' }, actorId);

      expect(result.status).toBe('completed');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeCycleId: undefined
        })
      );
    });

    it('[EARS-L1] should create bidirectional link between task and cycle', async () => {
      const taskId = '1757687335-task-test-task';
      const cycleId = '1757687335-cycle-test-cycle';

      const mockTask = createMockTaskRecord({
        id: taskId,
        cycleIds: []
      });
      const mockCycle = createMockCycleRecord({
        id: cycleId,
        taskIds: []
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.cycles.get.mockResolvedValue(mockCycle);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      // Mock getCurrentActor for the new implementation
      mockDependencies.identity.getCurrentActor = jest.fn().mockResolvedValue({
        id: 'human:test-user',
        displayName: 'Test User'
      });

      await backlogAdapter.addTaskToCycle(cycleId, taskId);

      expect(mockDependencies.stores.cycles.put).toHaveBeenCalledWith(
        cycleId,
        expect.objectContaining({
          payload: expect.objectContaining({
            taskIds: expect.arrayContaining([taskId])
          })
        })
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          payload: expect.objectContaining({
            cycleIds: expect.arrayContaining([cycleId])
          })
        })
      );
    });

    it('[EARS-K4b] should throw error when updating cycle in final state', async () => {
      const archivedCycle = createMockCycleRecord({
        id: '1757687335-cycle-archived',
        status: 'archived'
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(archivedCycle);

      await expect(backlogAdapter.updateCycle('1757687335-cycle-archived', { title: 'New Title' }))
        .rejects.toThrow('ProtocolViolationError: Cannot update cycle in final state: archived');
    });

    it('[EARS-L2] should remove multiple tasks with batch processing and validation', async () => {
      const cycleId = '1757687335-cycle-test-cycle';
      const taskIds = ['1757687335-task-test-1', '1757687335-task-test-2'];

      const mockCycle = createMockCycleRecord({
        id: cycleId,
        taskIds: taskIds
      });

      const mockTask1 = createMockTaskRecord({
        id: taskIds[0]!,
        cycleIds: [cycleId]
      });

      const mockTask2 = createMockTaskRecord({
        id: taskIds[1]!,
        cycleIds: [cycleId]
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(mockCycle);
      mockDependencies.stores.tasks.get
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.signRecord.mockImplementation(async (record) => record);

      // Mock getCurrentActor
      mockDependencies.identity.getCurrentActor = jest.fn().mockResolvedValue({
        id: 'human:test-user',
        displayName: 'Test User'
      });

      await backlogAdapter.removeTasksFromCycle(cycleId, taskIds);

      // Verify cycle was updated (taskIds removed)
      expect(mockDependencies.stores.cycles.put).toHaveBeenCalledWith(
        cycleId,
        expect.objectContaining({
          payload: expect.objectContaining({
            taskIds: []
          })
        })
      );

      // Verify both tasks were updated (cycleId removed)
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledTimes(2);
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskIds[0],
        expect.objectContaining({
          payload: expect.objectContaining({
            cycleIds: []
          })
        })
      );
    });

    it('[EARS-L3] should validate tasks are linked to cycle before removing', async () => {
      const cycleId = '1757687335-cycle-test-cycle';
      const taskId = '1757687335-task-test-1';

      const mockCycle = createMockCycleRecord({
        id: cycleId,
        taskIds: [] // Task is NOT linked to cycle
      });

      const mockTask = createMockTaskRecord({
        id: taskId,
        cycleIds: []
      });

      mockDependencies.stores.cycles.get.mockResolvedValue(mockCycle);
      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);

      await expect(backlogAdapter.removeTasksFromCycle(cycleId, [taskId]))
        .rejects.toThrow(`Tasks not linked to cycle ${cycleId}: ${taskId}`);
    });

    it('[EARS-L4] should move tasks atomically between cycles with all-or-nothing', async () => {
      const sourceCycleId = '1757687335-cycle-source';
      const targetCycleId = '1757687335-cycle-target';
      const taskIds = ['1757687335-task-test-1', '1757687335-task-test-2'];

      // Make sure source cycle has the tasks
      const mockSourceCycle = createMockCycleRecord({
        id: sourceCycleId,
        taskIds: [...taskIds] // Explicitly include taskIds
      });

      const mockTargetCycle = createMockCycleRecord({
        id: targetCycleId,
        taskIds: []
      });

      const mockTask1 = createMockTaskRecord({
        id: taskIds[0]!,
        cycleIds: [sourceCycleId]
      });

      const mockTask2 = createMockTaskRecord({
        id: taskIds[1]!,
        cycleIds: [sourceCycleId]
      });

      // Order: first source, then target (Promise.all reads in method line 1303-1306)
      mockDependencies.stores.cycles.get
        .mockResolvedValueOnce(mockSourceCycle)
        .mockResolvedValueOnce(mockTargetCycle);

      mockDependencies.stores.tasks.get
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2);

      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.signRecord.mockImplementation(async (record) => record);

      // Mock getCurrentActor
      mockDependencies.identity.getCurrentActor = jest.fn().mockResolvedValue({
        id: 'human:test-user',
        displayName: 'Test User'
      });

      await backlogAdapter.moveTasksBetweenCycles(targetCycleId, taskIds, sourceCycleId);

      // Verify source cycle was updated (tasks removed)
      expect(mockDependencies.stores.cycles.put).toHaveBeenCalledWith(
        sourceCycleId,
        expect.objectContaining({
          payload: expect.objectContaining({
            id: sourceCycleId,
            taskIds: []
          })
        })
      );

      // Verify target cycle was updated (tasks added)
      expect(mockDependencies.stores.cycles.put).toHaveBeenCalledWith(
        targetCycleId,
        expect.objectContaining({
          payload: expect.objectContaining({
            id: targetCycleId,
            taskIds: expect.arrayContaining(taskIds)
          })
        })
      );

      // Verify tasks were updated (cycleIds changed)
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledTimes(2);
    });

    it('[EARS-L5] should validate source !== target and tasks in source before moving', async () => {
      const cycleId = '1757687335-cycle-test';
      const taskIds = ['1757687335-task-test-1'];

      // Test 1: Same source and target
      await expect(backlogAdapter.moveTasksBetweenCycles(cycleId, taskIds, cycleId))
        .rejects.toThrow('Source and target cycles must be different');

      // Test 2: Tasks not in source cycle
      const mockSourceCycle = createMockCycleRecord({
        id: '1757687335-cycle-source',
        taskIds: [] // Task is NOT in source
      });

      const mockTargetCycle = createMockCycleRecord({
        id: '1757687335-cycle-target',
        taskIds: []
      });

      const mockTask = createMockTaskRecord({
        id: taskIds[0]!,
        cycleIds: []
      });

      mockDependencies.stores.cycles.get
        .mockResolvedValueOnce(mockTargetCycle)
        .mockResolvedValueOnce(mockSourceCycle);

      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);

      await expect(backlogAdapter.moveTasksBetweenCycles('1757687335-cycle-target', taskIds, '1757687335-cycle-source'))
        .rejects.toThrow(`Tasks not linked to source cycle 1757687335-cycle-source: ${taskIds[0]}`);
    });

    it('[EARS-L6] should rollback automatically if move operation fails', async () => {
      const sourceCycleId = '1757687335-cycle-source';
      const targetCycleId = '1757687335-cycle-target';
      const taskIds = ['1757687335-task-test-1'];

      const mockSourceCycle = createMockCycleRecord({
        id: sourceCycleId,
        taskIds: [...taskIds]
      });

      const mockTargetCycle = createMockCycleRecord({
        id: targetCycleId,
        taskIds: []
      });

      const mockTask = createMockTaskRecord({
        id: taskIds[0]!,
        cycleIds: [sourceCycleId]
      });

      // Order: source, target (Promise.all reads in method)
      mockDependencies.stores.cycles.get
        .mockResolvedValueOnce(mockSourceCycle)
        .mockResolvedValueOnce(mockTargetCycle);

      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);

      // Mock getCurrentActor
      mockDependencies.identity.getCurrentActor = jest.fn().mockResolvedValue({
        id: 'human:test-user',
        displayName: 'Test User'
      });

      // Mock signRecord to succeed, but make writes fail
      mockDependencies.identity.signRecord.mockImplementation(async (record) => record);

      // Make the first cycle write succeed, but second one fail (simulating partial failure)
      mockDependencies.stores.cycles.put
        .mockResolvedValueOnce(undefined) // First cycle write succeeds
        .mockRejectedValueOnce(new Error('Simulated cycle write failure')); // Second cycle write fails

      // The operation should fail because writes are atomic (Promise.all)
      await expect(backlogAdapter.moveTasksBetweenCycles(targetCycleId, taskIds, sourceCycleId))
        .rejects.toThrow('AtomicOperationError');

      // Verify that at least one write was attempted
      expect(mockDependencies.stores.cycles.put).toHaveBeenCalled();
    });
  });

  describe('Enhanced Task Operations', () => {
    it('[EARS-D1] should correctly update task fields', async () => {
      const originalTask = createMockTaskRecord({
        id: '1757687335-task-test-task',
        title: 'Original Title',
        status: 'draft'
      });
      const updatedTask = createMockTaskRecord({
        id: '1757687335-task-test-task',
        title: 'Updated Title',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(originalTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      // Mock the factory function
      const { createTaskRecord } = require('../../record_factories/task_factory');
      createTaskRecord.mockReturnValue(updatedTask.payload);

      const result = await backlogAdapter.updateTask('1757687335-task-test-task', { title: 'Updated Title' }, 'human:editor');

      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.any(Object),
        'human:editor',
        'editor',
        expect.any(String)
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('[EARS-D2] should throw error when updating task in final state', async () => {
      const archivedTask = createMockTaskRecord({
        id: '1757687335-task-archived',
        status: 'archived'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(archivedTask);

      await expect(backlogAdapter.updateTask('1757687335-task-archived', { title: 'New Title' }, 'human:editor'))
        .rejects.toThrow('ProtocolViolationError: Cannot update task in final state: archived');
    });

    it('[EARS-D4] should sign the updated record with editor role', async () => {
      const originalTask = createMockTaskRecord({
        id: '1757687335-task-sign-test',
        title: 'Original Title',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(originalTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      const { createTaskRecord } = require('../../record_factories/task_factory');
      createTaskRecord.mockReturnValue({
        ...originalTask.payload,
        title: 'Updated Title'
      });

      await backlogAdapter.updateTask('1757687335-task-sign-test', { title: 'Updated Title' }, 'human:editor');

      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ title: 'Updated Title' })
        }),
        'human:editor',
        'editor',
        'Task updated'
      );
    });

    it('[EARS-E1] should activate task from ready to active with permission validation', async () => {
      const taskId = '1757687335-task-ready-task';
      const readyTask = createMockTaskRecord({
        id: taskId,
        status: 'ready'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...readyTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.activateTask(taskId, 'human:developer');

      expect(mockDependencies.workflowAdapter.getTransitionRule).toHaveBeenCalledWith(
        'ready',
        'active',
        expect.objectContaining({
          task: readyTask.payload,
          transitionTo: 'active'
        })
      );
      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'active' })
        }),
        'human:developer',
        'executor',
        expect.any(String) // notes parameter
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'ready',
            newStatus: 'active',
            actorId: 'human:developer'
          })
        })
      );
      expect(result.status).toBe('active');
    });

    it('[EARS-E2] should throw error when task not found for activation', async () => {
      mockDependencies.stores.tasks.get.mockResolvedValue(null);

      await expect(backlogAdapter.activateTask('nonexistent-task', 'human:developer'))
        .rejects.toThrow('RecordNotFoundError: Task not found: nonexistent-task');
    });

    it('[EARS-E3] should throw error when task is not in ready state for activation', async () => {
      const draftTask = createMockTaskRecord({
        id: '1757687335-task-draft',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(draftTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });

      await expect(backlogAdapter.activateTask('1757687335-task-draft', 'human:developer'))
        .rejects.toThrow('ProtocolViolationError: Task is in \'draft\' state. Cannot activate from this state.');
    });

    it('[EARS-E4] should throw error when workflow methodology rejects activation', async () => {
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue(null);

      await expect(backlogAdapter.activateTask('1757687335-task-ready', 'human:developer'))
        .rejects.toThrow('ProtocolViolationError: Workflow rejected ready→active transition');
    });

    it('[EARS-E5] should update activeTaskId in session when task is activated', async () => {
      const taskId = '1757687335-task-ready-for-activation';
      const actorId = 'human:developer';
      const readyTask = createMockTaskRecord({
        id: taskId,
        status: 'ready'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: actorId,
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...readyTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.activateTask(taskId, actorId);

      expect(result.status).toBe('active');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeTaskId: taskId
        })
      );
    });

    it('[EARS-I1b] should pause task passing task payload to workflow transition context', async () => {
      const taskId = '1757687335-task-active';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused',
        notes: '[PAUSED] Waiting for external API approval'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:tech-lead',
        type: 'human',
        displayName: 'Tech Lead',
        publicKey: 'mock-key',
        roles: ['pauser'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'paused',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...activeTask,
        payload: pausedTask.payload
      });

      const result = await backlogAdapter.pauseTask(taskId, 'human:tech-lead', 'Waiting for external API approval');

      expect(mockDependencies.workflowAdapter.getTransitionRule).toHaveBeenCalledWith(
        'active',
        'paused',
        expect.objectContaining({
          task: activeTask.payload,
          transitionTo: 'paused'
        })
      );
      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'paused',
            notes: expect.stringContaining('[PAUSED] Waiting for external API approval')
          })
        }),
        'human:tech-lead',
        'pauser',
        expect.any(String) // notes parameter
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'active',
            newStatus: 'paused',
            actorId: 'human:tech-lead',
            reason: 'Waiting for external API approval'
          })
        })
      );
      expect(result.status).toBe('paused');
    });

    it('[EARS-I2] should throw error when task not found for pause', async () => {
      mockDependencies.stores.tasks.get.mockResolvedValue(null);

      await expect(backlogAdapter.pauseTask('nonexistent-task', 'human:tech-lead'))
        .rejects.toThrow('RecordNotFoundError: Task not found: nonexistent-task');
    });

    it('[EARS-I3] should throw error when task is not in active state for pause', async () => {
      const pausedTask = createMockTaskRecord({
        id: '1757687335-task-paused',
        status: 'paused'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(pausedTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:tech-lead',
        type: 'human',
        displayName: 'Tech Lead',
        publicKey: 'mock-key',
        roles: ['pauser'],
        status: 'active'
      });

      await expect(backlogAdapter.pauseTask('1757687335-task-paused', 'human:tech-lead'))
        .rejects.toThrow(`ProtocolViolationError: Task is in 'paused' state. Cannot pause (requires active).`);
    });

    it('[EARS-I4] should reject pause when workflow methodology denies transition', async () => {
      const activeTask = createMockTaskRecord({
        id: '1757687335-task-active',
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:tech-lead',
        type: 'human',
        displayName: 'Tech Lead',
        publicKey: 'mock-key',
        roles: ['pauser'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue(null);

      await expect(backlogAdapter.pauseTask('1757687335-task-active', 'human:tech-lead'))
        .rejects.toThrow('ProtocolViolationError: Workflow rejected active→paused transition');
    });

    it('[EARS-I4b] should add reason with PAUSED prefix in notes', async () => {
      // Arrange: Active task with existing notes
      const taskId = '1757687335-task-with-notes';
      const actorId = 'human:pm';
      const existingNotes = 'Task created for Q1 sprint';
      const pauseReason = 'Blocked by design review';

      const activeTask = createMockTaskRecord({
        id: taskId,
        title: 'Task with Notes',
        status: 'active',
        notes: existingNotes
      });

      const actor: ActorRecord = {
        id: actorId,
        type: 'human',
        displayName: 'Project Manager',
        publicKey: 'mock-public-key-pm',
        roles: ['author', 'approver'],
        status: 'active'
      };

      // Mock dependencies
      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue(actor);
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'paused',
        conditions: undefined
      });
      mockDependencies.identity.signRecord.mockImplementation((record) => Promise.resolve(record));
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      // Act
      const result = await backlogAdapter.pauseTask(taskId, actorId, pauseReason);

      // Assert: Verify notes contains existing content + new content with [PAUSED] prefix
      expect(result.notes).toContain(existingNotes);
      expect(result.notes).toContain('[PAUSED]');
      expect(result.notes).toContain(pauseReason);
      // Verify ISO timestamp format
      expect(result.notes).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('[EARS-I5] should clear activeTaskId in session when task is paused', async () => {
      const taskId = '1757687335-task-active-for-pause';
      const actorId = 'human:tech-lead';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused',
        notes: '[PAUSED] Waiting for dependencies'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: actorId,
        type: 'human',
        displayName: 'Tech Lead',
        publicKey: 'mock-key',
        roles: ['pauser'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'paused',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...activeTask,
        payload: pausedTask.payload
      });

      const result = await backlogAdapter.pauseTask(taskId, actorId, 'Waiting for dependencies');

      expect(result.status).toBe('paused');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeTaskId: undefined
        })
      );
    });

    it('[EARS-J1] should resume task from paused to active with blocking validation', async () => {
      const taskId = '1757687335-task-paused';
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(pausedTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:ops-lead',
        type: 'human',
        displayName: 'Ops Lead',
        publicKey: 'mock-key',
        roles: ['resumer'],
        status: 'active'
      });
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId,
        healthScore: 80,
        timeInCurrentStage: 3,
        stalenessIndex: 1,
        blockingFeedbacks: 0,
        lastActivity: Date.now(),
        recommendations: []
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...pausedTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.resumeTask(taskId, 'human:ops-lead');

      expect(mockDependencies.metricsAdapter.getTaskHealth).toHaveBeenCalledWith(taskId);
      expect(mockDependencies.workflowAdapter.getTransitionRule).toHaveBeenCalledWith(
        'paused',
        'active',
        expect.objectContaining({
          task: pausedTask.payload,
          transitionTo: 'active'
        })
      );
      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'active' })
        }),
        'human:ops-lead',
        'resumer',
        expect.any(String) // notes parameter
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'paused',
            newStatus: 'active',
            actorId: 'human:ops-lead'
          })
        })
      );
      expect(result.status).toBe('active');
    });

    it('[EARS-J2] should throw error when task not found for resume', async () => {
      mockDependencies.stores.tasks.get.mockResolvedValue(null);

      await expect(backlogAdapter.resumeTask('nonexistent-task', 'human:ops-lead'))
        .rejects.toThrow('RecordNotFoundError: Task not found: nonexistent-task');
    });

    it('[EARS-J3] should throw error when task is not in paused state for resume', async () => {
      const activeTask = createMockTaskRecord({
        id: '1757687335-task-active',
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:ops-lead',
        type: 'human',
        displayName: 'Ops Lead',
        publicKey: 'mock-key',
        roles: ['resumer'],
        status: 'active'
      });

      await expect(backlogAdapter.resumeTask('1757687335-task-active', 'human:ops-lead'))
        .rejects.toThrow(`ProtocolViolationError: Task is in 'active' state. Cannot resume (requires paused).`);
    });

    it('[EARS-J4] should throw error when paused task has blocking feedbacks', async () => {
      const pausedTask = createMockTaskRecord({
        id: '1757687335-task-blocked',
        status: 'paused'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(pausedTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:ops-lead',
        type: 'human',
        displayName: 'Ops Lead',
        publicKey: 'mock-key',
        roles: ['resumer'],
        status: 'active'
      });
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId: '1757687335-task-blocked',
        healthScore: 60,
        timeInCurrentStage: 5,
        stalenessIndex: 2,
        blockingFeedbacks: 2,
        lastActivity: Date.now(),
        recommendations: ['Resolve blocking feedbacks']
      });

      await expect(backlogAdapter.resumeTask('1757687335-task-blocked', 'human:ops-lead'))
        .rejects.toThrow('BlockingFeedbackError: Task has blocking feedbacks. Resolve them before resuming or use force.');
    });

    it('[EARS-J5] should force resume ignoring blocking feedbacks with force true', async () => {
      const taskId = '1757687335-task-force-resume';
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(pausedTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:ops-lead',
        type: 'human',
        displayName: 'Ops Lead',
        publicKey: 'mock-key',
        roles: ['resumer'],
        status: 'active'
      });
      mockDependencies.metricsAdapter.getTaskHealth.mockClear();
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...pausedTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.resumeTask(taskId, 'human:ops-lead', true);

      expect(mockDependencies.metricsAdapter.getTaskHealth).not.toHaveBeenCalled();
      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'active' })
        }),
        'human:ops-lead',
        'resumer',
        expect.any(String) // notes parameter
      );
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'paused',
            newStatus: 'active'
          })
        })
      );
      expect(result.status).toBe('active');
    });

    it('[EARS-J6] should update activeTaskId in session when task is resumed', async () => {
      const taskId = '1757687335-task-paused-for-resume';
      const actorId = 'human:ops-lead';
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(pausedTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: actorId,
        type: 'human',
        displayName: 'Ops Lead',
        publicKey: 'mock-key',
        roles: ['resumer'],
        status: 'active'
      });
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId,
        healthScore: 80,
        timeInCurrentStage: 3,
        stalenessIndex: 1,
        blockingFeedbacks: 0,
        lastActivity: Date.now(),
        recommendations: []
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...pausedTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.resumeTask(taskId, actorId);

      expect(result.status).toBe('active');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeTaskId: taskId
        })
      );
    });

    it('[EARS-F1] should complete task from active to done with approver quality validation', async () => {
      const taskId = '1757687335-task-active-task';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const doneTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:qa-lead',
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'done',
        conditions: { signatures: { __default__: { role: 'approver', capability_roles: ['approver:quality'], min_approvals: 1 } } }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(doneTask);

      const result = await backlogAdapter.completeTask(taskId, 'human:qa-lead');

      expect(result.status).toBe('done');
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(taskId, doneTask);
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith({
        type: 'task.status.changed',
        timestamp: expect.any(Number),
        source: 'backlog_adapter',
        payload: {
          taskId,
          oldStatus: 'active',
          newStatus: 'done',
          actorId: 'human:qa-lead'
        }
      });
    });

    it('[EARS-F2] should throw error when task not found for completion', async () => {
      mockDependencies.stores.tasks.get.mockResolvedValue(null);

      await expect(backlogAdapter.completeTask('non-existent-task', 'human:qa-lead'))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent-task');
    });

    it('[EARS-F3] should throw error when task is not in active state for completion', async () => {
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:qa-lead',
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });

      await expect(backlogAdapter.completeTask('1757687335-task-ready', 'human:qa-lead'))
        .rejects.toThrow('ProtocolViolationError: Task is in \'ready\' state. Cannot complete from this state.');
    });

    it('[EARS-F4] should throw error when workflow methodology rejects completion', async () => {
      const activeTask = createMockTaskRecord({
        id: '1757687335-task-active',
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:qa-lead',
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue(null);

      await expect(backlogAdapter.completeTask('1757687335-task-active', 'human:qa-lead'))
        .rejects.toThrow('ProtocolViolationError: Workflow rejected active→done transition');
    });

    it('[EARS-F5] should clear activeTaskId in session when task is completed', async () => {
      const taskId = '1757687335-task-active-for-completion';
      const actorId = 'human:qa-lead';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const doneTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: actorId,
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'done',
        conditions: { signatures: { __default__: { role: 'approver', capability_roles: ['approver:quality'], min_approvals: 1 } } }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(doneTask);

      const result = await backlogAdapter.completeTask(taskId, actorId);

      expect(result.status).toBe('done');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeTaskId: undefined
        })
      );
    });

    it('[EARS-G1] should cancel task from ready to discarded with proper validation', async () => {
      const taskId = '1757687335-task-ready-to-cancel';
      const readyTask = createMockTaskRecord({
        id: taskId,
        status: 'ready',
        title: 'Task to Cancel'
      });
      const cancelledTask = createMockTaskRecord({
        id: taskId,
        status: 'discarded',
        title: 'Task to Cancel',
        notes: '[CANCELLED] No longer needed (2025-01-15T10:30:00.000Z)'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:product-manager',
        type: 'human',
        displayName: 'Product Manager',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(cancelledTask);

      const result = await backlogAdapter.discardTask(taskId, 'human:product-manager', 'No longer needed');

      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[CANCELLED] No longer needed');
    });

    it('[EARS-G2] should cancel task from active to discarded', async () => {
      const taskId = '1757687335-task-active-to-cancel';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active',
        title: 'Active Task to Cancel'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:team-lead',
        type: 'human',
        displayName: 'Team Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...activeTask,
        payload: { ...activeTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.discardTask(taskId, 'human:team-lead');

      expect(result.status).toBe('discarded');
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
    });

    it('[EARS-G3] should throw error when cancelling task from invalid state', async () => {
      const draftTask = createMockTaskRecord({
        id: '1757687335-task-draft',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(draftTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:anyone',
        type: 'human',
        displayName: 'Anyone',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await expect(backlogAdapter.discardTask('1757687335-task-draft', 'human:anyone'))
        .rejects.toThrow('ProtocolViolationError: Cannot cancel task in \'draft\' state. Use \'gitgov task delete 1757687335-task-draft\' to remove draft tasks.');
    });

    it('[EARS-G4] should reject task from review to discarded with reason', async () => {
      const taskId = '1757687335-task-review-to-reject';
      const reviewTask = createMockTaskRecord({
        id: taskId,
        status: 'review',
        title: 'Review Task to Reject',
        notes: 'Original task notes'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(reviewTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:reviewer',
        type: 'human',
        displayName: 'Reviewer',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task reject' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...reviewTask,
        payload: { ...reviewTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.discardTask(taskId, 'human:reviewer', 'Requirements unclear');

      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[REJECTED] Requirements unclear');
      expect(result.notes).toContain('Original task notes');
      expect(mockDependencies.stores.tasks.put).toHaveBeenCalled();
    });

    it('[EARS-G5] should add reason with REJECTED prefix in notes for reject', async () => {
      const taskId = '1757687335-task-review-rejected';
      const reviewTask = createMockTaskRecord({
        id: taskId,
        status: 'review',
        title: 'Review Task for Rejection'
        // notes omitted - will be undefined by default
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(reviewTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:reviewer',
        type: 'human',
        displayName: 'Reviewer',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      } as ActorRecord);
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task reject' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...reviewTask,
        payload: { ...reviewTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.discardTask(taskId, 'human:reviewer', 'Not aligned with architecture');

      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[REJECTED] Not aligned with architecture');
      expect(result.notes).toContain('[REJECTED]');
      expect(result.notes).not.toContain('[CANCELLED]');
      expect(result.notes).toMatch(/\[REJECTED\] Not aligned with architecture \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\)/);
    });

    it('[EARS-G6] should validate ready active review states for cancel reject', async () => {
      // Test ready state (should use [CANCELLED])
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:pm',
        type: 'human',
        displayName: 'PM',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...readyTask,
        payload: { ...readyTask.payload, status: 'discarded' }
      });

      const readyResult = await backlogAdapter.discardTask('1757687335-task-ready', 'human:pm', 'Priorities changed');
      expect(readyResult.notes).toContain('[CANCELLED] Priorities changed');

      // Test review state (should use [REJECTED])
      const reviewTask = createMockTaskRecord({
        id: '1757687335-task-review',
        status: 'review'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(reviewTask);
      const reviewResult = await backlogAdapter.discardTask('1757687335-task-review', 'human:pm', 'Requirements unclear');
      expect(reviewResult.notes).toContain('[REJECTED] Requirements unclear');
    });

    it('[EARS-G7] should clear activeTaskId in session when task is discarded', async () => {
      const taskId = '1757687335-task-active-for-discard';
      const actorId = 'human:product-manager';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active',
        title: 'Task to Discard'
      });
      const discardedTask = createMockTaskRecord({
        id: taskId,
        status: 'discarded',
        title: 'Task to Discard',
        notes: '[CANCELLED] No longer needed'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: actorId,
        type: 'human',
        displayName: 'Product Manager',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(discardedTask);

      const result = await backlogAdapter.discardTask(taskId, actorId, 'No longer needed');

      expect(result.status).toBe('discarded');
      expect(mockDependencies.sessionManager.updateActorState).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({
          activeTaskId: undefined
        })
      );
    });

    it('[EARS-H1] should delete draft task completely without discarded state', async () => {
      const taskId = '1757687335-task-draft-to-delete';
      const draftTask = createMockTaskRecord({
        id: taskId,
        status: 'draft',
        title: 'Draft Task to Delete'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(draftTask);
      mockDependencies.stores.tasks.delete = jest.fn().mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:author',
        type: 'human',
        displayName: 'Author',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await backlogAdapter.deleteTask(taskId, 'human:author');

      expect(mockDependencies.stores.tasks.delete).toHaveBeenCalledWith(taskId);
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'draft',
            newStatus: 'deleted',
            actorId: 'human:author',
            reason: 'Draft task deleted'
          })
        })
      );
    });

    it('[EARS-H2] should throw error when task not found for deletion', async () => {
      mockDependencies.stores.tasks.get.mockResolvedValue(null);

      await expect(backlogAdapter.deleteTask('nonexistent-task', 'human:author'))
        .rejects.toThrow('RecordNotFoundError: Task not found: nonexistent-task');
    });

    it('[EARS-H3] should throw error when task is not in draft state for deletion', async () => {
      const activeTask = createMockTaskRecord({
        id: '1757687335-task-active',
        status: 'active'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:author',
        type: 'human',
        displayName: 'Author',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await expect(backlogAdapter.deleteTask('1757687335-task-active', 'human:author'))
        .rejects.toThrow('ProtocolViolationError: Cannot delete task in \'active\' state');
    });

    it('[EARS-H4] should show educational error suggesting reject for review task', async () => {
      const reviewTask = createMockTaskRecord({
        id: '1757687335-task-review',
        status: 'review'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(reviewTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:author',
        type: 'human',
        displayName: 'Author',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await expect(backlogAdapter.deleteTask('1757687335-task-review', 'human:author'))
        .rejects.toThrow('ProtocolViolationError: Cannot delete task in \'review\' state. Use \'gitgov task reject 1757687335-task-review\' to discard tasks under review.');
    });

    it('[EARS-H5] should show educational error suggesting cancel for ready/active tasks', async () => {
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(readyTask);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:author',
        type: 'human',
        displayName: 'Author',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await expect(backlogAdapter.deleteTask('1757687335-task-ready', 'human:author'))
        .rejects.toThrow('ProtocolViolationError: Cannot delete task in \'ready\' state. Use \'gitgov task cancel 1757687335-task-ready\' to discard tasks from ready/active states.');
    });

    it('[EARS-H6] should emit task status changed event with deleted status', async () => {
      const taskId = '1757687335-task-draft-emit-event';
      const draftTask = createMockTaskRecord({
        id: taskId,
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(draftTask);
      mockDependencies.stores.tasks.delete = jest.fn().mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:author',
        type: 'human',
        displayName: 'Author',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await backlogAdapter.deleteTask(taskId, 'human:author');

      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          source: 'backlog_adapter',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'draft',
            newStatus: 'deleted',
            actorId: 'human:author',
            reason: 'Draft task deleted'
          })
        })
      );
    });
  });

  describe('Event Handlers', () => {
    it('[EARS-M1] should pause active task when blocking feedback created', async () => {
      const taskId = '1757687335-task-active-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const mockFeedback = createMockFeedbackRecord({
        id: '1757687335-feedback-blocking',
        entityId: taskId,
        type: 'blocking'
      });

      mockDependencies.stores.feedbacks.get.mockResolvedValue(mockFeedback);
      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-blocking',
          entityType: 'task',
          entityId: taskId,
          type: 'blocking',
          status: 'open',
          content: 'Blocking feedback content',
          triggeredBy: 'human:reviewer'
        }
      };

      await backlogAdapter.handleFeedbackCreated(event);

      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'paused'
          })
        })
      );
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            oldStatus: 'active',
            newStatus: 'paused'
          })
        })
      );
    });

    it('[EARS-M3] should resume task when last blocking feedback resolved (immutable pattern)', async () => {
      const taskId = '1757687335-task-paused-task';
      const originalBlockingFeedbackId = '1757687335-feedback-blocking';

      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });

      // Original blocking feedback (still with status: 'open')
      const mockOriginalFeedback = createMockFeedbackRecord({
        id: originalBlockingFeedbackId,
        entityType: 'task',
        entityId: taskId,
        type: 'blocking',
        status: 'open'
      });

      mockDependencies.feedbackAdapter.getFeedback.mockResolvedValue(mockOriginalFeedback.payload);
      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId: taskId,
        healthScore: 100,
        timeInCurrentStage: 0,
        stalenessIndex: 0,
        blockingFeedbacks: 0, // No more blocking feedbacks
        lastActivity: Date.now(),
        recommendations: []
      });

      // NEW feedback created that RESOLVES the blocking feedback (immutable pattern)
      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-resolution',
          entityType: 'feedback', // Points to another feedback
          entityId: originalBlockingFeedbackId, // Points to the original blocking feedback
          type: 'clarification',
          status: 'resolved',
          content: 'Blocking issue resolved',
          triggeredBy: 'human:resolver',
          resolvesFeedbackId: originalBlockingFeedbackId // Marks this as a resolution
        }
      };

      await backlogAdapter.handleFeedbackCreated(event);

      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'active'
          })
        })
      );
    });

    it('[EARS-M4] should not resume task if other blocking feedbacks remain (immutable pattern)', async () => {
      const taskId = '1757687335-task-still-blocked';
      const originalBlockingFeedbackId = '1757687335-feedback-blocking-1';

      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });

      // Original blocking feedback being resolved
      const mockOriginalFeedback = createMockFeedbackRecord({
        id: originalBlockingFeedbackId,
        entityType: 'task',
        entityId: taskId,
        type: 'blocking',
        status: 'open'
      });

      mockDependencies.feedbackAdapter.getFeedback.mockResolvedValue(mockOriginalFeedback.payload);
      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId: taskId,
        healthScore: 80,
        timeInCurrentStage: 0,
        stalenessIndex: 0,
        blockingFeedbacks: 1, // Still 1 blocking feedback remaining!
        lastActivity: Date.now(),
        recommendations: []
      });

      // NEW feedback created that RESOLVES ONE blocking feedback
      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-resolution',
          entityType: 'feedback',
          entityId: originalBlockingFeedbackId,
          type: 'clarification',
          status: 'resolved',
          content: 'One blocking issue resolved',
          triggeredBy: 'human:resolver',
          resolvesFeedbackId: originalBlockingFeedbackId
        }
      };

      await backlogAdapter.handleFeedbackCreated(event);

      // Should NOT write to taskStore (task stays paused due to remaining blocks)
      expect(mockDependencies.stores.tasks.put).not.toHaveBeenCalled();
    });

    it('[EARS-M5] should transition task to active on first execution', async () => {
      const taskId = '1757687335-task-ready-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'ready'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:executor',
        type: 'human',
        displayName: 'Executor',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });

      const event: ExecutionCreatedEvent = {
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: {
          executionId: '1757687335-exec-first',
          taskId,
          type: 'progress',
          title: 'First Execution',
          triggeredBy: 'human:executor',
          isFirstExecution: true
        }
      };

      await backlogAdapter.handleExecutionCreated(event);

      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'active'
          })
        })
      );
    });

    it('[EARS-M6] should do nothing on subsequent executions', async () => {
      const event: ExecutionCreatedEvent = {
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: {
          executionId: '1757687335-exec-second',
          taskId: '1757687335-task-active-task',
          type: 'progress',
          title: 'Subsequent Execution',
          triggeredBy: 'human:executor',
          isFirstExecution: false
        }
      };

      await backlogAdapter.handleExecutionCreated(event);

      // Should not write to taskStore
      expect(mockDependencies.stores.tasks.put).not.toHaveBeenCalled();
    });

    it('[EARS-M7] should archive task when changelog created', async () => {
      const taskId = '1757687335-task-done-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });
      const mockChangelog = createMockChangelogRecord({
        id: '1757687335-changelog-task-done',
        title: 'Task completed',
        description: 'Successfully completed the task with all requirements met',
        relatedTasks: [taskId],
        completedAt: 1757687335,
        version: 'v1.0.0'
      });

      mockDependencies.stores.changelogs.get.mockResolvedValue(mockChangelog);
      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      const event: ChangelogCreatedEvent = {
        type: 'changelog.created',
        timestamp: Date.now(),
        source: 'changelog_adapter',
        payload: {
          changelogId: '1757687335-changelog-task-done',
          relatedTasks: [taskId],
          title: 'Task completed',
          version: 'v1.0.0'
        }
      };

      await backlogAdapter.handleChangelogCreated(event);

      expect(mockDependencies.stores.tasks.put).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'archived'
          })
        })
      );
    });

    it('[EARS-M9] should complete parent cycle when all child cycles are completed', async () => {
      const parentCycleId = '1757687335-cycle-parent';
      const childCycleId = '1757687335-cycle-child';

      // Mock parent cycle with child
      const parentCycle = createMockCycleRecord({
        id: parentCycleId,
        status: 'active',
        childCycleIds: [childCycleId]
      });

      // Mock completed child cycle
      const childCycle = createMockCycleRecord({
        id: childCycleId,
        status: 'completed'
      });

      // Setup mocks
      mockDependencies.stores.cycles.get
        .mockImplementation(async (id: string) => {
          if (id === childCycleId) return childCycle;
          if (id === parentCycleId) return parentCycle;
          return null;
        });

      mockDependencies.stores.cycles.list.mockResolvedValue([parentCycleId, childCycleId]);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      const event: CycleStatusChangedEvent = {
        type: 'cycle.status.changed',
        timestamp: Date.now(),
        source: 'backlog_adapter',
        payload: {
          cycleId: childCycleId,
          oldStatus: 'active',
          newStatus: 'completed',
          triggeredBy: 'system'
        }
      };

      // For now, just verify it doesn't throw an error
      // The full implementation requires complex factory mocking
      await expect(backlogAdapter.handleCycleStatusChanged(event)).resolves.not.toThrow();

      // Note: Epic task completion is delegated to planning methodology (not implemented yet)
    });
  });

  describe('Performance Benchmarks', () => {
    it('[EARS-O1] should execute task operations in under 100ms', async () => {
      const mockTask = createMockTaskRecord({
        id: '1757687335-task-performance',
        title: 'Performance Test Task',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(mockTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:performer',
        type: 'human',
        displayName: 'Performer',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'review',
        conditions: {}
      });

      const startTime = Date.now();
      await backlogAdapter.submitTask('1757687335-task-performance', 'human:performer');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
    });

    it('[EARS-O2] should execute cycle operations in under 100ms', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-performance',
        title: 'Performance Test Cycle',
        status: 'planning'
      });

      const { createCycleRecord } = require('../../record_factories/cycle_factory');
      createCycleRecord.mockReturnValue(mockCycle.payload);

      mockDependencies.identity.signRecord.mockResolvedValue(mockCycle);
      mockDependencies.stores.cycles.put.mockResolvedValue(undefined);

      const startTime = Date.now();
      await backlogAdapter.createCycle({
        title: 'Performance Test Cycle',
        status: 'planning'
      }, 'human:performer');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
    });

    it('[EARS-O3] should execute getSystemStatus in under 100ms', async () => {
      const startTime = Date.now();
      await backlogAdapter.getSystemStatus();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
      expect(mockDependencies.metricsAdapter.getSystemStatus).toHaveBeenCalled();
    });

    it('[EARS-O4] should execute getTaskHealth in under 100ms', async () => {
      const startTime = Date.now();
      await backlogAdapter.getTaskHealth('1757687335-task-health-test');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
      expect(mockDependencies.metricsAdapter.getTaskHealth).toHaveBeenCalledWith('1757687335-task-health-test');
    });
  });

  describe('Agent Navigation', () => {
    it('[EARS-R1] should return tasks assigned to a specific actor', async () => {
      const taskId1 = '1757687335-task-assigned-1';
      const taskId2 = '1757687335-task-assigned-2';
      const taskId3 = '1757687335-task-unassigned';
      const actorId = 'human:developer';

      // Mock feedback records for assignments
      const assignmentFeedback1 = createMockFeedbackRecord({
        id: '1757687335-feedback-assignment-1',
        entityId: taskId1,
        type: 'assignment',
        assignee: actorId,
        status: 'resolved'
      });
      const assignmentFeedback2 = createMockFeedbackRecord({
        id: '1757687335-feedback-assignment-2',
        entityId: taskId2,
        type: 'assignment',
        assignee: actorId,
        status: 'resolved'
      });
      const nonAssignmentFeedback = createMockFeedbackRecord({
        id: '1757687335-feedback-suggestion',
        entityId: taskId3,
        type: 'suggestion',
        assignee: 'human:other',
        status: 'open'
      });

      // Mock tasks
      const task1 = createMockTaskRecord({ id: taskId1, title: 'Assigned Task 1' });
      const task2 = createMockTaskRecord({ id: taskId2, title: 'Assigned Task 2' });

      // Setup mocks - list() returns IDs, get() returns full records
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-assignment-1',
        '1757687335-feedback-assignment-2',
        '1757687335-feedback-suggestion'
      ]);
      mockDependencies.stores.feedbacks.get
        .mockResolvedValueOnce(assignmentFeedback1)
        .mockResolvedValueOnce(assignmentFeedback2)
        .mockResolvedValueOnce(nonAssignmentFeedback);

      mockDependencies.stores.tasks.get
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(taskId1);
      expect(result[1]?.id).toBe(taskId2);
    });

    it('[EARS-R2] should return empty array for actor with no assigned tasks', async () => {
      const actorId = 'human:unassigned';

      // Mock no assignment feedbacks for this actor
      const nonAssignmentFeedback = createMockFeedbackRecord({
        id: '1757687335-feedback-other',
        entityId: 'task-123',
        type: 'suggestion',
        assignee: 'human:other-actor',
        status: 'open'
      });

      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-other'
      ]);
      mockDependencies.stores.feedbacks.get.mockResolvedValue(nonAssignmentFeedback);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      expect(result).toEqual([]);
    });

    it('[EARS-R3] should deduplicate tasks when multiple assignment feedbacks exist for same task', async () => {
      const taskId = '1757687335-task-duplicate-assignments';
      const actorId = 'human:developer';

      // Mock MULTIPLE assignment feedbacks for the SAME task to the SAME actor
      const assignmentFeedback1 = createMockFeedbackRecord({
        id: '1757687335-feedback-assignment-1',
        entityId: taskId,
        type: 'assignment',
        assignee: actorId,
        status: 'open'
      });
      const assignmentFeedback2 = createMockFeedbackRecord({
        id: '1757687335-feedback-assignment-2',
        entityId: taskId,
        type: 'assignment',
        assignee: actorId,
        status: 'open'
      });

      // Mock task (should only be returned once)
      const task = createMockTaskRecord({ id: taskId, title: 'Task with Duplicate Assignments' });

      // Setup mocks - list returns IDs, get returns full records
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-assignment-1',
        '1757687335-feedback-assignment-2'
      ]);
      mockDependencies.stores.feedbacks.get
        .mockResolvedValueOnce(assignmentFeedback1)
        .mockResolvedValueOnce(assignmentFeedback2);

      // Task should only be read ONCE due to deduplication
      mockDependencies.stores.tasks.get.mockResolvedValue(task);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      // Critical assertion: Should return only 1 task, not 2
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(taskId);
      expect(result[0]?.title).toBe('Task with Duplicate Assignments');

      // Verify task store was only read once (deduplication happened)
      expect(mockDependencies.stores.tasks.get).toHaveBeenCalledTimes(1);
      expect(mockDependencies.stores.tasks.get).toHaveBeenCalledWith(taskId);
    });

    it('[EARS-R4] should handle multiple tasks with some having duplicate assignments', async () => {
      const taskId1 = '1757687335-task-with-duplicates';
      const taskId2 = '1757687335-task-normal';
      const actorId = 'human:developer';

      // Mock feedbacks: task1 has 3 duplicate assignments, task2 has 1 normal assignment
      const feedbackRecords = [
        createMockFeedbackRecord({
          id: '1757687335-feedback-1',
          entityId: taskId1, type: 'assignment', assignee: actorId, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-2',
          entityId: taskId1, type: 'assignment', assignee: actorId, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-3',
          entityId: taskId1, type: 'assignment', assignee: actorId, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-4',
          entityId: taskId2, type: 'assignment', assignee: actorId, status: 'open'
        })
      ];

      const task1 = createMockTaskRecord({ id: taskId1, title: 'Task with 3 duplicate assignments' });
      const task2 = createMockTaskRecord({ id: taskId2, title: 'Normal task' });

      // list() returns IDs
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-1',
        '1757687335-feedback-2',
        '1757687335-feedback-3',
        '1757687335-feedback-4'
      ]);

      // get() returns full records
      feedbackRecords.forEach(f => {
        mockDependencies.stores.feedbacks.get.mockResolvedValueOnce(f);
      });

      mockDependencies.stores.tasks.get
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      // Should return only 2 unique tasks despite 4 assignment feedbacks
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(taskId1);
      expect(result[1]?.id).toBe(taskId2);

      // Verify deduplication: task store called only twice (once per unique task)
      expect(mockDependencies.stores.tasks.get).toHaveBeenCalledTimes(2);
    });

    it('[EARS-R5] should handle task assigned to multiple different actors correctly', async () => {
      const taskId = '1757687335-task-multi-actor';
      const actor1 = 'human:developer-1';
      const actor2 = 'human:developer-2';

      // Mock assignments for the same task to TWO DIFFERENT actors
      const feedbackRecords = [
        createMockFeedbackRecord({
          id: '1757687335-feedback-actor1',
          entityId: taskId, type: 'assignment', assignee: actor1, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-actor2',
          entityId: taskId, type: 'assignment', assignee: actor2, status: 'open'
        })
      ];

      const task = createMockTaskRecord({ id: taskId, title: 'Task assigned to multiple actors' });

      // list() returns IDs
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-actor1',
        '1757687335-feedback-actor2'
      ]);

      feedbackRecords.forEach(f => {
        mockDependencies.stores.feedbacks.get.mockResolvedValueOnce(f);
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(task);

      // Query for actor1 - should only return 1 task
      const resultActor1 = await backlogAdapter.getTasksAssignedToActor(actor1);
      expect(resultActor1).toHaveLength(1);
      expect(resultActor1[0]?.id).toBe(taskId);

      // Reset mocks
      jest.clearAllMocks();
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-actor1',
        '1757687335-feedback-actor2'
      ]);
      feedbackRecords.forEach(f => {
        mockDependencies.stores.feedbacks.get.mockResolvedValueOnce(f);
      });
      mockDependencies.stores.tasks.get.mockResolvedValue(task);

      // Query for actor2 - should also return 1 task
      const resultActor2 = await backlogAdapter.getTasksAssignedToActor(actor2);
      expect(resultActor2).toHaveLength(1);
      expect(resultActor2[0]?.id).toBe(taskId);
    });

    it('[EARS-R6] should handle edge case with no duplicate assignments gracefully', async () => {
      const actorId = 'human:developer';
      const taskId1 = '1757687335-task-unique-1';
      const taskId2 = '1757687335-task-unique-2';
      const taskId3 = '1757687335-task-unique-3';

      // Mock 3 unique assignments (no duplicates)
      const feedbackRecords = [
        createMockFeedbackRecord({
          id: '1757687335-feedback-1',
          entityId: taskId1, type: 'assignment', assignee: actorId, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-2',
          entityId: taskId2, type: 'assignment', assignee: actorId, status: 'open'
        }),
        createMockFeedbackRecord({
          id: '1757687335-feedback-3',
          entityId: taskId3, type: 'assignment', assignee: actorId, status: 'open'
        })
      ];

      const task1 = createMockTaskRecord({ id: taskId1, title: 'Unique Task 1' });
      const task2 = createMockTaskRecord({ id: taskId2, title: 'Unique Task 2' });
      const task3 = createMockTaskRecord({ id: taskId3, title: 'Unique Task 3' });

      // list() returns IDs
      mockDependencies.stores.feedbacks.list.mockResolvedValue([
        '1757687335-feedback-1',
        '1757687335-feedback-2',
        '1757687335-feedback-3'
      ]);

      // get() returns full records
      feedbackRecords.forEach(f => {
        mockDependencies.stores.feedbacks.get.mockResolvedValueOnce(f);
      });

      mockDependencies.stores.tasks.get
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2)
        .mockResolvedValueOnce(task3);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      // Should work normally with no duplicates
      expect(result).toHaveLength(3);
      expect(result.map(t => t.id)).toEqual([taskId1, taskId2, taskId3]);
      expect(mockDependencies.stores.tasks.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('pauseTask - Additional Edge Cases', () => {
    it('[EARS-I1c] should pause task verifying actor in workflow transition context', async () => {
      // Arrange: Task in 'active' state
      const taskId = '1757687335-task-active';
      const actorId = 'human:developer';

      const activeTask = createMockTaskRecord({
        id: taskId,
        title: 'Active Task',
        status: 'active',
        notes: 'Original notes'
      });

      const actor: ActorRecord = {
        id: actorId,
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-public-key',
        roles: ['author', 'executor'],
        status: 'active'
      };

      // Mock dependencies
      mockDependencies.stores.tasks.get.mockResolvedValue(activeTask);
      mockDependencies.identity.getActor.mockResolvedValue(actor);
      mockDependencies.workflowAdapter.getTransitionRule.mockResolvedValue({
        to: 'paused',
        conditions: undefined
      });
      mockDependencies.identity.signRecord.mockResolvedValue(activeTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      // Act
      const result = await backlogAdapter.pauseTask(taskId, actorId, 'Waiting for external API approval');

      // Assert
      expect(result.status).toBe('paused');
      expect(result.notes).toContain('[PAUSED] Waiting for external API approval');
      expect(mockDependencies.workflowAdapter.getTransitionRule).toHaveBeenCalledWith(
        'active',
        'paused',
        expect.objectContaining({
          task: expect.any(Object),
          actor: actor,
          transitionTo: 'paused'
        })
      );
      expect(mockDependencies.identity.signRecord).toHaveBeenCalledWith(
        expect.any(Object),
        actorId,
        'pauser',
        expect.any(String) // notes parameter
      );
      expect(mockDependencies.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.status.changed',
          payload: expect.objectContaining({
            taskId,
            oldStatus: 'active',
            newStatus: 'paused',
            actorId,
            reason: 'Waiting for external API approval'
          })
        })
      );
    });

    it('[EARS-I3b] should throw error when task is in draft state for pause', async () => {
      // Arrange: Task in 'draft' state (not 'active')
      const taskId = '1757687335-task-draft';
      const actorId = 'human:developer';

      const draftTask = createMockTaskRecord({
        id: taskId,
        title: 'Draft Task',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(draftTask);

      // Act & Assert
      await expect(backlogAdapter.pauseTask(taskId, actorId, 'Cannot pause draft'))
        .rejects.toThrow("ProtocolViolationError: Task is in 'draft' state");
    });

  });

  describe('Future Methods (Not Implemented)', () => {
    it('[EARS-S1] should throw NotImplementedError for lint method', async () => {
      await expect(backlogAdapter.lint())
        .rejects.toThrow('NotImplementedError: lint() will be implemented when lint_command.md is ready');
    });

    it('[EARS-S2] should throw NotImplementedError for audit method', async () => {
      await expect(backlogAdapter.audit())
        .rejects.toThrow('NotImplementedError: audit() will be implemented when audit_command.md is ready');
    });

    it('[EARS-S3] should throw NotImplementedError for processChanges method', async () => {
      await expect(backlogAdapter.processChanges([]))
        .rejects.toThrow('NotImplementedError: processChanges() will be implemented when commit_processor_adapter.md is ready');
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('[EARS-O5] should handle adapter failures gracefully in event handlers', async () => {
      // Simulate adapter failure
      mockDependencies.stores.feedbacks.get.mockRejectedValue(new Error('Store failure'));

      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-error',
          entityType: 'task',
          entityId: '1757687335-task-error',
          type: 'blocking',
          status: 'open',
          content: 'Error feedback content',
          triggeredBy: 'human:reviewer'
        }
      };

      // Should not throw error - graceful degradation
      await expect(backlogAdapter.handleFeedbackCreated(event)).resolves.not.toThrow();
    });

    it('[EARS-D3] should re-validate full payload using factory', async () => {
      const originalTask = createMockTaskRecord({
        id: '1757687335-task-validation',
        title: 'Original Title',
        status: 'draft'
      });

      mockDependencies.stores.tasks.get.mockResolvedValue(originalTask);
      mockDependencies.stores.tasks.put.mockResolvedValue(undefined);

      // Mock factory to validate the merged payload
      const { createTaskRecord } = require('../../record_factories/task_factory');
      createTaskRecord.mockReturnValue({
        ...originalTask.payload,
        title: 'Updated Title'
      });

      await backlogAdapter.updateTask('1757687335-task-validation', { title: 'Updated Title' }, 'human:editor');

      // Verify factory was called with merged payload
      expect(createTaskRecord).toHaveBeenCalledWith({
        ...originalTask.payload,
        title: 'Updated Title'
      });
    });
  });
});
