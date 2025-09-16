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
 */
export type TaskCreatedEvent = BaseEvent & {
  type: 'task.created';
  payload: {
    taskId: string;
    actorId: string;
  };
};

export type TaskStatusChangedEvent = BaseEvent & {
  type: 'task.status.changed';
  payload: {
    taskId: string;
    oldStatus: string;
    newStatus: string;
    actorId: string;
  };
};

/**
 * Cycle-related events
 */
export type CycleCreatedEvent = BaseEvent & {
  type: 'cycle.created';
  payload: {
    cycleId: string;
    actorId: string;
  };
};

export type CycleStatusChangedEvent = BaseEvent & {
  type: 'cycle.status.changed';
  payload: {
    cycleId: string;
    oldStatus: string;
    newStatus: string;
    actorId: string;
  };
};

/**
 * Execution-related events
 */
export type ExecutionCreatedEvent = BaseEvent & {
  type: 'execution.created';
  payload: {
    executionId: string;
    taskId: string;
    actorId: string;
    isFirstExecution: boolean;
  };
};

/**
 * Feedback-related events
 */
export type FeedbackCreatedEvent = BaseEvent & {
  type: 'feedback.created';
  payload: {
    feedbackId: string;
    entityType: string;
    entityId: string;
    feedbackType: string;
    actorId: string;
  };
}

export type FeedbackStatusChangedEvent = BaseEvent & {
  type: 'feedback.status.changed';
  payload: {
    feedbackId: string;
    oldStatus: string;
    newStatus: string;
    actorId: string;
  };
}

/**
 * Changelog-related events
 */
export type ChangelogCreatedEvent = BaseEvent & {
  type: 'changelog.created';
  payload: {
    changelogId: string;
    taskId: string;
    actorId: string;
  };
}

/**
 * Identity-related events
 */
export type ActorCreatedEvent = BaseEvent & {
  type: 'identity.actor.created';
  payload: {
    actorId: string;
    actorType: 'human' | 'agent';
    publicKey: string;
    roles: string[];
    isBootstrap: boolean;
  };
};

export type ActorRevokedEvent = BaseEvent & {
  type: 'identity.actor.revoked';
  payload: {
    actorId: string;
    revokedBy: string;
    supersededBy?: string;
    revocationReason: 'compromised' | 'rotation' | 'manual';
  };
};

export type AgentRegisteredEvent = BaseEvent & {
  type: 'identity.agent.registered';
  payload: {
    agentId: string;
    guild: string;
    engine: {
      type: 'local' | 'api' | 'mcp';
      [k: string]: unknown;
    };
    correspondingActorId: string;
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
  | FeedbackStatusChangedEvent
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
 * Activity Event for IndexerAdapter activity tracking
 */
export type ActivityEvent = {
  timestamp: number;
  type:
  | "task_created"
  | "cycle_created"
  | "feedback_created"
  | "changelog_created"
  | "execution_created"
  | "actor_created"
  | "agent_registered";
  entityId: string;
  entityTitle: string;
  actorId?: string;
  metadata?: {
    priority?: string;
    status?: string;
    type?: string;
    assignee?: string;
    resolution?: string;
    executionType?: string;
    taskId?: string;
  };
};

