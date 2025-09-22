# GitGovernance

![License: MPL-2.0](https://img.shields.io/badge/Core_License-MPL--2.0-brightgreen.svg)
![License: Apache-2.0](https://img.shields.io/badge/CLI_License-Apache--2.0-blue.svg)
![Tests](https://img.shields.io/badge/tests-667%20passing-success)
![npm version](https://img.shields.io/npm/v/@gitgov/cli)

**An Operating System for Intelligent Work, built on a Git-based ledger.**

GitGovernance provides the infrastructure of trust to orchestrate collaboration between human and AI agents, bringing engineering discipline to hybrid teams.

## The Vision: Why GitGovernance?

In the era of AI, high-performance teams face a new kind of chaos: zero accountability, coordination silos, and inconsistent quality. Leaders operate blindly, unable to see progress or risks in time.

GitGovernance is not another management tool. It's a foundational protocol layer that unifies all work into an immutable, auditable, and signed ledger. We built it on Git because it's the most robust and adopted distributed traceability system in the world.

Our core principle is a **Protocol-First Approach**. Every component is first defined as a formal specification—a contract readable by both humans and LLMs—before a single line of code is written. This ensures that the system's logic is guided by a clear purpose that an AI can understand and audit.

---

## 🚀 For Users: Get Started in 2 Minutes

This is the workflow to start using GitGovernance in your own project.

### 1. Install the CLI (macOS)
```sh
curl -sSL https://get.gitgovernance.com | sh (coming soon)
```

### ✅ Installed GitGovernance CLI v1.0.0

#### 2. Navigate to your project and initialize
```sh
cd your-project
git init  # if not a git repository
gitgov init --name "My Project"
```

### ✅ Project initialized with GitGovernance. Ready for human-agent collaboration.

#### 3. Launch the dashboard to visualize the state
```sh
gitgov dashboard                    # Live mode with 5s auto-refresh
gitgov dashboard --template=kanban-7col  # Kanban workflow view
gitgov dashboard --template=scrum-board  # Scrum ceremonies view
```

#### 4. Operate with the interactive dashboard

<img width="876" height="604" alt="Screen Shot 2025-09-18 at 06 08 59" src="https://github.com/user-attachments/assets/016a4bef-d374-4963-aef3-19303650fb3a" />

---

## 📦 Installation Methods

### 🚀 **For End Users (Recommended)**

**One-line installation via Cloudflare Pages:**

```bash
curl -sSL https://get.gitgovernance.com | sh
```

**Requirements:**

- macOS (Linux/Windows support coming soon)
- Node.js 18+
- Git (recommended)

**What it does:**

- Downloads and installs GitGovernance CLI from source
- Creates executable wrapper in `~/.local/bin/gitgov`
- Sets up proper PATH configuration
- Provides perfect first impression experience

### 🔧 **For Developers: Local Development Setup**

This guide is for contributors who want to work on the GitGovernance ecosystem (core, platform, etc.).

### Prerequisites

- Node.js (v18 or higher)
- pnpm

### Installation and Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/gitgovernance/monorepo.git
    cd monorepo
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Install CLI for development:**

    ```bash
    # Install portable wrapper (for demos/testing):
    cd packages/cli && npm run install:local
    ```

4.  **Verify installation:**

    ```bash
    # Complete tests:
    cd packages/core && npm test  # 503 tests
    cd packages/cli && npm test   # 164 tests

    # CLI working (development mode):
    gitgov-local init --name "Test Project"
    ```

### Development Workflow

```bash
# Normal development from the project:
cd packages/cli
pnpm dev status              # Direct CLI development
pnpm dev init               # Init testing

# E2E testing and demos (portable wrapper):
cd /tmp && mkdir demo && cd demo && git init
gitgov-local init --name "Demo"  # Portable, works anywhere
gitgov-local status

# Production installation testing:
curl -sSL https://get.gitgovernance.com | sh
gitgov init --name "Production Test"
```

## 📦 Monorepo Structure

For a high-level view of the product architecture, consult the **[Core Technical Design](packages/core/README.md)**.

### High-Level Architecture

```
            +------------------+
            |    Developer     |
            +--------+---------+
                     |
            +--------v---------+
            |      CLI         | (gitgov <command>)
            +--------+---------+
                     |
      +--------------v--------------+
      |      Core Engine            |
      | (Adapters, Business Logic)  |
      +--------------+--------------+
                     |
     +---------------v----------------+
     |     .gitgov/ (Ledger)          |
     | (Tasks, Cycles, Feedback, etc) |
     +--------------------------------+
```

### Package Details

```
packages/
├── 🟢 cli/         # The Tool (Apache 2.0)
└── 🟢 core/        # The Engine (MPL-2.0)
```

| Package             | License    | Purpose                                          | Key Documentation                      |
| :------------------ | :--------- | :----------------------------------------------- | :------------------------------------- |
| **`packages/core`** | MPL-2.0    | The **Engine:** Agnostic SDK for business logic. | [`README.md`](packages/core/README.md) |
| **`packages/cli`**  | Apache 2.0 | The **Tool:** Command line interface.            | [`README.md`](packages/cli/README.md)  |

## 🤝 Contribution Flow

- **Changes to Open Source Packages (`core`, `cli`):** Must be made in the corresponding `upstream` submodule repository. Once merged, the submodule pointer is updated in this monorepo.

## 🔧 IDE Integration

### Kiro IDE Integration

GitGovernance includes native integration with [Kiro IDE](https://kiro.dev), a next-generation development environment designed for AI-human collaboration, for an optimized development experience:

- **Agent Hooks:** Automatic hooks for creating tasks, analyzing files, and managing commits
- **Git Diagnostics:** Automatic correlation between commits and TaskRecords
- **Spec-Driven Development:** Task export to Kiro Spec format

## 🎯 Current Implementation Status (September 2025)

### ✅ **Core Ecosystem (Complete)**

- **@gitgov/core**: 503 tests passing, 7/7 adapters implemented
  - ProjectAdapter, BacklogAdapter, MetricsAdapter, IndexerAdapter
  - IdentityAdapter, ExecutionAdapter, FeedbackAdapter, ChangelogAdapter
  - WorkflowMethodologyAdapter, EventBusModule
- **@gitgov/cli**: 164 tests passing, 7/7 commands functional
  - `gitgov init`, `gitgov indexer`, `gitgov task`, `gitgov cycle`
  - `gitgov status`, `gitgov dashboard`, `gitgov diagram`

### 🚀 **Available Commands**

```bash
# Project initialization (perfect first impression)
gitgov init --name "My Project" --actor-name "Project Owner"

# Cache management (critical for performance)
gitgov indexer

# Task management (complete operational workflow)
gitgov task new "Implement user authentication"
gitgov task submit task-id-123    # Send definition to review
gitgov task approve task-id-123   # Approve definition
gitgov task activate task-id-123  # Start implementation
gitgov task complete task-id-123  # Mark as done

# Strategic planning
gitgov cycle new "Sprint Q1" --description "Q1 objectives"
gitgov cycle add-task cycle-id --task task-id-123

# Intelligent dashboards
gitgov status --all --health --alerts
gitgov dashboard  # Interactive TUI with live updates
gitgov dashboard --template=kanban-7col  # Kanban workflow visualization
gitgov dashboard --template=scrum-board  # Scrum ceremonies view

# Workflow visualization
gitgov diagram --watch  # Auto-regenerating diagrams
```

## 🤝 Converse with Your Project

GitGovernance is more than a set of commands; it's a system you can converse with. Our AI agent, `@gitgov`, acts as your project co-pilot.

Instead of memorizing commands, you can ask the agent in natural language to check the project's health, assign work, or identify priorities. The agent uses the `gitgov` CLI on your behalf, giving you access to the full power of the system.

### Example Interactions

#### **Project Health Check**

- **You:** `"Hey @gitgov, how are we doing?"`
- **Agent:** `"Our backlog health is at 87%, but task 'Refactor Compiler' has been stalled for 12 days, and there are 3 critical blockers. Throughput is excellent, but our lead time is high. Run \`gitgov status --health --alerts\` for full details."`

#### **Work Assignment**

- **You:** `"@gitgov, what should I work on next?"`
- **Agent:** `"You have one high-priority feedback item assigned to you: 'Refactor Compiler', which is blocking 3 other tasks. This is critical. Use \`gitgov task show <task-id>\` for details."`

#### **Blocking Issues**

- **You:** `"@gitgov, what's blocked?"`
- **Agent:** `"There are 3 critical blockers: Task X (12 days), Task Y (8 days), and Task Z (5 days). I recommend prioritizing these to improve project flow. Use \`gitgov task list --status blocked\` for analysis."`

### 🎯 **Dashboard Views - Multi-Methodology Support**

GitGovernance includes a sophisticated TUI dashboard with multiple views for different workflows:

#### **Row-Based View (Default)**

```bash
gitgov dashboard  # Default view - "Backlog with Life"
```

- **Epic Convergence**: Shows 6 adapters working in harmony
- **Real-Time Intelligence**: Auto-refresh every 5 seconds
- **Activity Stream**: Live system activity with agent collaboration
- **Interactive Controls**: Keyboard shortcuts for quick actions

#### **Kanban Workflow View**

```bash
gitgov dashboard --template=kanban-7col
```

- **7-Column Layout**: Draft → Review → Ready → Active → Done → Archived → Blocked
- **Flow Intelligence**: Bottleneck detection and flow acceleration
- **WIP Limits**: Visual warnings for column capacity
- **Cycle Time Tracking**: Performance metrics per stage

#### **Scrum Ceremonies View**

```bash
gitgov dashboard --template=scrum-board
```

- **Sprint Focus**: Product Backlog → Sprint Backlog → In Progress → Done → Demo Ready
- **Sprint Intelligence**: Burndown charts and velocity tracking
- **Ceremony Reminders**: Daily standups and sprint reviews
- **Impediment Detection**: Blocked tasks with escalation alerts

#### **Interactive Controls**

- **v**: Cycle between views (Row → Kanban → Scrum → loop)
- **1-3**: Direct view selection (1: Row, 2: Kanban, 3: Scrum)
- **s**: Sort tasks by Recent Activity, Creation Date, Priority, or Status
- **r**: Manual refresh, **?**: Help, **q**: Quit
- **n,s,a,e,c**: Educational shortcuts (shows CLI commands)

### 📊 **Performance Metrics**

- **Core Tests**: 503 passing (100% success rate)
- **CLI Tests**: 164 passing (100% success rate)
- **Cache Performance**: 146 records indexed in ~50ms
- **Dashboard Launch**: <500ms with 6-adapter orchestration
- **Project Bootstrap**: Complete initialization <500ms

## 🤝 Community and Support

- **GitHub Discussions:** For questions, ideas, and discussions about the protocol and architecture.
- **Discord:** Join our community to chat with the team and other contributors.
- **Twitter:** Follow us for the latest news and project announcements.

## ⚖️ License

This repository contains open source packages with permissive licenses:

- **`packages/core`**: Mozilla Public License 2.0 (MPL-2.0) - Copyleft Weak
- **`packages/cli`**: Apache License 2.0 - Maximum Distribution

Both packages are designed for maximum adoption and community contribution while maintaining the integrity of the core protocol.

---

**Built with ❤️ by the GitGovernance Development Team**
