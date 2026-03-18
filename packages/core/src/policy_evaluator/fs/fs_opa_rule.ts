/**
 * FsOpaRule -- filesystem implementation of OpaRuleFactory.
 *
 * Compiles .rego files to WASM using `opa build`, then evaluates
 * using @open-policy-agent/opa-wasm.
 *
 * EARS: PEVAL-O1, PEVAL-O2, PEVAL-O3, PEVAL-O4, PEVAL-O5, PEVAL-O6
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as zlib from "node:zlib";
import type {
  PolicyRule,
  PolicyRuleResult,
  ConsolidatedFinding,
  PolicyConfig,
  ActiveWaiver,
  OpaRuleFactory,
} from "../policy_evaluator.types";

/**
 * Input format for OPA evaluation.
 * OPA receives ConsolidatedFinding[] as input.findings (flat, SARIF-derived).
 */
type OpaInput = {
  findings: ConsolidatedFinding[];
  waivers: ActiveWaiver[];
  config: {
    failOn: string;
    blockCategories: string[];
    waiverRequirements: Record<string, { role: string; minApprovals: number }>;
    opa: { policies: string[] } | null;
  };
};

/** Minimal interface for the loaded OPA policy to avoid importing the class type. */
type LoadedOpaPolicy = {
  setData(data: object): void;
  evaluate(input: OpaInput): Array<{ result: unknown }>;
};

/**
 * Extracts policy.wasm from the tar.gz bundle produced by `opa build`.
 * OPA bundles are standard tar.gz containing /policy.wasm and /data.json.
 */
