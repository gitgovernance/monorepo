![License: MPL-2.0](https://img.shields.io/badge/Core_License-MPL--2.0-blue.svg)
![core npm version](https://img.shields.io/npm/v/@gitgov/core?color=orange&label=Core%20npm)
![Tests](https://img.shields.io/badge/tests-2120%20Core%20-success?label=Core%20tests)
![License: Apache-2.0](https://img.shields.io/badge/CLI_License-Apache--2.0-blue.svg)
![cli npm version](https://img.shields.io/npm/v/@gitgov/cli?color=orange&label=CLI%20npm)
![Tests](https://img.shields.io/badge/tests-236%20CLI-success?label=CLI%20tests)

# GitGovernance

**An Operating System for Intelligent Work, built on Git.**

GitGovernance provides the infrastructure of trust to orchestrate collaboration between human and AI agents, bringing engineering discipline to hybrid teams.

> 🏆 **Recognized Winner at the Code with Kiro Hackathon (October 2025)**

## The Vision: Why GitGovernance?

Modern software teams combine humans and AI agents, but face coordination challenges: operational gaps between where developers work, managers track, and agents execute. The result is coordination silos and leaders operating without unified, verifiable truth.

GitGovernance is not another management tool. It's a foundational protocol layer that unifies all work into an auditable, verifiable Git history. We built it on Git because it's the most robust and adopted distributed traceability system in the world.

<img width="876" height="604" alt="GitGovernance TUI Dashboard" src="https://github.com/user-attachments/assets/016a4bef-d374-4963-aef3-19303650fb3a" />

It's not about replacing your board; it's about giving it a foundation of truth.

And, of course, you can talk to it:

> **You ask:** "Are we okay?"  
> **@gitgov answers:** "Backlog health is at 87%, but 80 tasks are stalled. You have 1 critical feedback blocking 3 other tasks."

## A CLI for Humans and Agents

`gitgov` works two ways: powerful for developers who live in the terminal, but effective when operated by `@gitgov`, our AI agent.

**You don't need to memorize commands.** Just talk to it. Ask for a project status, what you should work on, or request a new task in natural language. The agent translates your intent into precise commands.

Built on **`AI-first = Prompt + Code`** - every command materializes formal specifications into working code through `@gitgov/core`.

---

## 🚀 Getting Started

```bash
# 1. Install from NPM
# Requires Node.js >= 18
npm install -g @gitgov/cli

# 2. Initialize in your project repository
cd your-project
git init # If not already a Git repository
gitgov init --name "My Project"

# 3. Launch the interactive dashboard
gitgov dashboard
```

## 🤝 Converse with Your Project

After installation, open your preferred IDE—Cursor, VS Code, or any editor with AI capabilities. Open the chat and use `@gitgov` (located in `.gitgov/gitgov` if your editor uses different syntax like `#gitgov`) to start conversing with your project.

Natural language becomes your primary interface. Ask the agent to check project health, assign work, or identify priorities. The agent executes `gitgov` commands on your behalf, providing conversational access to the complete system functionality.

### Example Interactions

#### **Project Health Check**

- **You:** `"@gitgov, how are we doing?"`
- **Agent:** `"Our backlog health is at 87%, but task 'Refactor Compiler' has been stalled for 12 days, and there are 3 critical blockers. Throughput is good, but our lead time is high."`
- _Run `gitgov status --health --alerts` for full details._

#### **Work Assignment**

- **You:** `"@gitgov, what should I work on next?"`
- **Agent:** `"You have one high-priority feedback item assigned to you: 'Refactor Compiler', which is blocking 3 other tasks. This is critical."`
- _Use `gitgov task show <task-id>` for details._

#### **Blocking Issues**

- **You:** `"@gitgov, what's blocked?"`
- **Agent:** `"There are 3 critical blockers: Task X (12 days), Task Y (8 days), and Task Z (5 days). I recommend prioritizing these to improve project flow."`
- _Use `gitgov task list --status blocked` for analysis._

---

## 📦 Monorepo Structure

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
     |     .gitgov/ (Records)         |
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
