# Requirements Document

## Introduction

The `gitgov init` command is the cornerstone of the GitGovernance ecosystem. Its purpose is to instantiate the complete "constitution" of a project, establishing the governance structure, creating the cryptographic trust root, and configuring the environment for a seamless user experience from the first moment.

## Requirements

### Initiative 1: Core Bootstrap & Orchestration

**User Story:** As a developer, I want to initialize a complete GitGovernance project with a single command, so I can start working with a fully configured governance system immediately.

#### Acceptance Criteria

1.  WHEN `gitgov init` is executed in a valid Git repo, THEN the system SHALL orchestrate the `ProjectAdapter` to create the full `.gitgov/` structure, an `ActorRecord` trust root, and a root `CycleRecord`.
2.  WHEN `gitgov init --blueprint=<template>` is used, THEN the system SHALL delegate to the `ProjectAdapter` to process the corresponding template file, creating predefined cycles and tasks.
3.  WHEN the process fails at any step, THEN the `ProjectAdapter`'s rollback mechanism **must** be triggered to ensure a clean environment.
4.  WHEN the process is successful, THEN the command SHALL display a visually impactful output detailing the created resources and actionable next steps.

### Initiative 2: User Experience & Automation

**User Story:** As a user, I want a flexible and user-friendly command that supports both interactive use and automated scripting.

#### Acceptance Criteria

1.  WHEN required information (like actor name) is missing, THEN the system SHALL present interactive prompts with intelligent defaults from the user's Git configuration.
2.  WHEN run with `--json`, THEN the system SHALL return a structured JSON output for automation.
3.  WHEN run with `--force`, THEN the system SHALL allow re-initialization of an existing project after a confirmation prompt.
4.  WHEN run in an invalid environment (e.g., not a Git repo, insufficient permissions), THEN the system SHALL provide a clear, user-friendly error and exit gracefully.
