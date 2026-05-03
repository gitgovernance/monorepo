import type { ILlmProvider } from './llm_provider';
import { AnthropicLlmProvider } from './anthropic/anthropic_llm_provider';
import { CliLlmProvider } from './cli/cli_llm_provider';

const SUPPORTED_PROVIDERS = ['anthropic', 'cli'] as const;

// [LLM-A1] [LLM-A2] [LLM-A3] [LLM-A4]
export function resolveLlmProvider(modelString: string, apiKey?: string): ILlmProvider {
  const slashIndex = modelString.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid LLM_MODEL format: "${modelString}". Expected "provider/model" (e.g. "anthropic/claude-sonnet-4-6", "cli/claude-haiku-4-5"). Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
  }

  const provider = modelString.slice(0, slashIndex);
  const model = modelString.slice(slashIndex + 1);

  switch (provider) {
    // [LLM-A1] anthropic/ → AnthropicLlmProvider
    case 'anthropic': {
      // [LLM-A4] Require apiKey for anthropic
      if (!apiKey) {
        throw new Error('AnthropicLlmProvider requires apiKey. Set LLM_API_KEY environment variable.');
      }
      return new AnthropicLlmProvider({ apiKey, model });
    }

    // [LLM-A2] cli/ → CliLlmProvider
    case 'cli':
      return new CliLlmProvider({ model });

    // [LLM-A3] Unknown provider → throw with list
    default:
      throw new Error(
        `Unknown LLM provider: "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
      );
  }
}
