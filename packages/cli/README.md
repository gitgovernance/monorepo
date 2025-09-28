# @gitgov/cli: AI-First Project Governance

[![NPM Version](https://img.shields.io/npm/v/@gitgov/cli)](https://www.npmjs.com/package/@gitgov/cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**AI-first governance CLI** for intelligent work. Built on the principle **`AI-first = Prompt + Código`** - every feature is defined first as a formal prompt specification, then implemented as code.

## Quick Start

```bash
# Install globally
npm install -g @gitgov/cli

# Initialize your project
cd my-project && gitgov init

# Launch interactive dashboard
gitgov dashboard
```

## AI-First Architecture

This CLI materializes **formal specifications** into working code. Each command, flag, and behavior follows the **`Prompt + Código`** methodology:

1. **Prompt**: Formal specification defines the vision
2. **Código**: Implementation faithfully follows the spec

```mermaid
graph LR
    A[Prompt Specs] --> B[@gitgov/core] --> C[@gitgov/cli]
```

**Designed for humans and AI agents.** Use it directly or through natural language with AI agents - the CLI becomes an intelligent conversational interface with your project.

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

## Current Status (September 2025)

**🎯 ECOSYSTEM STATUS:**

- ✅ **Core Adapters:** ProjectAdapter, BacklogAdapter, MetricsAdapter, IndexerAdapter, IdentityAdapter implemented
- ✅ **CLI Implementation:** 7 commands are fully functional and operational
- ✅ **Quality Assurance:** Comprehensive test suite, clean TypeScript, full EARS coverage
- ✅ **Production Ready:** Commands work with real project data, MVP mode is operational
- ✅ **TUI Dashboard:** The interactive TUI Dashboard is functional
- ✅ **Project Initialization:** The `gitgov init` command is ready for demos

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

**✅ CORE COMMANDS COMPLETED:**

```bash
# Project Initialization (IMPLEMENTED)
gitgov init --blueprint=saas-mvp

# All core commands are implemented
gitgov indexer && gitgov status && gitgov dashboard
```

**🎯 IMPLEMENTATION STATUS:**

- ✅ **7/7 commands** fully implemented (`init`, `indexer`, `diagram`, `task`, `cycle`, `status`, `dashboard`)
- ✅ **All specifications** ready (10/10 quality)
- ✅ **All core dependencies** ready
- ✅ **TUI Dashboard** achieved
- ✅ **Project Initialization** achieved with init command

## Implementation Guidelines for Agents

**🤖 FOR IMPLEMENTER AGENTS:**

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
