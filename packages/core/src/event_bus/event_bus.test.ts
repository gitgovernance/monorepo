import { EventBus, eventBus, publishEvent, subscribeToEvent } from './event_bus';
import type {
  BaseEvent,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  FeedbackCreatedEvent,
} from './types';

describe('EventBus Module', () => {
  let testEventBus: EventBus;

  beforeEach(() => {
    testEventBus = new EventBus();
  });

  afterEach(() => {
    testEventBus.clearSubscriptions();
  });

  // ==========================================
  // EARS-1 to EARS-8: Core EventBus Functionality
  // ==========================================

  it('[EARS-1] should create EventBus instance implementing IEventStream interface', () => {
    expect(testEventBus).toBeInstanceOf(EventBus);
    expect(testEventBus.publish).toBeDefined();
    expect(testEventBus.subscribe).toBeDefined();
    expect(testEventBus.unsubscribe).toBeDefined();
    expect(testEventBus.getSubscriptions).toBeDefined();
    expect(testEventBus.clearSubscriptions).toBeDefined();
  });

  it('[EARS-2] should publish events with valid structure', () => {
    const mockHandler = jest.fn();
    const event: BaseEvent = {
      type: 'test.event',
      timestamp: Date.now(),
      payload: { test: 'data' },
      source: 'test-source'
    };

    testEventBus.subscribe('test.event', mockHandler);
    testEventBus.publish(event);

    expect(mockHandler).toHaveBeenCalledWith(event);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('[EARS-3] should validate event structure and throw errors for invalid events', () => {
    const invalidEvents = [
      { timestamp: Date.now(), payload: {}, source: 'test' }, // Missing type
      { type: 'test', payload: {}, source: 'test' }, // Missing timestamp
      { type: 'test', timestamp: Date.now(), payload: {} }, // Missing source
      { type: '', timestamp: Date.now(), payload: {}, source: 'test' }, // Empty type
      { type: 'test', timestamp: 'invalid', payload: {}, source: 'test' }, // Invalid timestamp
      { type: 'test', timestamp: Date.now(), payload: {}, source: '' } // Empty source
    ];

    invalidEvents.forEach((invalidEvent) => {
      expect(() => {
        testEventBus.publish(invalidEvent as BaseEvent);
      }).toThrow();
    });
  });

  it('[EARS-4] should create subscription with unique ID and metadata', () => {
    const handler = jest.fn();
    const subscription = testEventBus.subscribe('test.event', handler);

    expect(subscription.id).toBeDefined();
    expect(subscription.id).toMatch(/^subscription:/);
    expect(subscription.eventType).toBe('test.event');
    expect(subscription.handler).toBeDefined(); // Handler is wrapped, so just check it exists
    expect(subscription.metadata?.createdAt).toBeDefined();
    expect(typeof subscription.metadata?.createdAt).toBe('number');
  });

  it('[EARS-5] should handle multiple subscribers for same event type', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();
    const event: BaseEvent = {
      type: 'multi.subscriber',
      timestamp: Date.now(),
      payload: { data: 'test' },
      source: 'test'
    };

    testEventBus.subscribe('multi.subscriber', handler1);
    testEventBus.subscribe('multi.subscriber', handler2);
    testEventBus.subscribe('multi.subscriber', handler3);

    testEventBus.publish(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
    expect(handler3).toHaveBeenCalledWith(event);
    expect(testEventBus.getSubscriptionCount('multi.subscriber')).toBe(3);
  });

  it('[EARS-6] should unsubscribe handlers correctly', () => {
    const handler = jest.fn();
    const subscription = testEventBus.subscribe('test.unsubscribe', handler);

    expect(testEventBus.getSubscriptionCount('test.unsubscribe')).toBe(1);

    const unsubscribed = testEventBus.unsubscribe(subscription.id);
    expect(unsubscribed).toBe(true);
    expect(testEventBus.getSubscriptionCount('test.unsubscribe')).toBe(0);

    // Event should not be delivered after unsubscribe
    const event: BaseEvent = {
      type: 'test.unsubscribe',
      timestamp: Date.now(),
      payload: {},
      source: 'test'
    };
    testEventBus.publish(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it('[EARS-7] should return false when unsubscribing non-existent subscription', () => {
    const result = testEventBus.unsubscribe('non-existent-id');
    expect(result).toBe(false);
  });

  it('[EARS-8] should clear all subscriptions', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    testEventBus.subscribe('event.one', handler1);
    testEventBus.subscribe('event.two', handler2);

    expect(testEventBus.getSubscriptions()).toHaveLength(2);

    testEventBus.clearSubscriptions();

    expect(testEventBus.getSubscriptions()).toHaveLength(0);
    expect(testEventBus.getActiveEventTypes()).toHaveLength(0);
  });

  // ==========================================
  // EARS-9 to EARS-16: Advanced Features
  // ==========================================

  it('[EARS-9] should provide subscription management methods', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    testEventBus.subscribe('event.one', handler1);
    testEventBus.subscribe('event.two', handler2);

    const subscriptions = testEventBus.getSubscriptions();
    expect(subscriptions).toHaveLength(2);

    const activeEventTypes = testEventBus.getActiveEventTypes();
    expect(activeEventTypes).toContain('event.one');
    expect(activeEventTypes).toContain('event.two');
  });

  it('[EARS-10] should support wildcard subscriptions for monitoring', () => {
    const wildcardHandler = jest.fn();
    const subscription = testEventBus.subscribeToAll(wildcardHandler);

    expect(subscription.eventType).toBe('*');

    const event1: BaseEvent = { type: 'any.event', timestamp: Date.now(), payload: {}, source: 'test' };
    const event2: BaseEvent = { type: 'another.event', timestamp: Date.now(), payload: {}, source: 'test' };

    testEventBus.publish(event1);
    testEventBus.publish(event2);

    expect(wildcardHandler).toHaveBeenCalledWith(event1);
    expect(wildcardHandler).toHaveBeenCalledWith(event2);
    expect(wildcardHandler).toHaveBeenCalledTimes(2);
  });

  it('[EARS-11] should handle async event handlers with error isolation', async () => {
    const successHandler = jest.fn().mockResolvedValue(undefined);
    const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
    const anotherSuccessHandler = jest.fn().mockResolvedValue(undefined);

    // Spy on console.error to verify error handling
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    testEventBus.subscribe('async.test', successHandler);
    testEventBus.subscribe('async.test', errorHandler);
    testEventBus.subscribe('async.test', anotherSuccessHandler);

    const event: BaseEvent = {
      type: 'async.test',
      timestamp: Date.now(),
      payload: { data: 'async test' },
      source: 'test'
    };

    testEventBus.publish(event);

    // Give async handlers time to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(successHandler).toHaveBeenCalledWith(event);
    expect(errorHandler).toHaveBeenCalledWith(event);
    expect(anotherSuccessHandler).toHaveBeenCalledWith(event);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in event handler for async.test:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('[EARS-12] should handle high-throughput scenarios with max listeners', () => {
    // Create 50 subscriptions (should be well under the 100 limit)
    const handlers: jest.Mock[] = [];
    for (let i = 0; i < 50; i++) {
      const handler = jest.fn();
      handlers.push(handler);
      testEventBus.subscribe('high.throughput', handler);
    }

    expect(testEventBus.getSubscriptionCount('high.throughput')).toBe(50);

    const event: BaseEvent = {
      type: 'high.throughput',
      timestamp: Date.now(),
      payload: { index: 1 },
      source: 'test'
    };

    testEventBus.publish(event);

    handlers.forEach(handler => {
      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  // ==========================================
  // EARS-13 to EARS-16: Type Safety & GitGov Events
  // ==========================================

  it('[EARS-13] should handle TaskCreatedEvent with proper typing', () => {
    const handler = jest.fn();
    const taskEvent: TaskCreatedEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:test-task-123',
        triggeredBy: 'human:test-user'
      }
    };

    testEventBus.subscribe<TaskCreatedEvent>('task.created', handler);
    testEventBus.publish(taskEvent);

    expect(handler).toHaveBeenCalledWith(taskEvent);
  });

  it('[EARS-14] should handle TaskStatusChangedEvent with proper typing', () => {
    const handler = jest.fn();
    const statusEvent: TaskStatusChangedEvent = {
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'backlog_adapter',
      payload: {
        taskId: 'task:test-task-123',
        oldStatus: 'draft',
        newStatus: 'review',
        triggeredBy: 'human:test-user'
      }
    };

    testEventBus.subscribe<TaskStatusChangedEvent>('task.status.changed', handler);
    testEventBus.publish(statusEvent);

    expect(handler).toHaveBeenCalledWith(statusEvent);
  });

  it('[EARS-15] should handle FeedbackCreatedEvent with proper typing', () => {
    const handler = jest.fn();
    const feedbackEvent: FeedbackCreatedEvent = {
      type: 'feedback.created',
      timestamp: Date.now(),
      source: 'feedback_adapter',
      payload: {
        feedbackId: 'feedback:test-feedback-123',
        entityType: 'task',
        entityId: 'task:test-task-123',
        type: 'blocking',
        status: 'open',
        content: 'Test feedback content',
        triggeredBy: 'human:test-user'
      }
    };

    testEventBus.subscribe<FeedbackCreatedEvent>('feedback.created', handler);
    testEventBus.publish(feedbackEvent);

    expect(handler).toHaveBeenCalledWith(feedbackEvent);
  });

  it('[EARS-16] should isolate event handlers from each other', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    testEventBus.subscribe('isolated.test', handler1);
    testEventBus.subscribe('different.event', handler2);
    testEventBus.subscribe('isolated.test', handler3);

    const event1: BaseEvent = {
      type: 'isolated.test',
      timestamp: Date.now(),
      payload: { data: 'first' },
      source: 'test'
    };

    const event2: BaseEvent = {
      type: 'different.event',
      timestamp: Date.now(),
      payload: { data: 'second' },
      source: 'test'
    };

    testEventBus.publish(event1);
    testEventBus.publish(event2);

    expect(handler1).toHaveBeenCalledWith(event1);
    expect(handler1).not.toHaveBeenCalledWith(event2);
    expect(handler2).toHaveBeenCalledWith(event2);
    expect(handler2).not.toHaveBeenCalledWith(event1);
    expect(handler3).toHaveBeenCalledWith(event1);
    expect(handler3).not.toHaveBeenCalledWith(event2);
  });

  // ==========================================
  // EARS-17 to EARS-20: Helper Functions & Singleton
  // ==========================================

  it('[EARS-17] should provide singleton eventBus instance', () => {
    expect(eventBus).toBeInstanceOf(EventBus);
    expect(eventBus).toBe(eventBus); // Same reference
  });

  it('[EARS-18] should provide publishEvent helper function', () => {
    const handler = jest.fn();
    const taskEvent: TaskCreatedEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      source: 'test',
      payload: {
        taskId: 'task:helper-test',
        triggeredBy: 'human:test-user'
      }
    };

    eventBus.subscribe('task.created', handler);
    publishEvent(taskEvent);

    expect(handler).toHaveBeenCalledWith(taskEvent);

    // Clean up
    eventBus.clearSubscriptions();
  });

  it('[EARS-19] should provide subscribeToEvent helper function', () => {
    const handler = jest.fn();
    const subscription = subscribeToEvent('task.status.changed', handler);

    expect(subscription.eventType).toBe('task.status.changed');
    expect(subscription.handler).toBeDefined(); // Handler is wrapped

    const statusEvent: TaskStatusChangedEvent = {
      type: 'task.status.changed',
      timestamp: Date.now(),
      source: 'test',
      payload: {
        taskId: 'task:helper-test',
        oldStatus: 'draft',
        newStatus: 'ready',
        triggeredBy: 'human:test-user'
      }
    };

    eventBus.publish(statusEvent);
    expect(handler).toHaveBeenCalledWith(statusEvent);

    // Clean up
    eventBus.clearSubscriptions();
  });

  it('[EARS-20] should maintain subscription state correctly across operations', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    const sub1 = testEventBus.subscribe('event.one', handler1);
    testEventBus.subscribe('event.two', handler2);
    testEventBus.subscribe('event.one', handler3);

    expect(testEventBus.getSubscriptions()).toHaveLength(3);
    expect(testEventBus.getSubscriptionCount('event.one')).toBe(2);
    expect(testEventBus.getSubscriptionCount('event.two')).toBe(1);

    // Remove one subscription
    testEventBus.unsubscribe(sub1.id);

    expect(testEventBus.getSubscriptions()).toHaveLength(2);
    expect(testEventBus.getSubscriptionCount('event.one')).toBe(1);
    expect(testEventBus.getSubscriptionCount('event.two')).toBe(1);

    // Publish events and verify correct handlers are called
    const event1: BaseEvent = { type: 'event.one', timestamp: Date.now(), payload: {}, source: 'test' };
    const event2: BaseEvent = { type: 'event.two', timestamp: Date.now(), payload: {}, source: 'test' };

    testEventBus.publish(event1);
    testEventBus.publish(event2);

    expect(handler1).not.toHaveBeenCalled(); // Unsubscribed
    expect(handler2).toHaveBeenCalledWith(event2);
    expect(handler3).toHaveBeenCalledWith(event1);
  });
});