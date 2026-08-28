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
import type { Engine } from "../agent_runner.types";

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
  });
});
