/**
 * Event Bus types for GitGovernance event-driven architecture
 */

/**
 * Event metadata for ordering and debugging
 */
export type EventMetadata = {
  /** Unique event identifier */
  eventId: string;
  /** Event creation timestamp */
  timestamp: number;
  /** Event processing timestamp (set by handlers) */
  processedAt?: number;
  /** Source adapter that emitted the event */
  sourceAdapter: string;
  /** Sequence number for ordering (optional) */
  sequenceNumber?: number;
};

/**
 * Base event structure
 */
export type BaseEvent = {
  /** Event type identifier */
  type: string;
  /** Event timestamp */
  timestamp: number;
  /** Event payload */
  payload: unknown;
  /** Source that emitted the event */
  source: string;
  /** Event metadata for ordering and debugging */
  metadata?: EventMetadata;
};

/**
 * Task-related events
 * Uses Utility Types derived automatically from official TaskRecord
 */
import type { TaskRecord } from '../record_types/generated/task_record';

export type TaskCreatedEvent = BaseEvent & {
  type: 'task.created';
  payload: {
    taskId: string; // Alias for TaskRecord id
    triggeredBy: string; // Actor ID who created the task
  };
};

export type TaskStatusChangedEvent = BaseEvent & {
  type: 'task.status.changed';
  payload: {
    taskId: string; // Alias for TaskRecord id
    oldStatus: TaskRecord['status'];
    newStatus: TaskRecord['status'];
    triggeredBy: string; // Actor ID who changed the status
    reason?: string;
  };
};

/**
 * Cycle-related events
 * Uses Utility Types derived automatically from official CycleRecord
 */
import type { CycleRecord } from '../record_types/generated/cycle_record';

export type CycleCreatedEvent = BaseEvent & {
  type: 'cycle.created';
  payload: {
    cycleId: string; // Alias for CycleRecord id
    triggeredBy: string; // Actor ID who created the cycle
  };
};

export type CycleStatusChangedEvent = BaseEvent & {
  type: 'cycle.status.changed';
  payload: {
    cycleId: string; // Alias for CycleRecord id
    oldStatus: CycleRecord['status'];
    newStatus: CycleRecord['status'];
    triggeredBy: string; // Actor ID who changed the status
  };
};

/**
 * Execution-related events
 * Uses Utility Types derived automatically from official ExecutionRecord
 */
import type { ExecutionRecord } from '../record_types/generated/execution_record';

export type ExecutionCreatedEvent = BaseEvent & {
  type: 'execution.created';
  payload: Pick<ExecutionRecord, 'taskId' | 'type' | 'title'> & {
    executionId: string; // Alias for ExecutionRecord id
    triggeredBy: string; // Actor ID who created the execution
    isFirstExecution: boolean;
  };
};

/**
 * Feedback-related events
 * Uses Utility Types derived automatically from official FeedbackRecord
 */
import type { FeedbackRecord } from '../record_types/generated/feedback_record';

export type FeedbackCreatedEvent = BaseEvent & {
  type: 'feedback.created';
  payload: Pick<FeedbackRecord, 'entityType' | 'entityId' | 'type' | 'status' | 'content' | 'assignee' | 'resolvesFeedbackId'> & {
    feedbackId: string; // Alias for FeedbackRecord id
    triggeredBy: string; // Actor ID who created the feedback
  };
}

/**
 * Changelog-related events
 * Uses Utility Types derived automatically from official ChangelogRecord
 */
import type { ChangelogRecord } from '../record_types/generated/changelog_record';

export type ChangelogCreatedEvent = BaseEvent & {
  type: 'changelog.created';
  payload: Pick<ChangelogRecord, 'relatedTasks' | 'title' | 'version'> & {
    changelogId: string; // Alias for ChangelogRecord id
  };
}

/**
 * Identity-related events
 * Uses Utility Types derived automatically from official ActorRecord and AgentRecord
 */
import type { ActorRecord } from '../record_types/generated/actor_record';
import type { AgentRecord } from '../record_types/generated/agent_record';

export type ActorCreatedEvent = BaseEvent & {
  type: 'identity.actor.created';
  payload: Pick<ActorRecord, 'type' | 'publicKey' | 'roles'> & {
    actorId: string; // Alias for ActorRecord id
    isBootstrap: boolean; // Business logic: first actor in the system
  };
};

export type ActorRevokedEvent = BaseEvent & {
  type: 'identity.actor.revoked';
  payload: Pick<ActorRecord, 'supersededBy'> & {
    actorId: string; // Alias for ActorRecord id
    revokedBy: string; // Actor ID who performed the revocation
    revocationReason: 'compromised' | 'rotation' | 'manual';
  };
};

export type AgentRegisteredEvent = BaseEvent & {
  type: 'identity.agent.registered';
  payload: Pick<AgentRecord, 'engine'> & {
    agentId: string; // Alias for AgentRecord id
    correspondingActorId: string; // Actor ID linked to this agent
  };
};

/**
 * System events
 */
export type SystemDailyTickEvent = BaseEvent & {
  type: 'system.daily_tick';
  payload: {
    date: string;
  };
}

/**
 * Union type of all possible events
 */
export type GitGovEvent =
  | TaskCreatedEvent
  | TaskStatusChangedEvent
  | CycleCreatedEvent
  | CycleStatusChangedEvent
  | ExecutionCreatedEvent
  | FeedbackCreatedEvent
  | ChangelogCreatedEvent
  | ActorCreatedEvent
  | ActorRevokedEvent
  | AgentRegisteredEvent
  | SystemDailyTickEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => void | Promise<void>;

/**
 * Event subscription
 */
export type EventSubscription = {
  /** Unique subscription ID */
  id: string;
  /** Event type being subscribed to */
  eventType: string;
  /** Handler function */
  handler: EventHandler;
  /** Subscription metadata */
  metadata?: {
    subscriberName?: string;
    createdAt: number;
  };
}

/**
 * Activity Event for RecordProjector activity tracking
 * Uses discriminated unions for type-safe metadata per event type
 */
export type ActivityEvent =
  | {
    timestamp: number;
    type: "task_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      priority?: string;
      status?: string;
    };
  }
  | {
    timestamp: number;
    type: "cycle_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      status?: string;
    };
  }
  | {
    timestamp: number;
    type: "feedback_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      type?: string;
      assignee?: string;
      resolution?: string;
    };
  }
  | {
    timestamp: number;
    type: "changelog_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      version?: string;
    };
  }
  | {
    timestamp: number;
    type: "execution_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      executionType?: string;
      taskId?: string;
    };
  }
  | {
    timestamp: number;
    type: "actor_created";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: {
      type?: string; // "human" | "agent"
    };
  }
  | {
    timestamp: number;
    type: "agent_registered";
    entityId: string;
    entityTitle: string;
    actorId?: string;
    metadata?: Record<string, never>; // No metadata for agent_registered
  };

