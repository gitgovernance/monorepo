# Design Document

## Overview

The Event Bus is the **nervous system** of the GitGovernance ecosystem, providing a fully decoupled communication layer. It allows "producer" adapters to broadcast significant state changes without any knowledge of the "consumer" adapters that might be listening. This is the core of our event-driven architecture.

## Architecture

The module implements a classic **pub/sub (publish-subscribe)** pattern.

```mermaid
graph TD
    subgraph "Producers (Adapters)"
        P1[BacklogAdapter]
        P2[IdentityAdapter]
        P3[...]
    end

    subgraph "Event Bus Module"
        EB[EventBus (Singleton)]
    end

    subgraph "Consumers (Adapters / UI)"
        C1[BacklogAdapter]
        C2[Dashboard TUI]
        C3[...]
    end

    P1 -- Publishes --> EB
    P2 -- Publishes --> EB

    EB -- Notifies --> C1
    EB -- Notifies --> C2
```

### Key Concepts

- **Dual Bus Architecture**: The `IEventStream` interface allows for two implementations: a local `EventEmitter` for the CLI and a cloud-based `Pub/Sub` for the premium platform, without changing the consumer/producer code.
- **Hybrid Pattern (Singleton + DI)**:
  - **Producers** use a simple, global `publishEvent()` function.
  - **Consumers** receive the `IEventStream` instance via dependency injection in their constructor to facilitate testing.

## Components and Interfaces

### `IEventStream` Interface

This is the canonical interface that both the local and global bus implementations adhere to.

```typescript
interface IEventStream {
  publish(event: BaseEvent): void;
  subscribe<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): EventSubscription;
  unsubscribe(subscriptionId: string): boolean;
}
```

### `EventBus` Class

The in-memory implementation used by the local CLI. It includes management features like `getSubscriptionCount()` and `subscribeToAll()` for debugging.

## Data Models

### Canonical Event Catalog

All events are strongly typed and collected in a `GitGovEvent` union type. There are currently 9 canonical event types, including:

- `task.created`
- `task.status.changed`
- `feedback.created`
- `feedback.status.changed`
- `execution.created`
- ...and others.

Each event has a `type`, `timestamp`, `source`, and a specific `payload`.

## Error Handling

- **Error Isolation**: The `EventBus` wraps all handler executions in a `try/catch` block. A failure in one subscriber will be logged but **will not** prevent other subscribers from receiving and processing the event. This ensures system robustness.
- **Type Safety**: The bus validates event structures at publish time to enforce type safety.

## Testing Strategy

- **Unit Tests**: Test core pub/sub functionality, subscription management, and error isolation
- **Integration Tests**: Verify event flow between adapters and proper dependency injection
- **Type Safety Tests**: Validate event schema enforcement and TypeScript type checking
- **Error Handling Tests**: Ensure failing handlers don't affect other subscribers
- **Performance Tests**: Verify event delivery performance under load with multiple subscribers
