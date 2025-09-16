/**
 * Modules - Specialized GitGovernance Components
 * 
 * This directory contains specialized modules that provide advanced
 * functionality for the GitGovernance ecosystem:
 * 
 * - EventBusModule: Event-driven architecture foundation
 * - WorkflowMethodologyModule: Configurable workflow validation engine
 * - DiagramGenerator: Mermaid diagram generation utilities
 * 
 * Each module is designed to be:
 * - Self-contained with minimal dependencies
 * - Highly testable with comprehensive EARS coverage
 * - Extensible for future enhancements
 * - Performance-optimized for production use
 */

// Event Bus Module - The Nervous System
export * as EventBus from "./event_bus_module";

// Diagram Generator - Visualization Utilities
export * as DiagramGenerator from "./diagram_generator";

// Re-export commonly used types and classes for convenience
export {
  EventBus as EventBusClass,
  eventBus,
  publishEvent,
  subscribeToEvent
} from "./event_bus_module";

export type { IEventStream } from "./event_bus_module";

export type {
  GitGovEvent,
  BaseEvent,
  EventHandler,
  EventSubscription,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  CycleCreatedEvent,
  CycleStatusChangedEvent,
  ExecutionCreatedEvent,
  FeedbackCreatedEvent,
  FeedbackStatusChangedEvent,
  ChangelogCreatedEvent,
  SystemDailyTickEvent
} from "./event_bus_module";
