/**
 * ApiBackend Tests
 *
 * Tests for engine.type: "api" execution via HTTP.
 *
 * Reference: agent_runner_module.md §4.4 (EARS-D1 to EARS-D5)
 * Reference: agent_protocol.md §5.1.2
 */

import { ApiBackend, ApiBackendError } from "./api_backend";
import type {
  ApiEngine,
  AgentExecutionContext,
} from "../agent_runner.types";
import type { IIdentityAdapter } from "../../adapters/identity_adapter";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("ApiBackend", () => {
  // Helper to create test context
  function createTestContext(
    overrides: Partial<AgentExecutionContext> = {}
  ): AgentExecutionContext {
    return {
      agentId: "agent:test-api",
      actorId: "agent:test-api",
      taskId: "task:123",
      runId: "run-uuid-123",
      ...overrides,
    };
  }

  // Helper to create mock response
  function createMockResponse(
    body: unknown,
    status = 200,
    statusText = "OK"
  ): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env["TEST_API_KEY"];
    delete process.env["TEST_BEARER_TOKEN"];
  });

  describe("4.4. API Backend (EARS-D1 to EARS-D5)", () => {
    describe("[EARS-D1] should prepare HTTP request for API engine", () => {
      it("should use POST method by default", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.example.com/agent",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
            }),
          })
        );
      });

      it("should use specified HTTP method", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          method: "PUT",
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: "PUT" })
        );
      });

      it("should include context in request body", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext({ input: { query: "test" } });

        await backend.execute(engine, ctx);

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body).toMatchObject({
          agentId: "agent:test-api",
          actorId: "agent:test-api",
          taskId: "task:123",
          runId: "run-uuid-123",
          input: { query: "test" },
        });
      });

      it("should not include body for GET requests", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          method: "GET",
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        const callArgs = mockFetch.mock.calls[0];
        // For GET requests, body should not be present in the options
        expect(callArgs[1].body).toBeUndefined();
      });
    });

    describe("[EARS-D2] should read auth token from environment", () => {
      it("should read bearer token from env var via secret_key", async () => {
        process.env["TEST_BEARER_TOKEN"] = "my-secret-bearer-token";
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          auth: {
            type: "bearer",
            secret_key: "TEST_BEARER_TOKEN",
          },
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer my-secret-bearer-token",
            }),
          })
        );
      });

      it("should read api-key from env var via secret_key", async () => {
        process.env["TEST_API_KEY"] = "my-api-key-12345";
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          auth: {
            type: "api-key",
            secret_key: "TEST_API_KEY",
          },
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              "X-API-Key": "my-api-key-12345",
            }),
          })
        );
      });

      it("should use direct token as fallback", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          auth: {
            type: "bearer",
            token: "direct-token-value",
          },
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer direct-token-value",
            }),
          })
        );
      });
    });

    describe("[EARS-D3] should sign request for actor-signature auth", () => {
      it("should add X-GitGov-Signature header using IdentityAdapter", async () => {
        mockFetch.mockResolvedValue(createMockResponse({ data: "ok" }));

        const mockIdentityAdapter: jest.Mocked<IIdentityAdapter> = {
          signRecord: jest.fn().mockResolvedValue({
            keyId: "agent:test-api",
            signature: "mock-signature-base64",
            timestamp: 1234567890,
          }),
        } as any;

        const backend = new ApiBackend(mockIdentityAdapter);
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          auth: {
            type: "actor-signature",
          },
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        // Verify signRecord was called
        expect(mockIdentityAdapter.signRecord).toHaveBeenCalled();

        // Verify headers include signature
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[1].headers["X-GitGov-Signature"]).toBeDefined();
        expect(callArgs[1].headers["X-GitGov-Actor"]).toBe("agent:test-api");
      });

      it("should throw error when IdentityAdapter not available for actor-signature", async () => {
        const backend = new ApiBackend(undefined); // No identity adapter
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
          auth: {
            type: "actor-signature",
          },
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "IdentityAdapter required for actor-signature auth"
        );
      });
    });

    describe("[EARS-D4] should capture response body as AgentOutput", () => {
      it("should parse JSON response and return as AgentOutput", async () => {
        const responseBody = {
          data: { result: "success" },
          message: "Agent completed",
          artifacts: ["output.json"],
          metadata: { version: "1.0" },
        };
        mockFetch.mockResolvedValue(createMockResponse(responseBody));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output).toEqual({
          data: { result: "success" },
          message: "Agent completed",
          artifacts: ["output.json"],
          metadata: { version: "1.0" },
        });
      });

      it("should normalize response without data field", async () => {
        const responseBody = { result: "success", count: 42 };
        mockFetch.mockResolvedValue(createMockResponse(responseBody));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        // Entire body becomes data
        expect(output.data).toEqual({ result: "success", count: 42 });
      });

      it("should handle primitive response", async () => {
        mockFetch.mockResolvedValue(createMockResponse("simple string"));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output).toEqual({ data: "simple string" });
      });

      it("should handle null response", async () => {
        mockFetch.mockResolvedValue(createMockResponse(null));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output).toEqual({});
      });
    });

    describe("[EARS-D5] should throw ApiBackendError on non-2xx response", () => {
      it("should throw error on 400 Bad Request", async () => {
        mockFetch.mockResolvedValue(
          createMockResponse({ error: "Invalid input" }, 400, "Bad Request")
        );

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          ApiBackendError
        );
        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "ApiBackendError: Bad Request"
        );
      });

      it("should throw error on 500 Internal Server Error", async () => {
        mockFetch.mockResolvedValue(
          createMockResponse(
            { error: "Server error" },
            500,
            "Internal Server Error"
          )
        );

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "ApiBackendError: Internal Server Error"
        );
      });

      it("should include status code in error", async () => {
        mockFetch.mockResolvedValue(
          createMockResponse({ error: "Not found" }, 404, "Not Found")
        );

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        try {
          await backend.execute(engine, ctx);
          fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiBackendError);
          expect((error as ApiBackendError).statusCode).toBe(404);
          expect((error as ApiBackendError).statusText).toBe("Not Found");
        }
      });

      it("should wrap network errors", async () => {
        mockFetch.mockRejectedValue(new Error("Network error"));

        const backend = new ApiBackend();
        const engine: ApiEngine = {
          type: "api",
          url: "https://api.example.com/agent",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "ApiBackendError: Network error"
        );
      });
    });
  });
});
