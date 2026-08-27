/**
 * FeedbackAdapter <-> BacklogAdapter Integration Tests
 * 
 * These tests verify REAL event-driven communication between adapters.
 * Uses REAL instances (not mocks) to ensure the event bus coordination works correctly.
 * 
 * Coverage: EARS-31 to EARS-35
 */

import { FeedbackAdapter } from '../adapters/feedback_adapter';
import { BacklogAdapter } from '../adapters/backlog_adapter';
import { ExecutionAdapter } from '../adapters/execution_adapter';
import { IdentityModule } from '../identity';
import { RecordMetrics } from '../record_metrics';
import type { IConfigManager } from '../config_manager';
import type { ISessionManager } from '../session_manager';
import { WorkflowAdapter } from '../adapters/workflow_adapter';
import { MemoryRecordStore } from '../record_store/memory';
import { EventBus } from '../event_bus/event_bus';
import type {
  GitGovTaskRecord, GitGovFeedbackRecord, GitGovCycleRecord,
  GitGovExecutionRecord, GitGovActorRecord
} from '../record_types';
import type { IEventStream } from '../event_bus';
import { MockKeyProvider } from '../key_provider/memory';
import { generateKeys } from '../crypto/signatures';
import { RecordSigner } from '../record_signer';

/** The single actor every record in this suite is authored and signed by. */
const TEST_ACTOR_ID = 'human:test-dev';

