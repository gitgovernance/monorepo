/**
 * Unit tests for validateAgentEngine (EARS-M1).
 *
 * Creation-time engine validation — the proactive counterpart of the audit-time
 * detection (AORCH-G1/G2). See agent_runner_module.md §4.12b.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAgentEngine } from "./engine_validator";
import type { Engine } from "./agent_runner.types";

describe("validateAgentEngine (EARS-M1)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-validator-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("[EARS-M1] should return resolvable true for a local engine with valid entrypoint and function", async () => {
    const entrypointPath = path.join(tempDir, "agent.js");
    fs.writeFileSync(entrypointPath, "module.exports.runAgent = async () => ({ data: 'ok' });");

    const engine: Engine = { type: "local", entrypoint: "agent.js", function: "runAgent" };
    const result = await validateAgentEngine(engine, tempDir);

    expect(result.resolvable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("[EARS-M1] should return resolvable false with reason when entrypoint does not resolve", async () => {
    // The session-63 phantom-agent case: npm package not installed anywhere
    const engine: Engine = { type: "local", entrypoint: "@gitgov/agent-does-not-exist", function: "runAgent" };
    const result = await validateAgentEngine(engine, tempDir);

    expect(result.resolvable).toBe(false);
    expect(result.reason).toContain("@gitgov/agent-does-not-exist");
  });

  it("[EARS-M1] should return resolvable false when function is not exported", async () => {
    const entrypointPath = path.join(tempDir, "agent.js");
    fs.writeFileSync(entrypointPath, "module.exports.someOtherFn = async () => ({});");

    const engine: Engine = { type: "local", entrypoint: "agent.js", function: "runAgent" };
    const result = await validateAgentEngine(engine, tempDir);

    expect(result.resolvable).toBe(false);
    expect(result.reason).toContain("does not export function 'runAgent'");
  });

  it("[EARS-M1] should return resolvable true for non-local engines", async () => {
    const apiEngine = { type: "api", url: "https://api.example.com/agent" } as Engine;
    const apiResult = await validateAgentEngine(apiEngine, tempDir);
    expect(apiResult.resolvable).toBe(true);

    // [EARS-M1](b) Runtime-based local engines also resolve at execution time
    const runtimeEngine: Engine = { type: "local", runtime: "typescript" };
    const runtimeResult = await validateAgentEngine(runtimeEngine, tempDir);
    expect(runtimeResult.resolvable).toBe(true);
  });
});
