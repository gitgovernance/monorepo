import { resolveLocalEntrypoint } from "../backends/local_backend";
import type { IEngineValidator } from "../agent_runner";
import type { Engine, EngineValidationResult } from "../agent_runner.types";

/**
 * [ARUN-M2] Filesystem-backed implementation of `IEngineValidator`.
 *
 * Spec: fs_agent_runner_module.md §4.11
 *
 * Resolves an entrypoint with the SAME rules as `LocalBackend` (ARUN-B1, via the shared
 * `resolveLocalEntrypoint`), imports the module, and verifies the declared function is
 * exported. Any failure returns `{ resolvable: false, reason }` — it never throws, which
 * is the contract half specified as ARUN-M1 in the pure spec.
 *
 * This class ships from `@gitgov/core/fs`, not from the root barrel. `resolveLocalEntrypoint`
 * reaches `node:path` and `node:module`, so anything that imports it statically pulls both
 * into whatever bundle it lands in. While `ProjectModule` imported the free function
 * `validateAgentEngine` directly, that is exactly what happened: `path` and `module` ended
 * up in `dist/src/index.js` and EARS-CI02 reported them. `ProjectModule` now receives an
 * `IEngineValidator` instead, and the chain is cut.
 *
 * The root is bound HERE, at construction (ARUN-M1), not passed per call. `require.resolve`
 * needs `node_modules`, which lives in the user's repo — never in `~/.gitgov/worktrees/<hash>`.
 * The only component that holds both roots is the CLI's DI service, so it is the only one
 * that can choose correctly: `dependency_injection_module` EARS-C16.
 */
export class FsEngineValidator implements IEngineValidator {
  constructor(private readonly projectRoot: string) {}

  async validate(engine: Engine): Promise<EngineValidationResult> {
    // [ARUN-M1] Non-local engines are not locally verifiable
    if (engine.type !== "local") {
      return { resolvable: true };
    }

    // [ARUN-M1] Runtime-based local engines resolve at execution time, via the registry
    if (!engine.entrypoint) {
      return { resolvable: true };
    }

    // [ARUN-M2] Entrypoint-based: resolve → import → verify function
    let absolutePath: string;
    try {
      absolutePath = resolveLocalEntrypoint(engine.entrypoint, this.projectRoot);
    } catch (error) {
      return {
        resolvable: false,
        reason: `entrypoint '${engine.entrypoint}' does not resolve: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    let mod: Record<string, unknown>;
    try {
      mod = await import(absolutePath) as Record<string, unknown>;
    } catch (error) {
      return {
        resolvable: false,
        reason: `entrypoint '${engine.entrypoint}' resolved to '${absolutePath}' but failed to load: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const fnName = engine.function || "runAgent";
    if (typeof mod[fnName] !== "function") {
      return {
        resolvable: false,
        reason: `module '${engine.entrypoint}' does not export function '${fnName}'`,
      };
    }

    return { resolvable: true };
  }
}
