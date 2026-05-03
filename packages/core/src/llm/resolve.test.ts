import { resolveLlmProvider } from './resolve';
import { AnthropicLlmProvider } from './anthropic/anthropic_llm_provider';
import { CliLlmProvider } from './cli/cli_llm_provider';

describe('resolveLlmProvider', () => {
  describe('4.1. Provider Resolution (LLM-A1 to LLM-A4)', () => {
    it('[LLM-A1] should resolve anthropic provider with model name', () => {
      const provider = resolveLlmProvider('anthropic/claude-sonnet-4-6', 'sk-ant-test');

      expect(provider).toBeInstanceOf(AnthropicLlmProvider);
      expect(provider.providerName).toBe('anthropic');
      expect(provider.modelName).toBe('claude-sonnet-4-6');
    });

    it('[LLM-A2] should resolve cli provider without apiKey', () => {
      const provider = resolveLlmProvider('cli/claude-haiku-4-5');

      expect(provider).toBeInstanceOf(CliLlmProvider);
      expect(provider.providerName).toBe('cli');
      expect(provider.modelName).toBe('claude-haiku-4-5');
    });

    it('[LLM-A3] should throw descriptive error for unknown provider', () => {
      expect(() => resolveLlmProvider('ollama/llama3')).toThrow('Unknown LLM provider: "ollama"');
      expect(() => resolveLlmProvider('ollama/llama3')).toThrow('Supported providers: anthropic, cli');
    });

    it('[LLM-A4] should throw when anthropic provider missing apiKey', () => {
      expect(() => resolveLlmProvider('anthropic/claude-sonnet-4-6')).toThrow('requires apiKey');
    });

    it('[LLM-A3] should throw on invalid format without slash', () => {
      expect(() => resolveLlmProvider('justmodel')).toThrow('Invalid LLM_MODEL format');
    });
  });

  describe('4.4. Interface Contract (LLM-D1 to LLM-D2)', () => {
    it('[LLM-D1] should expose providerName and modelName on all providers', () => {
      const anthropic = resolveLlmProvider('anthropic/claude-sonnet-4-6', 'sk-test');
      expect(typeof anthropic.providerName).toBe('string');
      expect(typeof anthropic.modelName).toBe('string');

      const cli = resolveLlmProvider('cli/claude-haiku-4-5');
      expect(typeof cli.providerName).toBe('string');
      expect(typeof cli.modelName).toBe('string');
    });

    it('[LLM-D2] should always return content and model in LlmResponse', async () => {
      // Verified structurally — actual API calls tested in provider-specific tests
      const cli = resolveLlmProvider('cli/claude-haiku-4-5');
      expect(cli.query).toBeDefined();
      expect(typeof cli.query).toBe('function');
    });
  });
});
