import { resolveLocalEntrypoint } from "./backends/local_backend";
import type { Engine } from "./agent_runner.types";

/**
 * Result of creation-time engine validation. Structured (no throw) so callers
 * decide fail vs warn: `agent new` fails fast (EARS-E9), `init` warns
 * non-fatally (PROJ-B6).
 */
export type EngineValidationResult = {
  resolvable: boolean;
  reason?: string;
};

/**
 * [EARS-M1] Validates that an agent engine is EXECUTABLE, not just well-formed.
 * Creation-time counterpart of the audit-time detection (AORCH-G1/G2): a
 * registered agent should be an agent that runs, not a JSON pointing nowhere.
 *
 * (a) local + entrypoint: resolve with the SAME rules as LocalBackend (EARS-B1,
 *     shared `resolveLocalEntrypoint`), import the module, verify the function
 *     (default `runAgent`) is exported. Any failure → { resolvable: false, reason }.
 * (b) local + runtime (no entrypoint): resolvable — runtime handlers resolve at
 *     execution via the registry.
 * (c) non-local engines (api, mcp): resolvable — not locally verifiable.
 *
 * Never throws — always returns a structured result.
 */
export async function validateAgentEngine(
  engine: Engine,
  projectRoot: string
): Promise<EngineValidationResult> {
  // [EARS-M1](c) Non-local engines are not locally verifiable
  if (engine.type !== "local") {
    return { resolvable: true };
  }

  // [EARS-M1](b) Runtime-based local engines resolve at execution time
  if (!engine.entrypoint) {
    return { resolvable: true };
  }

  // [EARS-M1](a) Entrypoint-based: resolve → import → verify function
  let absolutePath: string;
  try {
    absolutePath = resolveLocalEntrypoint(engine.entrypoint, projectRoot);
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
