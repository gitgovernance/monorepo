# @gitgov/cli: The Command Interface for the AI-First Enterprise

[![NPM Version](https://img.shields.io/npm/v/@gitgov/cli)](https://www.npmjs.com/package/@gitgov/cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

`@gitgov/cli` is the canonical command-line interface for interacting with the GitGovernance ecosystem. It's a tool designed for efficient collaboration between humans and AI agents directly from the terminal.

## Philosophy: Specification-Driven Development

This is not a traditional CLI. Its development strictly follows our `AI-first` principle: **`Specification -> Core -> CLI`**.

Every command, `flag`, and behavior of this tool is the **direct materialization of a formal specification**. The specifications are the source of truth that define the vision, architecture, and requirements, allowing AI and humans to build coherently. The CLI consumes the logic from the `@gitgov/core` SDK, which in turn is a faithful implementation of the Protocol.

### A CLI for Humans and Agents

`gitgov` is designed with a dual purpose. It's a powerful tool for developers who master the terminal, but its true power is revealed when operated by `@gitgov`, our AI agent.

**You don't need to memorize every command.** You can "talk to the dashboard" through the agent. Ask for a project status summary, inquire what you should work on, or request a new task in natural language. The agent will translate your intent into the precise commands, turning the CLI into an intelligent conversational interface with your project.

```mermaid
graph TD
    A["<code>Specifications</code> </br> (The Vision)"] --> B["<code>@gitgov/core</code> </br> (The SDK Engine)"];
    B --> C["<code>@gitgov/cli</code> </br> (The Tool)"];
```

## Technology Stack

- **Command Framework:** `Commander.js`
- **TUI Framework:** `Ink` and `React` (for `gitgov dashboard`)
- **Logic Engine:** `@gitgov/core`

## Installation and Setup

### 🔧 **For Developers:**

```bash
# 1. Main Setup:
git clone https://github.com/gitgovernance/monorepo.git
cd monorepo && pnpm install

# 2. CLI Development:
cd packages/cli
pnpm dev status              # Direct development
pnpm test                   # Run tests (185+ tests)
pnpm build                  # Build TypeScript
```

### 🎯 **For Demos and E2E Testing:**

```bash
# 1. Install portable wrapper (one time):
cd packages/cli && npm run install:local

# 2. Use from any directory:
cd /tmp/demo && git init
gitgov-local init --name "Demo Project"
gitgov-local status
```

### 🚀 **For End Users:**

```bash
# Public installation (via Cloudflare Pages):
curl -sSL https://get.gitgovernance.com | sh
gitgov init --name "My Project"
```

## Current Status (September 2025)

**🎯 ECOSYSTEM STATUS:**

- ✅ **Core Adapters:** ProjectAdapter, BacklogAdapter, MetricsAdapter, IndexerAdapter, IdentityAdapter implemented (503+ tests)
- ✅ **CLI Implementation:** 7 commands are fully functional and operational
- ✅ **Quality Assurance:** 185+ CLI tests passing, clean TypeScript, full EARS coverage
- ✅ **Production Ready:** Commands work with real project data, MVP mode is operational
- ✅ **EPIC CONVERGENCE:** TUI Dashboard with 6-adapter orchestration is functional
- ✅ **PERFECT FIRST IMPRESSION:** `gitgov init` is ready for demos

**🎯 AVAILABLE COMMANDS:** `gitgov init`, `gitgov indexer`, `gitgov diagram`, `gitgov task` (9 subcommands), `gitgov cycle`, `gitgov status`, `gitgov dashboard`
**❌ PENDING:** `gitgov task cancel`, `gitgov task reject` (completes the workflow)
**🚀 NEXT STEP:** Complete cancellation/rejection workflow and polish for production release.

## Development Workflow

### 🔧 **Main Development (pnpm):**

```bash
# Normal development from the GitGovernance project:
cd packages/cli
pnpm dev status              # Direct CLI development
pnpm dev init               # Test commands
pnpm dev dashboard          # TUI development

# Run tests from anywhere in the project:
pnpm test                   # Run all tests
pnpm build                  # Build TypeScript
```

### 🎯 **Demos and E2E Testing:**

```bash
# 1. Install portable wrapper (one time):
cd packages/cli && npm run install:local

# 2. Use from any external directory:
cd /tmp/demo && git init
gitgov-local init --name "Demo Project"
gitgov-local status
gitgov-local dashboard

# 3. Perfect for:
# • Client demos in clean directories
# • E2E testing without affecting development
# • Validating the public installer
```

### 🚀 **Production:**

```bash
# Public installation:
curl -sSL https://get.gitgovernance.com | sh
gitgov init --name "Production Project"
```

### 📋 **Command Summary:**

| Command        | When to Use            | From Where                |
| -------------- | ---------------------- | ------------------------- |
| `pnpm dev`     | Daily development      | `/packages/cli/`          |
| `gitgov-local` | Demos/E2E Testing      | Any directory             |
| `gitgov`       | Work on actual project | Any GitGovernance project |

## Quick Start Guide

**🔧 AVAILABLE COMMANDS:**

```bash
# 0. Initialize a GitGovernance project (FIRST TIME)
cd my-project
git init  # If not already a Git repository
gitgov init --name "My Project" --actor-name "Your Name"

# 1. Generate the local cache (RECOMMENDED AFTER INIT)
gitgov indexer

# 3. Generate a workflow diagram
gitgov diagram

# 4. Manage tasks (OPERATIONAL CORE)
gitgov task new "Implement user authentication"
gitgov task list --status draft
gitgov task show task-id-123 --verbose

# 5. Full task workflow
gitgov task submit task-id-123
gitgov task approve task-id-123
gitgov task activate task-id-123
gitgov task complete task-id-123
gitgov task assign task-id-123 --to human:developer

# 6. Use watch mode for development
gitgov diagram --watch

# 7. View your daily personal dashboard
gitgov status

# 8. Monitor project health
gitgov status --all --health --team

# 9. Validate project integrity
gitgov indexer --validate-only

# 10. EPIC CONVERGENCE: Interactive TUI Dashboard
gitgov dashboard

# 11. Troubleshoot cache issues
gitgov indexer --force
```

**✅ CORE COMMANDS COMPLETED:**

```bash
# Perfect first impression (IMPLEMENTED)
gitgov init --blueprint=saas-mvp

# All core commands are implemented
gitgov indexer && gitgov status && gitgov dashboard
```

**🎯 IMPLEMENTATION STATUS:**

- ✅ **7/7 commands** fully implemented (`init`, `indexer`, `diagram`, `task`, `cycle`, `status`, `dashboard`)
- ✅ **All specifications** ready (10/10 quality)
- ✅ **All core dependencies** ready (503+ tests)
- ✅ **EPIC CONVERGENCE** achieved with TUI dashboard
- ✅ **PERFECT FIRST IMPRESSION** achieved with init command

## Implementation Guidelines for Agents

**🤖 FOR IMPLEMENTER AGENTS:**

### **📋 Verified Prerequisites:**

- ✅ **IndexerAdapter:** `packages/core/src/adapters/indexer_adapter/index.ts` (18/18 tests)
- ✅ **MetricsAdapter:** `packages/core/src/adapters/metrics_adapter/index.ts` (32/32 tests)
- ✅ **BacklogAdapter:** `packages/core/src/adapters/backlog_adapter/index.ts` (29/29 tests)
- ✅ **CLI Specifications:** 7 commands with 10/10 quality specs ready to implement

### **🎯 Implementation Order (COMPLETED):**

1. ✅ **`gitgov init`** - Perfect first impression (Specification: `init_command.md`) - **COMPLETED**
2. ✅ **`gitgov indexer`** - Cache control foundation (Specification: `index_command.md`) - **COMPLETED**
3. ✅ **`gitgov task`** - Core operations (Specification: `task_command.md`) - **COMPLETED**
4. ✅ **`gitgov cycle`** - Strategic planning (Specification: `cycle_command.md`) - **COMPLETED**
5. ✅ **`gitgov status`** - Intelligence dashboard (Specification: `status_command.md`) - **COMPLETED**
6. ✅ **`gitgov dashboard`** - EPIC CONVERGENCE (Specification: `dashboard_command.md`) - **COMPLETED**
7. ✅ **`gitgov diagram`** - Workflow visualization (Specification: `diagram_command.md`) - **COMPLETED**

### **🏗️ Architectural Patterns:**

- **Pure CLI Interface:** Commands delegate to `@gitgov/core` adapters
- **Auto-indexation:** Read commands check cache freshness automatically
- **Cache invalidation:** Write commands invalidate the cache for consistency
- **Graceful degradation:** All commands work without the cache (slower)

### **📋 Functional Commands - Real Examples**

#### **Project Initialization (`gitgov init`)**

```bash
# Basic bootstrap (perfect for demos)
gitgov init

# Specific project with metadata
gitgov init --name "GitGovernance CLI" --actor-name "Project Owner"

# SaaS MVP template
gitgov init --blueprint=saas-mvp --methodology=scrum

# Complete enterprise setup
gitgov init --name "Enterprise Project" \
  --blueprint=enterprise \
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

#### **Epic Convergence TUI (`gitgov dashboard`)**

```bash
# Interactive TUI with live mode (EPIC CONVERGENCE)
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

**Verified Performance:**

- ✅ `gitgov init`: Complete bootstrap <500ms with 3-adapter orchestration
- ✅ `gitgov indexer`: 146 records in ~50ms
- ✅ `gitgov diagram`: Full generation in <2s
- ✅ `gitgov task`: Operational CRUD with full workflow (submit→approve→activate→complete)
- ✅ `gitgov cycle`: Strategic planning with bidirectional linking
- ✅ `gitgov status`: Personal dashboard <100ms, global <200ms with cache
- ✅ `gitgov dashboard`: TUI launch <500ms, live refresh every 5s
- ✅ Cache size: ~146 KB for a real project

## Complete Documentation

All CLI functionality is defined in specifications.

- **Command Reference:** For a full list and roadmap → **[`cli_reference.md`](../blueprints/03_products/cli/cli_reference.md)**
- **Technical Design:** For internal architecture → **[`cli_tech_design.md`](../blueprints/03_products/cli/cli_tech_design.md)**
- **Core API:** For the SDK it consumes → **[`core_reference.md`](../blueprints/03_products/core/core_reference.md)**
- **CLI Designer Agent:** For spec auditing → **[`cli_designer.md`](../blueprints/02_agents/design/cli_designer.md)**
