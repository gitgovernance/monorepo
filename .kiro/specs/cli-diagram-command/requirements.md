# Requirements Document

## Introduction

The `gitgov diagram` command provides automated workflow visualization by generating Mermaid diagrams from `.gitgov/` records. It follows a principle of progressive disclosure, offering a simple interactive TUI by default, with advanced filtering and output options available through flags.

## Requirements

### Initiative 1: Core Diagram Generation & Visualization

**User Story:** As a user, I want to generate and view workflow diagrams to quickly understand my project's structure.

#### Acceptance Criteria

1.  WHEN `gitgov diagram` is executed without arguments, THEN the system SHALL launch an interactive TUI dashboard.
2.  WHEN the user triggers generation (e.g., via the 'g' key in the TUI), THEN the system SHALL generate a valid Mermaid diagram of the project workflow.
3.  WHEN the command is run outside a valid GitGovernance project, THEN it **must** report a clear error and exit gracefully.

### Initiative 2: Advanced Filtering & Output

**User Story:** As a project manager, I want to create customized diagrams for documentation and presentations.

#### Acceptance Criteria

1.  WHEN filter flags like `--cycle`, `--task`, or `--package` are used, THEN the diagram SHALL only include the specified entities and their direct relationships.
2.  WHEN `--output <file>` is specified, THEN the diagram **must** be saved to the specified file instead of being displayed in the TUI or stdout.
3.  WHEN `--watch` is used, THEN the command SHALL monitor the `.gitgov/` directory and automatically regenerate the diagram upon changes.

### Initiative 3: CLI Experience & Integration

**User Story:** As a developer, I want a consistent and reliable command that integrates well with the core engine.

#### Acceptance Criteria

1.  WHEN generating a diagram, the command **must** delegate the core logic to the `DiagramGenerator` module from the `@gitgov/core` package.
2.  WHEN no filters are specified, the command **must** default to using the root cycle defined in `config.json`, retrieved via the `ConfigManager`.
3.  WHEN standard flags like `--json` or `--verbose` are used, THEN the command's output **must** adjust accordingly.
