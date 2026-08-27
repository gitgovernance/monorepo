import path from "node:path";
import { createRequire } from "node:module";
import {
  LocalEngineConfigError,
  FunctionNotExportedError,
  RuntimeNotFoundError,
} from "../agent_runner.errors";
import type { RuntimeHandlerRegistry } from "../agent_runner";
import type {
  LocalEngine,
  AgentExecutionContext,
  AgentOutput,
} from "../agent_runner.types";

/**
 * [ARUN-B1] Classifies an entrypoint as an npm package name rather than a file path.
 *
 * npm packages: start with `@` (scoped), or have no file extension and no path
 * separators. File paths: start with `.` or `/`, or carry an extension (.mjs, .js, .ts).
 *
 * Exported because BOTH `resolveLocalEntrypoint` and `LocalBackend.executeEntrypoint`
 * need the answer, and until 2026-08-27 each carried its own byte-identical copy 55 lines
 * apart. The backend cannot simply call the resolver and be done: it needs the
 * classification BEFORE resolving, to pick which root to anchor against.
 */
export function isPackageEntrypoint(entrypoint: string): boolean {
  const hasFileExtension = /\.\w+$/.test(entrypoint);
  return entrypoint.startsWith("@")
    || (!hasFileExtension && !entrypoint.startsWith(".") && !entrypoint.startsWith("/") && !entrypoint.includes(path.sep));
}

/**
 * [ARUN-B1] Resolves a local engine entrypoint to an absolute path using the
 * SAME rules as agent execution: npm package names (scoped or bare) via Node's
 * `require.resolve` anchored at the project root; absolute/relative paths joined
 * with the project root. Throws when the entrypoint cannot be resolved.
 *
 * Shared by `LocalBackend.executeEntrypoint` (execution) and `FsEngineValidator`
 * (ARUN-M2, creation-time validation) — single source of truth for resolution.
 *
 * CAVEAT worth knowing: this takes ONE root, while execution uses TWO —
 * `executeEntrypoint` anchors packages at `ctx.projectRoot` and paths at
 * `this.projectRoot`. Today both come from the same value (`fs_agent_runner.ts:74`
 * and `:129`), so validation predicts execution exactly. If they ever diverge, the
 * validator would resolve against one root and execution against the other, and
 * ARUN-M2 would stop predicting what actually happens — which is its whole purpose.
 */
export function resolveLocalEntrypoint(entrypoint: string, projectRoot: string): string {
  if (isPackageEntrypoint(entrypoint)) {
    const require = createRequire(path.join(projectRoot, "package.json"));
    return require.resolve(entrypoint);
  }
  return path.isAbsolute(entrypoint) ? entrypoint : path.join(projectRoot, entrypoint);
}

/**
 * Backend for executing local agents (engine.type: "local").
 * Supports entrypoint (dynamic import) and runtime (registered handler).
 * RETURNS AgentOutput captured from the agent function.
 *
 * Note: This is called "LocalBackend" because it handles engine.type: "local",
 * not because of filesystem usage. The FsAgentRunner loads AgentRecords from
 * filesystem, but this backend executes code locally via dynamic import.
 */
export class LocalBackend {
  constructor(
    private projectRoot: string,
    private runtimeRegistry?: RuntimeHandlerRegistry
  ) {}

  /**
   * Executes a local agent and captures its output.
   */
  async execute(
    engine: LocalEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    // [ARUN-B3] Validate that at least entrypoint or runtime is defined
    if (!engine.entrypoint && !engine.runtime) {
      throw new LocalEngineConfigError();
    }

    // [ARUN-B2] If runtime defined, use runtime handler
    if (engine.runtime) {
      return this.executeRuntime(engine, ctx);
    }

    // [ARUN-B1, B4, B5, B6, B7] If entrypoint defined, use dynamic import
    return this.executeEntrypoint(engine, ctx);
  }

  /**
   * Executes via entrypoint (dynamic import) and captures output.
   */
  private async executeEntrypoint(
    engine: LocalEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    // [ARUN-B1] Resolve entrypoint via the shared resolver (npm package via
    // require.resolve, absolute/relative path). Package resolution anchors at
    // ctx.projectRoot; path resolution at this.projectRoot (same as before).
    const entrypoint = engine.entrypoint!;
    // Same classifier the resolver uses — see isPackageEntrypoint. Needed here BEFORE
    // resolving, because packages and paths anchor at different roots.
    const absolutePath = resolveLocalEntrypoint(
      entrypoint,
      isPackageEntrypoint(entrypoint) ? ctx.projectRoot : this.projectRoot
    );

    // [ARUN-B4] Dynamic import
    const mod = await import(absolutePath);

    // [ARUN-B5] Get function (default: "runAgent")
    const fnName = engine.function || "runAgent";
    const fn = mod[fnName];

    // [ARUN-B6] Error if function not exported
    if (typeof fn !== "function") {
      throw new FunctionNotExportedError(fnName, engine.entrypoint!);
    }

    // [ARUN-B7] Invoke with context and capture output
    const result = await fn(ctx);

    return this.normalizeOutput(result);
  }

  /**
   * Executes via runtime handler.
   */
  private async executeRuntime(
    engine: LocalEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    if (!this.runtimeRegistry) {
      throw new RuntimeNotFoundError(engine.runtime!);
    }

    const handler = this.runtimeRegistry.get(engine.runtime!);
    if (!handler) {
      throw new RuntimeNotFoundError(engine.runtime!);
    }

    return handler(engine, ctx);
  }

  /**
   * Normalizes any result to AgentOutput.
   * If agent returns void/undefined, uses empty object.
   * If returns object with known fields, extracts them.
   */
  private normalizeOutput(result: unknown): AgentOutput {
    if (result === undefined || result === null) {
      return {};
    }

    if (typeof result === "object") {
      const obj = result as Record<string, unknown>;
      const output: AgentOutput = {};

      // Only include data if explicitly returned
      if (obj["data"] !== undefined) {
        output.data = obj["data"];
      }

      const message = obj["message"];
      if (typeof message === "string") {
        output.message = message;
      }

      const artifacts = obj["artifacts"];
      if (Array.isArray(artifacts)) {
        output.artifacts = artifacts;
      }

      const metadata = obj["metadata"];
      if (typeof metadata === "object" && metadata !== null) {
        output.metadata = metadata as Record<string, unknown>;
      }

      return output;
    }

    // For primitives, wrap in data
    return { data: result };
  }
}
