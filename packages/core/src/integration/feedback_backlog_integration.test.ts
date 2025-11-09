/**
 * FeedbackAdapter <-> BacklogAdapter Integration Tests
 * 
 * These tests verify REAL event-driven communication between adapters.
 * Uses REAL instances (not mocks) to ensure the event bus coordination works correctly.
 * 
 * Coverage: EARS-31 to EARS-35
 */

// Mock IdentityAdapter before importing
jest.doMock('../adapters/identity_adapter', () => ({
  IdentityAdapter: jest.fn().mockImplementation(() => ({
    getActorPublicKey: jest.fn().mockResolvedValue('mock-public-key'),
    getActor: jest.fn().mockResolvedValue({
      id: 'human:test-dev',
      type: 'human',
      displayName: 'Test Developer',
      publicKey: 'mock-public-key',
      roles: ['author', 'executor', 'approver:quality'],
      status: 'active'
    }),
    createActor: jest.fn().mockResolvedValue({
      id: 'human:test-dev',
      type: 'human',
      displayName: 'Test Developer',
      publicKey: 'mock-public-key',
      roles: ['author', 'executor', 'approver:quality'],
      status: 'active'
    }),
    listActors: jest.fn(),
    signRecord: jest.fn().mockImplementation(async (unsignedRecord, actorId, role = 'author') => {
      // signRecord receives a record with placeholder header and returns it properly signed
      return {
        header: {
          ...unsignedRecord.header,
          payloadChecksum: 'a'.repeat(64), // Mock checksum
          signatures: [createTestSignature(actorId || 'human:test-dev', role)]
        },
        payload: unsignedRecord.payload
      };
    }),
    rotateActorKey: jest.fn(),
    revokeActor: jest.fn(),
    resolveCurrentActorId: jest.fn(),
    getCurrentActor: jest.fn().mockResolvedValue({
      id: 'human:test-dev',
      type: 'human',
      displayName: 'Test Developer',
      publicKey: 'mock-public-key',
      roles: ['author', 'executor', 'approver:quality'],
      status: 'active'
    }),
    getEffectiveActorForAgent: jest.fn(),
    authenticate: jest.fn(),
    createAgentRecord: jest.fn(),
    getAgentRecord: jest.fn(),
    listAgentRecords: jest.fn(),
  }))
}));

import { FeedbackAdapter } from '../adapters/feedback_adapter';
import { BacklogAdapter } from '../adapters/backlog_adapter';
import { IdentityAdapter } from '../adapters/identity_adapter';
import { MetricsAdapter } from '../adapters/metrics_adapter';
import { WorkflowMethodologyAdapter } from '../adapters/workflow_methodology_adapter';
import { RecordStore } from '../store';
import { EventBus } from '../event_bus/event_bus';
import type { TaskRecord, FeedbackRecord, CycleRecord, ExecutionRecord, ChangelogRecord, ActorRecord, AgentRecord } from '../types';
import type { IEventStream } from '../event_bus';
import { loadTaskRecord, loadFeedbackRecord, loadCycleRecord, loadExecutionRecord, loadChangelogRecord, loadActorRecord, loadAgentRecord, createTestSignature } from '../factories';

