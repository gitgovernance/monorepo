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

  constructor() {
    this.emitter = new EventEmitter();
    this.subscriptions = new Map();

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

    // Wrap handler to catch errors and provide context
    const wrappedHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
        // In production, this could emit an error event or log to monitoring
      }
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
