/**
 * FsAgentRunner Tests
 *
 * Tests for filesystem-based agent runner implementation.
 *
 * Reference: fs_agent_runner_module.md §4.1-4.10
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FsAgentRunner, createFsAgentRunner } from "./fs_agent_runner";
import { DEFAULT_ID_ENCODER } from "../../record_store/fs/fs_record_store";
import type { IExecutionAdapter } from "../../adapters/execution_adapter";
import type { IEventStream, BaseEvent } from "../../event_bus";
import type { AgentRecord } from "../../record_types";
import type { RuntimeHandlerRegistry, AgentExecutor } from "../agent_runner";
import type { AgentExecutionContext } from "../agent_runner.types";
import { resolveLocalEntrypoint } from "../backends/local_backend";
import * as ResolveRunnerModule from "../resolve_runner";

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
    const agentId = `agent:${id}`;
    const filename = `${DEFAULT_ID_ENCODER.encode(agentId)}.json`;
    const fullAgent: AgentRecord = {
      id: agentId,
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

  /** Installs a minimal npm package inside the repo so `require.resolve` finds it there. */
  const installPackageInRepo = (name: string, code: string) => {
    const pkgDir = path.join(tempDir, "node_modules", name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "host", version: "1.0.0" }));
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
    fs.writeFileSync(path.join(pkgDir, "index.js"), code);
  };

  describe("4.1. Loading AgentRecord (ARUN-A1 to ARUN-A3)", () => {
    it("[ARUN-A1] should load agent from .gitgov/agents/", async () => {
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

    it("[ARUN-A2] should throw AgentNotFound when file missing", async () => {
      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      await expect(
        runner.runOnce({ agentId: "agent:nonexistent", taskId: "task:1" })
      ).rejects.toThrow("AgentNotFound: agent:nonexistent");
    });

    it("[ARUN-A3] should extract engine from payload", async () => {
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

  describe("4.2. LocalBackend - engine.type: \"local\" Execution (ARUN-B1 to ARUN-B7)", () => {
    it("[ARUN-B1] should resolve a relative path against projectRoot", async () => {
      // Named "absolute path" until 2026-09-23, which is what hid the gap: two it() shared
      // that name and both ran this branch, because writeAgentEntrypoint returns a relative
      // path. The fourth form of ARUN-B1 is tested below, on a file outside projectRoot.
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

    it("[ARUN-B1] should resolve an absolute path against no root at all", async () => {
      // The third form of ARUN-B1, and until 2026-09-23 NOTHING tested it. There were two
      // it() with the identical name "should resolve absolute path for entrypoint", and both
      // exercised the RELATIVE branch, because `writeAgentEntrypoint` returns the relative
      // path — the comment claiming "use absolute path directly (starts with /)" was false.
      // Measured: `grep -nE 'entrypoint: ["\x27]/'` over all of packages/ returned 0, with 69
      // occurrences of `entrypoint: "` as the positive control. The spec row was green.
      //
      // An absolute path must be used AS IS, so the discriminating setup is one that lives
      // outside projectRoot: joining it with the root would not find it.
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-outside-"));
      try {
        const absoluteEntrypoint = path.join(outsideDir, "abs-agent.js");
        fs.writeFileSync(absoluteEntrypoint, "module.exports.runAgent = async () => ({ message: 'from absolute' })");
        expect(path.isAbsolute(absoluteEntrypoint)).toBe(true); // anti-vacuity on the fixture
        expect(absoluteEntrypoint.startsWith(tempDir)).toBe(false);

        writeAgentFile("abs-test", {
          engine: { type: "local", entrypoint: absoluteEntrypoint },
        });

        const runner = new FsAgentRunner({
          executionAdapter: mockExecutionAdapter,
          gitgovPath,
          projectRoot: tempDir,
        });

        const response = await runner.runOnce({
          agentId: "agent:abs-test",
          taskId: "task:1",
        });

        expect(response.output?.message).toBe("from absolute");
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it("[ARUN-B1] should resolve NPM package name via createRequire", async () => {
      // createRequire is non-configurable on node:module — can't spy it.
      // Instead: create a fake node_modules structure so createRequire actually resolves.
      const fakeModuleDir = path.join(tempDir, "node_modules", "@fake", "agent-echo");
      fs.mkdirSync(fakeModuleDir, { recursive: true });
      fs.writeFileSync(
        path.join(fakeModuleDir, "package.json"),
        JSON.stringify({ name: "@fake/agent-echo", main: "index.js" }),
      );
      fs.writeFileSync(
        path.join(fakeModuleDir, "index.js"),
        "module.exports.runAgent = async function() { return { message: 'from npm resolve' }; };",
      );

      writeAgentFile("npm-agent", {
        engine: { type: "local", entrypoint: "@fake/agent-echo", function: "runAgent" },
      });

      const runner = new FsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:npm-agent",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output?.message).toBe("from npm resolve");
    });

    it("[ARUN-B2] should lookup runtime handler", async () => {
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

    it("[ARUN-B3] should throw LocalEngineConfigError when neither defined", async () => {
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

    it("[ARUN-B4] should dynamic import the entrypoint module", async () => {
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

    it("[ARUN-B5] should use engine.function or default to runAgent", async () => {
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

    it("[ARUN-B6] should throw FunctionNotExported when missing", async () => {
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

    it("[ARUN-B7] should invoke function with AgentExecutionContext", async () => {
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

  describe("4.12. Built-in Agent Resolution (ARUN-O1 to ARUN-O4)", () => {
    it("[ARUN-O1] should accept an optional BuiltinAgentRegistry at construction", async () => {
      // Optional like every other registry: without it, ONLY a `builtin:` entrypoint fails,
      // and everything else keeps working. That degradation is the requirement, so it is
      // asserted rather than assumed.
      const entrypoint = writeAgentEntrypoint(
        "plain.js",
        "module.exports.runAgent = async () => ({ message: 'no registry needed' })"
      );
      writeAgentFile("plain", { engine: { type: "local", entrypoint } });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir });
      const response = await runner.runOnce({ agentId: "agent:plain", taskId: "task:1" });

      expect(response.status).toBe("success");
      expect(response.output?.message).toBe("no registry needed");
    });

    it("[ARUN-O2] should invoke the registered builtin with the execution context and no dynamic import", async () => {
      let receivedCtx: AgentExecutionContext | undefined;
      const registry = new Map<string, AgentExecutor>([
        ["demo", async (ctx) => {
          receivedCtx = ctx;
          return { message: "from builtin" };
        }],
      ]);
      writeAgentFile("demo", { engine: { type: "local", entrypoint: "builtin:demo" } });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir, builtinAgents: registry });
      const response = await runner.runOnce({ agentId: "agent:demo", taskId: "task:7" });

      expect(response.status).toBe("success");
      expect(response.output?.message).toBe("from builtin");
      // Same invocation contract as an imported entrypoint (ARUN-B7): the context, and only
      // the context. Nothing was written to disk for this agent, so no import could have
      // produced the output.
      expect(receivedCtx?.agentId).toBe("agent:demo");
      expect(receivedCtx?.taskId).toBe("task:7");
      expect(receivedCtx?.projectRoot).toBe(tempDir);
    });

    it("[ARUN-O2] should ignore engine.function for a builtin entrypoint", async () => {
      // The registry maps a name to a function, so there is no module from which to select
      // an export. A `function` that named something absent would fail if it were honoured.
      const registry = new Map<string, AgentExecutor>([
        ["demo", async () => ({ message: "invoked anyway" })],
      ]);
      writeAgentFile("demo-fn", {
        engine: { type: "local", entrypoint: "builtin:demo", function: "thisExportDoesNotExist" },
      });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir, builtinAgents: registry });
      const response = await runner.runOnce({ agentId: "agent:demo-fn", taskId: "task:1" });

      expect(response.status).toBe("success");
      expect(response.output?.message).toBe("invoked anyway");
    });

    it("[ARUN-O3] should throw BuiltinAgentNotRegistered when the name is absent from the registry", async () => {
      // Surfaces the way every other resolution failure does — captured by runOnce as
      // status "error" (ARUN-H2) — but with its own named cause, so the message tells the
      // user the host did not ship the agent rather than that a module was not found.
      writeAgentFile("missing", { engine: { type: "local", entrypoint: "builtin:missing" } });

      const withEmptyRegistry = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
        builtinAgents: new Map<string, AgentExecutor>(),
      });
      const withNoRegistry = new FsAgentRunner({ gitgovPath, projectRoot: tempDir });

      for (const runner of [withEmptyRegistry, withNoRegistry]) {
        const response = await runner.runOnce({ agentId: "agent:missing", taskId: "task:1" });
        expect(response.status).toBe("error");
        expect(response.error).toContain("BuiltinAgentNotRegistered");
        expect(response.error).toContain("missing");
      }
    });

    it("[ARUN-O4] should derive its anchors inside the resolver without a caller-supplied root", async () => {
      // The backend used to pick the root at the call site: ctx.projectRoot for packages,
      // this.projectRoot for paths. Both held the same value, so the choice never changed an
      // outcome — but while it lived there, two callers could choose differently and ARUN-M2
      // would stop predicting execution with every test still green.
      //
      // Asserted behaviourally: the root that resolution uses is the one the backend was
      // built with, for BOTH shapes, and a different root reaching it by any other path
      // would make one of these fail.
      const entrypoint = writeAgentEntrypoint(
        "anchored.js",
        "module.exports.runAgent = async () => ({ message: 'anchored at construction' })"
      );
      writeAgentFile("anchored", { engine: { type: "local", entrypoint } });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir });
      const response = await runner.runOnce({ agentId: "agent:anchored", taskId: "task:1" });

      expect(response.output?.message).toBe("anchored at construction");
      // Anti-vacuity: the resolver takes exactly two arguments now — the entrypoint and one
      // anchors object. A third parameter would mean a caller can still hand it a root.
      expect(resolveLocalEntrypoint).toHaveLength(2);
    });

    it("[ARUN-B1] should prefer the builtin registry over an installed package of the same name", async () => {
      // Precedence is EXCLUSIVE, not a fallback chain. A `builtin:` never reaches the
      // filesystem, so a package of the same name installed in the repository cannot shadow
      // the agent the host shipped — and a `builtin:` that is NOT registered fails instead
      // of silently running that package, which would execute different code than the record
      // declares without anybody noticing.
      installPackageInRepo("shadow", "module.exports.runAgent = async () => ({ message: 'from package' })");

      const registry = new Map<string, AgentExecutor>([
        ["shadow", async () => ({ message: "from builtin" })],
      ]);
      writeAgentFile("shadow", { engine: { type: "local", entrypoint: "builtin:shadow" } });
      writeAgentFile("shadow-absent", { engine: { type: "local", entrypoint: "builtin:absent" } });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir, builtinAgents: registry });

      const preferred = await runner.runOnce({ agentId: "agent:shadow", taskId: "task:1" });
      expect(preferred.output?.message).toBe("from builtin");

      // Control: the package IS resolvable, so "from builtin" above was a choice, not the
      // only option available.
      writeAgentFile("shadow-pkg", { engine: { type: "local", entrypoint: "shadow" } });
      const viaPackage = await runner.runOnce({ agentId: "agent:shadow-pkg", taskId: "task:1" });
      expect(viaPackage.output?.message).toBe("from package");

      // And no fallback: an unregistered builtin fails rather than retrying as a package.
      installPackageInRepo("absent", "module.exports.runAgent = async () => ({ message: 'fallback' })");
      const noFallback = await runner.runOnce({ agentId: "agent:shadow-absent", taskId: "task:1" });
      expect(noFallback.status).toBe("error");
      expect(noFallback.error).toContain("BuiltinAgentNotRegistered");
    });
  });

  describe("4.3. Context Building (ARUN-C1 to ARUN-C3)", () => {
    it("[ARUN-C1] should include agentId in context", async () => {
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

    it("[ARUN-C2] should use actorId or fallback to agentId", async () => {
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

    it("[ARUN-C3] should generate unique UUID for runId", async () => {
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

  describe("4.4. Engine Type Validation (ARUN-G1 to ARUN-G3)", () => {
    it("[ARUN-G1] should throw UnsupportedEngineType for unknown type", async () => {
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

    it("[ARUN-G2] should throw EngineConfigError when url missing", async () => {
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

    it("[ARUN-G3] should throw MissingDependency for actor-signature without adapter", async () => {
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
        "MissingDependency: KeyProvider required for actor-signature auth"
      );
    });
  });

  // [ARUN-H3] Runner is pure — no record writing. Tests verify output capture, not persistence.
  describe("4.5. ExecutionRecord Handling — Pure Runner (ARUN-H1 to ARUN-H4)", () => {
    it("[ARUN-H1] should return AgentResponse with output on success (no record creation)", async () => {
      const entrypoint = writeAgentEntrypoint(
        "success.js",
        "module.exports.runAgent = async () => ({ data: 'ok' })"
      );
      writeAgentFile("success", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:success",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output).toEqual(expect.objectContaining({ data: "ok" }));
    });

    it("[ARUN-H2] should return AgentResponse with error on failure (no record creation)", async () => {
      const entrypoint = writeAgentEntrypoint(
        "error.js",
        "module.exports.runAgent = async () => { throw new Error('fail'); }"
      );
      writeAgentFile("error", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:error",
        taskId: "task:1",
      });

      expect(response.status).toBe("error");
      expect(response.error).toBe("fail");
    });

    it("[ARUN-H3] should include generated executionRecordId in AgentResponse", async () => {
      const entrypoint = writeAgentEntrypoint(
        "exec-id.js",
        "module.exports.runAgent = async () => ({})"
      );
      writeAgentFile("exec-id", {
        engine: { type: "local", entrypoint },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:exec-id",
        taskId: "task:1",
      });

      // executionRecordId is generated (not from a persisted record)
      expect(response.executionRecordId).toBeDefined();
      expect(response.executionRecordId).toMatch(/^\d{10}-exec-/);
    });

    it("[ARUN-H4] should NOT throw when executionAdapter is missing (optional now)", () => {
      expect(() => {
        new FsAgentRunner({
          gitgovPath,
          projectRoot: tempDir,
        });
      }).not.toThrow();
    });
  });

  describe("4.6. EventBus Integration (ARUN-I1 to ARUN-I4)", () => {
    it("[ARUN-I1] should emit agent:started event", async () => {
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

    it("[ARUN-I2] should emit agent:completed event on success", async () => {
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

    it("[ARUN-I3] should emit agent:error event on failure", async () => {
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

    it("[ARUN-I4] should work silently without EventBus", async () => {
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

  describe("4.7. Response Return (ARUN-J1 to ARUN-J3)", () => {
    it("[ARUN-J1] should always return AgentResponse", async () => {
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

    it("[ARUN-J2] should include output in AgentResponse on success", async () => {
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

    it("[ARUN-J3] should include error in AgentResponse on failure", async () => {
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

  describe("4.8. Factory Function (ARUN-K1)", () => {
    it("[ARUN-K1] should create FsAgentRunner with injected dependencies", () => {
      const runner = createFsAgentRunner({
        executionAdapter: mockExecutionAdapter,
        gitgovPath,
        projectRoot: tempDir,
      });

      expect(runner).toBeInstanceOf(FsAgentRunner);
    });
  });

  // [ARUN-H3] Runner is pure — returns output regardless of agent purpose.
  // Record creation is now the caller's responsibility.
  describe("4.9. Pure Runner for All Agent Types (ARUN-L1 to ARUN-L4)", () => {
    it("[ARUN-L1] should return output for review agents without creating FeedbackRecord", async () => {
      const entrypoint = writeAgentEntrypoint(
        "review-agent.js",
        "module.exports.runReviewAdvisor = async () => ({ data: 'review-ok' })"
      );
      writeAgentFile("review-agent", {
        engine: { type: "local", entrypoint, function: "runReviewAdvisor" },
        metadata: { purpose: "review" },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:review-agent",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output).toEqual(expect.objectContaining({ data: "review-ok" }));
      expect(response.executionRecordId).toMatch(/^\d{10}-exec-/);
    });

    it("[ARUN-L2] should work without feedbackAdapter (no longer needed)", async () => {
      const entrypoint = writeAgentEntrypoint(
        "review-no-feedback.js",
        "module.exports.runReviewAdvisor = async () => ({ data: 'review-fallback' })"
      );
      writeAgentFile("review-no-feedback", {
        engine: { type: "local", entrypoint, function: "runReviewAdvisor" },
        metadata: { purpose: "review" },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:review-no-feedback",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output).toEqual(expect.objectContaining({ data: "review-fallback" }));
    });

    it("[ARUN-L3] should return output for audit agents without creating ExecutionRecord", async () => {
      const entrypoint = writeAgentEntrypoint(
        "audit-agent.js",
        "module.exports.runAgent = async () => ({ data: 'audit-ok' })"
      );
      writeAgentFile("audit-agent", {
        engine: { type: "local", entrypoint },
        metadata: { purpose: "audit" },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:audit-agent",
        taskId: "task:1",
      });

      expect(response.status).toBe("success");
      expect(response.output).toEqual(expect.objectContaining({ data: "audit-ok" }));
    });

    it("[ARUN-L4] should include generated executionRecordId for all agent types", async () => {
      const entrypoint = writeAgentEntrypoint(
        "review-id.js",
        "module.exports.runReviewAdvisor = async () => ({ data: 'review-id-test' })"
      );
      writeAgentFile("review-id", {
        engine: { type: "local", entrypoint, function: "runReviewAdvisor" },
        metadata: { purpose: "review" },
      });

      const runner = new FsAgentRunner({
        gitgovPath,
        projectRoot: tempDir,
      });

      const response = await runner.runOnce({
        agentId: "agent:review-id",
        taskId: "task:1",
      });

      // executionRecordId is generated (not from a persisted record)
      expect(response.executionRecordId).toBeDefined();
      expect(response.executionRecordId).toMatch(/^\d{10}-exec-/);
    });
  });
  // ═══════════════════════════════════════════════════════════════════════
  // 4.10. Standalone Runner Resolution — delegation (ARUN-N4)
  // ═══════════════════════════════════════════════════════════════════════
  describe("4.10. Standalone Runner Resolution (ARUN-N4)", () => {
    it("[ARUN-N4] should use resolveRunner instead of inline switch", async () => {
      // The spy proves DELEGATION, not just outcome: a reintroduced inline switch would
      // keep every behavioral test green while resolveRunner stops being the single
      // source of truth — which is the exact regression this EARS exists to block.
      const spy = jest.spyOn(ResolveRunnerModule, "resolveRunner");

      const entrypoint = writeAgentEntrypoint(
        "n4-delegate.js",
        `module.exports.runAgent = async () => ({ message: "resolved-through-resolveRunner" })`
      );
      writeAgentFile("n4-delegate", { engine: { type: "local", entrypoint } });

      const runner = new FsAgentRunner({ gitgovPath, projectRoot: tempDir });
      const response = await runner.runOnce({ agentId: "agent:n4-delegate", taskId: "task:n4" });

      expect(spy).toHaveBeenCalledTimes(1);
      const [engineArg, backendsArg] = spy.mock.calls[0]!;
      expect(engineArg.type).toBe("local");
      // The full map travels — all four families resolvable from one call site.
      expect(Object.keys(backendsArg).sort()).toEqual(["api", "custom", "local", "mcp"]);
      // And the run result actually flowed through the delegated backend.
      expect(response.status).toBe("success");
      expect(response.output?.message).toBe("resolved-through-resolveRunner");

      spy.mockRestore();
    });
  });

});
