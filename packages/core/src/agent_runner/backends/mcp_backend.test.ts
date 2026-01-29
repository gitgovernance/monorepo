/**
 * McpBackend Tests
 *
 * Tests for engine.type: "mcp" execution via Model Context Protocol.
 *
 * Reference: agent_runner_module.md §4.5 (EARS-E1 to EARS-E4)
 * Reference: agent_protocol.md §5.1.3
 */

import { McpBackend, McpBackendError } from "./mcp_backend";
import type { McpEngine, AgentExecutionContext } from "../agent_runner.types";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("McpBackend", () => {
  // Helper to create test context
  function createTestContext(
    overrides: Partial<AgentExecutionContext> = {}
  ): AgentExecutionContext {
    return {
      agentId: "agent:test-mcp",
      actorId: "agent:test-mcp",
      taskId: "task:123",
      runId: "run-uuid-123",
      ...overrides,
    };
  }

  // Helper to create mock MCP response
  function createMcpResponse(
    result: unknown,
    error?: { code: number; message: string }
  ) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: "run-uuid-123",
        result: error ? undefined : result,
        error,
      }),
    } as Response;
  }

  // Helper to create mock HTTP error response
  function createHttpErrorResponse(status: number, statusText: string) {
    return {
      ok: false,
      status,
      statusText,
      json: async () => ({}),
    } as Response;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("4.5. MCP Backend (EARS-E1 to EARS-E4)", () => {
    describe("[EARS-E1] should connect to MCP server at engine.url", () => {
      it("should make POST request to MCP server URL", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse({ data: "success" })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          "http://mcp-server:8080/mcp",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
            }),
          })
        );
      });

      it("should send JSON-RPC formatted request", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse({ data: "success" })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
          tool: "create_issue",
        };
        const ctx = createTestContext({ input: { title: "Test Issue" } });

        await backend.execute(engine, ctx);

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body).toMatchObject({
          jsonrpc: "2.0",
          id: "run-uuid-123",
          method: "tools/call",
          params: {
            name: "create_issue",
            arguments: {
              agentId: "agent:test-mcp",
              taskId: "task:123",
              input: { title: "Test Issue" },
            },
          },
        });
      });
    });

    describe("[EARS-E2] should invoke tool and capture result as AgentOutput", () => {
      it("should use toolOverride as highest priority", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse({ data: "from override" })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
          tool: "engine_tool", // Lower priority
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx, "runtime_override"); // Highest priority

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.params.name).toBe("runtime_override");
      });

      it("should use engine.tool when no override", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse({ data: "from engine" })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
          tool: "configured_tool",
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.params.name).toBe("configured_tool");
      });

      it("should fallback to agentId without prefix when no tool specified", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse({ data: "from fallback" })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
          // No tool specified
        };
        const ctx = createTestContext({ agentId: "agent:github-helper" });

        await backend.execute(engine, ctx);

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.params.name).toBe("github-helper"); // "agent:" prefix removed
      });
    });

    describe("[EARS-E3] should map tool result to AgentOutput.data", () => {
      it("should map result with data field", async () => {
        const mcpResult = {
          data: { issues: [1, 2, 3] },
          message: "Found 3 issues",
        };
        mockFetch.mockResolvedValue(createMcpResponse(mcpResult));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output.data).toEqual({ issues: [1, 2, 3] });
        expect(output.message).toBe("Found 3 issues");
      });

      it("should use entire result as data when no data field", async () => {
        const mcpResult = { items: ["a", "b"], count: 2 };
        mockFetch.mockResolvedValue(createMcpResponse(mcpResult));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output.data).toEqual({ items: ["a", "b"], count: 2 });
      });

      it("should handle MCP content array format", async () => {
        const mcpResult = {
          content: [
            { type: "text", text: "Here are your results" },
            { type: "image", url: "http://example.com/img.png" },
          ],
        };
        mockFetch.mockResolvedValue(createMcpResponse(mcpResult));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output.message).toBe("Here are your results");
      });

      it("should handle null result", async () => {
        mockFetch.mockResolvedValue(createMcpResponse(null));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output).toEqual({});
      });

      it("should handle primitive result", async () => {
        mockFetch.mockResolvedValue(createMcpResponse("simple text"));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output.data).toBe("simple text");
      });
    });

    describe("[EARS-E4] should throw McpBackendError on connection/tool failure", () => {
      it("should throw on HTTP connection failure", async () => {
        mockFetch.mockResolvedValue(
          createHttpErrorResponse(503, "Service Unavailable")
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          McpBackendError
        );
        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "McpBackendError: HTTP 503: Service Unavailable"
        );
      });

      it("should throw on MCP JSON-RPC error response", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse(null, {
            code: -32601,
            message: "Method not found",
          })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "McpBackendError: Method not found"
        );
      });

      it("should include error code in McpBackendError", async () => {
        mockFetch.mockResolvedValue(
          createMcpResponse(null, {
            code: -32600,
            message: "Invalid Request",
          })
        );

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        try {
          await backend.execute(engine, ctx);
          fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(McpBackendError);
          expect((error as McpBackendError).code).toBe("MCP_ERROR_-32600");
        }
      });

      it("should wrap network errors", async () => {
        mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const backend = new McpBackend();
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "McpBackendError: ECONNREFUSED"
        );
      });

      it("should throw when IdentityAdapter missing for actor-signature", async () => {
        const backend = new McpBackend(undefined);
        const engine: McpEngine = {
          type: "mcp",
          url: "http://mcp-server:8080/mcp",
          auth: { type: "actor-signature" },
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "IdentityAdapter required for actor-signature auth"
        );
      });
    });
  });
});