describe('FeedbackAdapter <-> BacklogAdapter Integration (Real Event Communication)', () => {
  let feedbackAdapter: FeedbackAdapter;
  let realSigner: RecordSigner;

  /**
   * Puts a task into `active`, the precondition EARS-31 to EARS-33 all start from.
   *
   * `BacklogAdapter.activateTask()` is not usable here: it requires the task to already be
   * `ready` (draft -> review -> ready needs approvals) and an ActorRecord in the store. This
   * sets the status directly, but RE-SIGNS the record through the real RecordSigner — the
   * previous version wrote the mutated payload back under the old header, leaving a signature
   * that no longer matched its own content.
   */
  const activateTaskForTest = async (taskId: string): Promise<void> => {
    const taskRecord = await taskStore.get(taskId);
    if (!taskRecord) throw new Error(`Task not found in fixture: ${taskId}`);
    const resigned = await realSigner.createSignedRecord(
      { ...taskRecord.payload, status: 'active' },
      'task',
      TEST_ACTOR_ID,
      'author',
      'Integration fixture: activate task',
    );
    await taskStore.put(taskId, resigned);
  };
  let backlogAdapter: BacklogAdapter;
  let identityAdapter: IdentityModule;
  let metricsAdapter: RecordMetrics;
  let eventBus: IEventStream;

  // Real stores
  let taskStore: MemoryRecordStore<GitGovTaskRecord>;
  let feedbackStore: MemoryRecordStore<GitGovFeedbackRecord>;
  let cycleStore: MemoryRecordStore<GitGovCycleRecord>;
  let executionStore: MemoryRecordStore<GitGovExecutionRecord>;
  let actorStore: MemoryRecordStore<GitGovActorRecord>;

  beforeEach(async () => {
    // Create REAL EventBus (no mock)
    eventBus = new EventBus();

    // Create REAL stores with MemoryRecordStore for integration tests
    taskStore = new MemoryRecordStore<GitGovTaskRecord>();
    feedbackStore = new MemoryRecordStore<GitGovFeedbackRecord>();
    cycleStore = new MemoryRecordStore<GitGovCycleRecord>();
    executionStore = new MemoryRecordStore<GitGovExecutionRecord>();
    actorStore = new MemoryRecordStore<GitGovActorRecord>();

    // MockKeyProvider is the canonical in-memory KeyProvider (`implements KeyProvider`), seeded
    // with a real Ed25519 key so RecordSigner produces verifiable signatures. The previous
    // hand-rolled object literal was untyped and missing `getPublicKey`, so nothing forced it to
    // satisfy the interface and `sign()` returned 64 zero bytes — signatures nobody could verify.
    const testKeys = await generateKeys();
    const mockKeyProvider = new MockKeyProvider({
      keys: { [TEST_ACTOR_ID]: testKeys.privateKey },
    });

    // Typed mocks — no cast. `BacklogAdapterDependencies` takes the interfaces (IConfigManager,
    // ISessionManager), so tsc enforces that these satisfy the full contract. If a method is
    // added to either interface, this fails to compile instead of failing at runtime.
    const mockConfigManager: IConfigManager = {
      loadConfig: jest.fn().mockResolvedValue({}),
      getRootCycle: jest.fn().mockResolvedValue(null),
      getProjectInfo: jest.fn().mockResolvedValue(null),
      getSyncConfig: jest.fn().mockResolvedValue(null),
      getSyncDefaults: jest.fn().mockResolvedValue({}),
      getAuditState: jest.fn().mockResolvedValue({}),
      updateAuditState: jest.fn().mockResolvedValue(undefined),
      getStateBranch: jest.fn().mockResolvedValue(null),
      getSaasUrl: jest.fn().mockResolvedValue(null),
    };

    const mockSessionManager: ISessionManager = {
      loadSession: jest.fn().mockResolvedValue(null),
      detectActorFromKeyFiles: jest.fn().mockResolvedValue([TEST_ACTOR_ID]),
      getActorState: jest.fn().mockResolvedValue({ actorId: TEST_ACTOR_ID }),
      updateActorState: jest.fn().mockResolvedValue(undefined),
      getCloudSessionToken: jest.fn().mockResolvedValue(null),
      getSyncPreferences: jest.fn().mockResolvedValue(null),
      updateSyncPreferences: jest.fn().mockResolvedValue(undefined),
      getLastSession: jest.fn().mockResolvedValue(null),
      setCloudToken: jest.fn(),
      setLastSession: jest.fn(),
      clearCloudToken: jest.fn(),
    };

    // Create REAL IdentityModule
    identityAdapter = new IdentityModule({
      stores: {
        actors: actorStore,
      },
      keyProvider: mockKeyProvider,
    });

    // Create real RecordSigner with the same mock KeyProvider used by identityAdapter
    realSigner = new RecordSigner({ keyProvider: mockKeyProvider });

    // Create REAL FeedbackAdapter
    feedbackAdapter = new FeedbackAdapter({
      stores: {
        feedbacks: feedbackStore,
      },
      signer: realSigner,
      eventBus // REAL EventBus
    });

    // Create REAL RecordMetrics
    metricsAdapter = new RecordMetrics({
      stores: {
        tasks: taskStore,
        cycles: cycleStore,
        feedbacks: feedbackStore,
        executions: executionStore,
        actors: actorStore,
      }
    });

    // Create REAL WorkflowAdapter
    const workflowAdapter = WorkflowAdapter.createDefault(feedbackAdapter);

    // Create REAL BacklogAdapter (will subscribe to events in constructor)
    backlogAdapter = new BacklogAdapter({
      stores: {
        tasks: taskStore,
        cycles: cycleStore,
        feedbacks: feedbackStore,
      },
      feedbackAdapter, // REAL FeedbackAdapter
      executionAdapter: new ExecutionAdapter({
        stores: { tasks: taskStore, executions: executionStore },
        signer: realSigner,
        eventBus,
      }),
      metricsAdapter, // REAL RecordMetrics
      workflowAdapter: workflowAdapter,
      identity: identityAdapter,
      signer: realSigner,
      eventBus, // SAME EventBus instance
      configManager: mockConfigManager,
      sessionManager: mockSessionManager,
    });
  });

  describe('[EARS-31] Blocking Feedback → Pause Task (Real Event Flow)', () => {
    it('[EARS-31] should pause active task when FeedbackAdapter.create(blocking) is called', async () => {
      // 1. Create and activate a task
      const task = await backlogAdapter.createTask({
        title: 'Test Task for Blocking',
        description: 'Integration test for blocking feedback flow with real adapters',
        priority: 'high'
      }, TEST_ACTOR_ID);

      await activateTaskForTest(task.id);

      // 2. Create blocking feedback via REAL FeedbackAdapter
      // This should emit feedback.created event
      const blockingFeedback = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Security vulnerability detected in authentication flow'
      }, TEST_ACTOR_ID);

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
    it('[EARS-32] should resume paused task when FeedbackAdapter.resolve() resolves last blocking feedback', async () => {
      // 1. Create task and activate it
      const task = await backlogAdapter.createTask({
        title: 'Task with Single Block',
        description: 'Integration test for resolving last blocking feedback and automatic task resumption',
        priority: 'high'
      }, TEST_ACTOR_ID);

      await activateTaskForTest(task.id);

      // 2. Create blocking feedback (will pause task)
      const blockingFeedback = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Missing unit tests'
      }, TEST_ACTOR_ID);

      await eventBus.waitForIdle(); // Wait for BacklogAdapter.handleFeedbackCreated() to finish

      // Verify task is paused
      const pausedTask = await backlogAdapter.getTask(task.id);
      expect(pausedTask!.status).toBe('paused');

      // 3. Resolve the blocking feedback via REAL resolve() method
      // This should emit feedback.created with resolvesFeedbackId
      const resolution = await feedbackAdapter.resolve(
        blockingFeedback.id,
        TEST_ACTOR_ID,
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
    it('[EARS-33] should NOT resume task when resolving one of multiple blocking feedbacks', async () => {
      // 1. Create and activate task
      const task = await backlogAdapter.createTask({
        title: 'Task with Multiple Blocks',
        description: 'Integration test for handling multiple blocking feedbacks and progressive resolution tracking',
        priority: 'critical'
      }, TEST_ACTOR_ID);

      await activateTaskForTest(task.id);

      // 2. Create 3 blocking feedbacks
      const block1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Security issue'
      }, TEST_ACTOR_ID);

      await eventBus.waitForIdle();

      const block2 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Performance issue'
      }, TEST_ACTOR_ID);

      await eventBus.waitForIdle();

      const block3 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'blocking',
        content: 'Missing documentation'
      }, TEST_ACTOR_ID);

      await eventBus.waitForIdle();

      // Verify task is paused
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 3. Resolve first blocking feedback
      await feedbackAdapter.resolve(block1.id, TEST_ACTOR_ID, 'Security fixed');
      await eventBus.waitForIdle();

      // Task should STILL be paused (2 blocks remain)
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 4. Resolve second blocking feedback
      await feedbackAdapter.resolve(block2.id, TEST_ACTOR_ID, 'Performance optimized');
      await eventBus.waitForIdle();

      // Task should STILL be paused (1 block remains)
      expect((await backlogAdapter.getTask(task.id))!.status).toBe('paused');

      // 5. Resolve third blocking feedback
      await feedbackAdapter.resolve(block3.id, TEST_ACTOR_ID, 'Documentation added');
      await eventBus.waitForIdle(); // Wait for all event handlers to complete

      // NOW task should resume
      const finalTask = await backlogAdapter.getTask(task.id);
      expect(finalTask!.status).toBe('active');
    });
  });

  describe('[EARS-34] Duplicate Assignment Prevention (Integration)', () => {
    it('[EARS-34] should prevent duplicate assignments and getTasksAssignedToActor should not show duplicates', async () => {
      // 1. Create task
      const task = await backlogAdapter.createTask({
        title: 'Task for Assignment Test',
        description: 'Integration test for duplicate assignment prevention and getTasksAssignedToActor validation',
        priority: 'medium'
      }, TEST_ACTOR_ID);

      // 2. Create first assignment
      const assignment1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: TEST_ACTOR_ID,
        content: 'Assigned to developer for implementation'
      }, TEST_ACTOR_ID);

      expect(assignment1.assignee).toBe(TEST_ACTOR_ID);

      // 3. Try to create duplicate assignment - should FAIL
      await expect(
        feedbackAdapter.create({
          entityType: 'task',
          entityId: task.id,
          type: 'assignment',
          assignee: TEST_ACTOR_ID, // Same actor
          content: 'Re-assigning urgently'
        }, TEST_ACTOR_ID)
      ).rejects.toThrow('DuplicateAssignmentError');

      // 4. Verify getTasksAssignedToActor shows the task only once
      const assignedTasks = await backlogAdapter.getTasksAssignedToActor(TEST_ACTOR_ID);

      const taskCount = assignedTasks.filter(t => t.id === task.id).length;
      expect(taskCount).toBe(1); // Should appear only ONCE
    });
  });

  describe('[EARS-35] Re-Assignment After Resolve (Integration)', () => {
    it('[EARS-35] should allow re-assignment after resolving previous assignment feedback', async () => {
      // 1. Create task
      const task = await backlogAdapter.createTask({
        title: 'Task for Re-Assignment Test',
        description: 'Integration test for re-assignment after resolving previous assignment feedback',
        priority: 'medium'
      }, TEST_ACTOR_ID);

      // 2. Create first assignment
      const assignment1 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: TEST_ACTOR_ID,
        content: 'Initial assignment'
      }, TEST_ACTOR_ID);

      // 3. Resolve the assignment (work completed)
      const resolution = await feedbackAdapter.resolve(
        assignment1.id,
        TEST_ACTOR_ID,
        'Work completed successfully'
      );

      expect(resolution.resolvesFeedbackId).toBe(assignment1.id);

      // 4. Now create NEW assignment to SAME actor - should succeed
      const assignment2 = await feedbackAdapter.create({
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        assignee: TEST_ACTOR_ID, // Same actor, but previous resolved
        content: 'Follow-up assignment for phase 2'
      }, TEST_ACTOR_ID);

      expect(assignment2.assignee).toBe(TEST_ACTOR_ID);
      expect(assignment2.id).not.toBe(assignment1.id);

      // 5. Verify getTasksAssignedToActor still shows the task
      const assignedTasks = await backlogAdapter.getTasksAssignedToActor(TEST_ACTOR_ID);
      expect(assignedTasks.some(t => t.id === task.id)).toBe(true);
    });
  });
});

