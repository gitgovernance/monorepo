/**
 * E2E Test Helpers — Level 3.
 *
 * Spawns the real MCP server process via StdioClientTransport,
 * creates temp .gitgov/ projects, and provides call helpers.
 */

import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTempGitgovProject } from '../integration/core/core_test_helpers.js';
import type { E2eTestContext, E2eToolResult } from './mcp_e2e.types.js';

// Path to the server entrypoint (relative to this file in src/e2e/)
const SERVER_ENTRY = path.resolve(import.meta.dirname, '../index.ts');

/**
 * Spawns a real MCP server process and returns a connected Client.
 * Uses StdioClientTransport which handles all JSON-RPC framing.
 */
export async function spawnMcpServer(projectRoot: string): Promise<{
  client: Client;
  transport: StdioClientTransport;
  cleanup: () => Promise<void>;
}> {
  const transport = new StdioClientTransport({
    command: 'tsx',
    args: [SERVER_ENTRY],
    cwd: projectRoot,
    stderr: 'pipe',
    env: process.env as Record<string, string>,
  });

  const client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
  await client.connect(transport);

  const cleanup = async () => {
    await client.close();
  };

  return { client, transport, cleanup };
}

/**
 * Creates a full E2E test context: temp project + connected MCP server.
 */
export async function createE2eContext(): Promise<
  E2eTestContext & { client: Client; transport: StdioClientTransport; cleanupServer: () => Promise<void> }
> {
  const project = await createTempGitgovProject();
  const { client, transport, cleanup: cleanupServer } = await spawnMcpServer(project.projectRoot);

  return {
    ...project,
    client,
    transport,
    cleanupServer,
    cleanup: async () => {
      await cleanupServer();
      await project.cleanup();
    },
  };
}

/**
 * Call a tool via the MCP client and parse the JSON response.
 */
export async function callE2eTool<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<E2eToolResult<T>> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content[0]?.text ?? '{}';
  const data = JSON.parse(text) as T;
  return { data, isError: (result.isError as boolean) ?? false };
}
