import type { AgentRecord } from "../record_types";
import type { IEventStream } from "../event_bus";
import type { IExecutionAdapter } from "../adapters/execution_adapter";
import type { IIdentityAdapter } from "../adapters/identity_adapter";
import type { ProtocolHandlerRegistry, RuntimeHandlerRegistry } from "./agent_runner";

// ============================================================================
// Engine Types (derived from AgentRecord — source: agent_record_schema.yaml)
//
// These types are extracted from the generated AgentRecord interface so that
// the YAML schema remains the single source of truth.  If the schema changes,
// run `pnpm compile:types` and these aliases update automatically.
// ============================================================================

/**
 * Union type of all supported engines.
 */
export type Engine = AgentRecord["engine"];

/**
 * Supported engine types by the runner.
 */
export type EngineType = Engine["type"];

/**
 * Local engine configuration.
 * Agent executes in the same process.
 */
export type LocalEngine = Extract<Engine, { type: "local" }>;

/**
 * API engine configuration.
 * Agent executes on a remote server via HTTP.
 */
export type ApiEngine = Extract<Engine, { type: "api" }>;

/**
 * MCP engine configuration.
 * Agent executes as MCP server (Model Context Protocol).
 */
export type McpEngine = Extract<Engine, { type: "mcp" }>;

/**
 * Custom engine configuration.
 * Allows extensibility via registered protocol handlers.
 */
export type CustomEngine = Extract<Engine, { type: "custom" }>;

/**
 * Authentication configuration for remote backends (API/MCP).
 * Extracted from the API engine's auth field.
 */
export type AuthConfig = NonNullable<ApiEngine["auth"]>;

/**
 * Authentication types for remote backends.
 */
export type AuthType = NonNullable<AuthConfig["type"]>;

// ============================================================================
// Agent Runner Types
// ============================================================================

/**
 * Execution context passed to each agent.
 * Includes all information needed for traceability.
 */
export type AgentExecutionContext = {
  /** Agent ID being executed (e.g., "agent:source-audit") */
  agentId: string;
  /** ActorRecord executing (type "agent") */
  actorId: string;
  /** TaskRecord that triggered this execution (required) */
  taskId: string;
  /** Unique UUID for this execution */
  runId: string;
  /** Optional input passed to the agent (from RunOptions.input) */
  input?: unknown;
};

/**
 * Options for executing an agent.
 */
export type RunOptions = {
  /** Agent ID to execute (e.g., "agent:source-audit") */
  agentId: string;
  /** TaskRecord that triggers this execution (required) */
  taskId: string;
  /** Actor executing. If not provided, uses agentId */
  actorId?: string;
  /** Specific tool to invoke (MCP engines only) */
  tool?: string;
  /** Input to pass to the agent */
  input?: unknown;
};

/**
 * Structured output from the agent.
 * Captured by the runner from each backend.
 */
export type AgentOutput = {
  /** Response data from agent (free structure) */
  data?: unknown;
  /** Text message (summary or description) */
  message?: string;
  /** Generated artifacts (file paths, record IDs, etc.) */
  artifacts?: string[];
  /** Additional agent metadata */
  metadata?: Record<string, unknown>;
};

/**
 * Complete response from an agent execution.
 * Returned by runner.runOnce().
 */
export type AgentResponse = {
  /** Unique UUID for this execution */
  runId: string;
  /** Executed agent ID */
  agentId: string;
  /** Execution status */
  status: "success" | "error";
  /** Agent output (only if status: "success") */
  output?: AgentOutput;
  /** Error message (only if status: "error") */
  error?: string;
  /** Created ExecutionRecord ID */
  executionRecordId: string;
  /** Start timestamp */
  startedAt: string;
  /** Completion timestamp */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
};

/**
 * AgentRunner module dependencies (filesystem implementation).
 */
export type AgentRunnerDependencies = {
  /** Path to project root (REQUIRED, injected from CLI/bootstrap) */
  projectRoot: string;
  /** Path to .gitgov directory (optional, defaults to projectRoot/.gitgov) */
  gitgovPath?: string;
  /** IdentityAdapter for actor-signature auth (required if that auth type is used) */
  identityAdapter?: IIdentityAdapter;
  /** ExecutionAdapter for persisting executions (REQUIRED) */
  executionAdapter: IExecutionAdapter;
  /** EventBus for emitting events (optional, no events if not provided) */
  eventBus?: IEventStream;
  /** Protocol handler registry (for engine.type: "custom") */
  protocolHandlers?: ProtocolHandlerRegistry;
  /** Runtime handler registry (for engine.runtime in local engines) */
  runtimeHandlers?: RuntimeHandlerRegistry;
};

/**
 * Events emitted by the runner via EventBus.
 */
export type AgentRunnerEvent =
  | {
      type: "agent:started";
      payload: {
        runId: string;
        agentId: string;
        taskId: string;
        startedAt: string;
      };
    }
  | {
      type: "agent:completed";
      payload: {
        runId: string;
        agentId: string;
        taskId: string;
        status: "success";
        durationMs: number;
        executionRecordId: string;
      };
    }
  | {
      type: "agent:error";
      payload: {
        runId: string;
        agentId: string;
        taskId: string;
        status: "error";
        error: string;
        durationMs: number;
        executionRecordId: string;
      };
    };
