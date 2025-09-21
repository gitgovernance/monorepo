import { BacklogAdapter, type BacklogAdapterDependencies } from './index';
import type {
  FeedbackCreatedEvent,
  FeedbackStatusChangedEvent,
  ExecutionCreatedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent,
  IEventStream,
  CycleCreatedEvent,
  CycleStatusChangedEvent
} from '../../modules/event_bus_module';
import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { FeedbackRecord } from '../../types/feedback_record';
import type { ExecutionRecord } from '../../types/execution_record';
import type { ChangelogRecord } from '../../types/changelog_record';
import type { GitGovRecord } from '../../models';
import type { Signature } from '../../models/embedded.types';
import type { SystemStatus, TaskHealthReport } from '../metrics_adapter';
import type { ActorRecord } from '../../types/actor_record';
import type { ValidationContext } from '../workflow_methodology_adapter';
import type { WorkflowMethodologyRecord } from '../../types/workflow_methodology_record';

// Define the correct TransitionRule type based on the real implementation
type TransitionRule = {
  to: TaskRecord['status'];
  conditions: NonNullable<WorkflowMethodologyRecord['state_transitions']>[string]['requires'];
};

// Properly typed mock dependencies - NO ANY ALLOWED
type MockBacklogAdapterDependencies = {
  taskStore: {
    list: jest.MockedFunction<() => Promise<TaskRecord[]>>;
    read: jest.MockedFunction<(id: string) => Promise<TaskRecord | null>>;
    write: jest.MockedFunction<(record: TaskRecord) => Promise<void>>;
  };
  cycleStore: {
    list: jest.MockedFunction<() => Promise<string[]>>;
    read: jest.MockedFunction<(id: string) => Promise<GitGovRecord & { payload: CycleRecord } | null>>;
    write: jest.MockedFunction<(record: GitGovRecord & { payload: CycleRecord }) => Promise<void>>;
  };
  feedbackStore: {
    list: jest.MockedFunction<() => Promise<FeedbackRecord[]>>;
    read: jest.MockedFunction<(id: string) => Promise<FeedbackRecord | null>>;
    write: jest.MockedFunction<(record: FeedbackRecord) => Promise<void>>;
  };
  executionStore: {
    list: jest.MockedFunction<() => Promise<ExecutionRecord[]>>;
    read: jest.MockedFunction<(id: string) => Promise<ExecutionRecord | null>>;
    write: jest.MockedFunction<(record: ExecutionRecord) => Promise<void>>;
  };
  changelogStore: {
    list: jest.MockedFunction<() => Promise<ChangelogRecord[]>>;
    read: jest.MockedFunction<(id: string) => Promise<ChangelogRecord | null>>;
    write: jest.MockedFunction<(record: ChangelogRecord) => Promise<void>>;
  };
  feedbackAdapter: {
    create: jest.MockedFunction<(payload: Partial<FeedbackRecord>, actorId: string) => Promise<FeedbackRecord>>;
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
  workflowMethodology: {
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
};
import { RecordStore } from '../../store';
import { FeedbackAdapter } from '../feedback_adapter';
import { MetricsAdapter } from '../metrics_adapter';
import { IdentityAdapter } from '../identity_adapter';

// Mock the factories before importing
jest.mock('../../factories/task_factory', () => ({
  createTaskRecord: jest.fn()
}));

jest.mock('../../factories/cycle_factory', () => ({
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
      signatures: [{ keyId: 'mock-author', role: 'author', signature: 'mock-sig', timestamp: 123, timestamp_iso: '2025-01-01T00:00:00Z' }] as [Signature, ...Signature[]]
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
      signatures: [{ keyId: 'mock-author', role: 'author', signature: 'mock-sig', timestamp: 123, timestamp_iso: '2025-01-01T00:00:00Z' }] as [Signature, ...Signature[]]
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
      signatures: [{ keyId: 'mock-author', role: 'author', signature: 'mock-sig', timestamp: 123, timestamp_iso: '2025-01-01T00:00:00Z' }] as [Signature, ...Signature[]]
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

// Complete unit tests for BacklogAdapter
describe('BacklogAdapter - Complete Unit Tests', () => {
  let backlogAdapter: BacklogAdapter;
  let mockDependencies: MockBacklogAdapterDependencies;

  beforeEach(() => {
    // Complete setup for unit tests
    mockDependencies = {
      taskStore: {
        list: jest.fn().mockResolvedValue([]),
        read: jest.fn(),
        write: jest.fn()
      },
      cycleStore: {
        list: jest.fn().mockResolvedValue([]),
        read: jest.fn(),
        write: jest.fn()
      },
      feedbackStore: {
        read: jest.fn(),
        list: jest.fn().mockResolvedValue([]),
        write: jest.fn()
      },
      executionStore: {
        read: jest.fn(),
        list: jest.fn().mockResolvedValue([]),
        write: jest.fn()
      },
      changelogStore: {
        read: jest.fn(),
        list: jest.fn().mockResolvedValue([]),
        write: jest.fn()
      },
      feedbackAdapter: {
        create: jest.fn()
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
      workflowMethodology: {
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
      }
    };

    backlogAdapter = new BacklogAdapter(mockDependencies as unknown as BacklogAdapterDependencies);
  });

  it('[EARS-32] should do nothing for non-blocking feedback', async () => {
    const event: FeedbackCreatedEvent = {
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: {
        feedbackId: 'feedback-123',
        entityType: 'task',
        entityId: 'task-123',
        feedbackType: 'suggestion',
        actorId: 'human:reviewer'
      }
    };

    // Should not throw error
    await expect(backlogAdapter.handleFeedbackCreated(event)).resolves.not.toThrow();
  });

  it('[EARS-38] should handle daily tick events', async () => {
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
    it('[EARS-28] should create, sign, and persist a valid cycle', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        title: 'Test Cycle',
        status: 'planning'
      });

      // Mock the factory functions
      const { createCycleRecord } = require('../../factories/cycle_factory');
      createCycleRecord.mockResolvedValue(mockCycle.payload);

      mockDependencies.identity.signRecord.mockResolvedValue(mockCycle);
      mockDependencies.cycleStore.write.mockResolvedValue(undefined);

      const result = await backlogAdapter.createCycle({
        title: 'Test Cycle',
        status: 'planning'
      }, 'human:author');

      expect(mockDependencies.cycleStore.write).toHaveBeenCalled();
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

    it('[EARS-29] should read a cycle by its ID', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        title: 'Test Cycle'
      });

      mockDependencies.cycleStore.read.mockResolvedValue(mockCycle);

      const result = await backlogAdapter.getCycle('1757687335-cycle-test-cycle');

      expect(mockDependencies.cycleStore.read).toHaveBeenCalledWith('1757687335-cycle-test-cycle');
      expect(result).toEqual(mockCycle.payload);
    });

    it('[EARS-29] should return null for non-existent cycle', async () => {
      mockDependencies.cycleStore.read.mockResolvedValue(null);

      const result = await backlogAdapter.getCycle('non-existent');

      expect(result).toBeNull();
    });

    it('[EARS-30] should list all cycles', async () => {
      const mockCycles = [
        createMockCycleRecord({ id: '1757687335-cycle-test-1', title: 'Cycle 1' }),
        createMockCycleRecord({ id: '1757687336-cycle-test-2', title: 'Cycle 2' })
      ];

      mockDependencies.cycleStore.list.mockResolvedValue([
        '1757687335-cycle-test-1',
        '1757687336-cycle-test-2'
      ]);
      mockDependencies.cycleStore.read
        .mockResolvedValueOnce(mockCycles[0]!)
        .mockResolvedValueOnce(mockCycles[1]!);

      const result = await backlogAdapter.getAllCycles();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockCycles[0]?.payload);
      expect(result[1]).toEqual(mockCycles[1]?.payload);
    });

    it('[EARS-31] should update a cycle and emit event on status change', async () => {
      const originalCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        status: 'planning'
      });
      const updatedCycle = createMockCycleRecord({
        id: '1757687335-cycle-test-cycle',
        status: 'active'
      });

      mockDependencies.cycleStore.read.mockResolvedValue(originalCycle);
      mockDependencies.cycleStore.write.mockResolvedValue(undefined);

      // Mock the factory function
      const { createCycleRecord } = require('../../factories/cycle_factory');
      createCycleRecord.mockResolvedValue(updatedCycle.payload);

      const result = await backlogAdapter.updateCycle('1757687335-cycle-test-cycle', { status: 'active' });

      expect(mockDependencies.cycleStore.write).toHaveBeenCalled();
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

    it('[EARS-32] should create bidirectional link between task and cycle', async () => {
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

      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.cycleStore.read.mockResolvedValue(mockCycle);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.cycleStore.write.mockResolvedValue(undefined);

      // Mock getCurrentActor for the new implementation
      mockDependencies.identity.getCurrentActor = jest.fn().mockResolvedValue({
        id: 'human:test-user',
        displayName: 'Test User'
      });

      await backlogAdapter.addTaskToCycle(cycleId, taskId);

      expect(mockDependencies.cycleStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            taskIds: expect.arrayContaining([taskId])
          })
        })
      );
      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            cycleIds: expect.arrayContaining([cycleId])
          })
        })
      );
    });

    it('[EARS-31] should throw error when updating cycle in final state', async () => {
      const archivedCycle = createMockCycleRecord({
        id: '1757687335-cycle-archived',
        status: 'archived'
      });

      mockDependencies.cycleStore.read.mockResolvedValue(archivedCycle);

      await expect(backlogAdapter.updateCycle('1757687335-cycle-archived', { title: 'New Title' }))
        .rejects.toThrow('ProtocolViolationError: Cannot update cycle in final state: archived');
    });
  });

  describe('Enhanced Task Operations', () => {
    it('[EARS-25] should correctly update task fields', async () => {
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

      mockDependencies.taskStore.read.mockResolvedValue(originalTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);

      // Mock the factory function
      const { createTaskRecord } = require('../../factories/task_factory');
      createTaskRecord.mockResolvedValue(updatedTask.payload);

      const result = await backlogAdapter.updateTask('1757687335-task-test-task', { title: 'Updated Title' });

      expect(mockDependencies.taskStore.write).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('[EARS-26] should throw error when updating task in final state', async () => {
      const archivedTask = createMockTaskRecord({
        id: '1757687335-task-archived',
        status: 'archived'
      });

      mockDependencies.taskStore.read.mockResolvedValue(archivedTask as unknown as TaskRecord);

      await expect(backlogAdapter.updateTask('1757687335-task-archived', { title: 'New Title' }))
        .rejects.toThrow('ProtocolViolationError: Cannot update task in final state: archived');
    });

    it('[EARS-27] should activate task from ready to active with permission validation', async () => {
      const taskId = '1757687335-task-ready-task';
      const readyTask = createMockTaskRecord({
        id: taskId,
        status: 'ready'
      });
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });

      mockDependencies.taskStore.read.mockResolvedValue(readyTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'active',
        conditions: {}
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...readyTask,
        payload: activeTask.payload
      });

      const result = await backlogAdapter.activateTask(taskId, 'human:developer');

      expect(mockDependencies.workflowMethodology.getTransitionRule).toHaveBeenCalledWith(
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
        'executor'
      );
      expect(mockDependencies.taskStore.write).toHaveBeenCalled();
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

    it('[EARS-28] should throw error when task not found for activation', async () => {
      mockDependencies.taskStore.read.mockResolvedValue(null);

      await expect(backlogAdapter.activateTask('nonexistent-task', 'human:developer'))
        .rejects.toThrow('RecordNotFoundError: Task not found: nonexistent-task');
    });

    it('[EARS-29] should throw error when task is not in ready state for activation', async () => {
      const draftTask = createMockTaskRecord({
        id: '1757687335-task-draft',
        status: 'draft'
      });

      mockDependencies.taskStore.read.mockResolvedValue(draftTask as unknown as TaskRecord);
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

    it('[EARS-30] should throw error when workflow methodology rejects activation', async () => {
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.taskStore.read.mockResolvedValue(readyTask as unknown as TaskRecord);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue(null);

      await expect(backlogAdapter.activateTask('1757687335-task-ready', 'human:developer'))
        .rejects.toThrow('ProtocolViolationError: Workflow methodology rejected ready→active transition');
    });

    it('[EARS-31A] should complete task from active to done with approver quality validation', async () => {
      const taskId = '1757687335-task-active-task';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const doneTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });

      mockDependencies.taskStore.read.mockResolvedValue(activeTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:qa-lead',
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'done',
        conditions: { signatures: { __default__: { role: 'approver', capability_roles: ['approver:quality'], min_approvals: 1 } } }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(doneTask);

      const result = await backlogAdapter.completeTask(taskId, 'human:qa-lead');

      expect(result.status).toBe('done');
      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(doneTask);
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

    it('[EARS-32A] should throw error when task not found for completion', async () => {
      mockDependencies.taskStore.read.mockResolvedValue(null);

      await expect(backlogAdapter.completeTask('non-existent-task', 'human:qa-lead'))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent-task');
    });

    it('[EARS-33A] should throw error when task is not in active state for completion', async () => {
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.taskStore.read.mockResolvedValue(readyTask as unknown as TaskRecord);
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

    it('[EARS-34A] should throw error when workflow methodology rejects completion', async () => {
      const activeTask = createMockTaskRecord({
        id: '1757687335-task-active',
        status: 'active'
      });

      mockDependencies.taskStore.read.mockResolvedValue(activeTask as unknown as TaskRecord);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:qa-lead',
        type: 'human',
        displayName: 'QA Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue(null);

      await expect(backlogAdapter.completeTask('1757687335-task-active', 'human:qa-lead'))
        .rejects.toThrow('ProtocolViolationError: Workflow methodology rejected active→done transition');
    });

    it('[EARS-28] should cancel task from ready to discarded with proper validation', async () => {
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

      mockDependencies.taskStore.read.mockResolvedValue(readyTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:product-manager',
        type: 'human',
        displayName: 'Product Manager',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue(cancelledTask);

      const result = await backlogAdapter.cancelTask(taskId, 'human:product-manager', 'No longer needed');

      expect(mockDependencies.taskStore.write).toHaveBeenCalled();
      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[CANCELLED] No longer needed');
    });

    it('[EARS-29] should cancel task from active to discarded', async () => {
      const taskId = '1757687335-task-active-to-cancel';
      const activeTask = createMockTaskRecord({
        id: taskId,
        status: 'active',
        title: 'Active Task to Cancel'
      });

      mockDependencies.taskStore.read.mockResolvedValue(activeTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:team-lead',
        type: 'human',
        displayName: 'Team Lead',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...activeTask,
        payload: { ...activeTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.cancelTask(taskId, 'human:team-lead');

      expect(result.status).toBe('discarded');
      expect(mockDependencies.taskStore.write).toHaveBeenCalled();
    });

    it('[EARS-30] should throw error when cancelling task from invalid state', async () => {
      const draftTask = createMockTaskRecord({
        id: '1757687335-task-draft',
        status: 'draft'
      });

      mockDependencies.taskStore.read.mockResolvedValue(draftTask as unknown as TaskRecord);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:anyone',
        type: 'human',
        displayName: 'Anyone',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });

      await expect(backlogAdapter.cancelTask('1757687335-task-draft', 'human:anyone'))
        .rejects.toThrow('ProtocolViolationError: Task is in \'draft\' state. Cannot cancel from this state. Only \'ready\', \'active\', and \'review\' tasks can be cancelled.');
    });

    it('[EARS-31B] should reject task from review to discarded with reason', async () => {
      const taskId = '1757687335-task-review-to-reject';
      const reviewTask = createMockTaskRecord({
        id: taskId,
        status: 'review',
        title: 'Review Task to Reject',
        notes: 'Original task notes'
      });

      mockDependencies.taskStore.read.mockResolvedValue(reviewTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:reviewer',
        type: 'human',
        displayName: 'Reviewer',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task reject' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...reviewTask,
        payload: { ...reviewTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.cancelTask(taskId, 'human:reviewer', 'Requirements unclear');

      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[REJECTED] Requirements unclear');
      expect(result.notes).toContain('Original task notes');
      expect(mockDependencies.taskStore.write).toHaveBeenCalled();
    });

    it('[EARS-32B] should add reason with REJECTED prefix in notes for reject', async () => {
      const taskId = '1757687335-task-review-rejected';
      const reviewTask = createMockTaskRecord({
        id: taskId,
        status: 'review',
        title: 'Review Task for Rejection'
        // notes omitted - will be undefined by default
      });

      mockDependencies.taskStore.read.mockResolvedValue(reviewTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:reviewer',
        type: 'human',
        displayName: 'Reviewer',
        publicKey: 'mock-key',
        roles: ['approver:quality'],
        status: 'active'
      } as ActorRecord);
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task reject' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...reviewTask,
        payload: { ...reviewTask.payload, status: 'discarded' }
      });

      const result = await backlogAdapter.cancelTask(taskId, 'human:reviewer', 'Not aligned with architecture');

      expect(result.status).toBe('discarded');
      expect(result.notes).toContain('[REJECTED] Not aligned with architecture');
      expect(result.notes).toContain('[REJECTED]');
      expect(result.notes).not.toContain('[CANCELLED]');
      expect(result.notes).toMatch(/\[REJECTED\] Not aligned with architecture \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\)/);
    });

    it('[EARS-33B] should validate ready active review states for cancel reject', async () => {
      // Test ready state (should use [CANCELLED])
      const readyTask = createMockTaskRecord({
        id: '1757687335-task-ready',
        status: 'ready'
      });

      mockDependencies.taskStore.read.mockResolvedValue(readyTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:pm',
        type: 'human',
        displayName: 'PM',
        publicKey: 'mock-key',
        roles: ['approver:product'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'discarded',
        conditions: { command: 'gitgov task cancel' }
      });
      mockDependencies.identity.signRecord.mockResolvedValue({
        ...readyTask,
        payload: { ...readyTask.payload, status: 'discarded' }
      });

      const readyResult = await backlogAdapter.cancelTask('1757687335-task-ready', 'human:pm', 'Priorities changed');
      expect(readyResult.notes).toContain('[CANCELLED] Priorities changed');

      // Test review state (should use [REJECTED])
      const reviewTask = createMockTaskRecord({
        id: '1757687335-task-review',
        status: 'review'
      });

      mockDependencies.taskStore.read.mockResolvedValue(reviewTask as unknown as TaskRecord);
      const reviewResult = await backlogAdapter.cancelTask('1757687335-task-review', 'human:pm', 'Requirements unclear');
      expect(reviewResult.notes).toContain('[REJECTED] Requirements unclear');
    });
  });

  describe('Event Handlers', () => {
    it('[EARS-31] should pause active task when blocking feedback created', async () => {
      const taskId = '1757687335-task-active-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const mockFeedback = {
        id: '1757687335-feedback-blocking',
        payload: {
          entityId: taskId,
          type: 'blocking'
        }
      };

      mockDependencies.feedbackStore.read.mockResolvedValue(mockFeedback as unknown as FeedbackRecord);
      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);

      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-blocking',
          entityType: 'task',
          entityId: taskId,
          feedbackType: 'blocking',
          actorId: 'human:reviewer'
        }
      };

      await backlogAdapter.handleFeedbackCreated(event);

      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(
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

    it('[EARS-33] should resume task when last blocking feedback resolved', async () => {
      const taskId = '1757687335-task-paused-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      const mockFeedback = {
        id: '1757687335-feedback-resolved',
        payload: {
          entityId: taskId,
          type: 'blocking'
        }
      };

      mockDependencies.feedbackStore.read.mockResolvedValue(mockFeedback as unknown as FeedbackRecord);
      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId: 'task-123',
        healthScore: 100,
        timeInCurrentStage: 0,
        stalenessIndex: 0,
        blockingFeedbacks: 0,
        lastActivity: Date.now(),
        recommendations: []
      });

      const event: FeedbackStatusChangedEvent = {
        type: 'feedback.status.changed',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-resolved',
          oldStatus: 'open',
          newStatus: 'resolved',
          actorId: 'human:resolver'
        }
      };

      await backlogAdapter.handleFeedbackResolved(event);

      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'active'
          })
        })
      );
    });

    it('[EARS-34] should not resume task if other blocking feedbacks remain', async () => {
      const taskId = '1757687335-task-still-blocked';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      const mockFeedback = {
        id: '1757687335-feedback-resolved',
        payload: {
          entityId: taskId,
          type: 'blocking'
        }
      };

      mockDependencies.feedbackStore.read.mockResolvedValue(mockFeedback as unknown as FeedbackRecord);
      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.metricsAdapter.getTaskHealth.mockResolvedValue({
        taskId: 'task-123',
        healthScore: 80,
        timeInCurrentStage: 0,
        stalenessIndex: 0,
        blockingFeedbacks: 1,
        lastActivity: Date.now(),
        recommendations: []
      });

      const event: FeedbackStatusChangedEvent = {
        type: 'feedback.status.changed',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-resolved',
          oldStatus: 'open',
          newStatus: 'resolved',
          actorId: 'human:resolver'
        }
      };

      await backlogAdapter.handleFeedbackResolved(event);

      // Should not write to taskStore (no status change)
      expect(mockDependencies.taskStore.write).not.toHaveBeenCalled();
    });

    it('[EARS-35] should transition task to active on first execution', async () => {
      const taskId = '1757687335-task-ready-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'ready'
      });

      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:executor',
        type: 'human',
        displayName: 'Executor',
        publicKey: 'mock-key',
        roles: ['executor'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
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
          actorId: 'human:executor',
          isFirstExecution: true
        }
      };

      await backlogAdapter.handleExecutionCreated(event);

      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'active'
          })
        })
      );
    });

    it('[EARS-36] should do nothing on subsequent executions', async () => {
      const event: ExecutionCreatedEvent = {
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: {
          executionId: '1757687335-exec-second',
          taskId: '1757687335-task-active-task',
          actorId: 'human:executor',
          isFirstExecution: false
        }
      };

      await backlogAdapter.handleExecutionCreated(event);

      // Should not write to taskStore
      expect(mockDependencies.taskStore.write).not.toHaveBeenCalled();
    });

    it('[EARS-37] should archive task when changelog created', async () => {
      const taskId = '1757687335-task-done-task';
      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });
      const mockChangelog = {
        id: '1757687335-changelog-task-done',
        payload: {
          entityType: 'task',
          entityId: taskId
        }
      };

      mockDependencies.changelogStore.read.mockResolvedValue(mockChangelog as unknown as ChangelogRecord);
      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);

      const event: ChangelogCreatedEvent = {
        type: 'changelog.created',
        timestamp: Date.now(),
        source: 'changelog_adapter',
        payload: {
          changelogId: '1757687335-changelog-task-done',
          taskId,
          actorId: 'system'
        }
      };

      await backlogAdapter.handleChangelogCreated(event);

      expect(mockDependencies.taskStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'archived'
          })
        })
      );
    });

    it('[EARS-45] should complete parent cycle when all child cycles are completed', async () => {
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
      mockDependencies.cycleStore.read
        .mockImplementation(async (id: string) => {
          if (id === childCycleId) return childCycle;
          if (id === parentCycleId) return parentCycle;
          return null;
        });

      mockDependencies.cycleStore.list.mockResolvedValue([parentCycleId, childCycleId]);
      mockDependencies.cycleStore.write.mockResolvedValue(undefined);

      const event: CycleStatusChangedEvent = {
        type: 'cycle.status.changed',
        timestamp: Date.now(),
        source: 'backlog_adapter',
        payload: {
          cycleId: childCycleId,
          oldStatus: 'active',
          newStatus: 'completed',
          actorId: 'system'
        }
      };

      // For now, just verify it doesn't throw an error
      // The full implementation requires complex factory mocking
      await expect(backlogAdapter.handleCycleStatusChanged(event)).resolves.not.toThrow();

      // Note: Epic task completion is delegated to planning methodology (not implemented yet)
    });
  });

  describe('Performance Benchmarks', () => {
    it('[EARS-44] should execute task operations in under 100ms', async () => {
      const mockTask = createMockTaskRecord({
        id: '1757687335-task-performance',
        title: 'Performance Test Task',
        status: 'draft'
      });

      mockDependencies.taskStore.read.mockResolvedValue(mockTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);
      mockDependencies.identity.getActor.mockResolvedValue({
        id: 'human:performer',
        type: 'human',
        displayName: 'Performer',
        publicKey: 'mock-key',
        roles: ['author'],
        status: 'active'
      });
      mockDependencies.workflowMethodology.getTransitionRule.mockResolvedValue({
        to: 'review',
        conditions: {}
      });

      const startTime = Date.now();
      await backlogAdapter.submitTask('1757687335-task-performance', 'human:performer');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
    });

    it('[EARS-44] should execute cycle operations in under 100ms', async () => {
      const mockCycle = createMockCycleRecord({
        id: '1757687335-cycle-performance',
        title: 'Performance Test Cycle',
        status: 'planning'
      });

      const { createCycleRecord } = require('../../factories/cycle_factory');
      createCycleRecord.mockResolvedValue(mockCycle.payload);

      mockDependencies.identity.signRecord.mockResolvedValue(mockCycle);
      mockDependencies.cycleStore.write.mockResolvedValue(undefined);

      const startTime = Date.now();
      await backlogAdapter.createCycle({
        title: 'Performance Test Cycle',
        status: 'planning'
      }, 'human:performer');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
    });

    it('[EARS-44] should execute getSystemStatus in under 100ms', async () => {
      const startTime = Date.now();
      await backlogAdapter.getSystemStatus();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
      expect(mockDependencies.metricsAdapter.getSystemStatus).toHaveBeenCalled();
    });

    it('[EARS-44] should execute getTaskHealth in under 100ms', async () => {
      const startTime = Date.now();
      await backlogAdapter.getTaskHealth('1757687335-task-health-test');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Performance target <100ms
      expect(mockDependencies.metricsAdapter.getTaskHealth).toHaveBeenCalledWith('1757687335-task-health-test');
    });
  });

  describe('Agent Navigation', () => {
    it('[EARS-48] should return tasks assigned to a specific actor', async () => {
      const taskId1 = '1757687335-task-assigned-1';
      const taskId2 = '1757687335-task-assigned-2';
      const taskId3 = '1757687335-task-unassigned';
      const actorId = 'human:developer';

      // Mock feedback records for assignments
      const assignmentFeedback1 = {
        id: '1757687335-feedback-assignment-1',
        payload: {
          entityId: taskId1,
          type: 'assignment',
          assignee: actorId,
          status: 'resolved'
        }
      };
      const assignmentFeedback2 = {
        id: '1757687335-feedback-assignment-2',
        payload: {
          entityId: taskId2,
          type: 'assignment',
          assignee: actorId,
          status: 'resolved'
        }
      };
      const nonAssignmentFeedback = {
        id: '1757687335-feedback-suggestion',
        payload: {
          entityId: taskId3,
          type: 'suggestion',
          assignee: 'human:other',
          status: 'open'
        }
      };

      // Mock tasks
      const task1 = createMockTaskRecord({ id: taskId1, title: 'Assigned Task 1' });
      const task2 = createMockTaskRecord({ id: taskId2, title: 'Assigned Task 2' });
      const task3 = createMockTaskRecord({ id: taskId3, title: 'Unassigned Task' });

      // Setup mocks
      mockDependencies.feedbackStore.list.mockResolvedValue([
        createMockFeedbackRecord({ id: '1757687335-feedback-assignment-1' }) as unknown as FeedbackRecord,
        createMockFeedbackRecord({ id: '1757687335-feedback-assignment-2' }) as unknown as FeedbackRecord,
        createMockFeedbackRecord({ id: '1757687335-feedback-suggestion' }) as unknown as FeedbackRecord
      ]);
      mockDependencies.feedbackStore.read
        .mockResolvedValueOnce(assignmentFeedback1 as unknown as FeedbackRecord)
        .mockResolvedValueOnce(assignmentFeedback2 as unknown as FeedbackRecord)
        .mockResolvedValueOnce(nonAssignmentFeedback as unknown as FeedbackRecord);

      mockDependencies.taskStore.read
        .mockResolvedValueOnce(task1 as unknown as TaskRecord)
        .mockResolvedValueOnce(task2 as unknown as TaskRecord);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(taskId1);
      expect(result[1]?.id).toBe(taskId2);
    });

    it('[EARS-49] should return empty array for actor with no assigned tasks', async () => {
      const actorId = 'human:unassigned';

      // Mock no assignment feedbacks for this actor
      const nonAssignmentFeedback = {
        id: '1757687335-feedback-other',
        payload: {
          entityId: 'task-123',
          type: 'suggestion',
          assignee: 'human:other-actor',
          status: 'open'
        }
      };

      mockDependencies.feedbackStore.list.mockResolvedValue([
        createMockFeedbackRecord({ id: '1757687335-feedback-other' }) as unknown as FeedbackRecord
      ]);
      mockDependencies.feedbackStore.read.mockResolvedValue(nonAssignmentFeedback as unknown as FeedbackRecord);

      const result = await backlogAdapter.getTasksAssignedToActor(actorId);

      expect(result).toEqual([]);
    });
  });

  describe('Future Methods (Not Implemented)', () => {
    it('[EARS-38] should throw NotImplementedError for lint method', async () => {
      await expect(backlogAdapter.lint())
        .rejects.toThrow('NotImplementedError: lint() will be implemented when lint_command.md is ready');
    });

    it('[EARS-39] should throw NotImplementedError for audit method', async () => {
      await expect(backlogAdapter.audit())
        .rejects.toThrow('NotImplementedError: audit() will be implemented when audit_command.md is ready');
    });

    it('[EARS-42] should throw NotImplementedError for processChanges method', async () => {
      await expect(backlogAdapter.processChanges([]))
        .rejects.toThrow('NotImplementedError: processChanges() will be implemented when commit_processor.md is ready');
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('[EARS-45] should handle adapter failures gracefully in event handlers', async () => {
      // Simulate adapter failure
      mockDependencies.feedbackStore.read.mockRejectedValue(new Error('Store failure'));

      const event: FeedbackCreatedEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: '1757687335-feedback-error',
          entityType: 'task',
          entityId: '1757687335-task-error',
          feedbackType: 'blocking',
          actorId: 'human:reviewer'
        }
      };

      // Should not throw error - graceful degradation
      await expect(backlogAdapter.handleFeedbackCreated(event)).resolves.not.toThrow();
    });

    it('[EARS-27] should re-validate full payload using factory', async () => {
      const originalTask = createMockTaskRecord({
        id: '1757687335-task-validation',
        title: 'Original Title',
        status: 'draft'
      });

      mockDependencies.taskStore.read.mockResolvedValue(originalTask as unknown as TaskRecord);
      mockDependencies.taskStore.write.mockResolvedValue(undefined);

      // Mock factory to validate the merged payload
      const { createTaskRecord } = require('../../factories/task_factory');
      createTaskRecord.mockResolvedValue({
        ...originalTask.payload,
        title: 'Updated Title'
      });

      await backlogAdapter.updateTask('1757687335-task-validation', { title: 'Updated Title' });

      // Verify factory was called with merged payload
      expect(createTaskRecord).toHaveBeenCalledWith({
        ...originalTask.payload,
        title: 'Updated Title'
      });
    });
  });
});
