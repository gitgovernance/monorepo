/**
 * Backend for executing agents via HTTP API (engine.type: "api").
 *
 * EARS Coverage:
 * - [EARS-D1] Prepare HTTP request for API engine
 * - [EARS-D2] Read auth token from environment
 * - [EARS-D3] Sign request for actor-signature auth
 * - [EARS-D4] Capture response body as AgentOutput
 * - [EARS-D5] Throw ApiBackendError on non-2xx response
 *
 * Reference: agent_protocol.md §5.1.2
 */

import type {
  ApiEngine,
  AgentExecutionContext,
  AgentOutput,
  AuthConfig,
} from "../agent_runner.types";
import type { IIdentityAdapter } from "../../adapters/identity_adapter";

/**
 * Error thrown when API backend request fails.
 * [EARS-D5]
 */
export class ApiBackendError extends Error {
  public readonly statusCode: number | undefined;
  public readonly statusText: string | undefined;

  constructor(message: string, statusCode?: number, statusText?: string) {
    super(`ApiBackendError: ${message}`);
    this.name = "ApiBackendError";
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

/**
 * Backend for executing agents via HTTP API.
 *
 * Supports multiple authentication types:
 * - bearer: Bearer token from environment variable
 * - api-key: API key from environment variable
 * - actor-signature: Cryptographic signature using ActorRecord
 *
 * Reference: agent_protocol.md §5.1.2, §5.5, §5.6
 */
export class ApiBackend {
  constructor(private identityAdapter?: IIdentityAdapter) {}

  /**
   * Executes an agent via API and captures the response.
   *
   * @param engine - API engine configuration
   * @param ctx - Execution context
   * @returns AgentOutput with parsed response body
   *
   * @throws ApiBackendError - When request fails or non-2xx response [EARS-D5]
   */
  async execute(
    engine: ApiEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    // [EARS-D1] Prepare HTTP request
    const method = engine.method ?? "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // [EARS-D2, D3] Apply authentication
    if (engine.auth) {
      await this.applyAuth(headers, engine.auth, ctx);
    }

    // Prepare request body with context
    const body = JSON.stringify({
      agentId: ctx.agentId,
      actorId: ctx.actorId,
      taskId: ctx.taskId,
      runId: ctx.runId,
      input: ctx.input,
    });

    try {
      // Execute HTTP request
      const response = await fetch(engine.url, {
        method,
        headers,
        ...(method !== "GET" ? { body } : {}),
      });

      // [EARS-D5] Error on non-2xx response
      if (!response.ok) {
        throw new ApiBackendError(
          response.statusText || `HTTP ${response.status}`,
          response.status,
          response.statusText
        );
      }

      // [EARS-D4] Parse response body as JSON and return as AgentOutput
      const responseBody = await response.json();

      return this.normalizeOutput(responseBody);
    } catch (error) {
      // Re-throw ApiBackendError as-is
      if (error instanceof ApiBackendError) {
        throw error;
      }

      // Wrap other errors
      throw new ApiBackendError(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Apply authentication headers based on auth config.
   * [EARS-D2] Read token from environment
   * [EARS-D3] Sign request for actor-signature
   */
  private async applyAuth(
    headers: Record<string, string>,
    auth: AuthConfig,
    ctx: AgentExecutionContext
  ): Promise<void> {
    switch (auth.type) {
      case "bearer": {
        // [EARS-D2] Read token from env var or use direct token
        const token = auth.secret_key
          ? process.env[auth.secret_key]
          : auth.token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        break;
      }

      case "api-key": {
        // [EARS-D2] Read API key from env var or use direct token
        const apiKey = auth.secret_key
          ? process.env[auth.secret_key]
          : auth.token;
        if (apiKey) {
          headers["X-API-Key"] = apiKey;
        }
        break;
      }

      case "actor-signature": {
        // [EARS-D3] Sign context using IdentityAdapter
        if (!this.identityAdapter) {
          throw new ApiBackendError(
            "IdentityAdapter required for actor-signature auth"
          );
        }

        // Create signature payload
        const payload = JSON.stringify({
          agentId: ctx.agentId,
          actorId: ctx.actorId,
          taskId: ctx.taskId,
          runId: ctx.runId,
          timestamp: Date.now(),
        });

        // Sign using actor's private key
        const signature = await this.identityAdapter.signRecord(
          { header: { version: "1.0", type: "request", payloadChecksum: "", signatures: [] }, payload } as any,
          ctx.actorId,
          "executor",
          "API request signature"
        );

        headers["X-GitGov-Signature"] = JSON.stringify(signature);
        headers["X-GitGov-Actor"] = ctx.actorId;
        break;
      }

      case "oauth":
        // OAuth would require more complex flow (token refresh, etc.)
        // For now, treat similar to bearer
        if (auth.token) {
          headers["Authorization"] = `Bearer ${auth.token}`;
        }
        break;

      case "none":
      default:
        // No authentication
        break;
    }
  }

  /**
   * Normalize API response to AgentOutput format.
   * Handles various response structures.
   */
  private normalizeOutput(responseBody: unknown): AgentOutput {
    if (responseBody === null || responseBody === undefined) {
      return {};
    }

    if (typeof responseBody !== "object") {
      return { data: responseBody };
    }

    const body = responseBody as Record<string, unknown>;

    // If response already has AgentOutput structure, use it
    const output: AgentOutput = {};

    if (body["data"] !== undefined) {
      output.data = body["data"];
    } else {
      // If no data field, use entire body as data
      output.data = body;
    }

    if (typeof body["message"] === "string") {
      output.message = body["message"];
    }

    if (Array.isArray(body["artifacts"])) {
      output.artifacts = body["artifacts"];
    }

    if (typeof body["metadata"] === "object" && body["metadata"] !== null) {
      output.metadata = body["metadata"] as Record<string, unknown>;
    }

    return output;
  }
}
