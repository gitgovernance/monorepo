/**
 * CustomBackend Tests
 *
 * Tests for engine.type: "custom" execution via protocol handlers.
 *
 * Reference: agent_runner_module.md §4.6 (EARS-F1 to EARS-F4)
 * Reference: agent_protocol.md §5.1.4
 */

import {
  CustomBackend,
  CustomEngineConfigError,
  ProtocolHandlerNotFoundError,
  DefaultProtocolHandlerRegistry,
} from "./custom_backend";
import type {
  CustomEngine,
  AgentExecutionContext,
  AgentOutput,
} from "../agent_runner.types";

describe("CustomBackend", () => {
  // Helper to create test context
  function createTestContext(
    overrides: Partial<AgentExecutionContext> = {}
  ): AgentExecutionContext {
    return {
      agentId: "agent:test-custom",
      actorId: "agent:test-custom",
      taskId: "task:123",
      runId: "run-uuid-123",
      ...overrides,
    };
  }

  describe("4.6. Custom Backend (EARS-F1 to EARS-F4)", () => {
    describe("[EARS-F1] should lookup handler in ProtocolHandlerRegistry", () => {
      it("should lookup handler by protocol name", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        const mockHandler = jest.fn().mockResolvedValue({ message: "success" });
        registry.register("a2a", mockHandler);

        const backend = new CustomBackend(registry);
        const engine: CustomEngine = {
          type: "custom",
          protocol: "a2a",
          config: { endpoint: "https://example.com" },
        };
        const ctx = createTestContext();

        await backend.execute(engine, ctx);

        expect(mockHandler).toHaveBeenCalledWith(engine, ctx);
      });
    });

    describe("[EARS-F2] should throw CustomEngineConfigError when protocol missing", () => {
      it("should throw when protocol is undefined", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        const backend = new CustomBackend(registry);
        const engine: CustomEngine = {
          type: "custom",
          // protocol: undefined
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          CustomEngineConfigError
        );
        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "CustomEngineConfigError: protocol required for execution"
        );
      });

      it("should throw when protocol is empty string", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        const backend = new CustomBackend(registry);
        const engine: CustomEngine = {
          type: "custom",
          protocol: "",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "protocol required for execution"
        );
      });
    });

    describe("[EARS-F3] should throw ProtocolHandlerNotFound when missing", () => {
      it("should throw when registry has no handler for protocol", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        // Don't register any handler
        const backend = new CustomBackend(registry);
        const engine: CustomEngine = {
          type: "custom",
          protocol: "unknown-protocol",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          ProtocolHandlerNotFoundError
        );
        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "ProtocolHandlerNotFound: unknown-protocol"
        );
      });

      it("should throw when registry is not provided", async () => {
        const backend = new CustomBackend(undefined);
        const engine: CustomEngine = {
          type: "custom",
          protocol: "a2a",
        };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          ProtocolHandlerNotFoundError
        );
      });
    });

    describe("[EARS-F4] should invoke handler with engine and context", () => {
      it("should pass engine and ctx to handler", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        const mockHandler = jest.fn().mockResolvedValue({
          data: { result: "processed" },
          message: "Custom protocol executed",
        });
        registry.register("grpc", mockHandler);

        const backend = new CustomBackend(registry);
        const engine: CustomEngine = {
          type: "custom",
          protocol: "grpc",
          config: { host: "localhost", port: 50051 },
        };
        const ctx = createTestContext({ input: { payload: "test" } });

        const output = await backend.execute(engine, ctx);

        // Verify handler was called with correct arguments
        expect(mockHandler).toHaveBeenCalledTimes(1);
        expect(mockHandler).toHaveBeenCalledWith(engine, ctx);

        // Verify output is captured
        expect(output).toEqual({
          data: { result: "processed" },
          message: "Custom protocol executed",
        });
      });

      it("should capture AgentOutput from handler return value", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        const expectedOutput: AgentOutput = {
          data: { items: [1, 2, 3] },
          message: "Found 3 items",
          artifacts: ["report.json"],
          metadata: { version: "1.0" },
        };
        registry.register("a2a", async () => expectedOutput);

        const backend = new CustomBackend(registry);
        const engine: CustomEngine = { type: "custom", protocol: "a2a" };
        const ctx = createTestContext();

        const output = await backend.execute(engine, ctx);

        expect(output).toEqual(expectedOutput);
      });

      it("should propagate errors from handler", async () => {
        const registry = new DefaultProtocolHandlerRegistry();
        registry.register("failing", async () => {
          throw new Error("Handler failed");
        });

        const backend = new CustomBackend(registry);
        const engine: CustomEngine = { type: "custom", protocol: "failing" };
        const ctx = createTestContext();

        await expect(backend.execute(engine, ctx)).rejects.toThrow(
          "Handler failed"
        );
      });
    });
  });

  describe("DefaultProtocolHandlerRegistry", () => {
    it("should register and retrieve handlers", () => {
      const registry = new DefaultProtocolHandlerRegistry();
      const handler = jest.fn();

      registry.register("test-protocol", handler);

      expect(registry.get("test-protocol")).toBe(handler);
    });

    it("should return undefined for unregistered protocols", () => {
      const registry = new DefaultProtocolHandlerRegistry();

      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should allow overwriting handlers", () => {
      const registry = new DefaultProtocolHandlerRegistry();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      registry.register("proto", handler1);
      registry.register("proto", handler2);

      expect(registry.get("proto")).toBe(handler2);
    });
  });
});
