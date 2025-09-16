# Requirements Document

## Introduction

The `gitgov status` command provides an intelligent, multi-adapter dashboard in the terminal. It serves as a central point for users to get a quick overview of both their personal work and the overall health of the project, following a "Pure CLI Interface" pattern where all logic is delegated to core adapters.

## Requirements

### Initiative 1: Personal & Global Dashboards

**User Story:** As a user, I want a comprehensive dashboard that shows me what I need to focus on, as well as the overall project status.

#### Acceptance Criteria

1.  WHEN `gitgov status` is run without flags, THEN the system SHALL display a **personal dashboard** showing tasks assigned to the current actor, their pending feedback, and relevant active cycles.
2.  WHEN `gitgov status --all` is run, THEN the system SHALL display a **global dashboard** with an overview of all project tasks, cycles, and system health.
3.  WHEN the command is executed, it **must** first ensure the local cache is up-to-date by coordinating with the `IndexerAdapter`.

### Initiative 2: Rich Data Display & Intelligence

**User Story:** As a project manager, I want the dashboard to provide rich, actionable insights, not just raw data.

#### Acceptance Criteria

1.  WHEN the personal dashboard is displayed, THEN it **must** include a list of "Suggested Actions" based on the user's current work state.
2.  WHEN the global dashboard is displayed with `--health` or `--team` flags, THEN it **must** enrich the view with `ProductivityMetrics` and `CollaborationMetrics` calculated by the `MetricsAdapter`.
3.  WHEN system health is displayed, THEN it **must** include a health score (0-100%) and a list of specific alerts for critical issues like stalled or blocked tasks.

### Initiative 3: CLI Experience & Performance

**User Story:** As a developer, I want a consistent, reliable, and fast CLI experience.

#### Acceptance Criteria

1.  WHEN the command is run, it **must** read from the `IndexerAdapter`'s cache to ensure a response time under 200ms.
2.  WHEN the cache is unavailable, the command **must** degrade gracefully by falling back to direct adapter calls, showing a performance warning.
3.  WHEN standard flags like `--json` or `--verbose` are used, THEN the command's output **must** adjust accordingly.
