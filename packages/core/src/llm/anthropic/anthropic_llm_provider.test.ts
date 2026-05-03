import { AnthropicLlmProvider } from './anthropic_llm_provider';

const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Analysis: This is a critical finding.' }],
  model: 'claude-sonnet-4-6',
  usage: { input_tokens: 100, output_tokens: 50 },
});

// Mock the Anthropic SDK — I/O dependency
jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropicClass = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropicClass, __esModule: true };
});

describe('AnthropicLlmProvider', () => {
  describe('4.2. Anthropic Provider (LLM-B1 to LLM-B4)', () => {
    it('[LLM-B1] should query Anthropic SDK with model and messages', async () => {
      const provider = new AnthropicLlmProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' });

      const response = await provider.query([
        { role: 'user', content: 'Analyze this finding' },
      ]);

      expect(response.content).toBe('Analysis: This is a critical finding.');
      expect(response.model).toBe('claude-sonnet-4-6');
    });

    it('[LLM-B2] should map LlmTool to Anthropic tool format', async () => {
      const provider = new AnthropicLlmProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' });

      await provider.query(
        [{ role: 'user', content: 'Read file' }],
        [{
          name: 'Read',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
          execute: async () => 'file content',
        }],
      );

      const callArgs = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
      expect(callArgs.tools).toHaveLength(1);
      expect(callArgs.tools[0].name).toBe('Read');
    });

    it('[LLM-B3] should throw with original error message on API failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const provider = new AnthropicLlmProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' });

      await expect(provider.query([{ role: 'user', content: 'test' }])).rejects.toThrow('Rate limit exceeded');
    });

    it('[LLM-B4] should include usage tokens in response', async () => {
      const provider = new AnthropicLlmProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' });

      const response = await provider.query([{ role: 'user', content: 'test' }]);

      expect(response.usage).toBeDefined();
      expect(response.usage!.inputTokens).toBe(100);
      expect(response.usage!.outputTokens).toBe(50);
    });
  });
});
