/**
 * Types for MCP Core Integration Tests (Level 2).
 * Based on mcp_core_integration blueprint.
 */

/** Temp .gitgov/ project on disk */
export interface TempGitgovProject {
  projectRoot: string;
  gitgovPath: string;
  cleanup: () => Promise<void>;
}

/** Parsed tool result from handler response */
export interface ParsedToolResult<T = Record<string, unknown>> {
  data: T;
  isError: boolean;
}
