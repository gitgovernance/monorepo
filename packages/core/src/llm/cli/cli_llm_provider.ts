import { execSync, exec } from 'node:child_process';
import type { ILlmProvider, LlmMessage, LlmTool, LlmResponse, LlmProviderConfig } from '../llm_provider';

type CliType = 'claude' | 'opencode';

export type CliLlmProviderConfig = Pick<LlmProviderConfig, 'model' | 'timeout'> & {
  cwd?: string;
  allowedTools?: string[];
};

export type AgentJsonResult = {
  result: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  timedOut: boolean;
  raw: Record<string, unknown>;
};

// [LLM-C1] Detect available CLI — same logic as triad helpers (tested, HLPR-A6)
function detectCli(): CliType {
  try {
    execSync('claude --version', { stdio: 'pipe', timeout: 5000 });
    return 'claude';
  } catch { /* not found */ }

  try {
    execSync('opencode --version', { stdio: 'pipe', timeout: 5000 });
    return 'opencode';
  } catch { /* not found */ }

  throw new Error('No LLM CLI found. Install "claude" (Claude Code) or "opencode" to use cli/ provider.');
}

// [LLM-C1] [LLM-C2] [LLM-C3] [LLM-C4]
export class CliLlmProvider implements ILlmProvider {
  readonly providerName = 'cli';
  readonly modelName: string;
  private readonly cli: CliType;
  private readonly timeout: number;
  private readonly cwd: string;
  private readonly allowedTools: string[];

  constructor(config: CliLlmProviderConfig) {
    // [LLM-C1] Detect CLI at construction time
    this.cli = detectCli();
    this.modelName = config.model;
    this.timeout = config.timeout ?? 180_000;
    this.cwd = config.cwd ?? process.cwd();
    this.allowedTools = config.allowedTools ?? [];
  }

  // [LLM-C2] Execute CLI with prompt and model (sync — simple query)
  // [LLM-C4] Tools mapped to --allowedTools for claude, ignored for opencode (uses --dangerously-skip-permissions)
  async query(messages: readonly LlmMessage[], tools?: readonly LlmTool[]): Promise<LlmResponse> {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) {
      throw new Error('CliLlmProvider requires at least one user message');
    }

    const escapedPrompt = lastUserMsg.content.replace(/"/g, '\\"');
    const effectiveTools = tools?.map(t => t.name) ?? this.allowedTools;
    const toolsFlag = effectiveTools.length
      ? ` --allowedTools "${effectiveTools.join(',')}"` : '';

    let cmd: string;
    if (this.cli === 'claude') {
      cmd = `claude -p "${escapedPrompt}" --model ${this.modelName}${toolsFlag}`;
    } else {
      cmd = `opencode run "${escapedPrompt}" -m ${this.modelName} --pure --dangerously-skip-permissions`;
    }

    // [LLM-C3] CLI error → throw with stderr
    try {
      const stdout = execSync(cmd, {
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: this.timeout,
      });

      return {
        content: stdout.trim(),
        model: this.modelName,
      };
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      throw new Error(`CLI LLM failed: ${e.stderr ?? e.message ?? 'unknown error'}`);
    }
  }

  // [LLM-C2] Async execution with full metrics — based on triad helpers runAgentAsync (HLPR-C1)
  queryAsync(prompt: string): Promise<AgentJsonResult> {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const toolsFlag = this.allowedTools.length
      ? ` --allowedTools "${this.allowedTools.join(',')}"` : '';

    let cmd: string;
    if (this.cli === 'claude') {
      cmd = `claude -p "${escapedPrompt}" --model ${this.modelName}${toolsFlag} --output-format json`;
    } else {
      cmd = `opencode run "${escapedPrompt}" -m ${this.modelName} --pure --dangerously-skip-permissions --format json`;
    }

    return new Promise((resolve) => {
      exec(cmd, { cwd: this.cwd, timeout: this.timeout, maxBuffer: 10 * 1024 * 1024 }, (_err, stdout, stderr) => {
        if (_err?.killed) {
          resolve({
            result: '', inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0,
            costUsd: 0, durationMs: this.timeout, numTurns: 0,
            timedOut: true, raw: {},
          });
          return;
        }

        const output = stdout || stderr || '';

        if (this.cli === 'claude') {
          try {
            const parsed = JSON.parse(output) as Record<string, unknown>;
            const usage = (parsed.usage || {}) as Record<string, unknown>;
            const inputTokens = (usage.input_tokens as number) || 0;
            const cacheRead = (usage.cache_read_input_tokens as number) || 0;
            const cacheCreation = (usage.cache_creation_input_tokens as number) || 0;
            const outputTokens = (usage.output_tokens as number) || 0;

            resolve({
              result: (parsed.result as string) || '',
              inputTokens,
              outputTokens,
              cacheReadTokens: cacheRead,
              cacheCreationTokens: cacheCreation,
              totalTokens: inputTokens + cacheRead + cacheCreation + outputTokens,
              costUsd: (parsed.total_cost_usd as number) || 0,
              durationMs: (parsed.duration_ms as number) || 0,
              numTurns: (parsed.num_turns as number) || 0,
              timedOut: false,
              raw: parsed,
            });
          } catch {
            resolve({
              result: output, inputTokens: 0, outputTokens: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0,
              costUsd: 0, durationMs: 0, numTurns: 0,
              timedOut: false, raw: {},
            });
          }
        } else {
          // opencode: JSON lines parsing (HLPR-A2 pattern)
          const lines = output.split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'text' && parsed.part?.text) {
                resolve({
                  result: parsed.part.text, inputTokens: 0, outputTokens: 0,
                  cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0,
                  costUsd: 0, durationMs: 0, numTurns: 0,
                  timedOut: false, raw: parsed,
                });
                return;
              }
              if (parsed.result) {
                resolve({
                  result: parsed.result, inputTokens: 0, outputTokens: 0,
                  cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0,
                  costUsd: 0, durationMs: 0, numTurns: 0,
                  timedOut: false, raw: parsed,
                });
                return;
              }
            } catch { /* skip non-JSON line */ }
          }
          resolve({
            result: output, inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0,
            costUsd: 0, durationMs: 0, numTurns: 0,
            timedOut: false, raw: {},
          });
        }
      });
    });
  }
}
