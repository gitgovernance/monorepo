/**
 * Event Bus Module - The Nervous System of GitGovernance
 * 
 * This module provides the event-driven architecture foundation that enables
 * decoupled communication between adapters and other system components.
 * 
 * Key Components:
 * - EventBus: Local in-memory event bus implementation
 * - IEventStream: Interface for both local and global bus implementations
 * - Type definitions: Complete type safety for all GitGovernance events
 * - Helper functions: Type-safe event publishing and subscription
 * 
 * Architecture:
 * - Producers (Adapters) emit events without knowing consumers
 * - Consumers (Motors/Handlers) subscribe to specific event types
 * - Events are delivered asynchronously with error isolation
 * - Supports both targeted subscriptions and wildcard monitoring
 */

// Core EventBus implementation
export {
  EventBus,
  eventBus,
  publishEvent,
  subscribeToEvent
} from './event_bus';

export type { IEventStream } from './event_bus';

// Type definitions
export type {
  BaseEvent,
  GitGovEvent,
  EventHandler,
  EventSubscription,
  EventMetadata,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  CycleCreatedEvent,
  CycleStatusChangedEvent,
  ExecutionCreatedEvent,
  FeedbackCreatedEvent,
  FeedbackStatusChangedEvent,
  ChangelogCreatedEvent,
  ActorCreatedEvent,
  ActorRevokedEvent,
  AgentRegisteredEvent,
  SystemDailyTickEvent
} from './types';

// Re-export everything from types for convenience
export * from './types';
