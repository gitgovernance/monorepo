import type { AgentRecord } from "../types";
import type {
  CustomEngine,
  LocalEngine,
  AgentExecutionContext,
  RunOptions,
  AgentOutput,
  AgentResponse,
} from "./agent_runner.types";

// ============================================================================
// Interfaces
// ============================================================================

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
