import type { RecordStores } from '../../record_store';
import type { IdentityAdapter } from '../identity_adapter';
import type { FeedbackAdapter } from '../feedback_adapter';
import type { ConfigManager } from '../../config_manager/config_manager';
import type { SessionManager } from '../../session_manager/session_manager';
import type {
  TaskRecord,
  CycleRecord,
  ExecutionRecord,
} from '../../record_types';
import type { IWorkflow } from '../workflow_adapter';
import type {
  IEventStream,
  FeedbackCreatedEvent,
  ExecutionCreatedEvent,
  ChangelogCreatedEvent,
  CycleStatusChangedEvent,
  SystemDailyTickEvent,
} from '../../event_bus';
import type { ExecutionAdapter } from '../execution_adapter';
import type { ChangelogAdapter } from '../changelog_adapter';
import type { RecordMetrics, SystemStatus, TaskHealthReport } from '../../record_metrics';

/**
 * BacklogAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type BacklogAdapterDependencies = {
  // Data Layer - Required stores for BacklogAdapter
  stores: Required<Pick<RecordStores, 'tasks' | 'cycles' | 'feedbacks' | 'changelogs'>>;

  // Adapter Dependencies (Phase 3 Integration)
  feedbackAdapter: FeedbackAdapter;
  executionAdapter: ExecutionAdapter;
  changelogAdapter: ChangelogAdapter;
  metricsAdapter: RecordMetrics;

  // Business Rules Layer (Methodologies)
  workflowAdapter: IWorkflow;

  // Infrastructure Layer
  identity: IdentityAdapter;
  eventBus: IEventStream; // For listening to events (consumer pattern)
  configManager: ConfigManager; // For accessing project config
  sessionManager: SessionManager; // For updating session state (activeTaskId, activeCycleId)

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

  // Phase 4: Metrics & Reports
  getSystemStatus(): Promise<SystemStatus>;
  getTaskHealth(taskId: string): Promise<TaskHealthReport>;
  lint(): Promise<LintReport>;
  audit(): Promise<AuditReport>;
  processChanges(changes: unknown[]): Promise<ExecutionRecord[]>;
}

// Configuration types
export type BacklogAdapterConfig = {
  healthThresholds: {
    taskMinScore: number; // Minimum task health score before warning
    maxDaysInStage: number; // Maximum days in stage before stale warning
    systemMinScore: number; // Minimum system health score before alert
  };
}

// Future types
export type LintReport = { status: 'success' | 'failed'; issues: string[] };
export type AuditReport = { status: 'success' | 'failed'; violations: string[] };
