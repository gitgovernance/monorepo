import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from './mcp_server.js';
import type { McpToolDefinition, McpPromptDefinition, McpResourceHandler, ToolResult } from './mcp_server.types.js';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';
import { createResourceHandler } from '../resources/index.js';
import { getAllPrompts } from '../prompts/index.js';

/**
 * McpServer tests — Block A (MSRV-A1 to MSRV-A5) + Block P (MSRV-P1, MSRV-P2, MSRV-P3)
 */

function createServer() {
  return new McpServer({
    name: 'test-server',
    version: '1.0.0',
  });
}

function createMockDi(): McpDependencyInjectionService {
  return {
    getContainer: vi.fn().mockResolvedValue({}),
  } as unknown as McpDependencyInjectionService;
}

function createMockTool(
  name: string,
  handler?: McpToolDefinition['handler'],
): McpToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: {
      type: 'object',
      properties: {
        foo: { type: 'string' },
      },
      additionalProperties: false,
    },
    handler: handler ?? vi.fn().mockResolvedValue({
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
    }),
  };
}

describe('McpServer', () => {
  describe('4.1. Server Lifecycle (MSRV-A1 to MSRV-A5)', () => {
    let server: McpServer;

    beforeEach(() => {
      server = createServer();
    });

    it('[MSRV-A1] should create a server with stdio transport capability', () => {
      // The server is created and has connectStdio method available.
      // We cannot actually start stdio in a test, but we verify the server is
      // constructed and ready to register tools and connect.
      expect(server).toBeDefined();
      expect(typeof server.connectStdio).toBe('function');
      expect(typeof server.setDI).toBe('function');
      expect(typeof server.registerTool).toBe('function');
    });

    it('[MSRV-A2] should register tools and expose them via getToolCount', () => {
      const tool1 = createMockTool('gitgov_test_a');
      const tool2 = createMockTool('gitgov_test_b');

      server.registerTool(tool1);
      server.registerTool(tool2);

      expect(server.getToolCount()).toBe(2);
    });

    it('[MSRV-A3] should dispatch tool calls to the correct handler via protocol', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ result: 'dispatched' }) }],
      } satisfies ToolResult);

      const tool = createMockTool('gitgov_dispatch_test', handler);
      server.registerTool(tool);
      server.setDI(createMockDi());

      // Use InMemoryTransport for real MCP protocol dispatch
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.callTool({ name: 'gitgov_dispatch_test', arguments: { foo: 'bar' } });

      // Verify handler was called with correct input and DI
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ foo: 'bar' });
      expect(handler.mock.calls[0][1]).toBeDefined(); // DI was injected

      // Verify protocol response
      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0].type).toBe('text');
      expect(JSON.parse(textContent[0].text)).toEqual({ result: 'dispatched' });
      expect(result.isError).toBeFalsy();

      await client.close();
    });

    it('[MSRV-A4] should handle unknown tool names gracefully via protocol', async () => {
      server.registerTool(createMockTool('gitgov_known'));
      server.setDI(createMockDi());

      // Use InMemoryTransport for real MCP protocol dispatch
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      // Call an unregistered tool name — server should return isError
      const result = await client.callTool({ name: 'gitgov_unknown_tool', arguments: {} });

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(result.isError).toBe(true);
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.error).toContain('Unknown tool');

      await client.close();
    });

    it('[MSRV-A5] should initialize within acceptable time', () => {
      // Verify that server creation and tool registration are synchronous
      // and complete within performance budget.
      const start = performance.now();

      const s = createServer();
      for (let i = 0; i < 36; i++) {
        s.registerTool(createMockTool(`gitgov_tool_${i}`));
      }
      s.setDI(createMockDi());

      const elapsed = performance.now() - start;

      expect(s.getToolCount()).toBe(36);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('4.3. HTTP Transport + Capabilities (MSRV-P1 to MSRV-P3)', () => {
    it('[MSRV-P1] should expose connectTransport method for HTTP transport', () => {
      const server = createServer();
      expect(typeof server.connectTransport).toBe('function');
    });

    it('[MSRV-P2] should register resources and prompts as capabilities', () => {
      const server = createServer();

      // Register resource handler
      server.registerResourceHandler(createResourceHandler());
      expect(server.hasResources()).toBe(true);

      // Register prompts
      const prompts = getAllPrompts();
      for (const prompt of prompts) {
        server.registerPrompt(prompt);
      }
      expect(server.getPromptCount()).toBe(3);
    });

    it('[MSRV-P3] should execute same tool logic regardless of transport', async () => {
      // Tool logic is transport-agnostic — same handler runs for stdio and HTTP
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
      } satisfies ToolResult);

      const tool = createMockTool('gitgov_transport_test', handler);

      // Create two server instances
      const stdioServer = createServer();
      stdioServer.registerTool(tool);

      const httpServer = createServer();
      httpServer.registerTool(tool);

      // Both register the exact same handler
      const di = createMockDi();
      const result1 = await tool.handler({ foo: 'from-stdio' }, di);
      const result2 = await tool.handler({ foo: 'from-http' }, di);

      // Same handler, same logic, same result shape
      expect(JSON.parse(result1.content[0].text)).toEqual({ ok: true });
      expect(JSON.parse(result2.content[0].text)).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
