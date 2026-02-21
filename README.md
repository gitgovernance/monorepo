![License: Apache-2.0](https://img.shields.io/badge/Protocol-Apache--2.0-blue.svg)
![License: MPL-2.0](https://img.shields.io/badge/Core-MPL--2.0-blue.svg)
![core npm version](https://img.shields.io/npm/v/@gitgov/core?color=orange&label=Core%20npm)
![Tests](https://img.shields.io/badge/Core-2628%20tests-success)
![License: Apache-2.0](https://img.shields.io/badge/CLI-Apache--2.0-blue.svg)
![cli npm version](https://img.shields.io/npm/v/@gitgov/cli?color=orange&label=CLI%20npm)
![Tests](https://img.shields.io/badge/CLI-450%20tests-success)
![License: Apache-2.0](https://img.shields.io/badge/MCP--Server-Apache--2.0-blue.svg)
![Tests](https://img.shields.io/badge/MCP--Server-199%20tests-success)

# GitGovernance

**An Operating System for Intelligent Work, built on Git.**

GitGovernance provides the infrastructure of trust to orchestrate collaboration between human and AI agents, bringing engineering discipline to hybrid teams.

> **Recognized Winner at the Code with Kiro Hackathon (October 2025)**

<img width="876" height="604" alt="GitGovernance TUI Dashboard" src="https://github.com/user-attachments/assets/016a4bef-d374-4963-aef3-19303650fb3a" />

## Why GitGovernance?

Modern software teams combine humans and AI agents, but face a coordination gap: developers work in code, managers track in boards, agents execute in isolation. The result is coordination silos and leaders operating without unified, verifiable truth.

GitGovernance is not another management tool. It's a protocol layer that unifies all work into an auditable, verifiable Git history. We built it on Git because it's the most robust distributed traceability system in the world.

It's not about replacing your board; it's about giving it a foundation of truth.

---

## Getting Started

```bash
npm install -g @gitgov/cli

cd your-project
git init
gitgov init --name "My Project"
gitgov status
gitgov dashboard
```

## Converse with Your Project

**You don't need to memorize commands.** Open your IDE -- Cursor, VS Code, or any editor with AI capabilities -- and talk to `@gitgov` in natural language. The agent translates your intent into precise commands.

```
You:    "How are we doing?"
Agent:  "Backlog health is at 87%, but 3 tasks are stalled.
         You have 1 critical feedback blocking 3 other tasks."
         → gitgov status --health --alerts

You:    "What should I work on next?"
Agent:  "Task 'Refactor Compiler' is high-priority and blocking 3 others.
         This is critical."
         → gitgov task show <task-id>

You:    "Create a task for the login bug"
Agent:  → gitgov task new "Fix login authentication bug" --priority high

You:    "How's the sprint going?"
Agent:  "Sprint is 70% done, 3 tasks active, 1 blocked."
         → gitgov status --all --cycles --health
```

---

## Packages

| Package | License | Purpose | Documentation |
|:--------|:--------|:--------|:--------------|
| **Protocol** | Apache 2.0 | The **Standard** -- RFCs, schemas, and normative specifications. | [`protocol/`](packages/private/packages/blueprints/03_products/protocol/unified/) |
| **`@gitgov/core`** | MPL-2.0 | The **Engine** -- Type-safe SDK for business logic, records, validation, storage, adapters. | [`README.md`](packages/core/README.md) |
| **`@gitgov/cli`** | Apache 2.0 | The **Tool** -- Command-line interface for humans and AI agents. | [`README.md`](packages/cli/README.md) |
| **`@gitgov/mcp-server`** | Apache 2.0 | The **Bridge** -- MCP server exposing 43 tools for AI agents (Claude Code, Cursor, Windsurf). | [`README.md`](packages/mcp-server/README.md) |

## Community

- **GitHub Discussions:** Questions, ideas, and architecture discussions.
- **Discord:** Community chat with the team and contributors.
- **Twitter/X:** Project updates and announcements.

## License

- **Protocol Specs (RFCs, Schemas)**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)
- **`@gitgov/core`**: [Mozilla Public License 2.0 (MPL-2.0)](https://opensource.org/licenses/MPL-2.0)
- **`@gitgov/cli`**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)
- **`@gitgov/mcp-server`**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)

The protocol specification is licensed permissively to maximize adoption as an open standard. The core SDK uses weak copyleft to protect shared improvements while allowing commercial integration. The CLI and MCP server are permissively licensed to maximize distribution as adoption tools.

---

**Built with ❤️ by the GitGovernance team.**
