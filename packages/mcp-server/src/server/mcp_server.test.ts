import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from './mcp_server.js';
import type { McpToolDefinition, McpPromptDefinition, McpResourceHandler, ToolResult } from './mcp_server.types.js';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';
import { createResourceHandler } from '../resources/index.js';
import { getAllPrompts } from '../prompts/index.js';

/**
 * McpServer tests — Block A (MSRV-A1 to MSRV-A5) + Block P (MSRV-P1 to MSRV-P3) + Block E (MSRV-E1 to MSRV-E7)
 * All EARS prefixes map to mcp_server_spec.md
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

  describe('4.2. HTTP Transport + Capabilities (MSRV-P1 to MSRV-P3)', () => {
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
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ transport: 'agnostic' }) }],
      } satisfies ToolResult);

      const tool = createMockTool('gitgov_transport_test', handler);
      const server = createServer();
      server.registerTool(tool);
      server.setDI(createMockDi());

      // Dispatch via InMemoryTransport (simulates any transport, including HTTP)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.callTool({ name: 'gitgov_transport_test', arguments: { foo: 'test' } });

      // Same handler produces same result regardless of transport
      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(textContent[0].text)).toEqual({ transport: 'agnostic' });
      expect(result.isError).toBeFalsy();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ foo: 'test' });

      await client.close();
    });
  });

  describe('4.3. Error Boundary (MSRV-E1 to MSRV-E7)', () => {
    it('[MSRV-E1] should return error when DI container is not set', async () => {
      const server = createServer();
      server.registerTool(createMockTool('gitgov_test'));
      // DI not set intentionally

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.callTool({ name: 'gitgov_test', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.error).toContain('DI container not initialized');

      await client.close();
    });

    it('[MSRV-E2] should wrap handler exceptions in error result', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Something broke'));
      const tool = createMockTool('gitgov_failing', handler);

      const server = createServer();
      server.registerTool(tool);
      server.setDI(createMockDi());

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.callTool({ name: 'gitgov_failing', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.error).toContain('Tool execution failed');
      expect(parsed.error).toContain('Something broke');

      await client.close();
    });

    it('[MSRV-E3] should return empty resources when no handler is registered', async () => {
      const server = createServer();
      server.setDI(createMockDi());

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.listResources();
      expect(result.resources).toEqual([]);

      await client.close();
    });

    it('[MSRV-E4] should return empty resources when handler throws', async () => {
      const server = createServer();
      server.registerResourceHandler({
        list: vi.fn().mockRejectedValue(new Error('list failed')),
        read: vi.fn(),
      } as unknown as McpResourceHandler);
      server.setDI(createMockDi());

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      const result = await client.listResources();
      expect(result.resources).toEqual([]);

      await client.close();
    });

    it('[MSRV-E5] should throw when reading resources without handler', async () => {
      const server = createServer();
      server.setDI(createMockDi());

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      await expect(
        client.readResource({ uri: 'gitgov://test' }),
      ).rejects.toThrow();

      await client.close();
    });

    it('[MSRV-E6] should throw for unknown prompt name', async () => {
      const server = createServer();
      server.setDI(createMockDi());

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      await expect(
        client.getPrompt({ name: 'nonexistent' }),
      ).rejects.toThrow();

      await client.close();
    });

    it('[MSRV-E7] should throw when DI is not set for prompt handler', async () => {
      const server = createServer();
      server.registerPrompt({
        name: 'test-prompt',
        description: 'Test',
        handler: vi.fn(),
      });
      // DI not set intentionally

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connectTransport(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      await expect(
        client.getPrompt({ name: 'test-prompt' }),
      ).rejects.toThrow();

      await client.close();
    });
  });
});
