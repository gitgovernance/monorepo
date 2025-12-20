import type { AgentRecord } from "../types";
import type { IEventStream } from "../event_bus";
import type { IExecutionAdapter } from "../adapters/execution_adapter";
import type { IIdentityAdapter } from "../adapters/identity_adapter";
import type { CustomEngine } from "./engines";

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
 * AgentRunner module dependencies.
 */
export type AgentRunnerDependencies = {
  /** Path to .gitgov directory (optional, uses ConfigManager by default) */
  gitgovPath?: string;
  /** Path to project root (optional, uses ConfigManager by default) */
  projectRoot?: string;
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
  engine: LocalEngineForHandler,
  ctx: AgentExecutionContext
) => Promise<AgentOutput>;

/**
 * LocalEngine shape for handlers (avoids circular import).
 */
export type LocalEngineForHandler = {
  type: "local";
  runtime?: string;
  entrypoint?: string;
  function?: string;
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

/**
 * Interface for agent loader (allows mocking in tests).
 */
export interface IAgentLoader {
  loadAgent(agentId: string): Promise<AgentRecord>;
}
