import { execSync, exec } from 'node:child_process';
import { CliLlmProvider } from './cli_llm_provider';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn(),
}));

const mockExecSync = execSync as unknown as jest.Mock;
const mockExec = exec as unknown as jest.Mock;

describe('CliLlmProvider', () => {
  describe('4.3. CLI Provider (LLM-C1 to LLM-C4)', () => {
    beforeEach(() => {
      mockExecSync.mockReset();
      mockExec.mockReset();
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'claude --version') return 'claude 1.0.0\n';
        if (cmd.startsWith('claude -p')) return 'LLM response content';
        throw new Error(`Unexpected command: ${cmd}`);
      });
    });

    it('[LLM-C1] should detect available CLI binary', () => {
      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5' });
      expect(provider.providerName).toBe('cli');
      expect(provider.modelName).toBe('claude-haiku-4-5');
    });

    it('[LLM-C1] should fallback to opencode when claude not found', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'claude --version') throw new Error('not found');
        if (cmd === 'opencode --version') return 'opencode 1.0.0\n';
        if (cmd.startsWith('opencode run')) return 'opencode response';
        throw new Error(`Unexpected: ${cmd}`);
      });

      const provider = new CliLlmProvider({ model: 'haiku' });
      expect(provider.providerName).toBe('cli');
    });

    it('[LLM-C1] should throw when no CLI found', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'claude --version' || cmd === 'opencode --version') throw new Error('not found');
        throw new Error(`Unexpected: ${cmd}`);
      });

      expect(() => new CliLlmProvider({ model: 'haiku' })).toThrow('No LLM CLI found');
    });

    it('[LLM-C2] should execute CLI with user message and model', async () => {
      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5' });

      const response = await provider.query([
        { role: 'user', content: 'Analyze this finding' },
      ]);

      expect(response.content).toBe('LLM response content');
      expect(response.model).toBe('claude-haiku-4-5');

      const execCalls = mockExecSync.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('claude -p'),
      );
      expect(execCalls.length).toBeGreaterThan(0);
      expect(execCalls[0][0]).toContain('--model claude-haiku-4-5');
    });

    it('[LLM-C2] should pass cwd to execSync', async () => {
      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5', cwd: '/tmp/test-repo' });

      await provider.query([{ role: 'user', content: 'test' }]);

      const execCalls = mockExecSync.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('claude -p'),
      );
      expect(execCalls[0][1].cwd).toBe('/tmp/test-repo');
    });

    it('[LLM-C3] should throw with stderr when CLI fails', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'claude --version') return 'claude 1.0.0\n';
        if (cmd.startsWith('claude -p')) {
          const err = new Error('exit code 1') as Error & { stderr: string };
          err.stderr = 'Model not found: invalid-model';
          throw err;
        }
        throw new Error(`Unexpected: ${cmd}`);
      });

      const provider = new CliLlmProvider({ model: 'invalid-model' });

      await expect(provider.query([
        { role: 'user', content: 'test' },
      ])).rejects.toThrow('Model not found: invalid-model');
    });

    it('[LLM-C4] should pass tools as --allowedTools for claude', async () => {
      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5' });

      await provider.query(
        [{ role: 'user', content: 'Read the file' }],
        [{ name: 'Read', description: 'Read a file', inputSchema: {}, execute: async () => '' }],
      );

      const execCalls = mockExecSync.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('claude -p'),
      );
      expect(execCalls[0][0]).toContain('--allowedTools "Read"');
    });

    it('[LLM-C4] should use constructor allowedTools when no query tools', async () => {
      const provider = new CliLlmProvider({
        model: 'claude-haiku-4-5',
        allowedTools: ['Read', 'Bash'],
      });

      await provider.query([{ role: 'user', content: 'test' }]);

      const execCalls = mockExecSync.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('claude -p'),
      );
      expect(execCalls[0][0]).toContain('--allowedTools "Read,Bash"');
    });
  });

  describe('4.3b. queryAsync (LLM-C2 async)', () => {
    beforeEach(() => {
      mockExecSync.mockReset();
      mockExec.mockReset();
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'claude --version') return 'claude 1.0.0\n';
        throw new Error(`Unexpected: ${cmd}`);
      });
    });

    it('[LLM-C2] should return AgentJsonResult with token metrics via queryAsync', async () => {
      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(null, JSON.stringify({
          result: 'Analysis complete',
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 },
          total_cost_usd: 0.001,
          duration_ms: 3000,
          num_turns: 1,
        }), '');
      });

      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5' });
      const result = await provider.queryAsync('Analyze this');

      expect(result.timedOut).toBe(false);
      expect(result.result).toBe('Analysis complete');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.cacheReadTokens).toBe(20);
      expect(result.cacheCreationTokens).toBe(5);
      expect(result.totalTokens).toBe(175);
      expect(result.costUsd).toBe(0.001);
      expect(result.durationMs).toBe(3000);
    });

    it('[LLM-C2] should handle timeout in queryAsync', async () => {
      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        const err = new Error('killed') as Error & { killed: boolean };
        err.killed = true;
        cb(err, '', '');
      });

      const provider = new CliLlmProvider({ model: 'claude-haiku-4-5', timeout: 3000 });
      const result = await provider.queryAsync('Long essay');

      expect(result.timedOut).toBe(true);
      expect(result.result).toBe('');
    });
  });
});
