/**
 * Input types for the 7 task lifecycle MCP tools.
 * Based on mcp_tools_task blueprint §3.
 */

export interface TaskNewInput {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  cycleIds?: string[];
  tags?: string[];
  references?: string[];
}

export interface TaskTransitionInput {
  taskId: string;
}

export interface TaskAssignInput {
  taskId: string;
  actorId: string;
}

export interface TaskDeleteInput {
  taskId: string;
}
