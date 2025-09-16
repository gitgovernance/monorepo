# Requirements Document

## Introduction

The BacklogAdapter is the central **orchestrator** for task and cycle lifecycle management in GitGovernance. It acts as a **Facade/Mediator** that coordinates between data protocols (`Task`, `Cycle`) and business rule protocols (`WorkflowMethodology`). It contains no business logic itself, instead delegating all decisions to configurable methodologies and specialized adapters.

## Requirements

### Initiative 1: Task & Cycle Lifecycle Management

**User Story:** As a user, I want to manage the complete lifecycle of tasks and cycles, from creation to completion, according to predefined workflows.

#### Acceptance Criteria

1.  WHEN `createTask` or `createCycle` is called, THEN the system SHALL create, sign, persist the record, and emit a creation event.
2.  WHEN `submitTask` or `approveTask` is called, THEN the system SHALL delegate validation to the `WorkflowMethodology` before changing the task's state and emitting an event.
3.  WHEN `addTaskToCycle` is called, THEN a bidirectional link **must** be created between the task and cycle records.
4.  WHEN `getTasksAssignedToActor` is called, THEN the system SHALL query the `FeedbackStore` to find `assignment` records and return the corresponding tasks.

### Initiative 2: Event-Driven Orchestration

**User Story:** As a system, I want the backlog to react automatically to events from other domains to maintain a consistent and up-to-date state.

#### Acceptance Criteria

1.  WHEN a `feedback.created` event with type `blocking` is received, THEN the corresponding task **must** be paused.
2.  WHEN a `feedback.status.changed` event resolves the last blocking feedback on a task, THEN the task **must** be resumed.
3.  WHEN an `execution.created` event is received for the _first_ time for a `ready` task, THEN the task **must** be transitioned to `active`.
4.  WHEN a `changelog.created` event is received for a `done` task, THEN the task **must** be transitioned to `archived`.
5.  WHEN a `system.daily_tick` event is received, THEN the adapter **must** use the `MetricsAdapter` to audit the health of active tasks.

### Initiative 3: System Health & Integration

**User Story:** As a developer, I want a central point to query the overall health and status of the project backlog.

#### Acceptance Criteria

1.  WHEN `getSystemStatus` or `getTaskHealth` is called, THEN the adapter **must** delegate the calculation to the `MetricsAdapter` and enrich the results with its own context.
2.  WHEN instantiated, the adapter **must** accept all its dependencies (other adapters and stores) via dependency injection.
3.  WHEN any operation is performed, it **must** complete in under 100ms for typical datasets.
