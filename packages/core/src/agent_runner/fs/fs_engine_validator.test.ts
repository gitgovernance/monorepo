/**
 * Unit tests for FsEngineValidator — [ARUN-M2]
 *
 * Spec: fs_agent_runner_module.md §4.11
 *
 * These three assertions moved here from `agent_runner/engine_validator.test.ts` when
 * ARUN-M1 was split. They exercise the half that needs the filesystem — resolving an
 * entrypoint with `require.resolve` and importing it — which is why the implementation
 * ships from `@gitgov/core/fs`. The contract half (never throw, non-local engines are
 * resolvable) stayed as ARUN-M1 in agent_runner_module.md §4.12b.
 *
 * The ids are not a renumbering to inflate the count (module_designer §5.5): M1 described
 * two requirements with different packaging destinations, and the four original tests are
 * all still here — three under M2, one under M1.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FsEngineValidator } from "./fs_engine_validator";
import { LocalBackend } from "../backends/local_backend";
import type { Engine, LocalEngine, AgentExecutionContext } from "../agent_runner.types";
import type { BuiltinAgentRegistry, AgentExecutor } from "../agent_runner";

describe("FsEngineValidator", () => {
  let tempDir: string;
  let validator: FsEngineValidator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-validator-test-"));
    // [ARUN-M1] La raíz se ata al construir, no en cada llamada.
    validator = new FsEngineValidator(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("4.11. Engine Resolution — FsEngineValidator (ARUN-M2)", () => {
    it("[ARUN-M2] should return resolvable true for a local engine with valid entrypoint and function", async () => {
      const entrypointPath = path.join(tempDir, "agent.js");
      fs.writeFileSync(entrypointPath, "module.exports.runAgent = async () => ({ data: 'ok' });");

      const engine: Engine = { type: "local", entrypoint: "agent.js", function: "runAgent" };
      const result = await validator.validate(engine);

      expect(result.resolvable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("[ARUN-M2] should return resolvable false with reason when entrypoint does not resolve", async () => {
      // The session-63 phantom-agent case: npm package not installed anywhere
      const engine: Engine = { type: "local", entrypoint: "@gitgov/agent-does-not-exist", function: "runAgent" };
      const result = await validator.validate(engine);

      expect(result.resolvable).toBe(false);
      expect(result.reason).toContain("@gitgov/agent-does-not-exist");
    });

    it("[ARUN-M2] should return resolvable false when function is not exported", async () => {
      const entrypointPath = path.join(tempDir, "agent.js");
      fs.writeFileSync(entrypointPath, "module.exports.someOtherFn = async () => ({});");

      const engine: Engine = { type: "local", entrypoint: "agent.js", function: "runAgent" };
      const result = await validator.validate(engine);

      expect(result.resolvable).toBe(false);
      expect(result.reason).toContain("does not export function 'runAgent'");
    });
  });

  // ARUN-M1 is specified in agent_runner_module.md §4.4 — the contract half, which is
  // runtime-agnostic. It is asserted here because this is the only implementation.
  describe("4.4. Engine Validation (ARUN-M1)", () => {
    it("[ARUN-M1] should return resolvable true for non-local engines", async () => {
      const apiEngine = { type: "api", url: "https://api.example.com/agent" } as Engine;
      expect((await validator.validate(apiEngine)).resolvable).toBe(true);

      // Runtime-based local engines also resolve at execution time, via the registry
      const runtimeEngine: Engine = { type: "local", runtime: "typescript" };
      expect((await validator.validate(runtimeEngine)).resolvable).toBe(true);
    });

    it("[ARUN-M1] should never throw and report the cause in reason", async () => {
      // The contract is "structured result, never an exception", so the caller can decide
      // between failing and warning. This was asserted nowhere: the three tests above all
      // read `.resolvable`, which only proves the call returned — not that a hostile input
      // cannot escape as a throw.
      const hostile: Engine[] = [
        { type: "local", entrypoint: "", function: "runAgent" },
        { type: "local", entrypoint: "../../../nope/../../etc/passwd", function: "runAgent" },
        { type: "local", entrypoint: "agent.js", function: "" },
        { type: "custom", protocol: "grpc" } as Engine,
      ];

      // Anti-vacuity: an empty list would make the loop assert nothing.
      expect(hostile.length).toBeGreaterThan(3);

      for (const engine of hostile) {
        const result = await validator.validate(engine);
        expect(typeof result.resolvable).toBe("boolean");
        if (!result.resolvable) {
          expect(typeof result.reason).toBe("string");
          expect(result.reason!.length).toBeGreaterThan(0);
        }
      }
    });

    it("[ARUN-M1] should resolve against the root bound at construction", async () => {
      // `validate()` takes no root: the root is bound when the implementation is built.
      // Two validators over the SAME engine must disagree purely because their constructor
      // arguments differ — that is the whole point of removing the parameter.
      //
      // Until 2026-08-27 the signature was `validate(engine, projectRoot)`, so every caller
      // chose between two indistinguishable strings — the user's repo and
      // ~/.gitgov/worktrees/<hash> — and ProjectModule, which knows neither concept, chose
      // with process.cwd(). It happened to be right because `init` runs from the repo.
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-validator-other-"));
      try {
        fs.writeFileSync(path.join(tempDir, "agent.js"), "module.exports.runAgent = async () => ({});");
        // otherDir deliberately does NOT contain agent.js

        const engine: Engine = { type: "local", entrypoint: "agent.js", function: "runAgent" };

        const boundToTemp = await new FsEngineValidator(tempDir).validate(engine);
        const boundToOther = await new FsEngineValidator(otherDir).validate(engine);

        expect(boundToTemp.resolvable).toBe(true);
        expect(boundToOther.resolvable).toBe(false);
        // Anti-vacuity: a false that came from something other than the anchor would not
        // name the entrypoint we asked for.
        expect(boundToOther.reason).toContain("agent.js");
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("[ARUN-M1] should return resolvable true for a builtin entrypoint present in the registry", async () => {
      // A `builtin:` is the ONE new case this contract can decide by itself: verifying it
      // is a map lookup, no filesystem and no network, so it does not need ARUN-M2.
      const registry = makeRegistry({ "security-audit": async () => ({ data: "ok" }) });
      const validator = new FsEngineValidator(tempDir, registry);

      const engine: Engine = { type: "local", entrypoint: "builtin:security-audit" };
      const result = await validator.validate(engine);

      expect(result.resolvable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("[ARUN-M1] should return resolvable false with reason for a builtin entrypoint absent from the registry", async () => {
      const registry = makeRegistry({ "another-agent": async () => ({}) });
      const engine: Engine = { type: "local", entrypoint: "builtin:security-audit" };

      const withOtherAgent = await new FsEngineValidator(tempDir, registry).validate(engine);
      // ...and with no registry injected at all, which is the same failure (ARUN-O3).
      const withNoRegistry = await new FsEngineValidator(tempDir).validate(engine);

      for (const result of [withOtherAgent, withNoRegistry]) {
        expect(result.resolvable).toBe(false);
        expect(result.reason).toContain("security-audit");
        // Anti-vacuity, and it is NOT theoretical: before the builtin branch existed, this
        // test passed for the wrong reason — `builtin:security-audit` classified as a package
        // name, `require.resolve` failed, and the MODULE_NOT_FOUND text happened to contain
        // the agent name. The reason has to come from the registry lookup, not the filesystem.
        expect(result.reason).toContain("not registered");
        expect(result.reason).not.toContain("Cannot find module");
      }
    });
  });

  describe("4.12. Built-in Agent Resolution (ARUN-O3, ARUN-O5)", () => {
    it("[ARUN-O3] should return resolvable false with reason when the builtin is not registered", async () => {
      // The validator NEVER throws (ARUN-M1); execution does (asserted in fs_agent_runner.test.ts).
      const validator = new FsEngineValidator(tempDir, makeRegistry({}));
      const engine: Engine = { type: "local", entrypoint: "builtin:missing-agent" };

      let threw = false;
      let result;
      try {
        result = await validator.validate(engine);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result!.resolvable).toBe(false);
      expect(result!.reason).toContain("missing-agent");
      // Same anti-vacuity as above: without this, a MODULE_NOT_FOUND from treating the
      // string as a package name satisfies the assertion and the branch is never exercised.
      expect(result!.reason).toContain("not registered");
    });

    it("[ARUN-O5] should resolve to the same target in validation and execution for the three cases", async () => {
      // ARUN-M2 exists to PREDICT execution. This asserts the property directly, over the
      // three shapes an entrypoint can take: registered builtin, package installed in the
      // user's repo, and absent from both. `resolvable: true` must imply that execution
      // does not fail on resolution, and `false` must imply that it does.
      const registry = makeRegistry({ "demo-agent": async () => ({ data: "from-builtin" }) });
      installFakePackage(tempDir, "installed-agent");

      const validator = new FsEngineValidator(tempDir, registry);
      const backend = new LocalBackend(tempDir, undefined, registry);

      const cases: Array<{ engine: LocalEngine; expected: boolean }> = [
        { engine: { type: "local", entrypoint: "builtin:demo-agent" }, expected: true },
        { engine: { type: "local", entrypoint: "installed-agent", function: "runAgent" }, expected: true },
        { engine: { type: "local", entrypoint: "builtin:nowhere" }, expected: false },
      ];

      // Anti-vacuity: the loop must cover all three, and both outcomes must occur — a list
      // where everything resolves would pass without comparing anything.
      expect(cases).toHaveLength(3);
      expect(new Set(cases.map((c) => c.expected)).size).toBe(2);

      for (const { engine, expected } of cases) {
        const validation = await validator.validate(engine);
        expect(validation.resolvable).toBe(expected);

        const executionResolved = await resolutionSucceeds(backend, engine);
        expect(executionResolved).toBe(expected);
      }
    });

    it("[ARUN-O5] should fail the equivalence when validator and execution get different registries", async () => {
      // The negative control for the test above. Two registries with different contents make
      // the validator predict something the runner cannot do — the failure mode this EARS
      // exists to forbid, and the one that stays invisible in production when both sides are
      // wired from separate instances. If this test ever goes green by agreement, the
      // equivalence check above is not discriminating.
      const validatorRegistry = makeRegistry({ "demo-agent": async () => ({}) });
      const executionRegistry = makeRegistry({ "a-different-agent": async () => ({}) });

      const validator = new FsEngineValidator(tempDir, validatorRegistry);
      const backend = new LocalBackend(tempDir, undefined, executionRegistry);
      const engine: LocalEngine = { type: "local", entrypoint: "builtin:demo-agent" };

      expect((await validator.validate(engine)).resolvable).toBe(true);
      expect(await resolutionSucceeds(backend, engine)).toBe(false);
    });
  });
});

/** A registry satisfying the contract; a plain Map satisfies it structurally too. */
function makeRegistry(entries: Record<string, AgentExecutor>): BuiltinAgentRegistry {
  return new Map<string, AgentExecutor>(Object.entries(entries));
}

