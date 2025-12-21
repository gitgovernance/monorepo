import path from "node:path";
import {
  LocalEngineConfigError,
  FunctionNotExportedError,
  RuntimeNotFoundError,
} from "../errors";
import type { LocalEngine } from "../engines";
import type {
  AgentExecutionContext,
  AgentOutput,
  RuntimeHandlerRegistry,
} from "../types";

/**
 * Backend for executing local agents.
 * Supports entrypoint (custom code) and runtime (registered handler).
 * RETURNS AgentOutput captured from the agent function.
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
    // [EARS-B3] Validate that at least entrypoint or runtime is defined
    if (!engine.entrypoint && !engine.runtime) {
      throw new LocalEngineConfigError();
    }

    // [EARS-B2] If runtime defined, use runtime handler
    if (engine.runtime) {
      return this.executeRuntime(engine, ctx);
    }

    // [EARS-B1, B4, B5, B6, B7] If entrypoint defined, use dynamic import
    return this.executeEntrypoint(engine, ctx);
  }

  /**
   * Executes via entrypoint (dynamic import) and captures output.
   */
  private async executeEntrypoint(
    engine: LocalEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    // [EARS-B1] Resolve absolute path
    const absolutePath = path.join(this.projectRoot, engine.entrypoint!);

    // [EARS-B4] Dynamic import
    const mod = await import(absolutePath);

    // [EARS-B5] Get function (default: "runAgent")
    const fnName = engine.function || "runAgent";
    const fn = mod[fnName];

    // [EARS-B6] Error if function not exported
    if (typeof fn !== "function") {
      throw new FunctionNotExportedError(fnName, engine.entrypoint!);
    }

    // [EARS-B7] Invoke with context and capture output
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
