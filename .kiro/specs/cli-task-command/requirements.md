# Requirements Document

## Introduction

The `gitgov task` command is the operational heart of GitGovernance, providing the primary interface for actors to interact with the task backlog. It includes 8 subcommands for full lifecycle management, integrating with core adapters for logic and caching.

## Requirements

### Initiative 1: Core Task Lifecycle

**User Story:** As a user, I want to create, view, and modify tasks throughout their lifecycle.

#### Acceptance Criteria

1.  WHEN `gitgov task new` is used, THEN the system SHALL open `$EDITOR` (or use flags) to create a new `TaskRecord` by delegating to the `BacklogAdapter`.
2.  WHEN `gitgov task list` is used, THEN the system SHALL display tasks from the `IndexerAdapter` cache for high performance, with advanced filtering options.
3.  WHEN `gitgov task show <id>` is used, THEN the system SHALL display enriched details for a specific task, including derived states and health data from the `MetricsAdapter`.
4.  WHEN `gitgov task edit <id>` is used, THEN the system SHALL allow modification of task fields, respecting the immutability rule for the description field.

### Initiative 2: Workflow & Collaboration

**User Story:** As a team member, I want to move tasks through our defined workflow and assign them to other actors.

#### Acceptance Criteria

1.  WHEN `gitgov task submit <id>` or `gitgov task approve <id>` is used, THEN the system SHALL delegate to the `BacklogAdapter`, which uses the `WorkflowMethodologyAdapter` to validate the state transition.
2.  WHEN `gitgov task assign <id> --to <actor>` is used, THEN the system SHALL create a `FeedbackRecord` of type `assignment` via the `FeedbackAdapter`.
3.  WHEN `gitgov task promote <id>` is used on an epic, THEN the system SHALL orchestrate the creation of a new `CycleRecord` and pause the original task.

### Initiative 3: CLI Experience & Performance

**User Story:** As a developer, I want a consistent, reliable, and fast CLI experience.

#### Acceptance Criteria

1.  WHEN a read command is used, THEN the system **must** check cache freshness via `IndexerAdapter` and auto-regenerate if stale.
2.  WHEN a write command is used, THEN the system **must** invalidate the cache via `IndexerAdapter` to ensure consistency.
3.  WHEN any operation fails, THEN the system **must** provide a user-friendly error with an actionable suggestion.
4.  WHEN `--json`, `--verbose`, or `--quiet` flags are used, THEN the command's output **must** adjust accordingly.