describe('FeedbackAdapter <-> BacklogAdapter Integration (Real Event Communication)', () => {
  let feedbackAdapter: FeedbackAdapter;
  let backlogAdapter: BacklogAdapter;
  let identityAdapter: IdentityAdapter;
  let metricsAdapter: MetricsAdapter;
  let eventBus: IEventStream;

  // Real stores
  let taskStore: RecordStore<TaskRecord>;
  let feedbackStore: RecordStore<FeedbackRecord>;
  let cycleStore: RecordStore<CycleRecord>;
  let executionStore: RecordStore<ExecutionRecord>;
  let changelogStore: RecordStore<ChangelogRecord>;
  let actorStore: RecordStore<ActorRecord>;
  let agentStore: RecordStore<AgentRecord>;

  beforeEach(async () => {
    // Create REAL EventBus (no mock)
    eventBus = new EventBus();

    // Create REAL stores with unique temp directories per test in /tmp/
    const testRoot = `/tmp/gitgov-test-${Date.now()}`;
    taskStore = new RecordStore<TaskRecord>('tasks', loadTaskRecord, testRoot);
    feedbackStore = new RecordStore<FeedbackRecord>('feedback', loadFeedbackRecord, testRoot);
    cycleStore = new RecordStore<CycleRecord>('cycles', loadCycleRecord, testRoot);
    executionStore = new RecordStore<ExecutionRecord>('executions', loadExecutionRecord, testRoot);
    changelogStore = new RecordStore<ChangelogRecord>('changelogs', loadChangelogRecord, testRoot);
    actorStore = new RecordStore<ActorRecord>('actors', loadActorRecord, testRoot);
    agentStore = new RecordStore<AgentRecord>('agents', loadAgentRecord, testRoot);

    // Create REAL IdentityAdapter
    identityAdapter = new IdentityAdapter({
      actorStore,
      agentStore
    });

    // Create REAL FeedbackAdapter
    feedbackAdapter = new FeedbackAdapter({
      feedbackStore,
      identity: identityAdapter,
      eventBus // REAL EventBus
    });

    // Create REAL MetricsAdapter
    metricsAdapter = new MetricsAdapter({
      taskStore,
      cycleStore,
      feedbackStore,
      executionStore
    });

    // Create REAL WorkflowMethodologyAdapter
    const workflowAdapter = WorkflowMethodologyAdapter.createDefault(feedbackAdapter);

    // Create REAL BacklogAdapter (will subscribe to events in constructor)
    backlogAdapter = new BacklogAdapter({
      taskStore,
      cycleStore,
      feedbackStore,
      executionStore,
      changelogStore,
      feedbackAdapter, // REAL FeedbackAdapter
      executionAdapter: {
        isFirstExecution: jest.fn()
      } as any, // Mock ExecutionAdapter for now
      changelogAdapter: {
        create: jest.fn()
      } as any, // Mock ChangelogAdapter for now
      metricsAdapter, // REAL MetricsAdapter
      workflowMethodologyAdapter: workflowAdapter,
      identity: identityAdapter,
      eventBus // SAME EventBus instance
    });

    // Actor is already mocked in jest.doMock at the top
  });

  describe('[EARS-31] Blocking Feedback → Pause Task (Real Event Flow)', () => {
    it('should pause active task when FeedbackAdapter.create(blocking) is called', async () => {
      // 1. Create and activate a task
      const task = await backlogAdapter.createTask({
        title: 'Test Task for Blocking',
        description: 'Integration test for blocking feedback flow with real adapters',
        priority: 'high'
      }, 'human:test-dev');

      // Manually transition to active for testing
      const taskRecord = await taskStore.read(task.id);
      if (taskRecord) {
        await taskStore.write({
          ...taskRecord,
          payload: { ...taskRecord.payload, status: 'active' }
        });
      }

      // 2. Create blocking feedback via REAL FeedbackAdapter
      // This should emit feedback.created event
      const blockingFeedback = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Security vulnerability detected in authentication flow'
      }, 'human:test-dev');

      // 3. Give event bus time to process (async event handling)
      await eventBus.waitForIdle();

      // 4. Verify task was paused by BacklogAdapter event handler
      const pausedTask = await backlogAdapter.getTask(task.id);

      expect(pausedTask).not.toBeNull();
      expect(pausedTask!.status).toBe('paused');
      expect(blockingFeedback.type).toBe('blocking');
      expect(blockingFeedback.entityId).toBe(task.id);
    });
  });

  describe('[EARS-32] Resolve Last Block → Resume Task (Real Event Flow)', () => {
    it('should resume paused task when FeedbackAdapter.resolve() resolves last blocking feedback', async () => {
      // 1. Create task and activate it
      const task = await backlogAdapter.createTask({
        title: 'Task with Single Block',
        description: 'Integration test for resolving last blocking feedback and automatic task resumption',
        priority: 'high'
      }, 'human:test-dev');

      const taskRecord = await taskStore.read(task.id);
      if (taskRecord) {
        await taskStore.write({
          ...taskRecord,
          payload: { ...taskRecord.payload, status: 'active' }
        });
      }

      // 2. Create blocking feedback (will pause task)
      const blockingFeedback = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Missing unit tests'
      }, 'human:test-dev');

      await eventBus.waitForIdle(); // Wait for BacklogAdapter.handleFeedbackCreated() to finish

      // Verify task is paused
      const pausedTask = await backlogAdapter.getTask(task.id);
      expect(pausedTask!.status).toBe('paused');

      // 3. Resolve the blocking feedback via REAL resolve() method
      // This should emit feedback.created with resolvesFeedbackId
      const resolution = await feedbackAdapter.resolve(
        blockingFeedback.id,
        'human:test-dev',
        'Unit tests added with 90% coverage'
      );

      await eventBus.waitForIdle(); // Wait for BacklogAdapter to process resolution and resume task

      // 4. Verify task was resumed by BacklogAdapter event handler
      const resumedTask = await backlogAdapter.getTask(task.id);

      expect(resumedTask!.status).toBe('active');
      expect(resolution.resolvesFeedbackId).toBe(blockingFeedback.id);
      expect(resolution.entityType).toBe('feedback');
      expect(resolution.status).toBe('resolved');
    });
  });

  describe('[EARS-33] Multiple Blocks → Keep Task Paused (Real Event Flow)', () => {
    it('should NOT resume task when resolving one of multiple blocking feedbacks', async () => {
      // 1. Create and activate task
      const task = await backlogAdapter.createTask({
        title: 'Task with Multiple Blocks',
        description: 'Integration test for handling multiple blocking feedbacks and progressive resolution tracking',
        priority: 'critical'
      }, 'human:test-dev');

      const taskRecord = await taskStore.read(task.id);
      if (taskRecord) {
        await taskStore.write({
          ...taskRecord,
          payload: { ...taskRecord.payload, status: 'active' }
        });
      }

      // 2. Create 3 blocking feedbacks
      const block1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Security issue'
      }, 'human:test-dev');

      await eventBus.waitForIdle();

      const block2 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Performance issue'
      }, 'human:test-dev');

      await eventBus.waitForIdle();

      const block3 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Missing documentation'
      }, 'human:test-dev');

      await eventBus.waitForIdle();

      // Verify task is paused
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 3. Resolve first blocking feedback
      await feedbackAdapter.resolve(block1.id, 'human:test-dev', 'Security fixed');
      await eventBus.waitForIdle();

      // Task should STILL be paused (2 blocks remain)
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 4. Resolve second blocking feedback
      await feedbackAdapter.resolve(block2.id, 'human:test-dev', 'Performance optimized');
      await eventBus.waitForIdle();

      // Task should STILL be paused (1 block remains)
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 5. Resolve third blocking feedback
      await feedbackAdapter.resolve(block3.id, 'human:test-dev', 'Documentation added');
      await eventBus.waitForIdle(); // Wait for all event handlers to complete

      // NOW task should resume
      const finalTask = await backlogAdapter.getTask(task.id);
      expect(finalTask!.status).toBe('active');
    });
  });

  describe('[EARS-34] Duplicate Assignment Prevention (Integration)', () => {
    it('should prevent duplicate assignments and getTasksAssignedToActor should not show duplicates', async () => {
      // 1. Create task
      const task = await backlogAdapter.createTask({
        title: 'Task for Assignment Test',
        description: 'Integration test for duplicate assignment prevention and getTasksAssignedToActor validation',
        priority: 'medium'
      }, 'human:test-dev');

      // 2. Create first assignment
      const assignment1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: 'human:test-dev',
        content: 'Assigned to developer for implementation'
      }, 'human:test-dev');

      expect(assignment1.assignee).toBe('human:test-dev');

      // 3. Try to create duplicate assignment - should FAIL
      await expect(
        feedbackAdapter.create({
          entityType: 'task',
          entityId: task.id,
          type: 'assignment',
          assignee: 'human:test-dev', // Same actor
          content: 'Re-assigning urgently'
        }, 'human:test-dev')
      ).rejects.toThrow('DuplicateAssignmentError');

      // 4. Verify getTasksAssignedToActor shows the task only once
      const assignedTasks = await backlogAdapter.getTasksAssignedToActor('human:test-dev');

      const taskCount = assignedTasks.filter(t => t.id === task.id).length;
      expect(taskCount).toBe(1); // Should appear only ONCE
    });
  });

  describe('[EARS-35] Re-Assignment After Resolve (Integration)', () => {
    it('should allow re-assignment after resolving previous assignment feedback', async () => {
      // 1. Create task
      const task = await backlogAdapter.createTask({
        title: 'Task for Re-Assignment Test',
        description: 'Integration test for re-assignment after resolving previous assignment feedback',
        priority: 'medium'
      }, 'human:test-dev');

      // 2. Create first assignment
      const assignment1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: 'human:test-dev',
        content: 'Initial assignment'
      }, 'human:test-dev');

      // 3. Resolve the assignment (work completed)
      const resolution = await feedbackAdapter.resolve(
        assignment1.id,
        'human:test-dev',
        'Work completed successfully'
      );

      expect(resolution.resolvesFeedbackId).toBe(assignment1.id);

      // 4. Now create NEW assignment to SAME actor - should succeed
      const assignment2 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: 'human:test-dev', // Same actor, but previous resolved
        content: 'Follow-up assignment for phase 2'
      }, 'human:test-dev');

      expect(assignment2.assignee).toBe('human:test-dev');
      expect(assignment2.id).not.toBe(assignment1.id);

      // 5. Verify getTasksAssignedToActor still shows the task
      const assignedTasks = await backlogAdapter.getTasksAssignedToActor('human:test-dev');
      expect(assignedTasks.some(t => t.id === task.id)).toBe(true);
    });
  });
});

