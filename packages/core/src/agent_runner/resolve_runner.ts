/**
 * resolveRunner — Standalone engine→backend resolution
 *
 * Spec: fs_agent_runner_module.md §4.10 (ARUN-N1 to N4)
 *
 * Lives at the module ROOT and stays pure on purpose: it imports only types and the
 * error class, so it reaches no Node builtin and ships from `@gitgov/core` — a consumer
 * can resolve `engine.type` without touching `/fs` or instantiating `FsAgentRunner`.
 * The backends arrive as an argument (EngineBackendMap) precisely so this file never
 * has to import them.
 */
import type { EngineBackendMap, IEngineBackend } from "./agent_runner";
import type { Engine } from "./agent_runner.types";
import { UnsupportedEngineTypeError } from "./agent_runner.errors";

/**
 * [ARUN-N1] Returns the backend for `engine.type`.
 * [ARUN-N2] Unknown type → UnsupportedEngineTypeError naming the value.
 * [ARUN-N3] Pure: resolves and returns — never executes, emits or writes.
 */
export function resolveRunner(
  engine: Engine,
  backends: EngineBackendMap,
): IEngineBackend {
  const type = engine.type as keyof EngineBackendMap | string;
  switch (type) {
    case "local":
      return backends.local;
    case "api":
      return backends.api;
    case "mcp":
      return backends.mcp;
    case "custom":
      return backends.custom;
    default:
      throw new UnsupportedEngineTypeError(type);
  }
}
