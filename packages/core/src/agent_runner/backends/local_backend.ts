import path from "node:path";
import { createRequire } from "node:module";
import {
  LocalEngineConfigError,
  FunctionNotExportedError,
  RuntimeNotFoundError,
  BuiltinAgentNotRegisteredError,
} from "../agent_runner.errors";
import type { RuntimeHandlerRegistry, BuiltinAgentRegistry, AgentExecutor } from "../agent_runner";
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

/** [ARUN-B1] Marks an entrypoint as a built-in shipped by the host, not a module to import. */
export const BUILTIN_PREFIX = "builtin:";

/**
 * [ARUN-O1] The two anchors resolution can land in: the user's repository, and the
 * registry of the module that executes the agent (the CLI on a developer machine, the
 * worker in the SaaS).
 */
export type LocalResolutionAnchors = {
  projectRoot: string;
  /** Explicitly `| undefined`: the repo runs with `exactOptionalPropertyTypes`, and callers
   *  forward an optional dependency rather than omitting the key. */
  builtinAgents?: BuiltinAgentRegistry | undefined;
};

/** [ARUN-O2] Where an entrypoint resolved to. A built-in is a function, never a path. */
export type LocalEntrypointResolution =
  | { kind: "builtin"; name: string; execute: AgentExecutor }
  | { kind: "module"; absolutePath: string };

/**
 * [ARUN-B1] Resolves a local engine entrypoint using the SAME rules as agent execution,
 * in an EXCLUSIVE order of precedence:
 *
 *   1. `builtin:<name>` — looked up in the registry the host injected. Never touches disk.
 *   2. npm package name (scoped or bare) — `require.resolve` anchored at the project root.
 *   3. absolute path — used as is.
 *   4. relative path — joined with the project root.
 *
 * A `builtin:` that is not registered fails with its own error and is NOT retried as a
 * package or a path, even when the repository happens to have one by that name. Overriding
 * a built-in is done by declaring the package name in the AgentRecord entrypoint, which
 * keeps the choice auditable in the record.
 *
 * [ARUN-O4] The anchors are derived HERE, from the shape of the entrypoint. No caller picks
 * a root. Until 2026-09-23 `executeEntrypoint` chose between `ctx.projectRoot` for packages
 * and `this.projectRoot` for paths; both held the same value, so the choice never changed an
 * outcome, but while it lived at the call site two callers could choose differently and
 * ARUN-M2 would stop predicting execution with every test still green.
 *
 * [ARUN-O5] Shared by `LocalBackend.executeEntrypoint` (execution) and `FsEngineValidator`
 * (ARUN-M2, creation-time validation). Being the single function both sides call is what
 * MAKES validation predict execution — the equivalence is a property of this sharing, not
 * of either caller, which is why it is asserted here and not in one of them.
 */
export function resolveLocalEntrypoint(
  entrypoint: string,
  anchors: LocalResolutionAnchors
): LocalEntrypointResolution {
  // [ARUN-O2] Built-in: a function already in memory, not a module to import.
  if (entrypoint.startsWith(BUILTIN_PREFIX)) {
    const name = entrypoint.slice(BUILTIN_PREFIX.length);
    const execute = anchors.builtinAgents?.get(name);
    // [ARUN-O3] Missing name, or no registry at all — same failure, named.
    if (!execute) {
      throw new BuiltinAgentNotRegisteredError(name);
    }
    return { kind: "builtin", name, execute };
  }

  if (isPackageEntrypoint(entrypoint)) {
    const require = createRequire(path.join(anchors.projectRoot, "package.json"));
    return { kind: "module", absolutePath: require.resolve(entrypoint) };
  }

  return {
    kind: "module",
    absolutePath: path.isAbsolute(entrypoint) ? entrypoint : path.join(anchors.projectRoot, entrypoint),
  };
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
    private runtimeRegistry?: RuntimeHandlerRegistry,
    // [ARUN-O1] Injected at construction, like every other registry.
    private builtinAgents?: BuiltinAgentRegistry
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
    // [ARUN-B1, ARUN-O4] One call, and the resolver picks its own anchors from the shape
    // of the entrypoint — the backend no longer chooses a root.
    const entrypoint = engine.entrypoint!;
    const resolution = resolveLocalEntrypoint(entrypoint, {
      projectRoot: this.projectRoot,
      builtinAgents: this.builtinAgents,
    });

    // [ARUN-O2] A built-in is already a function: no import, and `engine.function` has no
    // effect, because there is no module from which to select an export.
    if (resolution.kind === "builtin") {
      // [ARUN-B7] Same invocation contract as an imported entrypoint.
      return this.normalizeOutput(await resolution.execute(ctx));
    }

    // [ARUN-B4] Dynamic import
    const mod = await import(resolution.absolutePath);

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
