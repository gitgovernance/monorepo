import type { AgentRecord } from "../types";
import type { IEventStream } from "../event_bus";
import type { IExecutionAdapter } from "../adapters/execution_adapter";
import type { IIdentityAdapter } from "../adapters/identity_adapter";

// ============================================================================
// Engine Types (from agent_protocol.md)
// ============================================================================

/**
 * Supported engine types by the runner (per agent_protocol.md).
 */
export type EngineType = "local" | "api" | "mcp" | "custom";

/**
 * Local engine configuration.
 * Agent executes in the same process.
 */
export type LocalEngine = {
  type: "local";
  /** Registered runtime (e.g., "claude:computer-use", "langchain:agent") */
  runtime?: string;
  /** Relative path to entrypoint (from project root) */
  entrypoint?: string;
  /** Exported function name (default: "runAgent") */
  function?: string;
};

/**
 * Authentication types for remote backends (API/MCP).
 */
export type AuthType =
  | "none"
  | "bearer"
  | "oauth"
  | "api-key"
  | "actor-signature";

/**
 * Authentication configuration for remote backends.
 */
export type AuthConfig = {
  type: AuthType;
  /** Environment variable name with token/key */
  secret_key?: string;
  /** Direct token (not recommended, prefer secret_key) */
  token?: string;
};

/**
 * API engine configuration.
 * Agent executes on a remote server via HTTP.
 */
export type ApiEngine = {
  type: "api";
  /** Agent endpoint URL (required) */
  url: string;
  /** HTTP method (default: "POST") */
  method?: "POST" | "GET" | "PUT";
  /** Authentication configuration */
  auth?: AuthConfig;
};

/**
 * MCP engine configuration.
 * Agent executes as MCP server (Model Context Protocol).
 */
export type McpEngine = {
  type: "mcp";
  /** MCP server URL (required) */
  url: string;
  /** Tool name to invoke (default: uses agentId) */
  tool?: string;
  /** Authentication configuration */
  auth?: AuthConfig;
};

/**
 * Custom engine configuration.
 * Allows extensibility via registered protocol handlers.
 */
export type CustomEngine = {
  type: "custom";
  /** Protocol identifier (e.g., "a2a", "grpc") - required for execution */
  protocol?: string;
  /** Protocol-specific configuration */
  config?: Record<string, unknown>;
};

/**
 * Union type of all supported engines.
 */
export type Engine = LocalEngine | ApiEngine | McpEngine | CustomEngine;

// ============================================================================
// Agent Runner Types
// ============================================================================

/**
 * Execution context passed to each agent.
 * Includes all information needed for traceability.
 */
export type AgentExecutionContext = {
  /** Agent ID being executed (e.g., "agent:gdpr-audit") */
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
  /** Agent ID to execute (e.g., "agent:gdpr-audit") */
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
 * Registry for protocol handlers (engine.type: "custom").
 */
export interface ProtocolHandlerRegistry {
  register(protocol: string, handler: ProtocolHandler): void;
  get(protocol: string): ProtocolHandler | undefined;
}

/**
 * Handler for engine.type: "custom".
 */
export type ProtocolHandler = (
  engine: CustomEngine,
  ctx: AgentExecutionContext
) => Promise<AgentOutput>;

/**
 * Registry for runtime handlers (engine.runtime in local engines).
 */
export interface RuntimeHandlerRegistry {
  register(runtime: string, handler: RuntimeHandler): void;
  get(runtime: string): RuntimeHandler | undefined;
}

/**
 * Handler for engine.runtime in local engines.
 */
export type RuntimeHandler = (
  engine: LocalEngine,
  ctx: AgentExecutionContext
) => Promise<AgentOutput>;

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

/**
 * Interface for agent loader (allows mocking in tests).
 */
export interface IAgentLoader {
  loadAgent(agentId: string): Promise<AgentRecord>;
}

/**
 * Interface for AgentRunner implementations.
 * Allows different backends (filesystem, memory, serverless).
 */
export interface IAgentRunner {
  /**
   * Executes an agent once and returns the response.
   * TaskRecord must exist before calling this method.
   */
  runOnce(opts: RunOptions): Promise<AgentResponse>;
}
