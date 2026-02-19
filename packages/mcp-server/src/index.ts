#!/usr/bin/env node

import { McpServer } from './server/mcp_server.js';
import { McpDependencyInjectionService } from './di/mcp_di.js';
import { registerAllTools } from './tools/index.js';
import { createResourceHandler } from './resources/index.js';
import { getAllPrompts } from './prompts/index.js';
import { findProjectRoot } from '@gitgov/core/fs';

async function main(): Promise<void> {
  // Discover project root
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    process.stderr.write(
      JSON.stringify({
        error: 'GitGovernance project root not found. Run from a directory with .gitgov/ or a git repo with gitgov-state branch.',
      }),
    );
    process.exit(1);
  }

  // Create server
  const server = new McpServer({
    name: 'gitgov-mcp',
    version: '0.1.0',
    description: 'GitGovernance MCP Server — Exposes project governance tools for AI agents.',
  });

  // Wire DI
  const di = new McpDependencyInjectionService({ projectRoot });

  // Register tools
  registerAllTools(server);

  // Register resources
  server.registerResourceHandler(createResourceHandler());

  // Register prompts
  for (const prompt of getAllPrompts()) {
    server.registerPrompt(prompt);
  }

  // Set DI and connect
  server.setDI(di);

  // Check for --port flag for HTTP mode
  const portArg = process.argv.find((arg) => arg.startsWith('--port'));
  if (portArg) {
    const port = parseInt(portArg.split('=')[1] ?? process.argv[process.argv.indexOf(portArg) + 1], 10);
    if (isNaN(port)) {
      process.stderr.write('Error: --port requires a numeric value\n');
      process.exit(1);
    }
    await startHttpServer(server, port);
  } else {
    await server.connectStdio();
  }
}

async function startHttpServer(server: McpServer, port: number): Promise<void> {
  const { createServer } = await import('http');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  const httpServer = createServer(async (req, res) => {
    // Only handle /mcp endpoint
    if (req.url === '/mcp') {
      // Collect body for POST requests
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        await transport.handleRequest(req, res, body);
      } else {
        await transport.handleRequest(req, res);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await server.connectTransport(transport);

  httpServer.listen(port, () => {
    process.stderr.write(`GitGov MCP server listening on http://localhost:${port}/mcp\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
