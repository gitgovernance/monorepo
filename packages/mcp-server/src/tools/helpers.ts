import type { ToolResult } from '../server/mcp_server.types.js';

/**
 * Helper para crear un ToolResult exitoso con datos JSON.
 */
export function successResult<T>(data: T): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

/**
 * Helper para crear un ToolResult de error estandar.
 */
export function errorResult(
  message: string,
  code?: string,
  details?: Record<string, unknown>,
): ToolResult {
  const payload: { error: string; code?: string; details?: Record<string, unknown> } = {
    error: message,
  };
  if (code) payload.code = code;
  if (details) payload.details = details;

  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}
