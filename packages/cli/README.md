# @gitgov/cli: The Command Interface for GitGovernance

[![NPM Version](https://img.shields.io/npm/v/@gitgov/cli)](https://www.npmjs.com/package/@gitgov/cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

`@gitgov/cli` is the canonical command-line interface for interacting with the GitGovernance ecosystem. It's a tool designed for efficient collaboration between humans and AI agents directly from the terminal.

## Getting Started

The recommended way to install `@gitgov/cli` is via `npm`.

```bash
# 1. Install from NPM
# Requires Node.js >= 18
npm install -g @gitgov/cli

# 2. Initialize in your project repository
cd my-project
git init # If not already a Git repository
gitgov init --name "My Project"

# 3. See your project status
gitgov status

# 4. Launch the interactive dashboard
gitgov dashboard
```

_For developer setup and other installation options, see the [Developer Guide](#developer-guide) below._

## A CLI for Humans and Agents

`gitgov` is designed with a dual purpose. It's a powerful tool for developers who work in the terminal, and becomes even more effective when operated by `@gitgov`, our AI agent.

**You don't need to memorize commands.** Talk to the dashboard through the agent. Ask for project status, what to work on, or request new tasks in natural language. The agent translates your intent into precise commands, creating a conversational interface with your project.

Built on **`AI-first = Prompt + Code`** - every command materializes formal specifications into working code. The CLI consumes logic from `@gitgov/core`, ensuring coherent collaboration between AI and humans.

<img width="876" height="604" alt="GitGovernance TUI Dashboard" src="https://github.com/user-attachments/assets/016a4bef-d374-4963-aef3-19303650fb3a" />

## Technology Stack

- **Command Framework:** `Commander.js`
- **TUI Framework:** `Ink` and `React` (for `gitgov dashboard`)
- **Logic Engine:** `@gitgov/core`

## Developer Guide

This guide is for contributors or those who want to run the CLI from the source code.

### 🔧 **For Developers:**

```bash
# 1. Main Setup:
git clone https://github.com/gitgovernance/monorepo.git
cd monorepo && pnpm install

# 2. Verify the CLI package:
cd packages/cli
pnpm verify                  # Build and run all tests
```

### 🎯 **For Demos and E2E Testing (System-wide):**

```bash
# 1. Link the package to your system (one time):
cd packages/cli
pnpm build
npm link

# 2. Now use the `gitgov` command from any directory:
cd /tmp/demo && git init
gitgov init --name "Demo Project"
gitgov status

# 3. To unlink when you're done:
npm unlink
```

### 🚀 **Alternative Installation: Standalone Binary**

This method uses an installer script to download a self-contained executable with no external dependencies (like Node.js).

```bash
curl -sSL https://get.gitgovernance.com | sh
```

## Current Status

**ECOSYSTEM STATUS:**

- ✅ **Core Adapters:** ProjectAdapter, BacklogAdapter, MetricsAdapter, IndexerAdapter, IdentityAdapter implemented
- ✅ **CLI Implementation:** 7 commands are fully functional and operational
- ✅ **Quality Assurance:** 210 tests passing (222 total with 12 skipped), clean TypeScript, EARS coverage, shell-safe input validation
- ✅ **Production Ready:** Commands work with real project data, MVP mode is operational
- ✅ **TUI Dashboard:** The interactive TUI Dashboard is functional
- ✅ **Project Initialization:** The `gitgov init` command is ready for demos

**AVAILABLE COMMANDS:** `gitgov init`, `gitgov indexer`, `gitgov diagram`, `gitgov task` (14 subcommands), `gitgov cycle`, `gitgov status`, `gitgov dashboard`
**ALL WORKFLOWS COMPLETE:** Full task lifecycle including pause/resume/cancel/reject/delete implemented and tested.

## Development Workflow

### 🔧 **Main Development (pnpm):**

```bash
# Normal development from the GitGovernance project:
cd packages/cli
pnpm dev status              # Direct CLI development
pnpm dev init               # Test commands
pnpm dev dashboard          # TUI development

# Run tests from anywhere in the project:
pnpm verify                 # Build and run all tests
pnpm build                  # Build TypeScript
```

### 🎯 **Demos and E2E Testing (using `npm link`):**

This method allows you to use the `gitgov` command globally on your machine, pointing directly to your development code.

```bash
# 1. Link the package (one time from packages/cli):
pnpm build && npm link

# 2. Use from any external directory:
cd /tmp/demo && git init
gitgov init --name "Demo Project"
gitgov status
gitgov dashboard

# 3. When finished, unlink the package:
npm unlink
```

### 🚀 **Production:**

```bash
# Public installation via NPM (Recommended):
npm install -g @gitgov/cli
gitgov init --name "Production Project"
```

### 📋 **Command Summary:**

| Command    | When to Use                            | From Where                |
| ---------- | -------------------------------------- | ------------------------- |
| `pnpm dev` | Daily development (hot-reload)         | `/packages/cli/`          |
| `gitgov`   | Demos/E2E (after `npm link`)           | Any directory             |
| `gitgov`   | Work on actual project (after install) | Any GitGovernance project |

## Command Reference

**AVAILABLE COMMANDS:**

```bash
# 0. Initialize a GitGovernance project (FIRST TIME)
cd my-project
git init  # If not already a Git repository
gitgov init --name "My Project" --actor-name "Your Name"

# 1. Generate the local cache (RECOMMENDED AFTER INIT)
gitgov indexer

# 3. Generate a workflow diagram
gitgov diagram

# 4. Manage tasks (Core Operations)
gitgov task new "Implement user authentication"
gitgov task list --status draft
gitgov task show task-id-123 --verbose

# 5. Full task workflow
gitgov task submit task-id-123
gitgov task approve task-id-123
gitgov task activate task-id-123
gitgov task complete task-id-123
gitgov task assign task-id-123 --to human:developer

# 5b. Task control workflow (pause/resume/cancel/reject/delete)
gitgov task pause task-id-123 --reason "Waiting for approval"
gitgov task resume task-id-123
gitgov task cancel task-id-123 --reason "Priorities changed"
gitgov task reject task-id-123 --reason "Requirements unclear"
gitgov task delete task-id-123  # For draft tasks only

# 6. Use watch mode for development
gitgov diagram --watch

# 7. View your daily personal dashboard
gitgov status

# 8. Monitor project health
gitgov status --all --health --team

# 9. Validate project integrity
gitgov indexer --validate-only

# 10. Interactive TUI Dashboard
gitgov dashboard

# 11. Troubleshoot cache issues
gitgov indexer --force
```

**CORE COMMANDS COMPLETED:**

```bash
# Project Initialization (IMPLEMENTED)
gitgov init --blueprint=saas-mvp

# All core commands are implemented
gitgov indexer && gitgov status && gitgov dashboard
```

**IMPLEMENTATION STATUS:**

- ✅ **7/7 commands** implemented (`init`, `indexer`, `diagram`, `task`, `cycle`, `status`, `dashboard`)
- ✅ **14/14 task subcommands** (new, list, show, submit, approve, assign, activate, complete, pause, resume, cancel, reject, delete, edit, promote)
- ✅ **All specifications** ready with 10/10 quality scores
- ✅ **Core dependencies** ready
- ✅ **TUI Dashboard** functional
- ✅ **Project Initialization** functional

## Implementation Guidelines for Agents

**FOR IMPLEMENTER AGENTS:**

### **📋 Verified Prerequisites:**

- ✅ **IndexerAdapter:** `packages/core/src/adapters/indexer_adapter/index.ts`
- ✅ **MetricsAdapter:** `packages/core/src/adapters/metrics_adapter/index.ts`
- ✅ **BacklogAdapter:** `packages/core/src/adapters/backlog_adapter/index.ts`
- ✅ **CLI Specifications:** 7 commands with 10/10 quality specs ready to implement

### **🎯 Implementation Order (COMPLETED):**

1. ✅ **`gitgov init`** - Project Initialization (Specification: `init_command.md`) - **COMPLETED**
2. ✅ **`gitgov indexer`** - Cache control foundation (Specification: `index_command.md`) - **COMPLETED**
3. ✅ **`gitgov task`** - Core operations (Specification: `task_command.md`) - **COMPLETED**
4. ✅ **`gitgov cycle`** - Strategic planning (Specification: `cycle_command.md`) - **COMPLETED**
5. ✅ **`gitgov status`** - Intelligence dashboard (Specification: `status_command.md`) - **COMPLETED**
6. ✅ **`gitgov dashboard`** - TUI Dashboard (Specification: `dashboard_command.md`) - **COMPLETED**
7. ✅ **`gitgov diagram`** - Workflow visualization (Specification: `diagram_command.md`) - **COMPLETED**

### **🏗️ Architectural Patterns:**

- **Pure CLI Interface:** Commands delegate to `@gitgov/core` adapters
- **Auto-indexation:** Read commands check cache freshness automatically
- **Cache invalidation:** Write commands invalidate the cache for consistency
- **Graceful degradation:** All commands work without the cache (slower)

### **📋 Functional Commands - Real Examples**

#### **Project Initialization (`gitgov init`)**

```bash
# Basic bootstrap (ideal for demos)
gitgov init

# Specific project with metadata
gitgov init --name "GitGovernance CLI" --actor-name "Project Owner"

# SaaS MVP template
gitgov init --blueprint=saas-mvp --methodology=scrum

# Complete business setup
gitgov init --name "Business Project" \
  --blueprint=saas-mvp \
  --methodology=scrum \
  --actor-name "Tech Lead" \
  --verbose

# For automation/CI
gitgov init --name "CI Project" --no-cache --json --quiet
```

#### **Cache Control (`gitgov indexer`)**

```bash
# Generate initial cache (RECOMMENDED FIRST STEP)
gitgov indexer

# Verify project integrity
gitgov indexer --validate-only

# Fix cache issues
gitgov indexer --force

# For automation/scripts
gitgov indexer --json --quiet
```

#### **Visualization (`gitgov diagram`)**

```bash
# Generate full diagram
gitgov diagram

# Interactive mode with auto-regeneration
gitgov diagram --watch

# Filter by specific entities
gitgov diagram --cycle 1757687335-cycle-core-mvp
gitgov diagram --task 1757687335-task-specific
```

#### **Task Management (`gitgov task`)**

```bash
# Create a new task
gitgov task new "Implement OAuth2 authentication"

# List tasks with filters
gitgov task list --status draft --priority high

# View full details
gitgov task show 1757789000-task-example --verbose

# Full workflow transitions
gitgov task submit 1757789000-task-example
gitgov task approve 1757789000-task-example
gitgov task activate 1757789000-task-example
gitgov task complete 1757789000-task-example

# Task control (pause/resume/cancel/reject/delete)
gitgov task pause 1757789000-task-example --reason "Blocked by dependency"
gitgov task resume 1757789000-task-example
gitgov task cancel 1757789000-task-example --reason "Priorities changed"
gitgov task reject 1757789000-task-example --reason "Requirements unclear"
gitgov task delete 1757789000-task-example  # Draft tasks only

# Assignment management
gitgov task assign 1757789000-task-example --to human:developer

# Editing tasks
gitgov task edit 1757789000-task-example --add-tags "urgent"

# For automation
gitgov task list --status done --json --quiet
```

#### **Strategic Planning (`gitgov cycle`)**

```bash
# Create a planning cycle
gitgov cycle new "Sprint Backend Q1" -d "API performance focus"

# List cycles with filters
gitgov cycle list --status planning --has-tasks

# Activate a cycle for work
gitgov cycle activate cycle-id-123

# Add tasks to a cycle (bidirectional linking)
gitgov cycle add-task cycle-id-123 --task task-id-456

# View cycle details
gitgov cycle show cycle-id-123 --tasks --verbose

# Complete a cycle
gitgov cycle complete cycle-id-123

# For automation
gitgov cycle list --status completed --json --quiet
```

#### **Intelligent Dashboard (`gitgov status`)**

```bash
# Daily personal dashboard (RECOMMENDED)
gitgov status

# Global project view
gitgov status --all

# Only critical health and alerts
gitgov status --health --alerts

# Complete view with team metrics
gitgov status --all --cycles --team --verbose

# For automation/monitoring
gitgov status --all --json

# Scripting (only critical alerts)
gitgov status --alerts --quiet

# Debugging (bypass cache)
gitgov status --from-source --verbose
```

#### **Interactive TUI (`gitgov dashboard`)**

```bash
# Interactive TUI with live mode
gitgov dashboard

# Specific views
gitgov dashboard --template=row-based      # Your original vision
gitgov dashboard --template=kanban-7col    # Kanban workflow
gitgov dashboard --template=scrum-board    # Scrum ceremonies

# Static mode (snapshot)
gitgov dashboard --no-live

# Custom refresh interval
gitgov dashboard --refresh-interval=10

# For automation
gitgov dashboard --json --quiet
```

**Interactive Controls (in the TUI):**

- **v**: Cycle views (Row → Kanban → Scrum → loop)
- **1-3**: Direct view selection (1: Row, 2: Kanban, 3: Scrum)
- **r**: Manual refresh, **?**: Help, **q**: Quit
- **n,s,a,e,c**: Educational shortcuts (show CLI commands)

**Performance Metrics:**

- ✅ `gitgov init`: Bootstrap <500ms with 3-adapter orchestration
- ✅ `gitgov indexer`: 146 records in ~50ms
- ✅ `gitgov diagram`: Generation in <2s
- ✅ `gitgov task`: Full workflow including pause/resume/cancel/reject/delete (14 subcommands, 46 tests, 102% EARS coverage)
- ✅ `gitgov cycle`: Planning with bidirectional linking
- ✅ `gitgov status`: Personal dashboard <100ms, global <200ms with cache
- ✅ `gitgov dashboard`: TUI launch <500ms, live refresh every 5s
- ✅ Cache size: ~146 KB for a project
- ✅ Test suite: 204 tests passing (216 total with 12 skipped)

## Complete Documentation

All CLI functionality is defined in specifications.

- **Command Reference:** For a full list and roadmap → **[`cli_reference.md`](../blueprints/03_products/cli/cli_reference.md)**
- **Technical Design:** For internal architecture → **[`cli_tech_design.md`](../blueprints/03_products/cli/cli_tech_design.md)**
- **Core API:** For the SDK it consumes → **[`core_reference.md`](../blueprints/03_products/core/core_reference.md)**
- **CLI Designer Agent:** For spec auditing → **[`cli_designer.md`](../blueprints/02_agents/design/cli_designer.md)**
