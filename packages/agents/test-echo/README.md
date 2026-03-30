# @gitgov/agent-test-echo

Minimal reference agent for the [GitGovernance](https://github.com/gitgovernance/monorepo) ecosystem. Receives input, returns an echo with execution context.

**What it's for:**

- Validate that the AgentRunner works correctly
- Concrete example of how to create an agent from scratch
- Demonstrate both installation modes: NPM package and local path
- Template for creating new agents

---

## Prerequisites

- [GitGovernance CLI](https://github.com/gitgovernance/monorepo) installed (`npm install -g @gitgov/cli`)
- A project initialized with `gitgov init`

---

## Installation

### Option A: From NPM (production, CI, GitLab Duo)

```bash
npm install @gitgov/agent-test-echo
```

### Option B: From the monorepo (local development)

```bash
cd packages/agents/test-echo
pnpm build
```

No need to install anything — the CLI can load the agent directly from its local path.

---

## Agent Registration

Register the agent in your GitGovernance project. One command — the CLI auto-creates the cryptographic identity (ActorRecord + Ed25519 keypair) if it doesn't exist.

**If installed from NPM:**

```bash
gitgov agent new agent:test-echo --config '{
  "metadata": { "purpose": "testing", "role": "tester" },
  "engine": {
    "type": "local",
    "entrypoint": "@gitgov/agent-test-echo",
    "function": "runAgent"
  }
}'
# → ActorRecord auto-created: agent:test-echo
# → AgentRecord created: agent:test-echo
```

**If using local path (development):**

```bash
gitgov agent new agent:test-echo --config '{
  "metadata": { "purpose": "testing", "role": "tester" },
  "engine": {
    "type": "local",
    "entrypoint": "packages/agents/test-echo/dist/index.mjs",
    "function": "runAgent"
  }
}'
```

### Verify

```bash
gitgov agent list
# → agent:test-echo  engine:local  status:active
```

> **Note:** You can still create the actor separately with `gitgov actor new --type agent --name test-echo --role tester` if you prefer. The `agent new` command will detect it already exists and skip the auto-creation.

---

## Execution

```bash
# Without input
gitgov agent run agent:test-echo

# With input
gitgov agent run agent:test-echo --input '{"hello": "world"}'
```

### Expected output

```json
{
  "message": "Echo agent executed successfully at 2026-03-26T12:00:00.000Z",
  "data": {
    "echo": { "hello": "world" },
    "context": {
      "agentId": "agent:test-echo",
      "taskId": "1774524476-task-run-test-echo",
      "runId": "a1b2c3d4-...",
      "projectRoot": "/path/to/your/repo"
    }
  },
  "metadata": {
    "executedAt": "2026-03-26T12:00:00.000Z",
    "version": "1.0.0"
  }
}
```

The `AgentRunner` automatically:
- Loads the `AgentRecord` from `.gitgov/agents/`
- Resolves the entrypoint (NPM or local path)
- Executes `runAgent(ctx)` injecting `projectRoot` (the repo directory)
- Creates and signs an `ExecutionRecord` with Ed25519
- Emits events via `EventBus`

Your agent only returns `AgentOutput`. It doesn't need to know about signing or records.

---

## Entrypoint Modes

The `engine.entrypoint` in the AgentRecord supports 3 formats:

| Mode | Entrypoint value | When to use |
|---|---|---|
| **NPM package** | `"@gitgov/agent-test-echo"` | Production, CI, GitLab Duo container. Agent installed via `npm install` |
| **Relative path** | `"packages/agents/test-echo/dist/index.mjs"` | Local development in the monorepo. Resolved from the project root |
| **Absolute path** | `"/Users/.../dist/index.mjs"` | Debugging. Used directly without resolution |

The `LocalBackend` detects the mode automatically:
- Starts with `@` or has no file extension → NPM package
- Starts with `/` → absolute path
- Starts with `.` or has a file extension → relative path

---

## Create Your Own Agent

Use this package as a template:

### 1. Copy

```bash
cp -r packages/agents/test-echo packages/agents/my-agent
```

### 2. Edit `package.json`

```json
{
  "name": "@gitgov/agent-my-agent",
  "version": "1.0.0",
  ...
}
```

### 3. Edit `index.ts`

```typescript
type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
  /** User's repo directory. Use instead of process.cwd(). */
  projectRoot: string;
};

type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

export async function runAgent(ctx: AgentExecutionContext): Promise<AgentOutput> {
  // ctx.projectRoot — repo directory (where source files live)
  // ctx.input       — user input (passed with --input)
  // ctx.agentId     — this agent's ID
  // ctx.taskId      — TaskRecord that triggered execution

  // Your logic here...

  return {
    message: "My agent executed successfully",
    data: { /* your result */ },
    metadata: { /* your metadata */ },
  };
}
```

**Important:** Use `ctx.projectRoot` for filesystem access. Never use `process.cwd()` — it may point to the wrong directory when the agent runs via AgentRunner.

### 4. Build and register

```bash
pnpm build

gitgov actor new --type agent --name my-agent --role developer
gitgov agent new agent:my-agent --config '{
  "metadata": { "purpose": "audit" },
  "engine": { "type": "local", "entrypoint": "@gitgov/agent-my-agent", "function": "runAgent" }
}'
gitgov agent run agent:my-agent
```

### 5. Publish to NPM (optional)

```bash
npm publish
```

Any user can then:
```bash
npm install @gitgov/agent-my-agent
gitgov actor new --type agent --name my-agent --role developer
gitgov agent new agent:my-agent --config '{"engine":{"type":"local","entrypoint":"@gitgov/agent-my-agent"}}'
gitgov agent run agent:my-agent
```

---

## How the AgentRunner Works

```
User runs: gitgov agent run agent:test-echo --input '{"hello":"world"}'
         │
         ▼
    AgentRunner
         │
         ├── 1. loadAgent("agent:test-echo")
         │       └── FsRecordStore reads .gitgov/agents/agent_test-echo.json
         │
         ├── 2. Resolve entrypoint
         │       ├── "@gitgov/agent-test-echo" → import from node_modules
         │       └── "packages/.../dist/index.mjs" → import from local path
         │
         ├── 3. Build AgentExecutionContext
         │       └── { agentId, actorId, taskId, runId, input, projectRoot }
         │
         ├── 4. Execute runAgent(ctx)
         │       └── Your function runs and returns AgentOutput
         │
         ├── 5. Create ExecutionRecord (automatic)
         │       └── Signed with the agent's ActorRecord Ed25519 key
         │
         └── 6. Return AgentResponse to CLI
                 └── { status, output, executionRecordId, durationMs }
```

---

## Existing Agents in the Ecosystem

| Agent | Purpose | Package |
|---|---|---|
| **test-echo** | Testing and reference | `@gitgov/agent-test-echo` |
| **security-audit** | PII, secrets, GDPR detection | `@gitgov/agent-security-audit` |
| **review-advisor** | Semantic analysis with Claude | `@gitgov/agent-review-advisor` |

---

## License

MPL-2.0
