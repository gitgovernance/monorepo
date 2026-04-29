# @gitgov/mcp-server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

MCP server that exposes [GitGovernance](https://github.com/gitgovernance) operations as tools for AI agents. Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.

43 tools, 3 prompts, dynamic `gitgov://` resources. Stdio and HTTP transports.

## Requirements

- Node.js >= 24
- A GitGovernance project (directory with `.gitgov/` or a git repo with `gitgov-state` branch)

## Installation

```bash
npm install -g @gitgov/mcp-server
```

Or within a monorepo:

```bash
pnpm add @gitgov/mcp-server
```

## Quick Start

### Claude Code

Add to `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "gitgov": {
      "command": "gitgov-mcp",
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP config:

```json
{
  "gitgov": {
    "command": "gitgov-mcp",
    "cwd": "/path/to/your/project"
  }
}
```

### HTTP Mode

For web services or remote clients:

```bash
gitgov-mcp --port 3100
# Listens on http://localhost:3100/mcp (StreamableHTTP transport)
```

## Tools (43)

### Read-Only (9)

| Tool | Description |
|---|---|
| `gitgov_status` | Project health, active cycles, recent tasks |
| `gitgov_context` | Config, session, and current actor |
| `gitgov_lint` | Run linter and return violations |
| `gitgov_task_list` | List tasks with optional status/cycle filters |
| `gitgov_task_show` | Full task detail by ID |
| `gitgov_cycle_list` | List all cycles with metadata |
| `gitgov_cycle_show` | Cycle detail with task hierarchy |
| `gitgov_agent_list` | List registered agents |
| `gitgov_agent_show` | Full agent definition by ID |

### Task Lifecycle (7)

| Tool | Description |
|---|---|
| `gitgov_task_new` | Create a task (status: draft) |
| `gitgov_task_delete` | Delete a draft task |
| `gitgov_task_submit` | draft -> review |
| `gitgov_task_approve` | review -> ready |
| `gitgov_task_activate` | ready -> active |
| `gitgov_task_complete` | active -> done |
| `gitgov_task_assign` | Assign actor to task |

### Feedback (3)

| Tool | Description |
|---|---|
| `gitgov_feedback_create` | Create feedback linked to an entity |
| `gitgov_feedback_list` | List feedback by entity or globally |
| `gitgov_feedback_resolve` | Resolve open feedback |

### Cycle Management (8)

| Tool | Description |
|---|---|
| `gitgov_cycle_new` | Create a cycle (status: planning) |
| `gitgov_cycle_activate` | planning -> active |
| `gitgov_cycle_complete` | active -> completed |
| `gitgov_cycle_edit` | Update cycle fields |
| `gitgov_cycle_add_task` | Link task to cycle |
| `gitgov_cycle_remove_task` | Unlink task from cycle |
| `gitgov_cycle_move_task` | Move task between cycles |
| `gitgov_cycle_add_child` | Add child cycle to parent |

### Sync (4)

| Tool | Description |
|---|---|
| `gitgov_sync_push` | Push state to gitgov-state branch |
| `gitgov_sync_pull` | Pull remote state |
| `gitgov_sync_resolve` | Resolve sync conflicts |
| `gitgov_sync_audit` | Audit state consistency |

### Execution (3)

| Tool | Description |
|---|---|
| `gitgov_execution_create` | Create an execution record linked to a task (proof of work) |
| `gitgov_execution_list` | List executions, optionally filtered by task and type |
| `gitgov_execution_show` | Show full details of an execution record |

### Identity (2)

| Tool | Description |
|---|---|
| `gitgov_actor_list` | List all actors, optionally filtered by type |
| `gitgov_actor_show` | Show detailed actor information by ID |

### Workflow (1)

| Tool | Description |
|---|---|
| `gitgov_workflow_transitions` | Get available task status transitions from a given status |

### Agent (1)

| Tool | Description |
|---|---|
| `gitgov_agent_new` | Create an AgentRecord for an actor of type agent |

### Audit (5)

| Tool | Description |
|---|---|
| `gitgov_audit_scan` | Scan project for audit findings |
| `gitgov_audit_waive` | Waive an audit finding |
| `gitgov_audit_waive_list` | List active waivers |
| `gitgov_agent_run` | Execute a registered agent |
| `gitgov_actor_new` | Register a new actor (human or agent) |

## Prompts (3)

| Prompt | Description |
|---|---|
| `plan-sprint` | Sprint planning summary with active cycles and suggested actions |
| `review-my-tasks` | List tasks relevant to the current actor |
| `prepare-pr-summary` | Generate PR summary from completed tasks in a cycle |

## Resources

The server exposes `gitgov://` URIs for all records:

- `gitgov://tasks/{id}` -- Task records
- `gitgov://cycles/{id}` -- Cycle records
- `gitgov://actors/{id}` -- Actor records

MCP clients can browse and read these via the standard resources protocol.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Run locally with tsx (stdio transport) |
| `pnpm build` | Build with tsup (ESM bundle) |
| `pnpm test` | Vitest run (199 tests, 3 levels) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm typecheck` | tsc --noEmit |

## Environment

The MCP server requires no env vars for basic usage (reads `.gitgov/` from filesystem).

`process.env` is used internally in two contexts:
- DI container: passed to child processes (git commands) for Git operations
- E2E tests: passed to spawnMcpServer to inherit the test environment

No env vars need to be configured by the user.

## Development

```bash
pnpm --filter @gitgov/mcp-server dev
pnpm --filter @gitgov/mcp-server test
pnpm --filter @gitgov/mcp-server typecheck
pnpm --filter @gitgov/mcp-server build
```

## @gitgov/core — Type System

This package depends on `@gitgov/core`. All record types, audit types, factories, and modules come from core.

**Rules:**
- Import types from `@gitgov/core` or `@gitgov/core/audit` — never redefine locally
- Record metadata is generic: `ExecutionRecord<SarifExecutionMetadata>`, `ActorRecord<GitHubActorMetadata>`
- Status enums (`FindingSeverity`, `WaiverStatus`, `ScanDisplayStatus`) come from core — never use bare `string`
- If a type you need does not exist in core, add it to core — do not invent it locally

See [@gitgov/core README](../core/README.md) for the full type chain (YAML → JSON → TS → generics) and import paths.

## License

This package is licensed under the [Apache License 2.0](https://opensource.org/licenses/Apache-2.0).

