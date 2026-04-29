# AGENTS.md — @gitgov/mcp-server

## Package Overview

MCP server exposing GitGovernance operations as tools for AI agents. 43 tools, 3 prompts, `gitgov://` resources. Stdio and HTTP transports.

## Architecture

```
src/
  index.ts          Entry point (stdio + HTTP transport)
  server/           McpServer wrapper + types
  di/               McpDependencyInjectionService (lazy singleton) + McpDiContainer
  tools/            43 tool handlers organized by domain
    read/           9 read-only tools (status, context, lint, list/show)
    task/           7 task lifecycle tools (CRUD + state transitions)
    feedback/       3 feedback tools (create, list, resolve)
    cycle/          8 cycle management tools (CRUD + task linking)
    execution/      3 execution tools (create, list, show)
    identity/       2 identity tools (actor_list, actor_show)
    workflow/       1 workflow tool (transitions query)
    agent/          1 tool (agent_new)
    sync/           4 sync tools (push, pull, resolve, audit)
    audit/          5 tools (audit scan/waive + agent_run + actor_new)
  prompts/          3 prompt handlers (plan-sprint, review-my-tasks, prepare-pr-summary)
  resources/        gitgov:// resource handler (tasks, cycles, actors)
  integration/      Level 2 tests
    protocol/       InMemoryTransport tests
    core/           Real DI + filesystem tests
  e2e/              Level 3: real server process tests (stdio)
```

- **DI:** `McpDependencyInjectionService` — lazy singleton, constructs all modules from a project root
- **Container:** `McpDiContainer` — typed object with all services, includes `getCurrentActor()` helper
- **Tools:** each tool is a standalone handler that receives `(input, di)` and returns `ToolResult`
- **Transport:** stdio (default) or HTTP via `--port` flag

## Key Conventions

- Tools access records via adapters from the container — never construct stores directly
- `container.getCurrentActor()` resolves the active actor (session-first, fallback to first active)
- Identity operations use `IdentityModule` (not IdentityAdapter — eliminated in identity_module_v2)
- Signing uses `RecordSigner` for record operations, `KeyProvider` for auth signatures
- Record payloads are accessed via `.payload.*` (GitGovRecord = `{ header, payload }`)

## Export Inventory

| Category | Count | Examples |
|----------|-------|---------|
| Tools | 43 | task_new, cycle_add_task, sync_push, audit_scan |
| Prompts | 3 | plan-sprint, review-my-tasks, prepare-pr-summary |
| Resources | 3 types | gitgov://tasks/{id}, gitgov://cycles/{id}, gitgov://actors/{id} |

## Deuda Tecnica

| Deuda | Prioridad | Input |
|-------|-----------|-------|
| 18 `payload as unknown as Record<string, unknown>` casts in tools/prompts/resources | alta | [mcp_type_safety_input.md](../../packages/blueprints/03_products/epics/inputs/mcp_type_safety_input.md) |
| 14 `as unknown as McpDependencyInjectionService` casts in tests | alta | mismo input |
| `seedActor` in core_test_helpers uses invented header instead of core factories | alta | mismo input |
| `Lint.RecordStores` cast in mcp_di.ts | media | mismo input |

## Trabajo Futuro

Mejoras identificadas con input documentado. No es deuda técnica — son oportunidades para épicas futuras.

| Item | Input | Prioridad | Estado |
|:-----|:------|:----------|:-------|
| Eliminar 40 cast violations (payload casts, DI class casts, seedActor) | [mcp_type_safety_input.md](../../packages/blueprints/03_products/epics/inputs/mcp_type_safety_input.md) | alta | proposed |

## Si tocaste / Actualizar

| Si tocaste... | Actualizar |
|:-------------|:-----------|
| Nuevo tool en `tools/` | README.md tool count + tabla de tools |
| Nuevo prompt en `prompts/` | README.md prompt count + tabla |
| `di/mcp_di.ts` o `mcp_di.types.ts` | AGENTS.md §Architecture si cambia estructura |
| Nuevo script en `package.json` | README.md §Scripts |
| `@gitgov/core` types o imports | Verificar que no se redefinen tipos localmente |

## Dependencies

| Package | Usage |
|---------|-------|
| `@gitgov/core` | All record types, modules, adapters, crypto, stores (`workspace:*`) |
| `@modelcontextprotocol/sdk` | MCP protocol implementation (Client, Server, transports) |

---

**Last updated:** 2026-04-29 — Created during identity_module_v2 doc-coherence audit.
