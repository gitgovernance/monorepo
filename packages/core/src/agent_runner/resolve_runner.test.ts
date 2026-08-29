/**
 * resolveRunner — Standalone engine→backend resolution
 *
 * Spec: fs_agent_runner_module.md §4.10 (ARUN-N1 to N3; N4 lives in fs_agent_runner.test.ts
 * because it verifies the runner's delegation, not this function).
 */
import { resolveRunner } from "./resolve_runner";
import type { IEngineBackend, EngineBackendMap } from "./agent_runner";
import { UnsupportedEngineTypeError } from "./agent_runner.errors";
import type { Engine, AgentOutput } from "./agent_runner.types";

/** A stub backend that records whether anyone executed it. */
function stubBackend(label: string): IEngineBackend & { calls: number } {
  return {
    calls: 0,
    async execute(): Promise<AgentOutput> {
      (this as { calls: number }).calls++;
      return { message: label };
    },
  };
}

describe("resolveRunner", () => {
  describe("4.10. Standalone Runner Resolution (ARUN-N1 to N3)", () => {
    let backends: EngineBackendMap & {
      local: ReturnType<typeof stubBackend>;
      api: ReturnType<typeof stubBackend>;
      mcp: ReturnType<typeof stubBackend>;
      custom: ReturnType<typeof stubBackend>;
    };

    beforeEach(() => {
      backends = {
        local: stubBackend("local"),
        api: stubBackend("api"),
        mcp: stubBackend("mcp"),
        custom: stubBackend("custom"),
      };
    });

    it("[ARUN-N1] should resolve each engine type to correct backend", () => {
      // Identity, not shape: the function must hand back the very instance it was given
      // for that type — anything else means it constructed or swapped backends.
      expect(resolveRunner({ type: "local" } as Engine, backends)).toBe(backends.local);
      expect(resolveRunner({ type: "api" } as Engine, backends)).toBe(backends.api);
      expect(resolveRunner({ type: "mcp" } as Engine, backends)).toBe(backends.mcp);
      expect(resolveRunner({ type: "custom" } as Engine, backends)).toBe(backends.custom);
    });

    it("[ARUN-N2] should throw UnsupportedEngineTypeError for unknown type", () => {
      // Widened through { type: string } so the invalid literal reaches the function
      // without the prohibited double cast.
      const unknownEngine: { type: string } = { type: "quantum" };
      expect(() => resolveRunner(unknownEngine as Engine, backends)).toThrow(
        UnsupportedEngineTypeError,
      );
      // The error must NAME the offending type — a bare "unsupported" is undiagnosable.
      expect(() => resolveRunner(unknownEngine as Engine, backends)).toThrow(/quantum/);
    });

    it("[ARUN-N3] should not emit events or write records", () => {
      // Pure resolution: the function returns the backend WITHOUT running it. If any stub
      // registered a call, resolveRunner executed instead of resolving.
      resolveRunner({ type: "local" } as Engine, backends);
      resolveRunner({ type: "api" } as Engine, backends);
      const totalCalls =
        backends.local.calls + backends.api.calls + backends.mcp.calls + backends.custom.calls;
      expect(totalCalls).toBe(0);
    });
  });
});
