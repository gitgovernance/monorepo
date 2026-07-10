import { execSync } from 'node:child_process';
import { Sarif } from '@gitgov/core';
import type { Runner } from '@gitgov/core';
import { FsFileLister } from '@gitgov/core/fs';
import type { SemgrepInput } from './types';
import { SemgrepAgent } from './agent';
import { resolveConfig, buildSemgrepArgs } from './config';

type AgentExecutionContext = Runner.AgentExecutionContext;

// [SGP-A1] [SGP-A4] [SGP-E3] Named export — entry point invoked by AgentRunner
// package.json has gitgov.agent with purpose:'audit', function:'runAgent', requires:'semgrep'
export async function runAgent(ctx: AgentExecutionContext) {
  const input = ctx.input as SemgrepInput;
  const resolvedCwd = input.baseDir ?? ctx.projectRoot ?? process.cwd();

  // [SGP-D1] [SGP-D2] Resolve config
  const config = resolveConfig(resolvedCwd);

  // [SGP-B6] Graceful degradation: diff without baselineCommit → full
  const effectiveInput = { ...input };
  if (input.scope === 'diff' && !input.baselineCommit) {
    effectiveInput.scope = 'full';
  }

  // [SGP-B1] Build CLI args
  const args = buildSemgrepArgs(config, resolvedCwd, effectiveInput);

  // Spawn semgrep and capture SARIF
  let semgrepSarif: Sarif.SarifLog | null = null;
  let error: string | undefined;

  try {
    // [SGP-B1] Spawn semgrep --sarif --quiet
    const stdout = execSync(`semgrep ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: config.timeout * 1000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: resolvedCwd,
    });
    semgrepSarif = JSON.parse(stdout);
  } catch (err: unknown) {
    const execError = err as { status?: number; stderr?: string; stdout?: string; killed?: boolean; message?: string };

    // [SGP-B5] Timeout
    if (execError.killed) {
      error = 'TIMEOUT';
    }
    // [SGP-B3] Exit code 1 = findings found (success for semgrep)
    else if (execError.status === 1 && execError.stdout) {
      try {
        semgrepSarif = JSON.parse(execError.stdout);
      } catch {
        error = execError.stderr ?? execError.message ?? 'Unknown semgrep error';
      }
    }
    // [SGP-B2] [SGP-B4] Real error
    else {
      const msg = execError.stderr ?? execError.message ?? 'Unknown semgrep error';
      error = msg.includes('command not found') || msg.includes('not found')
        ? msg
        : msg;
    }
  }

  // FsFileLister for getLineContent callback
  const fileLister = new FsFileLister({ cwd: resolvedCwd });

  const agent = new SemgrepAgent({
    sarifBuilder: Sarif.createSarifBuilder(),
    getLineContent: async (file: string, line: number) => {
      try {
        const content = await fileLister.read(file);
        return content.split('\n')[line - 1] ?? null;
      } catch {
        return null;
      }
    },
  });

  return agent.run(effectiveInput, semgrepSarif, error);
}

export type { SemgrepInput, SemgrepMetadata, SemgrepSummary, SemgrepConfig } from './types';
