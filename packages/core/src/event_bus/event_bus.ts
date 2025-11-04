import { EventEmitter } from 'events';

import type {
  BaseEvent,
  GitGovEvent,
  EventHandler,
  EventSubscription
} from './types';

// Generate unique subscription IDs
function generateSubscriptionId(): string {
  return `subscription:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Event Stream interface - Contract for both Local and Global bus implementations
 */
export interface IEventStream {
  /**
   * Publish an event to the bus
   */
  publish(event: BaseEvent): void;

  /**
   * Subscribe to events of a specific type
   */
  subscribe<T extends BaseEvent = BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): EventSubscription;

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean;

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): EventSubscription[];

  /**
   * Clear all subscriptions (for testing/cleanup)
   */
  clearSubscriptions(): void;

  /**
   * Wait for all pending event handlers to complete (for testing)
   */
  waitForIdle(options?: { timeout?: number }): Promise<void>;
}

/**
 * Local EventBus implementation using Node.js EventEmitter
 * 
 * This is the "Free Tier" implementation that operates in-memory
 * and provides synchronous event delivery for local-first usage.
 * 
 * Design Principles:
 * - Decoupled Producers: Adapters emit events without knowing consumers
 * - Pluggable Consumers: Event handlers can be added/removed dynamically  
 * - Type Safety: Full TypeScript support for all event types
 * - Performance: In-memory delivery with minimal overhead
 */
export class EventBus implements IEventStream {
  private emitter: EventEmitter;
  private subscriptions: Map<string, EventSubscription>;
  private pendingHandlers: Set<Promise<void>>;

  constructor() {
    this.emitter = new EventEmitter();
    this.subscriptions = new Map();
    this.pendingHandlers = new Set();

    // Increase max listeners for high-throughput scenarios
    this.emitter.setMaxListeners(100);
  }

  /**
   * Publish an event to all subscribers
   * 
   * @param event - The event to publish
   */
  publish(event: BaseEvent): void {
    // Validate event structure
    if (!event.type || typeof event.type !== 'string') {
      throw new Error('Event must have a valid type string');
    }

    if (!event.timestamp || typeof event.timestamp !== 'number') {
      throw new Error('Event must have a valid timestamp number');
    }

    if (!event.source || typeof event.source !== 'string') {
      throw new Error('Event must have a valid source string');
    }

    // Emit the event
    this.emitter.emit(event.type, event);

    // Also emit on wildcard for debugging/monitoring
    this.emitter.emit('*', event);
  }

  /**
   * Subscribe to events of a specific type
   * 
   * @param eventType - The event type to subscribe to
   * @param handler - The handler function to call when event is received
   * @returns EventSubscription object with subscription details
   */
  subscribe<T extends BaseEvent = BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): EventSubscription {
    // Generate unique subscription ID
    const subscriptionId = generateSubscriptionId();

    // Wrap handler to catch errors, provide context, AND track pending handlers
    const wrappedHandler = async (event: T) => {
      // Create promise that tracks this handler execution
      const handlerPromise = (async () => {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
          // In production, this could emit an error event or log to monitoring
        }
      })();

      // Track this promise
      this.pendingHandlers.add(handlerPromise);

      // Remove from tracking when done
      handlerPromise.finally(() => {
        this.pendingHandlers.delete(handlerPromise);
      });

      // Don't await - let it run in background (fire-and-forget for publish())
      // But tests can call waitForIdle() to wait for all handlers
    };

    // Create subscription object (store wrapped handler for unsubscribing)
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler: wrappedHandler as EventHandler, // Store wrapped handler
      metadata: {
        createdAt: Date.now()
      }
    };

    // Register with EventEmitter
    this.emitter.on(eventType, wrappedHandler);

    // Store subscription for management
    this.subscriptions.set(subscriptionId, subscription);

    return subscription;
  }

  /**
   * Unsubscribe from events
   * 
   * @param subscriptionId - The subscription ID to remove
   * @returns true if subscription was found and removed, false otherwise
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Remove from EventEmitter
    this.emitter.removeListener(subscription.eventType, subscription.handler);

    // Remove from our tracking
    this.subscriptions.delete(subscriptionId);

    return true;
  }

  /**
   * Get all active subscriptions
   * 
   * @returns Array of all active subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Clear all subscriptions (for testing/cleanup)
   */
  clearSubscriptions(): void {
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
  }

  /**
   * Get subscription count for a specific event type
   * 
   * @param eventType - The event type to count subscribers for
   * @returns Number of active subscriptions for the event type
   */
  getSubscriptionCount(eventType: string): number {
    return this.emitter.listenerCount(eventType);
  }

  /**
   * Get all event types that have active subscriptions
   * 
   * @returns Array of event types with active subscriptions
   */
  getActiveEventTypes(): string[] {
    return this.emitter.eventNames() as string[];
  }

  /**
   * Subscribe to all events (wildcard subscription)
   * Useful for debugging, monitoring, or logging
   * 
   * @param handler - Handler that will receive all events
   * @returns EventSubscription object
   */
  subscribeToAll(handler: EventHandler<BaseEvent>): EventSubscription {
    return this.subscribe('*', handler);
  }

  /**
   * Wait for all pending event handlers to complete.
   * This is primarily useful for testing to ensure event handlers finish before assertions.
   * 
   * In production, events are fire-and-forget for performance.
   * In tests, use this to synchronize and avoid race conditions.
   * 
   * @param options - Optional configuration
   * @param options.timeout - Maximum time to wait in ms (default: 5000)
   * @returns Promise that resolves when all handlers complete or timeout occurs
   * 
   * @example
   * ```typescript
   * await feedbackAdapter.create(...);  // publishes event
   * await eventBus.waitForIdle();       // wait for BacklogAdapter.handleFeedbackCreated()
   * const task = await backlogAdapter.getTask(taskId);
   * expect(task.status).toBe('paused'); // now safe to assert
   * ```
   */
  async waitForIdle(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 5000;
    const startTime = Date.now();

    while (this.pendingHandlers.size > 0) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        const pendingCount = this.pendingHandlers.size;
        console.warn(`EventBus.waitForIdle() timeout after ${timeout}ms with ${pendingCount} handlers still pending`);
        break;
      }

      // Wait for current batch of handlers
      if (this.pendingHandlers.size > 0) {
        await Promise.race([
          Promise.all(Array.from(this.pendingHandlers)),
          new Promise(resolve => setTimeout(resolve, 10)) // Re-check every 10ms
        ]);
      }
    }
  }
}

/**
 * Singleton instance for application-wide event bus usage
 */
export const eventBus = new EventBus();

/**
 * Type-safe event publisher helper
 * Ensures events conform to GitGovEvent union type
 */
export function publishEvent(event: GitGovEvent): void {
  eventBus.publish(event);
}

/**
 * Type-safe event subscriber helper
 * Provides better TypeScript inference for specific event types
 */
export function subscribeToEvent<T extends GitGovEvent>(
  eventType: T['type'],
  handler: EventHandler<T>
): EventSubscription {
  return eventBus.subscribe(eventType, handler);
}
