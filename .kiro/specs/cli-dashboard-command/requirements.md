# Requirements Document

## Introduction

The `gitgov dashboard` command is the **epic convergence** of the GitGovernance ecosystem. It provides a full-screen, interactive TUI (Terminal User Interface) that demonstrates the power of the entire system by orchestrating 6 core adapters to deliver a real-time, intelligent command and control center for hybrid human-AI teams.

## Requirements

### Requirement 1: Multi-Adapter Orchestration & Data Convergence

**User Story:** As a user, I want a single, unified view that brings together all aspects of my project, from high-level metrics to individual tasks, so that I can understand the complete state of my governance system at a glance.

#### Acceptance Criteria

1. WHEN the dashboard launches THEN the system SHALL orchestrate all 6 core adapters (`BacklogAdapter`, `MetricsAdapter`, `IndexerAdapter`, `FeedbackAdapter`, `WorkflowMethodologyAdapter`, `IdentityAdapter`) to gather and display a comprehensive view of the project
2. WHEN the dashboard displays data THEN the system SHALL rely on the `IndexerAdapter`'s cache for high-performance reads with cold start time less than 500ms
3. WHEN the cache is stale THEN the dashboard SHALL automatically trigger a regeneration via the `IndexerAdapter` and show progress to the user
4. WHEN adapter orchestration fails THEN the system SHALL display graceful error messages and continue rendering available data from successful adapters
5. WHEN the dashboard operates offline THEN the system SHALL use cached data from `.gitgov/index.json` and display appropriate offline indicators

### Requirement 2: Interactive Multi-Methodology UI

**User Story:** As a project manager, I want to interact with my project data in different ways depending on my current focus and methodology, so that I can work effectively with both traditional and AI-native workflows.

#### Acceptance Criteria

1. WHEN the dashboard is running THEN the user SHALL be able to switch between different views (Row-based, Kanban, Scrum) using keyboard shortcuts (`v`, `1`, `2`, `3`)
2. WHEN the view is switched THEN the task display SHALL reorganize according to the `view_configs` provided by the `WorkflowMethodologyAdapter` for the active methodology
3. WHEN `live` mode is active THEN the dashboard SHALL auto-refresh every 5 seconds, fetching the latest data from the adapters
4. WHEN the user presses action keys (`n`, `s`, `a`, etc.) THEN the dashboard SHALL display an "educational shortcut" message showing the equivalent CLI command
5. WHEN the user exits the dashboard THEN the system SHALL preserve the last selected view and methodology for the next session

### Requirement 3: Real-Time Intelligence Display

**User Story:** As a team lead managing hybrid human-AI teams, I want the dashboard to show me intelligent, actionable insights rather than just data tables, so that I can make informed decisions about governance and workflow optimization.

#### Acceptance Criteria

1. WHEN the dashboard is active THEN the system SHALL display real-time intelligence panels including `System Health`, `Productivity Metrics`, and `Collaboration Metrics` from the `MetricsAdapter`
2. WHEN the `Kanban` view is active THEN the system SHALL display specific `Kanban Flow Intelligence` metrics (e.g., bottlenecks, WIP limit warnings)
3. WHEN the `Scrum` view is active THEN the system SHALL display `Sprint Intelligence` metrics (e.g., burndown, velocity alerts)
4. WHEN the dashboard is running THEN the system SHALL display a `System Activity` stream calculated by the `IndexerAdapter` from record timestamps, showing a real-time log of project events
5. WHEN intelligence data is unavailable THEN the system SHALL display appropriate fallback messages without breaking the overall dashboard experience

### Requirement 4: Offline-First Operation & Error Resilience

**User Story:** As a developer working in various network conditions, I want the dashboard to work reliably offline and handle errors gracefully, so that I can always access my governance data regardless of connectivity.

#### Acceptance Criteria

1. WHEN the dashboard launches offline THEN the system SHALL display cached data from the `.gitgov/index.json` file with appropriate offline status indicators
2. WHEN network connectivity is restored THEN the system SHALL automatically sync and refresh data without user intervention
3. WHEN individual adapters fail THEN the dashboard SHALL continue operating with degraded functionality and clear error indicators showing which adapters are unavailable
4. WHEN the `.gitgov` directory is corrupted or missing THEN the system SHALL display helpful guidance for recovery or initialization with actionable next steps
5. WHEN cryptographic verification fails for cached records THEN the system SHALL display security warnings and provide options for re-verification
