/**
 * Backend for executing agents via Model Context Protocol (engine.type: "mcp").
 *
 * EARS Coverage:
 * - [EARS-E1] Connect to MCP server at engine.url
 * - [EARS-E2] Invoke tool and capture result as AgentOutput
 * - [EARS-E3] Map tool result to AgentOutput.data
 * - [EARS-E4] Throw McpBackendError on connection/tool failure
 *
 * Reference: agent_protocol.md §5.1.3
 *
 * Note: This implementation uses HTTP transport for MCP. In production,
 * this would integrate with the actual MCP SDK for full protocol support.
 */

import type {
  McpEngine,
  AgentExecutionContext,
  AgentOutput,
  AuthConfig,
} from "../agent_runner.types";
import type { IIdentityAdapter } from "../../adapters/identity_adapter";

/**
 * Error thrown when MCP backend operation fails.
 * [EARS-E4]
 */
export class McpBackendError extends Error {
  public readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(`McpBackendError: ${message}`);
    this.name = "McpBackendError";
    this.code = code;
  }
}

/**
 * MCP JSON-RPC request structure.
 */
interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure.
 */
interface McpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Backend for executing agents via Model Context Protocol.
 *
 * Connects to MCP servers and invokes tools.
 * CAPTURES the tool result and returns it as AgentOutput.
 *
 * Tool resolution priority (per agent_protocol.md §5.1.3):
 * 1. toolOverride (RunOptions.tool) - runtime selection
 * 2. engine.tool - AgentRecord configuration
 * 3. agentId without "agent:" prefix - fallback
 *
 * Reference: agent_protocol.md §5.1.3
 */
export class McpBackend {
  constructor(private identityAdapter?: IIdentityAdapter) {}

  /**
   * Executes an agent via MCP and captures the result.
   *
   * @param engine - MCP engine configuration
   * @param ctx - Execution context
   * @param toolOverride - Optional tool override from RunOptions.tool
   * @returns AgentOutput with tool result
   *
   * @throws McpBackendError - When connection or tool invocation fails [EARS-E4]
   */
  async execute(
    engine: McpEngine,
    ctx: AgentExecutionContext,
    toolOverride?: string
  ): Promise<AgentOutput> {
    // [EARS-E2] Determine tool to invoke (priority order)
    const tool = this.resolveToolName(engine, ctx, toolOverride);

    // [EARS-E1] Prepare MCP connection/request
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Apply authentication if configured
    if (engine.auth) {
      await this.applyAuth(headers, engine.auth, ctx);
    }

    // Build MCP JSON-RPC request for tool invocation
    const mcpRequest: McpRequest = {
      jsonrpc: "2.0",
      id: ctx.runId,
      method: "tools/call",
      params: {
        name: tool,
        arguments: {
          agentId: ctx.agentId,
          actorId: ctx.actorId,
          taskId: ctx.taskId,
          runId: ctx.runId,
          input: ctx.input,
        },
      },
    };

    try {
      // [EARS-E1] Connect to MCP server via HTTP
      const response = await fetch(engine.url, {
        method: "POST",
        headers,
        body: JSON.stringify(mcpRequest),
      });

      if (!response.ok) {
        // [EARS-E4] Connection failure
        throw new McpBackendError(
          `HTTP ${response.status}: ${response.statusText}`,
          "CONNECTION_FAILED"
        );
      }

      const mcpResponse: McpResponse = await response.json();

      // [EARS-E4] Check for MCP error response
      if (mcpResponse.error) {
        throw new McpBackendError(
          mcpResponse.error.message,
          `MCP_ERROR_${mcpResponse.error.code}`
        );
      }

      // [EARS-E3] Map tool result to AgentOutput.data
      return this.mapResultToOutput(mcpResponse.result);
    } catch (error) {
      // Re-throw McpBackendError as-is
      if (error instanceof McpBackendError) {
        throw error;
      }

      // [EARS-E4] Wrap other errors
      throw new McpBackendError(
        error instanceof Error ? error.message : "Unknown error",
        "EXECUTION_FAILED"
      );
    }
  }

  /**
   * [EARS-E2] Resolve tool name following priority order:
   * 1. toolOverride (from RunOptions.tool)
   * 2. engine.tool (from AgentRecord)
   * 3. agentId without "agent:" prefix
   */
  private resolveToolName(
    engine: McpEngine,
    ctx: AgentExecutionContext,
    toolOverride?: string
  ): string {
    if (toolOverride) {
      return toolOverride;
    }

    if (engine.tool) {
      return engine.tool;
    }

    // Fallback: use agentId without "agent:" prefix
    return ctx.agentId.replace(/^agent:/, "");
  }

  /**
   * Apply authentication headers based on auth config.
   */
  private async applyAuth(
    headers: Record<string, string>,
    auth: AuthConfig,
    ctx: AgentExecutionContext
  ): Promise<void> {
    switch (auth.type) {
      case "bearer": {
        const token = auth.secret_key
          ? process.env[auth.secret_key]
          : auth.token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        break;
      }

      case "api-key": {
        const apiKey = auth.secret_key
          ? process.env[auth.secret_key]
          : auth.token;
        if (apiKey) {
          headers["X-API-Key"] = apiKey;
        }
        break;
      }

      case "actor-signature": {
        if (!this.identityAdapter) {
          throw new McpBackendError(
            "IdentityAdapter required for actor-signature auth",
            "AUTH_MISSING_ADAPTER"
          );
        }

        const payload = JSON.stringify({
          agentId: ctx.agentId,
          actorId: ctx.actorId,
          taskId: ctx.taskId,
          runId: ctx.runId,
          timestamp: Date.now(),
        });

        const signature = await this.identityAdapter.signRecord(
          { header: { version: "1.0", type: "request", payloadChecksum: "", signatures: [] }, payload } as any,
          ctx.actorId,
          "executor",
          "MCP request signature"
        );

        headers["X-GitGov-Signature"] = JSON.stringify(signature);
        headers["X-GitGov-Actor"] = ctx.actorId;
        break;
      }

      default:
        break;
    }
  }

  /**
   * [EARS-E3] Map MCP tool result to AgentOutput.
   */
  private mapResultToOutput(result: unknown): AgentOutput {
    if (result === null || result === undefined) {
      return {};
    }

    // If result is already AgentOutput-like, extract fields
    if (typeof result === "object") {
      const obj = result as Record<string, unknown>;
      const output: AgentOutput = {
        data: obj["data"] ?? result, // Use data field or entire result
      };

      if (typeof obj["message"] === "string") {
        output.message = obj["message"];
      }

      if (Array.isArray(obj["artifacts"])) {
        output.artifacts = obj["artifacts"];
      }

      if (typeof obj["metadata"] === "object" && obj["metadata"] !== null) {
        output.metadata = obj["metadata"] as Record<string, unknown>;
      }

      // Handle MCP-specific content array format
      if (Array.isArray(obj["content"])) {
        const textContent = obj["content"].find(
          (c: any) => c.type === "text"
        );
        if (textContent && typeof textContent.text === "string") {
          output.message = textContent.text;
        }
      }

      return output;
    }

    // Primitive result
    return { data: result };
  }
}