function extractWasmFromBundle(bundlePath: string): Buffer {
  const gzipped = fs.readFileSync(bundlePath);
  const tar = zlib.gunzipSync(gzipped);

  // Tar format: 512-byte header blocks followed by data blocks
  let offset = 0;
  while (offset < tar.length) {
    // Read filename from header (first 100 bytes, null-terminated)
    const nameBytes = tar.subarray(offset, offset + 100);
    const nameEnd = nameBytes.indexOf(0);
    const name = nameBytes
      .subarray(0, nameEnd === -1 ? 100 : nameEnd)
      .toString("utf-8")
      .replace(/^\.\//, "");

    // Read file size from header (octal, bytes 124-135)
    const sizeStr = tar
      .subarray(offset + 124, offset + 136)
      .toString("utf-8")
      .trim();
    const size = parseInt(sizeStr, 8);

    if (isNaN(size) || size === 0) {
      offset += 512;
      continue;
    }

    // Data starts after the 512-byte header
    const dataStart = offset + 512;

    if (name === "policy.wasm" || name === "/policy.wasm") {
      return Buffer.from(tar.subarray(dataStart, dataStart + size));
    }

    // Advance past header + data (rounded up to 512-byte boundary)
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  throw new Error("policy.wasm not found in OPA bundle");
}

/**
 * Checks if the `opa` CLI is available.
 */
function isOpaCLIAvailable(): boolean {
  try {
    execSync("opa version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an OPA-based PolicyRule from a .rego file.
 *
 * The .rego file is compiled to WASM using `opa build`, then loaded
 * via @open-policy-agent/opa-wasm for evaluation.
 *
 * @param regoPath - Path to the .rego file (absolute or relative to repoRoot)
 * @param repoRoot - Repository root for resolving relative paths
 */
export async function createOpaRule(
  regoPath: string,
  repoRoot: string,
): Promise<PolicyRule> {
  const filename = path.basename(regoPath, ".rego");
  const ruleName = `opa:${filename}`;

  // No-op rule factory for error cases (PEVAL-O6)
  const noOpRule: PolicyRule = {
    name: ruleName,
    evaluate(
      _findings: ConsolidatedFinding[],
      _config: PolicyConfig,
    ): PolicyRuleResult {
      return {
        ruleName,
        passed: true,
        reason: "OPA policy skipped",
      };
    },
  };

  // Check opa CLI availability
  if (!isOpaCLIAvailable()) {
    console.warn(`[PolicyEvaluator] opa CLI not available, skipping ${regoPath}`);
    return noOpRule;
  }

  // Resolve path
  const absoluteRegoPath = path.isAbsolute(regoPath)
    ? regoPath
    : path.resolve(repoRoot, regoPath);

  // Check if .rego file exists (PEVAL-O6)
  if (!fs.existsSync(absoluteRegoPath)) {
    console.warn(
      `[PolicyEvaluator] .rego file not found: ${absoluteRegoPath}, skipping`,
    );
    return noOpRule;
  }

  // Read .rego to extract package name for entrypoint
  const regoContent = fs.readFileSync(absoluteRegoPath, "utf-8");
  const packageMatch = regoContent.match(/^package\s+([\w.]+)/m);
  if (!packageMatch?.[1]) {
    console.warn(
      `[PolicyEvaluator] No package declaration found in ${absoluteRegoPath}, skipping`,
    );
    return noOpRule;
  }
  const packagePath = packageMatch[1].replace(/\./g, "/");
  const entrypoint = `${packagePath}/block`;

  // Compile to WASM bundle
  const bundlePath = path.join(
    path.dirname(absoluteRegoPath),
    `${filename}_bundle.tar.gz`,
  );

  try {
    execSync(
      `opa build -t wasm -e "${entrypoint}" -o "${bundlePath}" "${absoluteRegoPath}"`,
      { stdio: "pipe" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[PolicyEvaluator] opa build failed for ${regoPath}: ${msg}`);
    return noOpRule;
  }

  // Extract policy.wasm from the tar.gz bundle
  let wasmBuffer: Buffer;
  try {
    wasmBuffer = extractWasmFromBundle(bundlePath);
  } finally {
    // Cleanup bundle file
    try {
      fs.unlinkSync(bundlePath);
    } catch {
      // ignore cleanup errors
    }
  }

  // Load WASM policy via @open-policy-agent/opa-wasm
  const { loadPolicy } = await import("@open-policy-agent/opa-wasm");
  const policy = (await loadPolicy(wasmBuffer)) as LoadedOpaPolicy;
  policy.setData({});

  return {
    name: ruleName,

    evaluate(
      findings: ConsolidatedFinding[],
      config: PolicyConfig,
    ): PolicyRuleResult {
      // Build OPA input (PEVAL-O4)
      // Waivers are already applied to findings (isWaived flag set), but
      // we pass the full activeWaivers for OPA policies that need waiver metadata.
      const activeWaivers = findings
        .filter((f): f is ConsolidatedFinding & { waiver: ActiveWaiver } => f.isWaived && f.waiver !== undefined)
        .map((f) => f.waiver);
      const input: OpaInput = {
        findings,
        waivers: activeWaivers,
        config: {
          failOn: config.failOn,
          blockCategories: config.blockCategories ?? [],
          waiverRequirements: config.waiverRequirements ?? {},
          opa: config.opa ?? null,
        },
      };

      const evalResult = policy.evaluate(input);
      const firstResult = evalResult[0];

      // Extract block messages from result
      let blockMessages: string[] = [];
      if (firstResult?.result) {
        const result = firstResult.result;
        if (Array.isArray(result)) {
          blockMessages = result.filter(
            (m): m is string => typeof m === "string",
          );
        } else if (result instanceof Set) {
          blockMessages = [...result].filter(
            (m): m is string => typeof m === "string",
          );
        }
      }

      // PEVAL-O3: No block results -> pass
      if (blockMessages.length === 0) {
        return {
          ruleName,
          passed: true,
          reason: "OPA policy passed",
        };
      }

      // PEVAL-O2: block results -> fail
      return {
        ruleName,
        passed: false,
        reason: blockMessages.join("; "),
      };
    },
  };
}

/**
 * Filesystem implementation of OpaRuleFactory.
 * Receives repoRoot at construction time (DI) so callers don't need to know it.
 */
export class FsOpaRuleFactory implements OpaRuleFactory {
  constructor(private readonly repoRoot: string) {}

  async createOpaRule(regoPath: string): Promise<PolicyRule> {
    return createOpaRule(regoPath, this.repoRoot);
  }
}
