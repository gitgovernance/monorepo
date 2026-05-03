/** Message in the LLM conversation */
export type LlmMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/** Tool that the LLM can invoke during query execution */
export type LlmTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<string>;
};

/** Response from the LLM provider */
export type LlmResponse = {
  content: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/** Configuration for constructing an LLM provider */
export type LlmProviderConfig = {
  apiKey?: string;
  model: string;
  timeout?: number;
};

/**
 * Provider-agnostic interface for LLM operations (G18).
 * Implementations: AnthropicLlmProvider, CliLlmProvider.
 */
// [LLM-D1] [LLM-D2]
export interface ILlmProvider {
  query(messages: readonly LlmMessage[], tools?: readonly LlmTool[]): Promise<LlmResponse>;
  readonly providerName: string;
  readonly modelName: string;
}
