import type { ILlmProvider, LlmMessage, LlmTool, LlmResponse, LlmProviderConfig } from '../llm_provider';

// [LLM-B1] [LLM-B2] [LLM-B3] [LLM-B4]
export class AnthropicLlmProvider implements ILlmProvider {
  readonly providerName = 'anthropic';
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: LlmProviderConfig) {
    if (!config.apiKey) {
      throw new Error('AnthropicLlmProvider requires apiKey');
    }
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.timeout = config.timeout ?? 180_000;
  }

  // [LLM-B1] Query Anthropic SDK with model and messages
  async query(messages: readonly LlmMessage[], tools?: readonly LlmTool[]): Promise<LlmResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    // [LLM-B2] Map LlmTool to Anthropic tool format
    const anthropicTools = tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Record<string, unknown>,
    }));

    // [LLM-B3] API error preserved — throw propagates
    const response = await client.messages.create({
      model: this.modelName,
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: nonSystemMsgs.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
    });

    const textBlock = response.content.find(
      (b: { type: string }) => b.type === 'text',
    ) as { type: 'text'; text: string } | undefined;

    // [LLM-B4] Include usage tokens in response
    return {
      content: textBlock?.text ?? '',
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
