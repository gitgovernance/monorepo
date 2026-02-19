import type { McpDependencyInjectionService } from '../di/mcp_di.js';

/**
 * Configuracion del MCP Server
 */
export interface McpServerConfig {
  /** Nombre del server expuesto en la negociacion MCP */
  name: string;
  /** Version del server (semver) */
  version: string;
  /** Descripcion opcional */
  description?: string;
}

/**
 * Resultado estructurado que devuelven todos los tool handlers.
 * Siempre JSON serializable — nunca texto libre.
 */
export interface ToolResult {
  /** Contenido principal: array de content blocks MCP */
  content: Array<{
    type: 'text';
    text: string;
  }>;
  /** true si el tool encontro un error de negocio o validacion */
  isError?: boolean;
}

/**
 * Funcion handler de un tool individual.
 * Recibe el input ya validado y el DI container.
 */
export type ToolHandler<TInput = Record<string, unknown>> = (
  input: TInput,
  di: McpDependencyInjectionService,
) => Promise<ToolResult>;

/**
 * Definicion completa de un tool MCP listo para registrar.
 */
export interface McpToolDefinition<TInput = Record<string, unknown>> {
  /** Nombre del tool en snake_case (ej: gitgov_task_new) */
  name: string;
  /** Descripcion legible para el AI client */
  description: string;
  /** JSON Schema del input (draft-07) */
  inputSchema: Record<string, unknown>;
  /** Handler que implementa la logica del tool */
  handler: ToolHandler<TInput>;
}

// --- Resources ---

/** MCP Resource descriptor returned by resources/list */
export interface McpResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** MCP Resource content returned by resources/read */
export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
}

/** Handler pair for resource list + read operations */
export interface McpResourceHandler {
  list: (di: McpDependencyInjectionService) => Promise<{ resources: McpResourceEntry[] }>;
  read: (uri: string, di: McpDependencyInjectionService) => Promise<{ contents: McpResourceContent[] }>;
}

// --- Prompts ---

/** MCP Prompt argument definition */
export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/** Result returned by prompts/get */
export interface McpPromptResult {
  description?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
  }>;
}

/** Definicion completa de un prompt MCP */
export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
  handler: (args: Record<string, string>, di: McpDependencyInjectionService) => Promise<McpPromptResult>;
}
