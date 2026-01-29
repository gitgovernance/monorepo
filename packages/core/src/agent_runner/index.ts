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

// Interface and types only - NO implementation re-exports
export type {
  // Core interface
  IAgentRunner,
  IAgentLoader,
  // Execution types
  RunOptions,
  AgentResponse,
  AgentOutput,
  AgentExecutionContext,
  AgentRunnerDependencies,
  AgentRunnerEvent,
  // Registry types
  ProtocolHandlerRegistry,
  ProtocolHandler,
  RuntimeHandlerRegistry,
  RuntimeHandler,
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
} from "./errors";
