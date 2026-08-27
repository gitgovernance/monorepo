import type { AgentRecord } from "../record_types";
import type {
  CustomEngine,
  Engine,
  EngineValidationResult,
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

/**
 * [ARUN-M1] Contract for validating that an agent engine is EXECUTABLE, not just
 * well-formed — the creation-time counterpart of the audit-time detection
 * (AORCH-G1/G2). A registered agent should be an agent that runs, not a JSON
 * pointing nowhere.
 *
 * The CONTRACT lives here, in the pure barrel, because consumers only need the type:
 * `ProjectModule` (PROJ-B6) and `agent new` (EARS-E9) never touch the filesystem
 * themselves. The only implementation that exists today does — it resolves entrypoints
 * with `require.resolve` and imports them — so it ships from `@gitgov/core/fs` as
 * `FsEngineValidator` (ARUN-M2).
 *
 * That split is not stylistic: while `ProjectModule` imported the concrete function, it
 * dragged `backends/local_backend.ts` — and with it `path` and `node:module` — into the
 * `@gitgov/core` bundle. Those were the last two violations reported by EARS-CI02.
 */
export interface IEngineValidator {
  /** Validates `engine` from `projectRoot`. NEVER throws. */
  validate(engine: Engine, projectRoot: string): Promise<EngineValidationResult>;
}
