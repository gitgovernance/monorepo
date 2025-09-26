import { EventBus } from './event_bus';
import type {
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  CycleCreatedEvent,
  ExecutionCreatedEvent,
  FeedbackCreatedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent
} from './types';

describe('EventBus Integration Tests', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.clearSubscriptions();
  });

  // ==========================================
  // EARS-1 to EARS-7: Cross-Adapter Event Flow
  // ==========================================

  it('[EARS-1] should simulate complete task creation workflow with events', () => {
    const backlogAdapterHandler = jest.fn();
    const executionAdapterHandler = jest.fn();
    const feedbackAdapterHandler = jest.fn();
    const changelogAdapterHandler = jest.fn();

    // Simulate adapter subscriptions
    eventBus.subscribe<TaskCreatedEvent>('task.created', backlogAdapterHandler);
    eventBus.subscribe<ExecutionCreatedEvent>('execution.created', executionAdapterHandler);
    eventBus.subscribe<FeedbackCreatedEvent>('feedback.created', feedbackAdapterHandler);
    eventBus.subscribe<ChangelogCreatedEvent>('changelog.created', changelogAdapterHandler);

    // 1. Task is created (emitted by BacklogAdapter)
    const taskCreatedEvent: TaskCreatedEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:integration-test-123',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(taskCreatedEvent);

    // 2. Execution is created (emitted by ExecutionAdapter)
    const executionCreatedEvent: ExecutionCreatedEvent = {
      type: 'execution.created',
      timestamp: Date.now(),
      source: 'execution_adapter',
      payload: {
        executionId: 'execution:integration-test-456',
        taskId: 'task:integration-test-123',
        triggeredBy: 'human:test-user',
        isFirstExecution: true
      }
    };
    eventBus.publish(executionCreatedEvent);

    // 3. Feedback is created (emitted by FeedbackAdapter)
    const feedbackCreatedEvent: FeedbackCreatedEvent = {
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: {
        feedbackId: 'feedback:integration-test-789',
        entityType: 'task',
        entityId: 'task:integration-test-123',
        type: 'blocking',
        status: 'open',
        content: 'Test feedback content',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(feedbackCreatedEvent);

    // 4. Changelog is created (emitted by ChangelogAdapter)
    const changelogCreatedEvent: ChangelogCreatedEvent = {
      type: 'changelog.created',
      timestamp: Date.now(),
      source: 'changelog_adapter',
      payload: {
        changelogId: 'changelog:integration-test-abc',
        entityId: 'task:integration-test-123',
        entityType: 'task',
        changeType: 'creation',
        riskLevel: 'low',
        triggeredBy: 'human:test-user',
        title: 'Integration test changelog',
        trigger: 'manual'
      }
    };
    eventBus.publish(changelogCreatedEvent);

    // Verify all handlers received their respective events
    expect(backlogAdapterHandler).toHaveBeenCalledWith(taskCreatedEvent);
    expect(executionAdapterHandler).toHaveBeenCalledWith(executionCreatedEvent);
    expect(feedbackAdapterHandler).toHaveBeenCalledWith(feedbackCreatedEvent);
    expect(changelogAdapterHandler).toHaveBeenCalledWith(changelogCreatedEvent);
  });

  it('[EARS-2] should handle task status change workflow across adapters', () => {
    const backlogHandler = jest.fn();
    const executionHandler = jest.fn();
    const changelogHandler = jest.fn();

    // BacklogAdapter listens to execution and changelog events
    eventBus.subscribe<ExecutionCreatedEvent>('execution.created', backlogHandler);
    eventBus.subscribe<ChangelogCreatedEvent>('changelog.created', backlogHandler);

    // Other adapters listen to task status changes
    eventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', executionHandler);
    eventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', changelogHandler);

    // 1. Task status changes from draft → review
    const statusChangeEvent1: TaskStatusChangedEvent = {
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:status-workflow-123',
        oldStatus: 'draft',
        newStatus: 'review',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(statusChangeEvent1);

    // 2. Execution created triggers task status change ready → active
    const executionEvent: ExecutionCreatedEvent = {
      type: 'execution.created',
      timestamp: Date.now(),
      source: 'execution_adapter',
      payload: {
        executionId: 'execution:status-workflow-456',
        taskId: 'task:status-workflow-123',
        triggeredBy: 'human:test-user',
        isFirstExecution: true
      }
    };
    eventBus.publish(executionEvent);

    // 3. Task status changes from active → done
    const statusChangeEvent2: TaskStatusChangedEvent = {
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:status-workflow-123',
        oldStatus: 'active',
        newStatus: 'done',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(statusChangeEvent2);

    // 4. Changelog created triggers task status change done → archived
    const changelogEvent: ChangelogCreatedEvent = {
      type: 'changelog.created',
      timestamp: Date.now(),
      source: 'changelog_adapter',
      payload: {
        changelogId: 'changelog:status-workflow-789',
        entityId: 'task:status-workflow-123',
        entityType: 'task',
        changeType: 'completion',
        riskLevel: 'low',
        triggeredBy: 'human:test-user',
        title: 'Task status workflow completed',
        trigger: 'manual'
      }
    };
    eventBus.publish(changelogEvent);

    // Verify event flow
    expect(backlogHandler).toHaveBeenCalledWith(executionEvent);
    expect(backlogHandler).toHaveBeenCalledWith(changelogEvent);
    expect(executionHandler).toHaveBeenCalledWith(statusChangeEvent1);
    expect(executionHandler).toHaveBeenCalledWith(statusChangeEvent2);
    expect(changelogHandler).toHaveBeenCalledWith(statusChangeEvent1);
    expect(changelogHandler).toHaveBeenCalledWith(statusChangeEvent2);
  });

  it('[EARS-3] should handle cycle hierarchy events with parent-child relationships', () => {
    const backlogHandler = jest.fn();
    const metricsHandler = jest.fn();

    eventBus.subscribe<CycleCreatedEvent>('cycle.created', backlogHandler);
    eventBus.subscribe<CycleCreatedEvent>('cycle.created', metricsHandler);

    // Parent cycle created
    const parentCycleEvent: CycleCreatedEvent = {
      type: 'cycle.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        cycleId: 'cycle:parent-123',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(parentCycleEvent);

    // Child cycle created
    const childCycleEvent: CycleCreatedEvent = {
      type: 'cycle.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        cycleId: 'cycle:child-456',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(childCycleEvent);

    expect(backlogHandler).toHaveBeenCalledWith(parentCycleEvent);
    expect(backlogHandler).toHaveBeenCalledWith(childCycleEvent);
    expect(metricsHandler).toHaveBeenCalledWith(parentCycleEvent);
    expect(metricsHandler).toHaveBeenCalledWith(childCycleEvent);
  });

  it('[EARS-4] should handle feedback blocking workflow with task pausing', () => {
    const backlogHandler = jest.fn();
    const taskStatusHandler = jest.fn();

    // BacklogAdapter handles feedback events
    eventBus.subscribe<FeedbackCreatedEvent>('feedback.created', backlogHandler);
    eventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', taskStatusHandler);

    // 1. Blocking feedback created
    const blockingFeedbackEvent: FeedbackCreatedEvent = {
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: {
        feedbackId: 'feedback:blocking-123',
        entityType: 'task',
        entityId: 'task:blocked-task-456',
        type: 'blocking',
        status: 'open',
        content: 'Test feedback content',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(blockingFeedbackEvent);

    // 2. Task status changes to paused (would be emitted by BacklogAdapter)
    const taskPausedEvent: TaskStatusChangedEvent = {
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:blocked-task-456',
        oldStatus: 'active',
        newStatus: 'paused',
        triggeredBy: 'human:test-user'
      }
    };
    eventBus.publish(taskPausedEvent);

    expect(backlogHandler).toHaveBeenCalledWith(blockingFeedbackEvent);
    expect(taskStatusHandler).toHaveBeenCalledWith(taskPausedEvent);
  });

  it('[EARS-5] should handle system daily tick events for health monitoring', () => {
    const backlogHandler = jest.fn();
    const metricsHandler = jest.fn();
    const feedbackHandler = jest.fn();

    eventBus.subscribe<SystemDailyTickEvent>('system.daily_tick', backlogHandler);
    eventBus.subscribe<SystemDailyTickEvent>('system.daily_tick', metricsHandler);
    eventBus.subscribe<SystemDailyTickEvent>('system.daily_tick', feedbackHandler);

    const dailyTickEvent: SystemDailyTickEvent = {
      type: 'system.daily_tick',
      timestamp: Date.now(),
      source: 'system_scheduler',
      payload: {
        date: '2025-01-09'
      }
    };
    eventBus.publish(dailyTickEvent);

    expect(backlogHandler).toHaveBeenCalledWith(dailyTickEvent);
    expect(metricsHandler).toHaveBeenCalledWith(dailyTickEvent);
    expect(feedbackHandler).toHaveBeenCalledWith(dailyTickEvent);
  });

  it('[EARS-6] should handle high-frequency events without performance degradation', () => {
    const handler = jest.fn();
    eventBus.subscribe<ExecutionCreatedEvent>('execution.created', handler);

    const startTime = Date.now();
    const eventCount = 100;

    // Publish 100 execution events rapidly
    for (let i = 0; i < eventCount; i++) {
      const executionEvent: ExecutionCreatedEvent = {
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: {
          executionId: `execution:perf-test-${i}`,
          taskId: `task:perf-test-${Math.floor(i / 10)}`,
          triggeredBy: 'human:test-user',
          isFirstExecution: i % 10 === 0
        }
      };
      eventBus.publish(executionEvent);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(handler).toHaveBeenCalledTimes(eventCount);
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });

  it('[EARS-7] should maintain event ordering in complex workflows', () => {
    const eventOrder: string[] = [];

    const orderTracker = (eventType: string) => (event: any) => {
      eventOrder.push(`${eventType}:${event.payload.taskId || event.payload.cycleId}`);
    };

    // Subscribe to all relevant events
    eventBus.subscribe<TaskCreatedEvent>('task.created', orderTracker('task.created'));
    eventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', orderTracker('task.status.changed'));
    eventBus.subscribe<ExecutionCreatedEvent>('execution.created', orderTracker('execution.created'));
    eventBus.subscribe<ChangelogCreatedEvent>('changelog.created', orderTracker('changelog.created'));

    const taskId = 'task:order-test-123';

    // Publish events in expected workflow order
    eventBus.publish({
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: { taskId, actorId: 'human:test-user' }
    } as TaskCreatedEvent);

    eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: { taskId, oldStatus: 'draft', newStatus: 'ready', actorId: 'human:test-user' }
    } as TaskStatusChangedEvent);

    eventBus.publish({
      type: 'execution.created',
      timestamp: Date.now(),
      source: 'execution_adapter',
      payload: { executionId: 'execution:order-test-456', taskId, actorId: 'human:test-user', isFirstExecution: true }
    } as ExecutionCreatedEvent);

    eventBus.publish({
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: { taskId, oldStatus: 'ready', newStatus: 'active', actorId: 'human:test-user' }
    } as TaskStatusChangedEvent);

    eventBus.publish({
      type: 'changelog.created',
      timestamp: Date.now(),
      source: 'changelog_adapter',
      payload: { changelogId: 'changelog:order-test-789', taskId, actorId: 'human:test-user' }
    } as ChangelogCreatedEvent);

    // Verify events were processed in order
    expect(eventOrder).toEqual([
      `task.created:${taskId}`,
      `task.status.changed:${taskId}`,
      `execution.created:${taskId}`,
      `task.status.changed:${taskId}`,
      `changelog.created:${taskId}`
    ]);
  });

  // ==========================================
  // EARS-8 to EARS-12: Error Handling & Resilience
  // ==========================================

  it('[EARS-8] should isolate adapter failures from affecting other adapters', async () => {
    const successfulHandler = jest.fn().mockResolvedValue(undefined);
    const failingHandler = jest.fn().mockRejectedValue(new Error('Adapter failure'));
    const anotherSuccessfulHandler = jest.fn().mockResolvedValue(undefined);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    eventBus.subscribe<TaskCreatedEvent>('task.created', successfulHandler);
    eventBus.subscribe<TaskCreatedEvent>('task.created', failingHandler);
    eventBus.subscribe<TaskCreatedEvent>('task.created', anotherSuccessfulHandler);

    const taskEvent: TaskCreatedEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:error-isolation-123',
        triggeredBy: 'human:test-user'
      }
    };

    eventBus.publish(taskEvent);

    // Wait for async handlers
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(successfulHandler).toHaveBeenCalledWith(taskEvent);
    expect(failingHandler).toHaveBeenCalledWith(taskEvent);
    expect(anotherSuccessfulHandler).toHaveBeenCalledWith(taskEvent);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in event handler for task.created:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('[EARS-9] should handle subscription cleanup during event processing', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const selfUnsubscribingHandler = jest.fn().mockImplementation(() => {
      eventBus.unsubscribe(subscription.id);
    });

    eventBus.subscribe<TaskCreatedEvent>('task.created', handler1);
    const subscription = eventBus.subscribe<TaskCreatedEvent>('task.created', selfUnsubscribingHandler);
    eventBus.subscribe<TaskCreatedEvent>('task.created', handler2);

    const taskEvent: TaskCreatedEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:cleanup-test-123',
        triggeredBy: 'human:test-user'
      }
    };

    eventBus.publish(taskEvent);

    expect(handler1).toHaveBeenCalledWith(taskEvent);
    expect(selfUnsubscribingHandler).toHaveBeenCalledWith(taskEvent);
    expect(handler2).toHaveBeenCalledWith(taskEvent);
    expect(eventBus.getSubscriptionCount('task.created')).toBe(2); // One unsubscribed
  });

  it('[EARS-10] should handle rapid subscription and unsubscription cycles', () => {
    const handler = jest.fn();
    const subscriptions: any[] = [];

    // Create and remove subscriptions rapidly
    for (let i = 0; i < 10; i++) {
      const subscription = eventBus.subscribe(`test.event.${i}`, handler);
      subscriptions.push(subscription);

      if (i % 2 === 0) {
        eventBus.unsubscribe(subscription.id);
      }
    }

    expect(eventBus.getSubscriptions()).toHaveLength(5); // 5 remaining subscriptions

    // Publish events to remaining subscriptions
    for (let i = 1; i < 10; i += 2) {
      eventBus.publish({
        type: `test.event.${i}`,
        timestamp: Date.now(),
        payload: { index: i },
        source: 'test'
      });
    }

    expect(handler).toHaveBeenCalledTimes(5);
  });

  it('[EARS-11] should maintain performance under subscription churn', () => {
    const startTime = Date.now();
    const subscriptions: any[] = [];
    const handler = jest.fn();

    // Create many subscriptions
    for (let i = 0; i < 100; i++) {
      subscriptions.push(eventBus.subscribe('churn.test', handler));
    }

    // Remove half of them
    for (let i = 0; i < 50; i++) {
      eventBus.unsubscribe(subscriptions[i].id);
    }

    // Publish event to remaining subscriptions
    eventBus.publish({
      type: 'churn.test',
      timestamp: Date.now(),
      payload: { test: 'churn' },
      source: 'test'
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(handler).toHaveBeenCalledTimes(50); // Only remaining subscriptions
    expect(duration).toBeLessThan(100); // Should be fast
    expect(eventBus.getSubscriptionCount('churn.test')).toBe(50);
  });

  it('[EARS-12] should handle complex multi-adapter coordination scenarios', () => {
    // Simulate a complex scenario where multiple adapters coordinate
    const backlogHandler = jest.fn();
    const metricsHandler = jest.fn();

    // Set up cross-adapter subscriptions
    eventBus.subscribe<TaskCreatedEvent>('task.created', metricsHandler);
    eventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', metricsHandler);
    eventBus.subscribe<ExecutionCreatedEvent>('execution.created', backlogHandler);
    eventBus.subscribe<FeedbackCreatedEvent>('feedback.created', backlogHandler);
    eventBus.subscribe<ChangelogCreatedEvent>('changelog.created', backlogHandler);

    // Complex workflow simulation
    const taskId = 'task:complex-coordination-123';

    // 1. Task created
    eventBus.publish({
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: { taskId, actorId: 'human:test-user' }
    } as TaskCreatedEvent);

    // 2. Multiple executions created
    for (let i = 0; i < 3; i++) {
      eventBus.publish({
        type: 'execution.created',
        timestamp: Date.now(),
        source: 'execution_adapter',
        payload: { executionId: `execution:complex-${i}`, taskId, actorId: 'human:test-user', isFirstExecution: i === 0 }
      } as ExecutionCreatedEvent);
    }

    // 3. Feedback created and resolved
    eventBus.publish({
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: { feedbackId: 'feedback:complex-123', entityType: 'task', entityId: taskId, feedbackType: 'review', actorId: 'human:test-user' }
    } as FeedbackCreatedEvent);

    // 4. Task completed
    eventBus.publish({
      type: 'changelog.created',
      timestamp: Date.now(),
      source: 'changelog_adapter',
      payload: { changelogId: 'changelog:complex-123', taskId, actorId: 'human:test-user' }
    } as ChangelogCreatedEvent);

    // Verify all coordination happened correctly
    expect(metricsHandler).toHaveBeenCalledTimes(1); // task.created
    expect(backlogHandler).toHaveBeenCalledTimes(5); // 3 executions + 1 feedback + 1 changelog
  });
});
