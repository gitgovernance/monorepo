# @gitgov/mcp-server

MCP server that exposes [GitGovernance](https://github.com/gitgovernance) operations as tools for AI agents. Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.

36 tools, 3 prompts, dynamic `gitgov://` resources. Stdio and HTTP transports.

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

## Tools (36)

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

### Audit & Identity (5)

| Tool | Description |
|---|---|
| `gitgov_audit_scan` | Scan project for audit findings |
| `gitgov_audit_waive` | Waive an audit finding |
| `gitgov_audit_waive_list` | List active waivers |
| `gitgov_agent_run` | Execute a registered agent |
| `gitgov_actor_new` | Register a new actor |

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

## Development

```bash
# Run locally with tsx
pnpm --filter @gitgov/mcp-server dev

# Run tests (184 tests across 3 levels)
pnpm --filter @gitgov/mcp-server test

# Type check
pnpm --filter @gitgov/mcp-server typecheck

# Build
pnpm --filter @gitgov/mcp-server build
```

## Architecture

```
src/
  index.ts                    Entry point (stdio + HTTP transport)
  server/                     McpServer wrapper + types
  di/                         Dependency injection (lazy singleton)
  tools/
    read/                     9 read-only tools (status, context, lint, list/show)
    task/                     7 task lifecycle tools (CRUD + state transitions)
    feedback/                 3 feedback tools (create, list, resolve)
    cycle/                    8 cycle management tools (CRUD + task linking)
    sync/                     4 sync tools (push, pull, resolve, audit)
    audit/                    5 tools (audit scan/waive + agent_run + actor_new)
  prompts/                    3 prompt handlers
  resources/                  gitgov:// resource handler
  integration/
    protocol/                 Level 2: InMemoryTransport tests (47 tests)
    core/                     Level 2: real DI + filesystem tests (32 tests)
  e2e/                        Level 3: real server process tests (15 tests)
```

## License

Apache-2.0
