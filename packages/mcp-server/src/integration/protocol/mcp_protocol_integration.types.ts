/**
 * Types for MCP Protocol Integration Tests (Level 1).
 * Based on mcp_protocol_integration blueprint.
 */

/** Parsed tool result from protocol response */
export interface ProtocolToolResult<T = unknown> {
  data: T;
  isError?: boolean;
  rawContent: Array<{ type: string; text: string }>;
}

/** Configuration for the comprehensive mock DI container */
export interface MockContainerOverrides {
  tasks?: Map<string, { header: Record<string, unknown>; payload: Record<string, unknown> }>;
  cycles?: Map<string, { header: Record<string, unknown>; payload: Record<string, unknown> }>;
  actors?: Map<string, { header: Record<string, unknown>; payload: Record<string, unknown> }>;
  agents?: Map<string, { header: Record<string, unknown>; payload: Record<string, unknown> }>;
}
