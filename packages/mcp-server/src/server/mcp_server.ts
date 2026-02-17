import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  McpServerConfig,
  McpToolDefinition,
  McpResourceHandler,
  McpPromptDefinition,
} from './mcp_server.types.js';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';

export class McpServer {
  private server: Server;
  private tools: Map<string, McpToolDefinition> = new Map();
  private resourceHandler: McpResourceHandler | null = null;
  private prompts: Map<string, McpPromptDefinition> = new Map();
  private di: McpDependencyInjectionService | null = null;

  constructor(private config: McpServerConfig) {
    this.server = new Server(
      { name: config.name, version: config.version },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );
  }

  /** Registra el DI container para que los handlers lo usen */
  setDI(di: McpDependencyInjectionService): void {
    this.di = di;
  }

  /** Registra un tool handler */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(definition: McpToolDefinition<any>): void {
    this.tools.set(definition.name, definition as McpToolDefinition);
  }

  /** Registra el resource handler (list + read) */
  registerResourceHandler(handler: McpResourceHandler): void {
    this.resourceHandler = handler;
  }

  /** Registra un prompt template */
  registerPrompt(definition: McpPromptDefinition): void {
    this.prompts.set(definition.name, definition);
  }

  /** Retorna el numero de tools registrados */
  getToolCount(): number {
    return this.tools.size;
  }

  /** Retorna el numero de prompts registrados */
  getPromptCount(): number {
    return this.prompts.size;
  }

  /** Returns whether resources are registered */
  hasResources(): boolean {
    return this.resourceHandler !== null;
  }

  /** Conecta el transport stdio y empieza a escuchar */
  async connectStdio(): Promise<void> {
    this.setupHandlers();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /** Conecta un transport HTTP (StreamableHTTPServerTransport) */
  async connectTransport(transport: { start?: () => Promise<void> }): Promise<void> {
    this.setupHandlers();
    await this.server.connect(transport as Parameters<Server['connect']>[0]);
  }

  /** Exposes the underlying Server for advanced use */
  getInternalServer(): Server {
    return this.server;
  }

  private setupHandlers(): void {
    // --- Tools ---
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as { type: 'object'; properties?: Record<string, unknown> },
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);

      if (!tool) {
        return this.mcpErrorResult(`Unknown tool: ${request.params.name}`);
      }

      if (!this.di) {
        return this.mcpErrorResult('DI container not initialized');
      }

      try {
        const result = await tool.handler(request.params.arguments ?? {}, this.di);
        return {
          content: result.content,
          isError: result.isError,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.mcpErrorResult(`Tool execution failed: ${message}`);
      }
    });

    // --- Resources ---
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (!this.resourceHandler || !this.di) {
        return { resources: [] };
      }
      try {
        return await this.resourceHandler.list(this.di);
      } catch {
        return { resources: [] };
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!this.resourceHandler || !this.di) {
        throw new Error('Resources not available');
      }
      return await this.resourceHandler.read(request.params.uri, this.di);
    });

    // --- Prompts ---
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: Array.from(this.prompts.values()).map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.setRequestHandler(GetPromptRequestSchema, async (request): Promise<any> => {
      const prompt = this.prompts.get(request.params.name);
      if (!prompt) {
        throw new Error(`Unknown prompt: ${request.params.name}`);
      }
      if (!this.di) {
        throw new Error('DI container not initialized');
      }
      return await prompt.handler(request.params.arguments ?? {}, this.di);
    });
  }

  private mcpErrorResult(message: string) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true as const,
    };
  }
}
