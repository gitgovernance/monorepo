/**
 * FsAgentRunner Tests
 *
 * Tests for filesystem-based agent runner implementation.
 *
 * Reference: fs_agent_runner_module.md §4.1-4.8
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FsAgentRunner, createFsAgentRunner } from "./fs_agent_runner";
import type { IExecutionAdapter } from "../../adapters/execution_adapter";
import type { IEventStream, BaseEvent } from "../../event_bus";
import type { AgentRecord, ExecutionRecord } from "../../types";
import type { RuntimeHandlerRegistry } from "../agent_runner.types";

describe("FsAgentRunner", () => {
  let tempDir: string;
  let gitgovPath: string;
  let agentsDir: string;
  let mockExecutionAdapter: jest.Mocked<IExecutionAdapter>;
  let mockEventBus: jest.Mocked<IEventStream>;
  let emittedEvents: BaseEvent[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-test-"));
    gitgovPath = path.join(tempDir, ".gitgov");
    agentsDir = path.join(gitgovPath, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    emittedEvents = [];

    mockExecutionAdapter = {
      create: jest.fn().mockImplementation(async (payload) => ({
        id: `exec:${Date.now()}`,
        ...payload,
      })),
      getExecution: jest.fn(),
      getExecutionsByTask: jest.fn(),
      getAllExecutions: jest.fn(),
    } as unknown as jest.Mocked<IExecutionAdapter>;

    mockEventBus = {
      publish: jest.fn().mockImplementation((event) => {
        emittedEvents.push(event);
      }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn(),
      clearSubscriptions: jest.fn(),
      waitForIdle: jest.fn(),
    } as unknown as jest.Mocked<IEventStream>;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeAgentFile = (id: string, agent: Partial<AgentRecord>) => {
    const filename = `agent-${id}.json`;
    const fullAgent: AgentRecord = {
      id: `agent:${id}`,
      engine: { type: "local" },
      ...agent,
    };
    const record = { header: { type: "agent" }, payload: fullAgent };
    fs.writeFileSync(path.join(agentsDir, filename), JSON.stringify(record));
  };

  const writeAgentEntrypoint = (
    relativePath: string,
    code: string
  ): string => {
    const fullPath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, code);
    return relativePath;
  };

  describe("4.1. Loading AgentRecord (EARS-A1 to EARS-A3)", () => {
    it("[EARS-A1] should load agent from .gitgov/agents/", async () => {
      writeAgentFile("test-agent", {
        engine: { type: "local", entrypoint: "agent.js", function: "run" },
      });
      writeAgentEntrypoint(
        "agent.js",
        "module.exports.run = async () => ({ data: 'ok' })"
      );

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:test-agent",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
    });

    it("[EARS-A2] should throw AgentNotFound when file missing", async () => {
      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await expect(
        runner.runOnce({ agentId: "agent:nonexistent", taskId: "task:1" })
      ).rejects.toThrow("AgentNotFound: agent:nonexistent");
    });

    it("[EARS-A3] should extract engine from payload", async () => {
      const entrypoint = writeAgentEntrypoint(
        "agents/my-agent.js",
        "module.exports.execute = async (ctx) => ({ data: ctx.agentId })"
      );
      writeAgentFile("extract-test", {
        engine: { type: "local", entrypoint, function: "execute" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:extract-test",
        taskId: "task:1",
      });

      expect(response.output?.data).toBe("agent:extract-test");
    });
  });

  describe("4.2. Local Backend (EARS-B1 to EARS-B7)", () => {
    it("[EARS-B1] should resolve absolute path for entrypoint", async () => {
      const entrypoint = writeAgentEntrypoint(
        "src/agent.js",
        "module.exports.runAgent = async () => ({ message: 'from src' })"
      );
      writeAgentFile("path-test", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:path-test",
        taskId: "task:1",
      });

      expect(response.output?.message).toBe("from src");
    });

    it("[EARS-B2] should lookup runtime handler", async () => {
      writeAgentFile("runtime-test", {
        engine: { type: "local", runtime: "test-runtime" },
      });

      const mockRuntimeRegistry: RuntimeHandlerRegistry = {
        register: jest.fn(),
        get: jest.fn().mockReturnValue(async () => ({
          data: "runtime executed",
        })),
      };

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
        runtimeHandlers: mockRuntimeRegistry,
      });

      const response = await runner.runOnce({
        agentId: "agent:runtime-test",
        taskId: "task:1",
      });

      expect(mockRuntimeRegistry.get).toHaveBeenCalledWith("test-runtime");
      expect(response.output?.data).toBe("runtime executed");
    });

    it("[EARS-B3] should throw LocalEngineConfigError when neither defined", async () => {
      writeAgentFile("no-config", {
        engine: { type: "local" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:no-config",
        taskId: "task:1",
      });

      expect(response.status).toBe("error");
      expect(response.error).toContain("LocalEngineConfigError");
    });

    it("[EARS-B4] should dynamic import the entrypoint module", async () => {
      const entrypoint = writeAgentEntrypoint(
        "dynamic.js",
        "module.exports.runAgent = async () => ({ data: 'imported' })"
      );
      writeAgentFile("dynamic-import", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:dynamic-import",
        taskId: "task:1",
      });

      expect(response.output?.data).toBe("imported");
    });

    it("[EARS-B5] should use engine.function or default to runAgent", async () => {
      const entrypoint1 = writeAgentEntrypoint(
        "default-fn.js",
        "module.exports.runAgent = async () => ({ data: 'default' })"
      );
      const entrypoint2 = writeAgentEntrypoint(
        "custom-fn.js",
        "module.exports.customFn = async () => ({ data: 'custom' })"
      );

      writeAgentFile("default-fn", {
        engine: { type: "local", entrypoint: entrypoint1 },
      });
      writeAgentFile("custom-fn", {
        engine: { type: "local", entrypoint: entrypoint2, function: "customFn" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const res1 = await runner.runOnce({
        agentId: "agent:default-fn",
        taskId: "task:1",
      });
      const res2 = await runner.runOnce({
        agentId: "agent:custom-fn",
        taskId: "task:2",
      });

      expect(res1.output?.data).toBe("default");
      expect(res2.output?.data).toBe("custom");
    });

    it("[EARS-B6] should throw FunctionNotExported when missing", async () => {
      const entrypoint = writeAgentEntrypoint(
        "no-fn.js",
        "module.exports.otherFn = async () => ({})"
      );
      writeAgentFile("no-fn", {
        engine: { type: "local", entrypoint, function: "missingFn" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:no-fn",
        taskId: "task:1",
      });

      expect(response.status).toBe("error");
      expect(response.error).toContain("FunctionNotExported");
    });

    it("[EARS-B7] should invoke function with AgentExecutionContext", async () => {
      const entrypoint = writeAgentEntrypoint(
        "ctx-test.js",
        `module.exports.runAgent = async (ctx) => ({
          data: {
            agentId: ctx.agentId,
            taskId: ctx.taskId,
            input: ctx.input
          }
        })`
      );
      writeAgentFile("ctx-test", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:ctx-test",
        taskId: "task:123",
        input: { key: "value" },
      });

      expect(response.output?.data).toEqual({
        agentId: "agent:ctx-test",
        taskId: "task:123",
        input: { key: "value" },
      });
    });
  });

  describe("4.3. Context Building (EARS-C1 to EARS-C3)", () => {
    it("[EARS-C1] should include agentId in context", async () => {
      const entrypoint = writeAgentEntrypoint(
        "agent-id.js",
        "module.exports.runAgent = async (ctx) => ({ data: ctx.agentId })"
      );
      writeAgentFile("agent-id-test", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:agent-id-test",
        taskId: "task:1",
      });

      expect(response.output?.data).toBe("agent:agent-id-test");
    });

    it("[EARS-C2] should use actorId or fallback to agentId", async () => {
      const entrypoint = writeAgentEntrypoint(
        "actor-id.js",
        "module.exports.runAgent = async (ctx) => ({ data: ctx.actorId })"
      );
      writeAgentFile("actor-test", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const res1 = await runner.runOnce({
        agentId: "agent:actor-test",
        taskId: "task:1",
      });
      const res2 = await runner.runOnce({
        agentId: "agent:actor-test",
        taskId: "task:2",
        actorId: "actor:custom",
      });

      expect(res1.output?.data).toBe("agent:actor-test");
      expect(res2.output?.data).toBe("actor:custom");
    });

    it("[EARS-C3] should generate unique UUID for runId", async () => {
      const entrypoint = writeAgentEntrypoint(
        "run-id.js",
        "module.exports.runAgent = async (ctx) => ({ data: ctx.runId })"
      );
      writeAgentFile("runid-test", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const res1 = await runner.runOnce({
        agentId: "agent:runid-test",
        taskId: "task:1",
      });
      const res2 = await runner.runOnce({
        agentId: "agent:runid-test",
        taskId: "task:2",
      });

      expect(res1.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(res1.runId).not.toBe(res2.runId);
    });
  });

  describe("4.4. Engine Type Validation (EARS-G1 to EARS-G3)", () => {
    it("[EARS-G1] should throw UnsupportedEngineType for unknown type", async () => {
      writeAgentFile("unknown-engine", {
        engine: { type: "invalid" as "local" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await expect(
        runner.runOnce({ agentId: "agent:unknown-engine", taskId: "task:1" })
      ).rejects.toThrow("UnsupportedEngineType: invalid");
    });

    it("[EARS-G2] should throw EngineConfigError when url missing", async () => {
      writeAgentFile("no-url", {
        engine: { type: "api" } as AgentRecord["engine"],
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await expect(
        runner.runOnce({ agentId: "agent:no-url", taskId: "task:1" })
      ).rejects.toThrow("EngineConfigError: url required for api");
    });

    it("[EARS-G3] should throw MissingDependency for actor-signature without adapter", async () => {
      writeAgentFile("actor-sig", {
        engine: {
          type: "api",
          url: "http://example.com",
          auth: { type: "actor-signature" },
        } as AgentRecord["engine"],
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await expect(
        runner.runOnce({ agentId: "agent:actor-sig", taskId: "task:1" })
      ).rejects.toThrow(
        "MissingDependency: IdentityAdapter required for actor-signature auth"
      );
    });
  });

  describe("4.5. ExecutionRecord Writing (EARS-H1 to EARS-H4)", () => {
    it("[EARS-H1] should create ExecutionRecord on success", async () => {
      const entrypoint = writeAgentEntrypoint(
        "success.js",
        "module.exports.runAgent = async () => ({ data: 'ok' })"
      );
      writeAgentFile("success", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await runner.runOnce({
        agentId: "agent:success",
        taskId: "task:1",
      });

      expect(mockExecutionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task:1",
          type: "completion",
          title: "Agent execution: agent:success",
          result: expect.stringContaining("completed successfully"),
          metadata: expect.objectContaining({
            agentId: "agent:success",
            status: "success",
            output: expect.objectContaining({ data: "ok" }),
          }),
        }),
        expect.any(String)
      );
    });

    it("[EARS-H2] should create ExecutionRecord on error", async () => {
      const entrypoint = writeAgentEntrypoint(
        "error.js",
        "module.exports.runAgent = async () => { throw new Error('fail'); }"
      );
      writeAgentFile("error", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await runner.runOnce({
        agentId: "agent:error",
        taskId: "task:1",
      });

      expect(mockExecutionAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task:1",
          type: "blocker",
          title: "Agent execution: agent:error",
          result: expect.stringContaining("failed"),
          metadata: expect.objectContaining({
            agentId: "agent:error",
            status: "error",
            error: "fail",
            output: undefined,
          }),
        }),
        expect.any(String)
      );
    });

    it("[EARS-H3] should include executionRecordId in AgentResponse", async () => {
      const entrypoint = writeAgentEntrypoint(
        "exec-id.js",
        "module.exports.runAgent = async () => ({})"
      );
      writeAgentFile("exec-id", {
        engine: { type: "local", entrypoint },
      });

      mockExecutionAdapter.create.mockResolvedValueOnce({
        id: "exec:test-123",
      } as ExecutionRecord);

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:exec-id",
        taskId: "task:1",
      });

      expect(response.executionRecordId).toBe("exec:test-123");
    });

    it("[EARS-H4] should throw MissingDependency when ExecutionAdapter missing", () => {
      expect(() => {
        new FsAgentRunner({
          executionAdapter: undefined as unknown as IExecutionAdapter,
          gitgovPath,
          projectRoot: tempDir,
        });
      }).toThrow("MissingDependency: ExecutionAdapter required");
    });
  });

  describe("4.6. EventBus Integration (EARS-I1 to EARS-I4)", () => {
    it("[EARS-I1] should emit agent:started event", async () => {
      const entrypoint = writeAgentEntrypoint(
        "event-started.js",
        "module.exports.runAgent = async () => ({})"
      );
      writeAgentFile("event-started", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        eventBus: mockEventBus,
        gitgovPath,
        projectRoot: tempDir,
      });

      await runner.runOnce({
        agentId: "agent:event-started",
        taskId: "task:1",
      });

      const startedEvent = emittedEvents.find((e) => e.type === "agent:started");
      expect(startedEvent).toBeDefined();
      expect(startedEvent?.payload).toMatchObject({
        agentId: "agent:event-started",
        taskId: "task:1",
      });
    });

    it("[EARS-I2] should emit agent:completed event on success", async () => {
      const entrypoint = writeAgentEntrypoint(
        "event-completed.js",
        "module.exports.runAgent = async () => ({ data: 'done' })"
      );
      writeAgentFile("event-completed", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        eventBus: mockEventBus,
        gitgovPath,
        projectRoot: tempDir,
      });

      await runner.runOnce({
        agentId: "agent:event-completed",
        taskId: "task:1",
      });

      const completedEvent = emittedEvents.find(
        (e) => e.type === "agent:completed"
      );
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.payload).toMatchObject({
        agentId: "agent:event-completed",
        status: "success",
      });
    });

    it("[EARS-I3] should emit agent:error event on failure", async () => {
      const entrypoint = writeAgentEntrypoint(
        "event-error.js",
        "module.exports.runAgent = async () => { throw new Error('boom'); }"
      );
      writeAgentFile("event-error", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        eventBus: mockEventBus,
        gitgovPath,
        projectRoot: tempDir,
      });

      await runner.runOnce({
        agentId: "agent:event-error",
        taskId: "task:1",
      });

      const errorEvent = emittedEvents.find((e) => e.type === "agent:error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.payload).toMatchObject({
        agentId: "agent:event-error",
        status: "error",
        error: "boom",
      });
    });

    it("[EARS-I4] should work silently without EventBus", async () => {
      const entrypoint = writeAgentEntrypoint(
        "no-eventbus.js",
        "module.exports.runAgent = async () => ({ data: 'silent' })"
      );
      writeAgentFile("no-eventbus", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:no-eventbus",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output?.data).toBe("silent");
    });
  });

  describe("4.7. Response Return (EARS-J1 to EARS-J3)", () => {
    it("[EARS-J1] should always return AgentResponse", async () => {
      const entrypoint = writeAgentEntrypoint(
        "response.js",
        "module.exports.runAgent = async () => ({})"
      );
      writeAgentFile("response", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:response",
        taskId: "task:1",
      });

      expect(response).toHaveProperty("runId");
      expect(response).toHaveProperty("agentId");
      expect(response).toHaveProperty("status");
      expect(response).toHaveProperty("executionRecordId");
      expect(response).toHaveProperty("startedAt");
      expect(response).toHaveProperty("completedAt");
      expect(response).toHaveProperty("durationMs");
    });

    it("[EARS-J2] should include output in AgentResponse on success", async () => {
      const entrypoint = writeAgentEntrypoint(
        "output.js",
        "module.exports.runAgent = async () => ({ data: 'result', message: 'done' })"
      );
      writeAgentFile("output", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:output",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output).toBeDefined();
      expect(response.output?.data).toBe("result");
      expect(response.output?.message).toBe("done");
      expect(response.error).toBeUndefined();
    });

    it("[EARS-J3] should include error in AgentResponse on failure", async () => {
      const entrypoint = writeAgentEntrypoint(
        "fail.js",
        "module.exports.runAgent = async () => { throw new Error('agent failed'); }"
      );
      writeAgentFile("fail", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:fail",
        taskId: "task:1",
      });

      expect(response.status).toBe("error");
      expect(response.error).toBe("agent failed");
      expect(response.output).toBeUndefined();
    });
  });

  describe("4.8. Factory Function (EARS-K1)", () => {
    it("[EARS-K1] should create FsAgentRunner with injected dependencies", () => {
      const runner = createFsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      expect(runner).toBeInstanceOf(FsAgentRunner);
    });
  });
});
