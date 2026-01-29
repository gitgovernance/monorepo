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
