/**
 * Input types for agent MCP tools.
 * Blueprint: mcp_tools_agent.md
 */

export type AgentNewInput = {
  actorId: string;
  engineType: 'local' | 'api' | 'mcp' | 'custom';
};
