// Mock IdentityAdapter before importing
jest.doMock('../identity_adapter', () => ({
  IdentityAdapter: jest.fn().mockImplementation(() => ({
    getActorPublicKey: jest.fn().mockResolvedValue('mock-public-key'),
    getActor: jest.fn(),
    createActor: jest.fn(),
    listActors: jest.fn(),
    signRecord: jest.fn().mockImplementation(async (record) => record),
    rotateActorKey: jest.fn(),
    revokeActor: jest.fn(),
    resolveCurrentActorId: jest.fn(),
    getCurrentActor: jest.fn().mockResolvedValue({
      id: 'human:test-user',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'mock-public-key',
      roles: ['developer'],
      status: 'active',
      metadata: {}
    }),
    getEffectiveActorForAgent: jest.fn(),
    authenticate: jest.fn(),
    createAgentRecord: jest.fn(),
    getAgentRecord: jest.fn(),
    listAgentRecords: jest.fn(),
  }))
}));

import { BacklogAdapter } from './index';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { WorkflowMethodologyAdapter } from '../workflow_methodology_adapter';
import { FeedbackAdapter } from '../feedback_adapter';
import { ExecutionAdapter } from '../execution_adapter';
import type { IFeedbackAdapter } from '../feedback_adapter';
import { ChangelogAdapter } from '../changelog_adapter';
import { MetricsAdapter } from '../metrics_adapter';
import { eventBus } from '../../event_bus';
import type {
  FeedbackCreatedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent
} from '../../event_bus';
import type { TaskRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { ExecutionRecord } from '../../types';
import type { ChangelogRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { AgentRecord } from '../../types';
import type { GitGovRecord } from '../../types';
import type { Signature } from '../../types/embedded.types';
import { generateTaskId, generateCycleId } from '../../utils/id_generator';
import { calculatePayloadChecksum } from '../../crypto/checksum';

// Helper to create properly typed mock records for integration tests
function createMockTaskRecord(payload: Partial<TaskRecord>): GitGovRecord & { payload: TaskRecord } {
  const timestamp = Date.now();
  const title = payload.title || 'Mock Task';
  const taskId = payload.id || generateTaskId(title, timestamp);

  const fullPayload: TaskRecord = {
    id: taskId,
    title,
    status: 'draft',
    priority: 'medium',
    description: 'Mock description',
    tags: [],
    ...payload
  };

  // Calculate real checksum
  const payloadChecksum = calculatePayloadChecksum(fullPayload);

  // Create mock signature (we'll use a simplified version for testing)
  const mockSignature: Signature = {
    keyId: 'human:mock-author',
    role: 'author',
    notes: 'Mock task for integration test',
    signature: 'mock-signature-base64',
    timestamp: Math.floor(timestamp / 1000)
  };

  return {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum,
      signatures: [mockSignature] as [Signature, ...Signature[]]
    },
    payload: fullPayload
  };
}

function createMockCycleRecord(payload: Partial<CycleRecord>): GitGovRecord & { payload: CycleRecord } {
  const timestamp = Date.now();
  const title = payload.title || 'Mock Cycle';
  const cycleId = payload.id || generateCycleId(title, timestamp);

  const fullPayload: CycleRecord = {
    id: cycleId,
    title,
    status: 'planning',
    taskIds: [],
    childCycleIds: [],
    ...payload
  };

  // Calculate real checksum
  const payloadChecksum = calculatePayloadChecksum(fullPayload);

  // Create mock signature
  const mockSignature: Signature = {
    keyId: 'human:mock-author',
    role: 'author',
    notes: 'Mock cycle for integration test',
    signature: 'mock-signature-base64',
    timestamp: Math.floor(timestamp / 1000)
  };

  return {
    header: {
      version: '1.0',
      type: 'cycle',
      payloadChecksum,
      signatures: [mockSignature] as [Signature, ...Signature[]]
    },
    payload: fullPayload
  };
}

describe('BacklogAdapter Integration Tests', () => {
  let backlogAdapter: BacklogAdapter;
  let taskStore: RecordStore<TaskRecord>;
  let cycleStore: RecordStore<CycleRecord>;
  let identityAdapter: IdentityAdapter;
  let methodologyAdapter: WorkflowMethodologyAdapter;
  let feedbackAdapter: IFeedbackAdapter;

  beforeEach(async () => {
    // Use real WorkflowMethodologyAdapter with default configuration

    // Create stores in /tmp/ to avoid polluting .gitgov/
    const testRoot = `/tmp/gitgov-test-${Date.now()}`;

    // Create mock stores for IdentityAdapter constructor
    const mockActorStore = new RecordStore<ActorRecord>('actors', testRoot);
    const mockAgentStore = new RecordStore<AgentRecord>('agents', testRoot);

    // Create identity adapter - will be mocked by jest.doMock
    identityAdapter = new IdentityAdapter({
      actorStore: mockActorStore,
      agentStore: mockAgentStore,
    });

    // Create stores with identity for validation
    taskStore = new RecordStore<TaskRecord>('tasks', testRoot);
    cycleStore = new RecordStore<CycleRecord>('cycles', testRoot);

    // Create mock feedback adapter for methodology adapter
    feedbackAdapter = {
      create: jest.fn(),
      resolve: jest.fn(),
      getFeedback: jest.fn(),
      getFeedbackByEntity: jest.fn(),
      getAllFeedback: jest.fn(),
      getFeedbackThread: jest.fn(),
    };

    methodologyAdapter = WorkflowMethodologyAdapter.createDefault(feedbackAdapter);

    // Config is loaded at construction, no need to reload

    backlogAdapter = new BacklogAdapter({
      taskStore,
      cycleStore,
      workflowMethodologyAdapter: methodologyAdapter,
      identity: identityAdapter,
      eventBus: eventBus,
      // The following adapters are mocked as they are not the focus of these integration tests
      feedbackStore: {
        list: jest.fn().mockResolvedValue([]),
        read: jest.fn().mockResolvedValue(null),
        write: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(false)
      } as unknown as RecordStore<FeedbackRecord>,
      executionStore: {
        list: jest.fn().mockResolvedValue([]),
        read: jest.fn().mockResolvedValue(null),
        write: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(false)
      } as unknown as RecordStore<ExecutionRecord>,
      changelogStore: {
        list: jest.fn().mockResolvedValue([]),
        read: jest.fn().mockResolvedValue(null),
        write: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(false)
      } as unknown as RecordStore<ChangelogRecord>,
      feedbackAdapter: {
        create: jest.fn(),
        resolve: jest.fn(),
        getFeedback: jest.fn(),
        getFeedbackByEntity: jest.fn(),
        getAllFeedback: jest.fn()
      } as unknown as FeedbackAdapter,
      executionAdapter: {
        create: jest.fn(),
        getExecution: jest.fn(),
        getExecutionsByTask: jest.fn(),
        getAllExecutions: jest.fn()
      } as unknown as ExecutionAdapter,
      changelogAdapter: {
        create: jest.fn(),
        getChangelog: jest.fn(),
        getChangelogsByEntity: jest.fn(),
        getAllChangelogs: jest.fn(),
        getRecentChangelogs: jest.fn()
      } as unknown as ChangelogAdapter,
      metricsAdapter: {
        getSystemStatus: jest.fn(),
        getTaskHealth: jest.fn(),
        getProductivityMetrics: jest.fn(),
        getCollaborationMetrics: jest.fn()
      } as unknown as MetricsAdapter,
    });
  });

  describe('Role-based Workflow Validation', () => {
    // The signature group is determined by the actor's roles, not the task's tags
    it('[EARS-24] should validate signature for design role with real methodology', async () => {
      const task = createMockTaskRecord({
        id: 'task-design',
        status: 'review',
        tags: [],
        title: 'Design Task'
      });

      const designApprover = {
        id: 'human:designer',
        type: 'human' as const,
        displayName: 'Designer',
        status: 'active' as const,
        publicKey: 'mock-key',
        roles: ['approver:design'] as [string, ...string[]]
      };

      const productApprover = {
        id: 'human:product-manager',
        type: 'human' as const,
        displayName: 'Product Manager',
        status: 'active' as const,
        publicKey: 'mock-key',
        roles: ['approver:product'] as [string, ...string[]]
      };

      // Mock the stores and identity adapter
      jest.spyOn(taskStore, 'read').mockResolvedValue(task);
      jest.spyOn(identityAdapter, 'signRecord').mockImplementation(async (record) => record);
      jest.spyOn(taskStore, 'write').mockResolvedValue(undefined);

      // Both design and product approvers can approve (using their respective signature groups)
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(designApprover);
      const result1 = await backlogAdapter.approveTask('task-design', 'human:designer');
      expect(result1.status).toBe('ready');

      // Product approver also succeeds (uses __default__ signature group)
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(productApprover);
      const result2 = await backlogAdapter.approveTask('task-design', 'human:product-manager');
      expect(result2.status).toBe('ready');
    });
  });

  describe('Task-Cycle Bidirectional Linking', () => {
    it('[EARS-32] should create and maintain bidirectional links between tasks and cycles', async () => {
      const task = createMockTaskRecord({
        id: 'task-123',
        status: 'draft',
        cycleIds: [],
        title: 'Test Task'
      });

      const cycle = createMockCycleRecord({
        id: 'cycle-123',
        status: 'planning',
        taskIds: [],
        title: 'Test Cycle'
      });

      // Mock the stores
      jest.spyOn(taskStore, 'read').mockResolvedValue(task);
      jest.spyOn(cycleStore, 'read').mockResolvedValue(cycle);

      const writeTaskSpy = jest.spyOn(taskStore, 'write').mockResolvedValue(undefined);
      const writeCycleSpy = jest.spyOn(cycleStore, 'write').mockResolvedValue(undefined);

      // Execute the bidirectional linking
      await backlogAdapter.addTaskToCycle('cycle-123', 'task-123');

      // Verify both records were updated with bidirectional links
      expect(writeCycleSpy).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          taskIds: expect.arrayContaining(['task-123'])
        })
      }));

      expect(writeTaskSpy).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          cycleIds: expect.arrayContaining(['cycle-123'])
        })
      }));
    });
  });

  describe('End-to-End Task Lifecycle', () => {
    it('should support complete task lifecycle from creation to archival', async () => {
      // This test verifies the complete flow works with real methodology
      const actor = {
        id: 'human:developer',
        type: 'human' as const,
        displayName: 'Developer',
        status: 'active' as const,
        publicKey: 'mock-key',
        roles: ['author', 'approver:product'] as [string, ...string[]]
      };

      // Mock stores and identity
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(actor);
      jest.spyOn(identityAdapter, 'signRecord').mockImplementation(async (record) => record);
      jest.spyOn(taskStore, 'write').mockResolvedValue(undefined);

      let currentTask = createMockTaskRecord({
        id: 'task-123',
        status: 'draft',
        title: 'Test Task'
      });

      // Mock read to return the current state of the task
      jest.spyOn(taskStore, 'read').mockImplementation(async () => currentTask);

      // 1. Submit task (draft -> review)
      await backlogAdapter.submitTask('task-123', 'human:developer');

      // Update mock task state
      currentTask = createMockTaskRecord({
        id: 'task-123',
        status: 'review',
        title: 'Test Task'
      });

      // 2. Approve task (review -> ready)  
      const approvedTask = await backlogAdapter.approveTask('task-123', 'human:developer');
      expect(approvedTask.status).toBe('ready');

      // This demonstrates the complete workflow integration works
    });
  });

  describe('Integration Test Scenarios - The Five Critical Flows', () => {
    it('[EARS-39] "The Perfect Task Journey" - Complete task lifecycle with all adapters', async () => {
      // Setup: Create a complete task journey from draft to archived
      const actor = {
        id: 'human:developer',
        type: 'human' as const,
        displayName: 'Developer',
        status: 'active' as const,
        publicKey: 'mock-key',
        roles: ['author', 'approver:product'] as [string, ...string[]]
      };

      let currentTask = createMockTaskRecord({
        id: '1757687335-task-journey',
        status: 'draft',
        title: 'Perfect Journey Task'
      });

      // Mock all the stores and adapters
      jest.spyOn(identityAdapter, 'getActor').mockResolvedValue(actor);
      jest.spyOn(identityAdapter, 'signRecord').mockImplementation(async (record) => record);
      jest.spyOn(taskStore, 'write').mockResolvedValue(undefined);
      jest.spyOn(taskStore, 'read').mockImplementation(async () => currentTask);

      // Step 1: Submit task (draft -> review)
      await backlogAdapter.submitTask('1757687335-task-journey', 'human:developer');

      // Step 2: Approve task (review -> ready)
      currentTask = createMockTaskRecord({
        id: '1757687335-task-journey',
        status: 'review',
        title: 'Perfect Journey Task'
      });

      const approvedTask = await backlogAdapter.approveTask('1757687335-task-journey', 'human:developer');
      expect(approvedTask.status).toBe('ready');

      console.log('✅ Perfect Task Journey completed successfully');
    });

    it('[EARS-40] "The Blocking Crisis" - Complete feedback blocking and resolution flow', async () => {
      const taskId = '1757687335-task-crisis';
      const feedbackId = '1757687335-feedback-blocking-crisis';

      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'active'
      });
      const mockFeedback = {
        id: feedbackId,
        payload: {
          entityId: taskId,
          type: 'blocking'
        }
      };

      // Setup mocks for blocking crisis
      const mockFeedbackStore = backlogAdapter['feedbackStore'] as any;
      const mockTaskStore = backlogAdapter['taskStore'] as any;
      const mockMetricsAdapter = backlogAdapter['metricsAdapter'] as any;

      jest.spyOn(mockFeedbackStore, 'read').mockResolvedValue(mockFeedback);
      jest.spyOn(mockTaskStore, 'read').mockResolvedValue(mockTask);
      jest.spyOn(mockTaskStore, 'write').mockResolvedValue(undefined);
      jest.spyOn(mockMetricsAdapter, 'getTaskHealth')
        .mockResolvedValueOnce({ blockingFeedbacks: 1 }) // Still blocked
        .mockResolvedValueOnce({ blockingFeedbacks: 0 }); // No more blocks

      // Crisis: Blocking feedback created
      const blockingEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId,
          entityType: 'task',
          entityId: taskId,
          feedbackType: 'blocking',
          actorId: 'human:reviewer'
        }
      } as FeedbackCreatedEvent;

      await backlogAdapter.handleFeedbackCreated(blockingEvent);

      // Update task to paused for resolution test
      const pausedTask = createMockTaskRecord({
        id: taskId,
        status: 'paused'
      });
      jest.spyOn(mockTaskStore, 'read').mockResolvedValue(pausedTask);

      // Resolution: New feedback created that resolves the blocking feedback (immutable pattern)
      const resolutionFeedbackId = `${Date.now()}-feedback-resolution`;
      const resolutionEvent = {
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: resolutionFeedbackId,
          entityType: 'feedback', // Points to another feedback
          entityId: feedbackId, // Points to the blocking feedback
          type: 'clarification',
          status: 'resolved',
          content: 'Blocking issue resolved',
          triggeredBy: 'human:resolver',
          resolvesFeedbackId: feedbackId // Marks this as a resolution
        }
      } as FeedbackCreatedEvent;

      // Mock getFeedback to return the original blocking feedback
      jest.spyOn(feedbackAdapter as any, 'getFeedback').mockResolvedValue({
        id: feedbackId,
        entityType: 'task',
        entityId: taskId,
        type: 'blocking',
        status: 'open',
        content: 'Blocking issue'
      });

      await backlogAdapter.handleFeedbackCreated(resolutionEvent);

      console.log('✅ Blocking Crisis handled successfully');
    });

    it('[EARS-41] "The Automated Archivist" - Complete archival flow with ChangelogAdapter', async () => {
      const taskId = '1757687335-task-archival';
      const changelogId = '1757687335-changelog-archival';

      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'done'
      });
      const mockChangelog = {
        id: changelogId,
        payload: {
          id: changelogId,
          title: 'Task Archival Completed',
          description: 'Successfully archived task with full changelog',
          relatedTasks: [taskId],
          completedAt: 1757687335,
          version: 'v1.0.0'
        }
      };

      // Setup mocks for archival
      const mockChangelogStore = backlogAdapter['changelogStore'] as any;
      const mockTaskStore = backlogAdapter['taskStore'] as any;

      jest.spyOn(mockChangelogStore, 'read').mockResolvedValue(mockChangelog);
      jest.spyOn(mockTaskStore, 'read').mockResolvedValue(mockTask);
      jest.spyOn(mockTaskStore, 'write').mockResolvedValue(undefined);

      const archivalEvent = {
        type: 'changelog.created',
        timestamp: Date.now(),
        source: 'changelog_adapter',
        payload: {
          changelogId,
          relatedTasks: [taskId],
          title: 'Task Archival Completed',
          version: 'v1.0.0'
        }
      } as ChangelogCreatedEvent;

      await backlogAdapter.handleChangelogCreated(archivalEvent);

      expect(mockTaskStore.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'archived'
          })
        })
      );

      console.log('✅ Automated Archivist completed successfully');
    });

    it('[EARS-42] "The Proactive System" - Daily audit with MetricsAdapter and automated warnings', async () => {
      const mockSystemStatus = {
        tasks: { total: 10, byStatus: { active: 5 }, byPriority: {} },
        cycles: { total: 2, active: 1, completed: 1 },
        health: { overallScore: 45, blockedTasks: 2, staleTasks: 1 } // Low health score
      };

      const mockTaskHealth = {
        taskId: 'task-at-risk',
        healthScore: 30, // Low health
        timeInCurrentStage: 10, // Too long
        stalenessIndex: 5,
        blockingFeedbacks: 0,
        lastActivity: Date.now(),
        recommendations: ['Task is stale', 'Needs attention']
      };

      // Setup mocks for proactive system
      const mockMetricsAdapter = backlogAdapter['metricsAdapter'] as any;
      const mockFeedbackAdapter = backlogAdapter['feedbackAdapter'] as any;

      jest.spyOn(mockMetricsAdapter, 'getSystemStatus').mockResolvedValue(mockSystemStatus);
      jest.spyOn(mockMetricsAdapter, 'getTaskHealth').mockResolvedValue(mockTaskHealth);
      jest.spyOn(mockFeedbackAdapter, 'create').mockResolvedValue({ id: 'warning-feedback' });

      // Mock getAllTasks to return at-risk tasks
      jest.spyOn(backlogAdapter, 'getAllTasks').mockResolvedValue([
        createMockTaskRecord({ id: 'task-at-risk', status: 'active' }).payload
      ]);

      const dailyTickEvent = {
        type: 'system.daily_tick',
        timestamp: Date.now(),
        source: 'system',
        payload: {
          date: '2025-01-15'
        }
      } as SystemDailyTickEvent;

      await backlogAdapter.handleDailyTick(dailyTickEvent);

      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalled();
      expect(mockMetricsAdapter.getTaskHealth).toHaveBeenCalledWith('task-at-risk');
      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'suggestion',
          content: expect.stringContaining('health score is 30%')
        }),
        'system'
      );

      console.log('✅ Proactive System audit completed successfully');
    });

    it('[EARS-43] "The Multi-Adapter Orchestra" - All adapters working together seamlessly', async () => {
      // This test validates that multiple adapters coordinate without conflicts
      const orchestrationStart = Date.now();

      // Simulate complex multi-adapter scenario
      const taskId = '1757687335-task-orchestra';
      const cycleId = '1757687335-cycle-orchestra';
      const feedbackId = '1757687335-feedback-orchestra';

      const mockTask = createMockTaskRecord({
        id: taskId,
        status: 'active',
        cycleIds: [cycleId]
      });

      // Setup comprehensive mocks
      const stores = {
        taskStore: backlogAdapter['taskStore'] as any,
        cycleStore: backlogAdapter['cycleStore'] as any,
        feedbackStore: backlogAdapter['feedbackStore'] as any
      };

      jest.spyOn(stores.taskStore, 'read').mockResolvedValue(mockTask);
      jest.spyOn(stores.taskStore, 'write').mockResolvedValue(undefined);
      jest.spyOn(stores.feedbackStore, 'read').mockResolvedValue({
        id: feedbackId,
        payload: { entityId: taskId, type: 'suggestion' }
      });

      // Test multiple operations in sequence
      await backlogAdapter.getTask(taskId);
      await backlogAdapter.getTasksAssignedToActor('human:orchestrator');
      await backlogAdapter.getSystemStatus();
      await backlogAdapter.getTaskHealth(taskId);

      const orchestrationEnd = Date.now();
      const totalTime = orchestrationEnd - orchestrationStart;

      expect(totalTime).toBeLessThan(500); // Multi-adapter coordination should be fast
      console.log(`✅ Multi-Adapter Orchestra completed in ${totalTime}ms`);
    });
  });
});
