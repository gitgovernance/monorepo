/**
 * AgentRunner - Agent execution abstraction
 *
 * This module provides backend-agnostic agent execution.
 *
 * IMPORTANT: This module only exports the interface and types.
 * For implementations, use:
 * - @gitgov/core/fs for FsAgentRunner
 *
 * @example
 * ```typescript
 * // Import interface and types
 * import type { IAgentRunner, RunOptions, AgentResponse } from '@gitgov/core';
 *
 * // Import filesystem implementation from fs entry point
 * import { FsAgentRunner } from '@gitgov/core/fs';
 * ```
 */

// Interfaces and handler types (from agent_runner.ts)
export type {
  IAgentRunner,
  IAgentLoader,
  IEngineValidator,
  ProtocolHandlerRegistry,
  ProtocolHandler,
  RuntimeHandlerRegistry,
  RuntimeHandler,
  IEngineBackend,
  EngineBackendMap,
} from "./agent_runner";

// Pure types (from agent_runner.types.ts)
export type {
  EngineValidationResult,
  RunOptions,
  AgentResponse,
  AgentOutput,
  AgentExecutionContext,
  AgentRunnerDependencies,
  AgentRunnerEvent,
  // Engine types (from protocol)
  Engine,
  EngineType,
  LocalEngine,
  ApiEngine,
  McpEngine,
  CustomEngine,
  AuthType,
  AuthConfig,
} from "./agent_runner.types";

// [ARUN-N1..N3] Pure resolution from the root — consumers resolve engine.type against
// their own IEngineBackend implementations without touching /fs.
export { resolveRunner } from "./resolve_runner";

// Errors are part of the public contract
export {
  RunnerError,
  AgentNotFoundError,
  FunctionNotExportedError,
  LocalEngineConfigError,
  UnsupportedEngineTypeError,
  EngineConfigError,
  MissingDependencyError,
  RuntimeNotFoundError,
} from "./agent_runner.errors";
