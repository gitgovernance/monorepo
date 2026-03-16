# @gitgov/agent-security-audit

Security audit agent for GitGovernance. Scans repositories for PII, secrets, and API keys, producing SARIF 2.1.0 output.

**Agent ID:** `agent:gitgov:security-audit`

## Delegation Model

```
GitGov signs, the scanner detects.

  agent:gitgov:security-audit (wrapper)
          │
          ├── ActorRecord (identity)
          │   type: "agent", publicKey: Ed25519
          │   Signs ExecutionRecords
          │
          └── Scanner (detection logic)
              SourceAuditorModule   ← does NOT know the protocol
              FindingDetectorModule ← does NOT sign anything
              SarifBuilder          ← format, not protocol

The agent attests: "I, agent:gitgov:security-audit,
executed the scanner and certify these findings."
```

The scanner modules are open-source detection logic. The agent wraps them with protocol identity (Ed25519 signature on ExecutionRecord). Replacing the scanner does not change the agent's identity.

## Usage

### Via AgentRunner (production)

```bash
gitgov agent run agent:gitgov:security-audit --task task-001
```

AgentRunner reads the AgentRecord, constructs `AgentExecutionContext`, invokes `runAgent`, and creates a signed `ExecutionRecord`.

### Via AuditOrchestrator

The orchestrator discovers this agent and invokes it as part of a multi-agent audit pipeline. The agent returns `AgentOutput` with SARIF metadata that the orchestrator consolidates.

### Standalone (development)

```typescript
import { runAgent } from '@gitgov/agent-security-audit';

const output = await runAgent({
  agentId: 'agent:gitgov:security-audit',
  actorId: 'agent:gitgov:security-audit',
  taskId: 'task-001',
  runId: crypto.randomUUID(),
  input: {
    scope: 'full',
    taskId: 'task-001',
    baseDir: '/path/to/repo',
  },
});

// output.metadata.kind === 'sarif'
// output.metadata.data === SarifLog
```

## Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `full` | Scans all files in the repository | Initial audit, baseline creation |
| `diff` | Scans only changed files (via `changedSince: 'HEAD'`) | PR review, incremental audit |
| `baseline` | Full scan saved as reference snapshot | Compliance baseline |

## Configuration

The agent uses an internal `DEFAULT_CONFIG` with a two-stage pipeline:

1. **regex** (non-conditional) — fast pattern matching, always runs
2. **heuristic** (conditional) — deeper analysis, only runs if regex found findings

LLM detection is not in the default pipeline — it requires explicit override.

### Pipeline Override

```typescript
// Custom pipeline with LLM stage
const input = {
  scope: 'full',
  taskId: 'task-001',
  baseDir: '/path/to/repo',
};
```

The `buildConfig()` function accepts optional `Partial<AgentDetectorConfig>` overrides.

## Output

The agent returns `AgentOutput` with:

```typescript
{
  message: "Scan completed: 3 findings across 42 files",
  metadata: {
    kind: "sarif",          // format discriminator
    version: "2.1.0",       // OASIS SARIF version
    data: SarifLog,         // full SARIF log
    summary: {
      totalFindings: 3,
      bySeverity: { high: 1, medium: 2 },
      byCategory: { "pii-email": 1, "hardcoded-secret": 2 },
      scopeType: "full",
      filesScanned: 42,
    }
  }
}
```

The agent emits **ALL** findings without waiver filtering. Waiver application is the orchestrator's responsibility (Decision A12/A13).

## Dependencies

| Module | Source | Purpose |
|--------|--------|---------|
| `SourceAuditorModule` | `@gitgov/core` | Core scan pipeline |
| `FindingDetectorModule` | `@gitgov/core` | Detection engine (regex/heuristic/llm) |
| `createSarifBuilder()` | `@gitgov/core` (Sarif namespace) | SARIF 2.1.0 output |
| `FsFileLister` | `@gitgov/core/fs` | File system listing |
