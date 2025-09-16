# Requirements Document

## Introduction

The Feedback Adapter is the **communication facilitator** of the GitGovernance system. It manages `FeedbackRecords` to enable structured communication (assignments, reviews, questions, blockers) between actors. It implements the rules from `feedback_protocol.md` and emits a dual event stream (`feedback.created`, `feedback.status.changed`) for system-wide coordination.

## Requirements

### Initiative 1: Record Creation & Lifecycle

**User Story:** As a system actor, I want to create and resolve feedback to manage the communication lifecycle around a piece of work.

#### Acceptance Criteria
1.  WHEN `create()` is called with a valid payload, THEN the system SHALL construct, sign, persist a `FeedbackRecord` with `status: "open"`, and emit a `feedback.created` event.
2.  WHEN `resolve()` is called on an open feedback record, THEN the system SHALL update its `status` to `"resolved"`, add a new signature, persist it, and emit a `feedback.status.changed` event.
3.  WHEN `create()` is called with an invalid payload (e.g., invalid `entityType` or missing `content`), THEN the system SHALL throw a `DetailedValidationError` or `RecordNotFoundError`.
4.  WHEN `resolve()` is called on an already resolved or non-existent feedback, THEN the system SHALL throw a `ProtocolViolationError` or `RecordNotFoundError`.

### Initiative 2: Record Query & Retrieval

**User Story:** As a system component, I want to retrieve feedback records to understand the communication history of an entity.

#### Acceptance Criteria
1.  WHEN `getFeedback()` is called with an existing ID, THEN the system SHALL return the corresponding `FeedbackRecord`.
2.  WHEN `getFeedbackByEntity()` is called, THEN the system SHALL return a filtered array of all `FeedbackRecords` for that entity.
3.  WHEN `getAllFeedback()` is called, THEN the system SHALL return an array of all `FeedbackRecords` in the system.

### Initiative 3: System Integration & Performance

**User Story:** As a developer, I want a reliable and performant adapter that integrates seamlessly with the ecosystem.

#### Acceptance Criteria
1.  WHEN the adapter is instantiated without optional dependencies (like `workflowMethodology`), THEN it **must** operate gracefully without permission validation.
2.  WHEN any method is called, THEN it **must** execute in under 50ms for typical datasets.
3.  WHEN implemented, the adapter **must** be fully type-safe with no `any` types.