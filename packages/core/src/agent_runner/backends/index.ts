/**
 * Engine Backends for Agent Runner
 *
 * This module exports the 4 engine backends per agent_protocol.md §5.1:
 * - LocalBackend: engine.type: "local" - in-process execution via dynamic import
 * - ApiBackend: engine.type: "api" - HTTP endpoint execution
 * - McpBackend: engine.type: "mcp" - Model Context Protocol execution
 * - CustomBackend: engine.type: "custom" - extensible via protocol handlers
 *
 * Note: These are ENGINE backends (HOW to execute), not storage backends.
 * They are shared across all IAgentRunner implementations (Fs, Memory, etc.)
 *
 * EARS Coverage:
 * - Local: B1-B7 (in fs_agent_runner_module.md)
 * - API: D1-D5 (in agent_runner_module.md §4.4)
 * - MCP: E1-E4 (in agent_runner_module.md §4.5)
 * - Custom: F1-F4 (in agent_runner_module.md §4.6)
 */

// Local Backend - engine.type: "local"
export { LocalBackend } from "./local_backend";

// API Backend - engine.type: "api"
export { ApiBackend, ApiBackendError } from "./api_backend";

// MCP Backend - engine.type: "mcp"
export { McpBackend, McpBackendError } from "./mcp_backend";

// Custom Backend - engine.type: "custom"
export {
  CustomBackend,
  CustomEngineConfigError,
  ProtocolHandlerNotFoundError,
  DefaultProtocolHandlerRegistry,
} from "./custom_backend";
