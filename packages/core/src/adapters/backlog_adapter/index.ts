import { createTaskRecord } from '../../factories/task_factory';
import { createCycleRecord } from '../../factories/cycle_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { FeedbackAdapter } from '../feedback_adapter';
import { ExecutionAdapter } from '../execution_adapter';
import { ChangelogAdapter } from '../changelog_adapter';
import { MetricsAdapter } from '../metrics_adapter';
import { ConfigManager } from '../../config_manager';
import type { TaskRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { ExecutionRecord } from '../../types';
import type { ChangelogRecord } from '../../types';
import type { IWorkflowMethodology } from '../workflow_methodology_adapter';
import type { ActorRecord } from '../../types';
import type {
  IEventStream,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  CycleCreatedEvent,
  CycleStatusChangedEvent,
  FeedbackCreatedEvent,
  ExecutionCreatedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent,
  EventMetadata
} from '../../event_bus';
import type { GitGovRecord } from '../../types';

/**
 * BacklogAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type BacklogAdapterDependencies = {
  // Data Layer (Protocols)
  taskStore: RecordStore<TaskRecord>;
  cycleStore: RecordStore<CycleRecord>;

  // Cross-Adapter Dependencies (Mediator coordination) - PHASE 3 READY
  feedbackStore: RecordStore<FeedbackRecord>;
  executionStore: RecordStore<ExecutionRecord>;
  changelogStore: RecordStore<ChangelogRecord>;

  // Adapter Dependencies (Phase 3 Integration)
  feedbackAdapter: FeedbackAdapter;
  executionAdapter: ExecutionAdapter;
  changelogAdapter: ChangelogAdapter;
  metricsAdapter: MetricsAdapter;

  // Business Rules Layer (Methodologies)
  workflowMethodologyAdapter: IWorkflowMethodology;
  planningMethodologyAdapter?: IWorkflowMethodology; // Future

  // Infrastructure Layer
  identity: IdentityAdapter;
  eventBus: IEventStream; // For listening to events (consumer pattern)
  configManager: ConfigManager; // For updating session state (activeTaskId, activeCycleId)

  // Configuration Layer (Optional)
  config?: BacklogAdapterConfig; // Optional configuration, defaults to DEFAULT_CONFIG
};

/**
 * BacklogAdapter Interface - The Facade/Mediator
 */
export interface IBacklogAdapter {
  // Phase 1: Task/Cycle CRUD operations
  createTask(payload: Partial<TaskRecord>, actorId: string): Promise<TaskRecord>;
  getTask(taskId: string): Promise<TaskRecord | null>;
  getAllTasks(): Promise<TaskRecord[]>;
  submitTask(taskId: string, actorId: string): Promise<TaskRecord>;
  approveTask(taskId: string, actorId: string): Promise<TaskRecord>;
  updateTask(taskId: string, payload: Partial<TaskRecord>, actorId: string): Promise<TaskRecord>;
  activateTask(taskId: string, actorId: string): Promise<TaskRecord>;
  completeTask(taskId: string, actorId: string): Promise<TaskRecord>;
  pauseTask(taskId: string, actorId: string, reason?: string): Promise<TaskRecord>;
  resumeTask(taskId: string, actorId: string, force?: boolean): Promise<TaskRecord>;
  discardTask(taskId: string, actorId: string, reason?: string): Promise<TaskRecord>;
  deleteTask(taskId: string, actorId: string): Promise<void>;

  createCycle(payload: Partial<CycleRecord>, actorId: string): Promise<CycleRecord>;
  getCycle(cycleId: string): Promise<CycleRecord | null>;
  getAllCycles(): Promise<CycleRecord[]>;
  updateCycle(cycleId: string, payload: Partial<CycleRecord>): Promise<CycleRecord>;
  addTaskToCycle(cycleId: string, taskId: string): Promise<void>;
  removeTasksFromCycle(cycleId: string, taskIds: string[]): Promise<void>;
  moveTasksBetweenCycles(targetCycleId: string, taskIds: string[], sourceCycleId: string): Promise<void>;

  // Phase 2: Agent Navigation
  getTasksAssignedToActor(actorId: string): Promise<TaskRecord[]>;

  // Phase 3: Event Handlers (NEW)
  handleFeedbackCreated(event: FeedbackCreatedEvent): Promise<void>;
  handleExecutionCreated(event: ExecutionCreatedEvent): Promise<void>;
  handleChangelogCreated(event: ChangelogCreatedEvent): Promise<void>;
  handleCycleStatusChanged(event: CycleStatusChangedEvent): Promise<void>;
  handleDailyTick(event: SystemDailyTickEvent): Promise<void>;

  // Phase 4: Stubs and Polish (Future)
  getSystemStatus(): Promise<SystemStatus>;
  getTaskHealth(taskId: string): Promise<TaskHealthReport>;
  lint(): Promise<LintReport>;
  audit(): Promise<AuditReport>;
  processChanges(changes: unknown[]): Promise<ExecutionRecord[]>;
}

// Type imports from MetricsAdapter
import type { SystemStatus, TaskHealthReport } from '../metrics_adapter';

// Configuration types
export type BacklogAdapterConfig = {
  healthThresholds: {
    taskMinScore: number; // Minimum task health score before warning
    maxDaysInStage: number; // Maximum days in stage before stale warning
    systemMinScore: number; // Minimum system health score before alert
  };
}

// Default configuration
const DEFAULT_CONFIG: BacklogAdapterConfig = {
  healthThresholds: {
    taskMinScore: 50,
    maxDaysInStage: 7,
    systemMinScore: 60
  }
};

// Future types
type LintReport = { status: 'success' | 'failed'; issues: string[] };
type AuditReport = { status: 'success' | 'failed'; violations: string[] };

/**
 * BacklogAdapter - The Facade/Mediator
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between Task/Cycle protocols and Workflow/Planning methodologies.
 */
export class BacklogAdapter implements IBacklogAdapter {
  private taskStore: RecordStore<TaskRecord>;
  private cycleStore: RecordStore<CycleRecord>;
  private feedbackStore: RecordStore<FeedbackRecord>;
  private changelogStore: RecordStore<ChangelogRecord>;

  private feedbackAdapter: FeedbackAdapter;
  private metricsAdapter: MetricsAdapter;

  private workflowMethodologyAdapter: IWorkflowMethodology;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;
  private configManager: ConfigManager;
  private config: BacklogAdapterConfig;


  constructor(dependencies: BacklogAdapterDependencies) {
    // Data Layer
    this.taskStore = dependencies.taskStore;
    this.cycleStore = dependencies.cycleStore;
    this.feedbackStore = dependencies.feedbackStore;
    this.changelogStore = dependencies.changelogStore;

    // Adapter Dependencies
    this.feedbackAdapter = dependencies.feedbackAdapter;
    this.metricsAdapter = dependencies.metricsAdapter;

    // Business Rules & Infrastructure
    this.workflowMethodologyAdapter = dependencies.workflowMethodologyAdapter;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
    this.configManager = dependencies.configManager;

    // Configuration with defaults
    this.config = dependencies.config || DEFAULT_CONFIG;

    // Phase 3: Setup event subscriptions
    this.setupEventSubscriptions();
  }

  /**
   * Setup event subscriptions for Phase 3 event handlers
   */
  private setupEventSubscriptions(): void {
    this.eventBus.subscribe<FeedbackCreatedEvent>("feedback.created", (event) =>
      this.handleFeedbackCreated(event)
    );
    this.eventBus.subscribe<ExecutionCreatedEvent>("execution.created", (event) =>
      this.handleExecutionCreated(event)
    );
    this.eventBus.subscribe<ChangelogCreatedEvent>("changelog.created", (event) =>
      this.handleChangelogCreated(event)
    );
    this.eventBus.subscribe<CycleStatusChangedEvent>("cycle.status.changed", (event) =>
      this.handleCycleStatusChanged(event)
    );
    this.eventBus.subscribe<SystemDailyTickEvent>("system.daily_tick", (event) =>
      this.handleDailyTick(event)
    );
  }

  // ===== PHASE 1: TASK/CYCLE CRUD OPERATIONS (IMPLEMENTED) =====

  /**
   * Creates a new task with workflow validation
   */
  async createTask(payload: Partial<TaskRecord>, actorId: string): Promise<TaskRecord> {
    // 1. Build the record with factory
    const validatedPayload = createTaskRecord(payload);

    // 2. Create unsigned record structure
    const unsignedRecord: GitGovRecord & { payload: TaskRecord } = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'will-be-calculated-by-signRecord',
        signatures: [{
          keyId: actorId,
          role: 'author',
          notes: 'Task created',
          signature: 'placeholder',
          timestamp: Date.now()
        }]
      },
      payload: validatedPayload,
    };

    // 3. Sign the record
    const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author', 'Task created');

    // 4. Persist the record with validation
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 5. Emit event
    this.eventBus.publish({
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: validatedPayload.id,
        actorId
      },
      metadata: {
        eventId: `${Date.now()}-task-created-${validatedPayload.id}`,
        timestamp: Date.now(),
        sourceAdapter: 'backlog_adapter'
      }
    } as TaskCreatedEvent);

    return validatedPayload;
  }

  /**
   * Gets a specific task by ID
   */
  async getTask(taskId: string): Promise<TaskRecord | null> {
    const record = await this.taskStore.read(taskId);
    return record ? record.payload : null;
  }

  /**
   * Gets all tasks in the system
   */
  async getAllTasks(): Promise<TaskRecord[]> {
    const ids = await this.taskStore.list();
    const tasks: TaskRecord[] = [];

    for (const id of ids) {
      const record = await this.taskStore.read(id);
      if (record) {
        tasks.push(record.payload);
      }
    }

    return tasks;
  }

  /**
   * Submits a task for review
   */
  async submitTask(taskId: string, actorId: string): Promise<TaskRecord> {
    // Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;

    // Validate current status
    if (task.status !== 'draft') {
      throw new Error(`ProtocolViolationError: Task ${taskId} is not in draft status`);
    }

    // Get actor with proper typing
    const actor = await this.getActor(actorId);

    // Delegate to workflow methodology for validation
    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('draft', 'review', {
      task,
      actor,
      signatures: taskRecord.header.signatures
    });

    if (!transitionRule) {
      throw new Error(`ProtocolViolationError: Transition draft→review not allowed for task ${taskId}`);
    }

    // Update task status
    const updatedPayload: TaskRecord = { ...task, status: 'review' as const };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // Sign and persist
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'submitter', 'Task submitted for review');
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // Emit event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'draft',
        newStatus: 'review',
        actorId
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Approves a task for next stage with complete workflow validation
   */
  async approveTask(taskId: string, actorId: string): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;
    const actor = await this.getActor(actorId);

    // 2. Determine target transition from available transitions
    const availableTransitions = await this.getAvailableTransitions(task.status);
    const approvalTransition = availableTransitions.find(transition =>
      transition.requires?.signatures && Object.keys(transition.requires.signatures).length > 0
    );

    if (!approvalTransition) {
      throw new Error(`ProtocolViolationError: No approval transition available from ${task.status}`);
    }

    const targetState = approvalTransition.to;

    // 3. Generate temporary signature for validation
    const tempSignature = {
      keyId: actorId,
      role: 'approver',
      notes: 'Task approval',
      signature: 'temp-signature',
      timestamp: Date.now()
    };

    // 4. Build complete validation context
    const context = {
      task,
      actor,
      signatures: [...taskRecord.header.signatures, tempSignature],
      transitionTo: targetState as TaskRecord['status']
    };

    // 5. Delegate signature validation to methodology
    const isValidSignature = await this.workflowMethodologyAdapter.validateSignature(tempSignature, context);
    if (!isValidSignature) {
      throw new Error(`ProtocolViolationError: Signature is not valid for this approval`);
    }

    // 6. Update, sign and persist if validation successful
    const updatedPayload: TaskRecord = { ...task, status: targetState as TaskRecord['status'] };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'approver', `Task approved: ${task.status} → ${targetState}`);
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 7. Emit event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: task.status,
        newStatus: targetState,
        actorId
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Activates a task transitioning from ready to active with permission validation
   */
  async activateTask(taskId: string, actorId: string): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;
    const actor = await this.getActor(actorId);

    // 2. Validate current status is 'ready'
    if (task.status !== 'ready') {
      throw new Error(`ProtocolViolationError: Task is in '${task.status}' state. Cannot activate from this state.`);
    }

    // 3. Validate transition with WorkflowMethodology
    const context = {
      task,
      actor,
      signatures: taskRecord.header.signatures,
      transitionTo: 'active' as TaskRecord['status']
    };

    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('ready', 'active', context);
    if (!transitionRule) {
      throw new Error(`ProtocolViolationError: Workflow methodology rejected ready→active transition`);
    }

    // 4. Update task status to 'active'
    const updatedPayload: TaskRecord = { ...task, status: 'active' };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // 5. Sign the record with 'executor' role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'executor', 'Task activated');
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 6. Update activeTaskId in session state
    await this.configManager.updateActorState(actorId, {
      activeTaskId: taskId
    });

    // 7. Emit task status changed event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'ready',
        newStatus: 'active',
        actorId
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Pauses a task manually transitioning from active to paused with optional reason
   */
  async pauseTask(taskId: string, actorId: string, reason?: string): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;

    // 2. Validate current status is 'active'
    if (task.status !== 'active') {
      throw new Error(`ProtocolViolationError: Task is in '${task.status}' state. Cannot pause (requires active).`);
    }

    // 3. Resolve actor and validate permissions via workflow methodology
    const actor = await this.getActor(actorId);

    const context = {
      task,
      actor,
      signatures: taskRecord.header.signatures,
      transitionTo: 'paused' as TaskRecord['status']
    };

    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('active', 'paused', context);
    if (!transitionRule) {
      throw new Error('ProtocolViolationError: Workflow methodology rejected active→paused transition');
    }

    // 4. Update task status to 'paused' and add reason to notes if provided
    const updatedPayload: TaskRecord = {
      ...task,
      status: 'paused',
      // Add reason to notes with [PAUSED] prefix if provided
      ...(reason && {
        notes: `${task.notes || ''}\n[PAUSED] ${reason} (${new Date().toISOString()})`.trim()
      })
    };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // 5. Sign and persist with pauser role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'pauser', `Task paused: ${reason || 'No reason provided'}`);
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 6. Clear activeTaskId in session state (task no longer active)
    await this.configManager.updateActorState(actorId, {
      activeTaskId: undefined
    });

    // 7. Emit task status changed event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'active',
        newStatus: 'paused',
        actorId,
        reason: reason || 'Task manually paused'
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Resumes a paused task transitioning back to active with optional force override
   */
  async resumeTask(taskId: string, actorId: string, force: boolean = false): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;

    // 2. Validate current status is 'paused'
    if (task.status !== 'paused') {
      throw new Error(`ProtocolViolationError: Task is in '${task.status}' state. Cannot resume (requires paused).`);
    }

    // 3. Resolve actor and validate permissions via workflow methodology
    const actor = await this.getActor(actorId);

    if (!force) {
      const taskHealth = await this.metricsAdapter.getTaskHealth(task.id);
      if (taskHealth.blockingFeedbacks > 0) {
        throw new Error('BlockingFeedbackError: Task has blocking feedbacks. Resolve them before resuming or use force.');
      }
    }

    const context = {
      task,
      actor,
      signatures: taskRecord.header.signatures,
      transitionTo: 'active' as TaskRecord['status']
    };

    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('paused', 'active', context);
    if (!transitionRule) {
      throw new Error('ProtocolViolationError: Workflow methodology rejected paused→active transition');
    }

    // 4. Update task status back to 'active'
    const updatedPayload: TaskRecord = { ...task, status: 'active' };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // 5. Sign and persist with resumer role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'resumer', 'Task resumed');
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 6. Update activeTaskId in session state
    await this.configManager.updateActorState(actorId, {
      activeTaskId: taskId
    });

    // 7. Emit task status changed event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'paused',
        newStatus: 'active',
        actorId
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Completes a task transitioning from active to done with signature validation
   */
  async completeTask(taskId: string, actorId: string): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;
    const actor = await this.getActor(actorId);

    // 2. Validate current status is 'active'
    if (task.status !== 'active') {
      throw new Error(`ProtocolViolationError: Task is in '${task.status}' state. Cannot complete from this state.`);
    }

    // 3. Validate transition with WorkflowMethodology
    const context = {
      task,
      actor,
      signatures: taskRecord.header.signatures,
      transitionTo: 'done' as TaskRecord['status']
    };

    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('active', 'done', context);
    if (!transitionRule) {
      throw new Error(`ProtocolViolationError: Workflow methodology rejected active→done transition`);
    }

    // 4. Update task status to 'done'
    const updatedPayload: TaskRecord = { ...task, status: 'done' };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // 5. Sign the record with 'approver' role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'approver', 'Task completed');
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 6. Clear activeTaskId in session state (task completed)
    await this.configManager.updateActorState(actorId, {
      activeTaskId: undefined
    });

    // 7. Emit task status changed event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'active',
        newStatus: 'done',
        actorId
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Discards a task transitioning from ready/active/review to discarded
   * Supports both cancellation (ready/active) and rejection (review) operations
   */
  async discardTask(taskId: string, actorId: string, reason?: string): Promise<TaskRecord> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;
    const actor = await this.getActor(actorId);

    // 2. Validate current status allows cancellation/rejection with educational error messages
    if (!['ready', 'active', 'review'].includes(task.status)) {
      // Educational error messages for semantic clarity
      if (task.status === 'draft') {
        throw new Error(`ProtocolViolationError: Cannot cancel task in 'draft' state. Use 'gitgov task delete ${taskId}' to remove draft tasks.`);
      }
      throw new Error(`ProtocolViolationError: Task is in '${task.status}' state. Cannot cancel from this state. Only 'ready', 'active', and 'review' tasks can be cancelled.`);
    }

    // 3. Validate transition with WorkflowMethodology
    const context = {
      task,
      actor,
      signatures: taskRecord.header.signatures,
      transitionTo: 'discarded' as TaskRecord['status']
    };

    const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule(task.status, 'discarded', context);
    if (!transitionRule) {
      throw new Error(`ProtocolViolationError: Workflow methodology rejected ${task.status}→discarded transition`);
    }

    // 4. Update task status to 'discarded' and add cancellation/rejection reason
    const updatedPayload: TaskRecord = {
      ...task,
      status: 'discarded',
      // Add reason to notes with appropriate prefix based on current state
      ...(reason && {
        notes: `${task.notes || ''}\n${task.status === 'review' ? '[REJECTED]' : '[CANCELLED]'} ${reason} (${new Date().toISOString()})`.trim()
      })
    };
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // 5. Sign the record with 'canceller' role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'canceller', `Task discarded: ${reason || 'No reason provided'}`);
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    // 6. Clear activeTaskId in session state (task discarded)
    await this.configManager.updateActorState(actorId, {
      activeTaskId: undefined
    });

    // 7. Emit task status changed event
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: task.status,
        newStatus: 'discarded',
        actorId,
        reason: reason || (task.status === 'review' ? 'Task rejected' : 'Task cancelled')
      }
    } as TaskStatusChangedEvent);

    return updatedPayload;
  }

  /**
   * Deletes a draft task completely (no discarded state)
   * Only works for tasks in 'draft' status that never entered formal workflow
   */
  async deleteTask(taskId: string, actorId: string): Promise<void> {
    // 1. Read and validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;

    // 2. Validate current status is 'draft' with educational error messages
    if (task.status !== 'draft') {
      // Educational error messages for semantic clarity
      if (task.status === 'review') {
        throw new Error(`ProtocolViolationError: Cannot delete task in 'review' state. Use 'gitgov task reject ${taskId}' to discard tasks under review.`);
      } else if (task.status === 'ready' || task.status === 'active') {
        throw new Error(`ProtocolViolationError: Cannot delete task in '${task.status}' state. Use 'gitgov task cancel ${taskId}' to discard tasks from ready/active states.`);
      }
      throw new Error(`ProtocolViolationError: Cannot delete task in '${task.status}' state. Only draft tasks can be deleted.`);
    }

    // 3. Validate actor has permission (simplified for MVP - in production would check permissions)
    await this.getActor(actorId);

    // 4. Delete the task file directly (no discarded state needed for draft)
    await this.taskStore.delete(taskId);

    // 5. Emit task deleted event (not a status change since it's being removed)
    this.eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId,
        oldStatus: 'draft',
        newStatus: 'deleted',
        actorId,
        reason: 'Draft task deleted'
      }
    } as TaskStatusChangedEvent);
  }

  /**
   * Updates a task with new payload
   * [EARS-28] Signs the updated record with the editor's signature
   */
  async updateTask(taskId: string, payload: Partial<TaskRecord>, actorId: string): Promise<TaskRecord> {
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    // Validate not in final state
    if (['archived'].includes(taskRecord.payload.status)) {
      throw new Error(`ProtocolViolationError: Cannot update task in final state: ${taskRecord.payload.status}`);
    }

    // Merge and validate with factory
    const updatedPayload = createTaskRecord({ ...taskRecord.payload, ...payload });
    const updatedRecord = { ...taskRecord, payload: updatedPayload };

    // Sign the updated record with editor role
    const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'editor', 'Task updated');
    await this.taskStore.write(signedRecord as GitGovRecord & { payload: TaskRecord });

    return updatedPayload;
  }

  // ===== PHASE 2: AGENT NAVIGATION (IMPLEMENTED) =====

  /**
   * Gets tasks assigned to a specific actor
   */
  async getTasksAssignedToActor(actorId: string): Promise<TaskRecord[]> {
    // Read all feedbacks to find assignments
    const feedbackIds = await this.feedbackStore.list();
    const assignedTaskIds: string[] = [];

    for (const id of feedbackIds) {
      const record = await this.feedbackStore.read(id);
      if (record &&
        record.payload.type === 'assignment' &&
        record.payload.assignee === actorId) {
        assignedTaskIds.push(record.payload.entityId);
      }
    }

    // Deduplicate task IDs (same task may have multiple assignment records)
    const uniqueTaskIds = [...new Set(assignedTaskIds)];

    // Read the assigned tasks
    const assignedTasks: TaskRecord[] = [];
    for (const taskId of uniqueTaskIds) {
      const task = await this.getTask(taskId);
      if (task) {
        assignedTasks.push(task);
      }
    }

    return assignedTasks;
  }

  // ===== PHASE 3: EVENT HANDLERS (NEW IMPLEMENTATION) =====

  /**
   * [EARS-31, EARS-33, EARS-34] Handles feedback created events (Immutable Pattern)
   * 
   * This handler respects the immutable feedback pattern:
   * - Case 1: Blocking feedback created → pause task if active/ready
   * - Case 2: Feedback resolving another feedback → resume task if no more blocks
   * 
   * The immutable pattern means:
   * - Original feedbacks NEVER change status
   * - Resolution is expressed by creating a NEW feedback pointing to the original
   * - We detect resolution via: entityType='feedback' + status='resolved' + resolvesFeedbackId
   */
  async handleFeedbackCreated(event: FeedbackCreatedEvent): Promise<void> {
    try {
      const metadata: EventMetadata = {
        eventId: `${Date.now()}-handle-feedback-created`,
        timestamp: Date.now(),
        processedAt: Date.now(),
        sourceAdapter: 'backlog_adapter'
      };

      // === CASE 1: Blocking Feedback Created on Task ===
      if (event.payload.type === 'blocking' && event.payload.entityType === 'task') {
        // Read the associated task
        const task = await this.getTask(event.payload.entityId);
        if (!task) {
          console.warn(`Task not found for feedback: ${event.payload.entityId}`);
          return;
        }

        // Only pause if task is in a pausable state
        if (!['active', 'ready'].includes(task.status)) {
          return; // EARS-32: Do nothing if task not pausable
        }

        // Update task to paused
        const updatedTask = { ...task, status: 'paused' as const };
        const taskRecord = await this.taskStore.read(task.id);
        if (taskRecord) {
          const updatedRecord = { ...taskRecord, payload: updatedTask };
          await this.taskStore.write(updatedRecord);

          // Emit status change event
          this.eventBus.publish({
            type: 'task.status.changed',
            timestamp: Date.now(),
            source: 'backlog_adapter',
            payload: {
              taskId: task.id,
              oldStatus: task.status,
              newStatus: 'paused',
              actorId: 'system'
            },
            metadata
          } as TaskStatusChangedEvent);
        }
        return;
      }

      // === CASE 2: Feedback Resolving Another Feedback (Immutable Pattern) ===
      // Detect: entityType='feedback' + status='resolved' + resolvesFeedbackId present
      if (
        event.payload.entityType === 'feedback' &&
        event.payload.status === 'resolved' &&
        event.payload.resolvesFeedbackId
      ) {
        // 1. Get the ORIGINAL feedback that was resolved
        const originalFeedback = await this.feedbackAdapter.getFeedback(event.payload.resolvesFeedbackId);
        if (!originalFeedback || originalFeedback.type !== 'blocking') {
          return; // Only care about blocking feedbacks
        }

        // 2. Get the task associated with the original blocking feedback
        const task = await this.getTask(originalFeedback.entityId);
        if (!task || task.status !== 'paused') {
          return; // Only resume if task is paused
        }

        // 3. Check if other blocking feedbacks remain open (EARS-34)
        const taskHealth = await this.metricsAdapter.getTaskHealth(task.id);
        if (taskHealth.blockingFeedbacks > 0) {
          return; // Don't resume if other blocks remain
        }

        // 4. Resume task automatically
        const updatedTask = { ...task, status: 'active' as const };
        const taskRecord = await this.taskStore.read(task.id);
        if (taskRecord) {
          const updatedRecord = { ...taskRecord, payload: updatedTask };
          await this.taskStore.write(updatedRecord);

          this.eventBus.publish({
            type: 'task.status.changed',
            timestamp: Date.now(),
            source: 'backlog_adapter',
            payload: {
              taskId: task.id,
              oldStatus: 'paused',
              newStatus: 'active',
              actorId: 'system'
            },
            metadata
          } as TaskStatusChangedEvent);
        }
        return;
      }

      // Other feedback types: do nothing
    } catch (error) {
      console.error('Error in handleFeedbackCreated:', error);
    }
  }


  /**
   * [EARS-35] Handles execution created events - transitions ready→active on first execution
   */
  async handleExecutionCreated(event: ExecutionCreatedEvent): Promise<void> {
    try {
      // EARS-35: Use ExecutionAdapter isFirstExecution logic
      if (!event.payload.isFirstExecution) {
        return; // EARS-36: Do nothing on subsequent executions
      }

      const task = await this.getTask(event.payload.taskId);
      if (!task || task.status !== 'ready') {
        return;
      }

      // EARS-36: Validate with WorkflowMethodology before transition
      const actor = await this.getActor(event.payload.triggeredBy);
      const transitionRule = await this.workflowMethodologyAdapter.getTransitionRule('ready', 'active', {
        task,
        actor,
        signatures: []
      });

      if (!transitionRule) {
        console.warn(`Workflow methodology rejected ready→active transition for task ${task.id}`);
        return;
      }

      // Transition to active
      const updatedTask = { ...task, status: 'active' as const };
      const taskRecord = await this.taskStore.read(task.id);
      if (taskRecord) {
        const updatedRecord = { ...taskRecord, payload: updatedTask };
        await this.taskStore.write(updatedRecord);

        this.eventBus.publish({
          type: 'task.status.changed',
          timestamp: Date.now(),
          source: 'backlog_adapter',
          payload: {
            taskId: task.id,
            oldStatus: 'ready',
            newStatus: 'active',
            actorId: event.payload.triggeredBy
          }
        } as TaskStatusChangedEvent);
      }
    } catch (error) {
      console.error('Error in handleExecutionCreated:', error);
    }
  }

  /**
   * [EARS-37] Handles changelog created events - transitions done→archived
   */
  async handleChangelogCreated(event: ChangelogCreatedEvent): Promise<void> {
    try {
      // Get changelog record to access entityType and entityId
      const changelogRecord = await this.changelogStore.read(event.payload.changelogId);
      if (!changelogRecord) {
        console.warn(`Changelog not found: ${event.payload.changelogId}`);
        return;
      }

      // EARS-37: Handle changelogs with relatedTasks
      if (!changelogRecord.payload.relatedTasks || changelogRecord.payload.relatedTasks.length === 0) {
        return;
      }

      // Archive all related tasks that are in 'done' status
      for (const taskId of changelogRecord.payload.relatedTasks) {
        const task = await this.getTask(taskId);
        if (!task || task.status !== 'done') {
          continue;
        }

        // Transition to archived
        const updatedTask = { ...task, status: 'archived' as const };
        const taskRecord = await this.taskStore.read(task.id);
        if (taskRecord) {
          const updatedRecord = { ...taskRecord, payload: updatedTask };
          await this.taskStore.write(updatedRecord);

          this.eventBus.publish({
            type: 'task.status.changed',
            timestamp: Date.now(),
            source: 'backlog_adapter',
            payload: {
              taskId: task.id,
              oldStatus: 'done',
              newStatus: 'archived',
              actorId: 'system'
            }
          } as TaskStatusChangedEvent);
        }
      } // Close for loop
    } catch (error) {
      console.error('Error in handleChangelogCreated:', error);
    }
  }

  /**
   * [EARS-38] Handles daily tick events - proactive health auditing
   */
  async handleDailyTick(_event: SystemDailyTickEvent): Promise<void> {
    try {
      // EARS-38: Use MetricsAdapter for proactive auditing
      const systemStatus = await this.metricsAdapter.getSystemStatus();

      // Get all active tasks for health analysis
      const allTasks = await this.getAllTasks();
      const activeTasks = allTasks.filter(task => task.status === 'active');

      for (const task of activeTasks) {
        const taskHealth = await this.metricsAdapter.getTaskHealth(task.id);

        // Apply configurable health thresholds
        if (taskHealth.healthScore < this.config.healthThresholds.taskMinScore ||
          taskHealth.timeInCurrentStage > this.config.healthThresholds.maxDaysInStage) {
          // Create automated warning feedback
          await this.feedbackAdapter.create({
            entityType: 'task',
            entityId: task.id,
            type: 'suggestion',
            content: `Automated health warning: Task health score is ${taskHealth.healthScore}%. ${taskHealth.recommendations.join('. ')}.`,
            status: 'open'
          }, 'system');
        }
      }

      // Log system health alert if critical issues (no custom event needed)
      if (systemStatus.health.overallScore < this.config.healthThresholds.systemMinScore) {
        console.warn(`System health alert: Score ${systemStatus.health.overallScore}%, blocked: ${systemStatus.health.blockedTasks}, stale: ${systemStatus.health.staleTasks}`);
        // Note: Health alerts are logged, not emitted as events. 
        // System monitoring should read logs for alerting.
      }
    } catch (error) {
      console.error('Error in handleDailyTick:', error);
    }
  }

  /**
   * [EARS-45] Handles cycle status changed events - manages cycle hierarchy completion
   */
  async handleCycleStatusChanged(event: CycleStatusChangedEvent): Promise<void> {
    try {
      // Only handle cycle completion
      if (event.payload.newStatus !== 'completed') {
        return;
      }

      const completedCycle = await this.getCycle(event.payload.cycleId);
      if (!completedCycle) {
        console.warn(`Completed cycle not found: ${event.payload.cycleId}`);
        return;
      }

      // Find parent cycles that contain this completed cycle
      const allCycles = await this.getAllCycles();
      const parentCycles = allCycles.filter(cycle =>
        cycle.childCycleIds?.includes(event.payload.cycleId)
      );

      for (const parentCycle of parentCycles) {
        // Check if ALL child cycles are completed
        const childCycles = await Promise.all(
          (parentCycle.childCycleIds || []).map(id => this.getCycle(id))
        );

        const allChildrenCompleted = childCycles.every(child =>
          child && child.status === 'completed'
        );

        if (allChildrenCompleted) {
          // Complete the parent cycle
          await this.updateCycle(parentCycle.id, { status: 'completed' });

          // TODO: Delegate epic task completion to planning methodology
          // The logic for completing epic tasks based on cycle completion
          // should be handled by planningMethodology, not backlogAdapter
          /*
          if (this.planningMethodology) {
            await this.planningMethodology.handleEpicCompletion({
              completedCycleId: parentCycle.id,
              event
            });
          }
          */

          // For now, just log the completion - epic logic will be in planning methodology
          console.log(`Parent cycle ${parentCycle.id} completed - epic task completion delegated to planning methodology`);
        }
      }
    } catch (error) {
      console.error('Error in handleCycleStatusChanged:', error);
    }
  }

  // ===== PHASE 4: STUBS AND POLISH (DELEGATE TO ADAPTERS) =====

  /**
   * Gets system status by delegating to MetricsAdapter
   */
  async getSystemStatus(): Promise<SystemStatus> {
    return await this.metricsAdapter.getSystemStatus();
  }

  /**
   * Gets task health by delegating to MetricsAdapter
   */
  async getTaskHealth(taskId: string): Promise<TaskHealthReport> {
    return await this.metricsAdapter.getTaskHealth(taskId);
  }

  // ===== HELPER METHODS =====

  /**
   * Helper to get actor record
   */
  private async getActor(actorId: string): Promise<ActorRecord> {
    // Use IdentityAdapter to get real actor data
    const actor = await this.identity.getActor(actorId);
    if (!actor) {
      throw new Error(`RecordNotFoundError: Actor not found: ${actorId}`);
    }
    return actor;
  }

  /**
   * Helper to get available transitions from current state
   */
  private async getAvailableTransitions(fromStatus: string): Promise<Array<{ from: string; to: string; requires?: { signatures?: Record<string, { role: string }> } }>> {
    // This would normally be implemented using workflowMethodology.getAvailableTransitions()
    // For now, implementing basic logic based on canonical workflow
    const transitions = [
      { from: 'review', to: 'ready', requires: { signatures: { __default__: { role: 'approver' } } } },
      { from: 'active', to: 'done', requires: { signatures: { __default__: { role: 'approver' } } } }
    ];

    return transitions.filter(t => t.from === fromStatus);
  }

  // ===== PHASE 1: CYCLE CRUD OPERATIONS (IMPLEMENTED) =====

  /**
   * Creates a new cycle with workflow validation
   */
  async createCycle(payload: Partial<CycleRecord>, actorId: string): Promise<CycleRecord> {
    // 1. Build the record with factory
    const validatedPayload = createCycleRecord(payload);

    // 2. Create unsigned record structure
    const unsignedRecord: GitGovRecord & { payload: CycleRecord } = {
      header: {
        version: '1.0',
        type: 'cycle',
        payloadChecksum: 'will-be-calculated-by-signRecord',
        signatures: [{
          keyId: actorId,
          role: 'author',
          notes: 'Cycle created',
          signature: 'placeholder',
          timestamp: Date.now()
        }]
      },
      payload: validatedPayload,
    };

    // 3. Sign the record
    const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author', 'Cycle created');

    // 4. Persist the record
    await this.cycleStore.write(signedRecord as GitGovRecord & { payload: CycleRecord });

    // 5. Emit event
    this.eventBus.publish({
      type: 'cycle.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        cycleId: validatedPayload.id,
        actorId
      },
      metadata: {
        eventId: `${Date.now()}-cycle-created-${validatedPayload.id}`,
        timestamp: Date.now(),
        sourceAdapter: 'backlog_adapter'
      }
    } as CycleCreatedEvent);

    return validatedPayload;
  }

  /**
   * Gets a specific cycle by ID
   */
  async getCycle(cycleId: string): Promise<CycleRecord | null> {
    const record = await this.cycleStore.read(cycleId);
    return record ? record.payload : null;
  }

  /**
   * Gets all cycles in the system
   */
  async getAllCycles(): Promise<CycleRecord[]> {
    const ids = await this.cycleStore.list();
    const cycles: CycleRecord[] = [];

    for (const id of ids) {
      const record = await this.cycleStore.read(id);
      if (record) {
        cycles.push(record.payload);
      }
    }

    return cycles;
  }

  /**
   * Updates a cycle with new payload
   */
  async updateCycle(cycleId: string, payload: Partial<CycleRecord>, actorId?: string): Promise<CycleRecord> {
    const cycleRecord = await this.cycleStore.read(cycleId);
    if (!cycleRecord) {
      throw new Error(`RecordNotFoundError: Cycle not found: ${cycleId}`);
    }

    // Validate not in final state
    if (['archived'].includes(cycleRecord.payload.status)) {
      throw new Error(`ProtocolViolationError: Cannot update cycle in final state: ${cycleRecord.payload.status}`);
    }

    // Merge and validate with factory
    const updatedPayload = createCycleRecord({ ...cycleRecord.payload, ...payload });
    const updatedRecord = { ...cycleRecord, payload: updatedPayload };

    // Update activeCycleId in session state based on cycle status transitions
    if (actorId) {
      // Set activeCycleId when cycle is activated
      if (updatedPayload.status === 'active' && cycleRecord.payload.status !== 'active') {
        await this.configManager.updateActorState(actorId, {
          activeCycleId: cycleId
        });
      }
      // Clear activeCycleId when cycle is completed
      else if (updatedPayload.status === 'completed' && cycleRecord.payload.status !== 'completed') {
        await this.configManager.updateActorState(actorId, {
          activeCycleId: undefined
        });
      }
    }

    // Emit event if status changed
    if (cycleRecord.payload.status !== updatedPayload.status) {
      this.eventBus.publish({
        type: 'cycle.status.changed',
        timestamp: Date.now(),
        source: 'backlog_adapter',
        payload: {
          cycleId,
          oldStatus: cycleRecord.payload.status,
          newStatus: updatedPayload.status,
          actorId: actorId || 'system'
        }
      } as CycleStatusChangedEvent);
    }

    await this.cycleStore.write(updatedRecord);
    return updatedPayload;
  }

  /**
   * Creates bidirectional link between task and cycle
   */
  async addTaskToCycle(cycleId: string, taskId: string): Promise<void> {
    // Read both records
    const cycleRecord = await this.cycleStore.read(cycleId);
    const taskRecord = await this.taskStore.read(taskId);

    if (!cycleRecord) {
      throw new Error(`RecordNotFoundError: Cycle not found: ${cycleId}`);
    }
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    // Create bidirectional links
    const updatedCycle = {
      ...cycleRecord.payload,
      taskIds: [...(cycleRecord.payload.taskIds || []), taskId]
    };
    const updatedTask = {
      ...taskRecord.payload,
      cycleIds: [...(taskRecord.payload.cycleIds || []), cycleId]
    };

    // Get current actor for signing (MVP mode)
    const currentActor = await this.identity.getCurrentActor();

    // Sign and persist both records with current actor
    const signedCycleRecord = await this.identity.signRecord(
      { ...cycleRecord, payload: updatedCycle },
      currentActor.id,
      'author',
      `Task ${taskId} added to cycle`
    );
    const signedTaskRecord = await this.identity.signRecord(
      { ...taskRecord, payload: updatedTask },
      currentActor.id,
      'author',
      `Task linked to cycle ${cycleId}`
    );

    await Promise.all([
      this.cycleStore.write(signedCycleRecord as GitGovRecord & { payload: CycleRecord }),
      this.taskStore.write(signedTaskRecord as GitGovRecord & { payload: TaskRecord })
    ]);
  }

  /**
   * Removes multiple tasks from a cycle with bidirectional unlinking
   * All business logic and validation happens here in the adapter
   */
  async removeTasksFromCycle(cycleId: string, taskIds: string[]): Promise<void> {
    // 1. Validate inputs
    if (!cycleId || typeof cycleId !== 'string') {
      throw new Error('ValidationError: cycleId must be a non-empty string');
    }
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error('ValidationError: taskIds must be a non-empty array');
    }

    // 2. Read cycle record
    const cycleRecord = await this.cycleStore.read(cycleId);
    if (!cycleRecord) {
      throw new Error(`RecordNotFoundError: Cycle not found: ${cycleId}`);
    }

    // 3. Read all task records and validate they exist
    const taskRecords = await Promise.all(
      taskIds.map(async (taskId) => {
        const taskRecord = await this.taskStore.read(taskId);
        if (!taskRecord) {
          throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
        }
        return { taskId, record: taskRecord };
      })
    );

    // 4. Validate that all tasks are actually linked to this cycle
    const cycleTaskIds = cycleRecord.payload.taskIds || [];
    const notLinkedTasks = taskIds.filter(taskId => !cycleTaskIds.includes(taskId));
    if (notLinkedTasks.length > 0) {
      throw new Error(`ValidationError: Tasks not linked to cycle ${cycleId}: ${notLinkedTasks.join(', ')}`);
    }

    // 5. Prepare updated cycle (remove all taskIds)
    const updatedCycle = {
      ...cycleRecord.payload,
      taskIds: cycleTaskIds.filter(id => !taskIds.includes(id))
    };

    // 6. Get current actor for signing
    const currentActor = await this.identity.getCurrentActor();

    // 7. Sign cycle record
    const signedCycleRecord = await this.identity.signRecord(
      { ...cycleRecord, payload: updatedCycle },
      currentActor.id,
      'author',
      `Tasks removed from cycle: ${taskIds.join(', ')}`
    );

    // 8. Prepare and sign all task records (remove cycleId from each)
    const signedTaskRecords = await Promise.all(
      taskRecords.map(async ({ record }) => {
        const taskCycleIds = record.payload.cycleIds || [];
        const updatedTask = {
          ...record.payload,
          cycleIds: taskCycleIds.filter(id => id !== cycleId)
        };
        return await this.identity.signRecord(
          { ...record, payload: updatedTask },
          currentActor.id,
          'author',
          'Task removed from deleted cycle'
        );
      })
    );

    // 9. Atomic write - all or nothing
    await Promise.all([
      this.cycleStore.write(signedCycleRecord as GitGovRecord & { payload: CycleRecord }),
      ...signedTaskRecords.map(signedTask =>
        this.taskStore.write(signedTask as GitGovRecord & { payload: TaskRecord })
      )
    ]);
  }

  /**
   * Moves multiple tasks from one cycle to another atomically
   * Provides transactional semantics - all tasks move or none do
   * All business logic and validation happens here in the adapter
   */
  async moveTasksBetweenCycles(targetCycleId: string, taskIds: string[], sourceCycleId: string): Promise<void> {
    // 1. Validate inputs
    if (!sourceCycleId || typeof sourceCycleId !== 'string') {
      throw new Error('ValidationError: sourceCycleId must be a non-empty string');
    }
    if (!targetCycleId || typeof targetCycleId !== 'string') {
      throw new Error('ValidationError: targetCycleId must be a non-empty string');
    }
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error('ValidationError: taskIds must be a non-empty array');
    }
    if (sourceCycleId === targetCycleId) {
      throw new Error('ValidationError: Source and target cycles must be different');
    }

    // 2. Read all records
    const [sourceCycleRecord, targetCycleRecord] = await Promise.all([
      this.cycleStore.read(sourceCycleId),
      this.cycleStore.read(targetCycleId)
    ]);

    if (!sourceCycleRecord) {
      throw new Error(`RecordNotFoundError: Source cycle not found: ${sourceCycleId}`);
    }
    if (!targetCycleRecord) {
      throw new Error(`RecordNotFoundError: Target cycle not found: ${targetCycleId}`);
    }

    // 3. Read all task records and validate they exist
    const taskRecords = await Promise.all(
      taskIds.map(async (taskId) => {
        const taskRecord = await this.taskStore.read(taskId);
        if (!taskRecord) {
          throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
        }
        return { taskId, record: taskRecord };
      })
    );

    // 4. Validate that all tasks are actually linked to source cycle
    const sourceTaskIds = sourceCycleRecord.payload.taskIds || [];
    const notLinkedTasks = taskIds.filter(taskId => !sourceTaskIds.includes(taskId));
    if (notLinkedTasks.length > 0) {
      throw new Error(`ValidationError: Tasks not linked to source cycle ${sourceCycleId}: ${notLinkedTasks.join(', ')}`);
    }

    // 5. Prepare updated cycles
    const updatedSourceCycle = {
      ...sourceCycleRecord.payload,
      taskIds: sourceTaskIds.filter(id => !taskIds.includes(id))
    };
    const updatedTargetCycle = {
      ...targetCycleRecord.payload,
      taskIds: [...(targetCycleRecord.payload.taskIds || []), ...taskIds]
    };

    // 6. Get current actor for signing
    const currentActor = await this.identity.getCurrentActor();

    // 7. Sign both cycle records
    const [signedSourceCycle, signedTargetCycle] = await Promise.all([
      this.identity.signRecord(
        { ...sourceCycleRecord, payload: updatedSourceCycle },
        currentActor.id,
        'author',
        'Tasks moved from cycle'
      ),
      this.identity.signRecord(
        { ...targetCycleRecord, payload: updatedTargetCycle },
        currentActor.id,
        'author',
        'Tasks moved to cycle'
      )
    ]);

    // 8. Prepare and sign all task records (update cycleIds)
    const signedTaskRecords = await Promise.all(
      taskRecords.map(async ({ record }) => {
        const taskCycleIds = record.payload.cycleIds || [];
        const updatedTask = {
          ...record.payload,
          cycleIds: taskCycleIds
            .filter(id => id !== sourceCycleId)  // Remove source
            .concat(targetCycleId)                // Add target
        };
        return await this.identity.signRecord(
          { ...record, payload: updatedTask },
          currentActor.id,
          'author',
          'Task cycle updated'
        );
      })
    );

    // 9. Atomic write - all or nothing
    try {
      await Promise.all([
        this.cycleStore.write(signedSourceCycle as GitGovRecord & { payload: CycleRecord }),
        this.cycleStore.write(signedTargetCycle as GitGovRecord & { payload: CycleRecord }),
        ...signedTaskRecords.map(signedTask =>
          this.taskStore.write(signedTask as GitGovRecord & { payload: TaskRecord })
        )
      ]);
    } catch (error) {
      throw new Error(`AtomicOperationError: Failed to move tasks between cycles: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // TODO: Implement when lint_command.md is implemented
  async lint(): Promise<LintReport> {
    throw new Error('NotImplementedError: lint() will be implemented when lint_command.md is ready');
  }

  // TODO: Implement when audit_command.md is implemented  
  async audit(): Promise<AuditReport> {
    throw new Error('NotImplementedError: audit() will be implemented when audit_command.md is ready');
  }

  // TODO: Implement when commit_processor_adapter.md is implemented
  async processChanges(_changes: unknown[]): Promise<ExecutionRecord[]> {
    throw new Error('NotImplementedError: processChanges() will be implemented when commit_processor_adapter.md is ready');
  }
}
