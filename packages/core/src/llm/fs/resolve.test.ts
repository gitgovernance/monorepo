/**
 * Provider resolution tests — [LLM-A1] to [LLM-A5]
 *
 * Spec: fs_llm_provider_module.md §4.1
 *
 * These EARS moved here from `src/llm/resolve.test.ts` when the module was split into
 * interface (pure, `@gitgov/core`) and implementation (Node-only, `@gitgov/core/fs`).
 * Their ids did not change: the code and its tests moved subpath, the requirements did
 * not change behaviour (module_designer §5.5 — normalizing is not consolidating).
 *
 * LLM-D1 and LLM-D2 used to live in this file. They are contract requirements of
 * `ILlmProvider`, not of the resolver, so they now live in
 * `src/llm/llm_provider_contract.test.ts` next to the interface they describe.
 */

import { resolveLlmProvider } from './resolve';
import { AnthropicLlmProvider } from '../anthropic/anthropic_llm_provider';
import { CliLlmProvider } from './cli_llm_provider';

describe('resolveLlmProvider', () => {
  describe('4.1. Provider Resolution (LLM-A1 to LLM-A5)', () => {
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

    // [LLM-A5] `ollama/` → OllamaLlmProvider is NOT implemented. There is deliberately no
    // it.skip here: a skipped test reports as a test that exists, and this requirement has
    // no code behind it. Today `resolveLlmProvider('ollama/...')` falls through to the
    // default branch and throws, which the LLM-A3 test above already pins down.
    // The blocker is OllamaLlmProvider itself (LLM-E1..E5, llm_provider_module.md §4.3).
  });
});