/** Installs a minimal npm package inside `root` so `require.resolve` finds it from there. */
function installFakePackage(root: string, name: string): void {
  const pkgDir = path.join(root, "node_modules", name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "host", version: "1.0.0" }));
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
  fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports.runAgent = async () => ({ data: 'from-package' });");
}

/**
 * True when execution gets far enough to run the agent, false when it fails while RESOLVING.
 * Errors raised by the agent itself are not resolution failures and must not count.
 */
async function resolutionSucceeds(backend: LocalBackend, engine: LocalEngine): Promise<boolean> {
  const ctx: AgentExecutionContext = {
    agentId: "agent:test",
    actorId: "agent:test",
    taskId: "task:test",
    runId: "run-1",
    projectRoot: "/unused",
  };

  try {
    await backend.execute(engine, ctx);
    return true;
  } catch (error) {
    return !isResolutionFailure(error);
  }
}

/**
 * The three ways resolution itself can fail, which are exactly the three the validator
 * reports as `resolvable: false`. Anything else is the agent failing, which ARUN-H2 says
 * is not a resolution problem and must not count here.
 */
function isResolutionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "BuiltinAgentNotRegisteredError") return true;
  if (error.name === "FunctionNotExportedError") return true;
  return "code" in error && error.code === "MODULE_NOT_FOUND";
}
