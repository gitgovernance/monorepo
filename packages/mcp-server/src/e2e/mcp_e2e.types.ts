/**
 * Types for MCP E2E Tests (Level 3).
 * Based on mcp_e2e blueprint.
 */

/** Context for an E2E test session */
export interface E2eTestContext {
  projectRoot: string;
  gitgovPath: string;
  cleanup: () => Promise<void>;
}

/** Parsed tool call result from MCP client */
export interface E2eToolResult<T = Record<string, unknown>> {
  data: T;
  isError: boolean;
}
