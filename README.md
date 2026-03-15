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

| Package | Version | Tests | License | Purpose |
|:--------|:--------|------:|:--------|:--------|
| **Protocol** | — | — | ![Apache-2.0](https://img.shields.io/badge/Apache--2.0-brightgreen.svg) | The **Standard** — RFCs, schemas, specifications |
| [`@gitgov/core`](packages/core/README.md) | 2.10.1 | 2,568 | ![MPL-2.0](https://img.shields.io/badge/MPL--2.0-brightgreen.svg) | The **Engine** — SDK for records, validation, storage, adapters |
| [`@gitgov/cli`](packages/cli/README.md) | 2.1.0 | 475 | ![Apache-2.0](https://img.shields.io/badge/Apache--2.0-brightgreen.svg) | The **Tool** — CLI for humans and AI agents |
| [`@gitgov/mcp-server`](packages/mcp-server/README.md) | — | 199 | ![Apache-2.0](https://img.shields.io/badge/Apache--2.0-brightgreen.svg) | The **Bridge** — 43 MCP tools for AI agents |
| [`@gitgov/e2e`](packages/e2e/README.md) | — | 36 | ![Apache-2.0](https://img.shields.io/badge/Apache--2.0-brightgreen.svg) | The **Validation** — Cross-package E2E tests (CLI + core + GitHub) |

## Community

- **GitHub Discussions:** Questions, ideas, and architecture discussions.
- **Discord:** Community chat with the team and contributors.
- **Twitter/X:** Project updates and announcements.

## License

- **Protocol Specs (RFCs, Schemas)**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)
- **`@gitgov/core`**: [Mozilla Public License 2.0 (MPL-2.0)](https://opensource.org/licenses/MPL-2.0)
- **`@gitgov/cli`**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)
- **`@gitgov/mcp-server`**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)
- **`@gitgov/e2e`**: [Apache License 2.0](https://opensource.org/licenses/Apache-2.0)

The protocol specification is licensed permissively to maximize adoption as an open standard. The core SDK uses weak copyleft to protect shared improvements while allowing commercial integration. The CLI, MCP server, and E2E tests are permissively licensed to maximize distribution as adoption tools.

---

**Built with ❤️ by the GitGovernance team.**
