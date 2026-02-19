import type { McpServer } from '../server/mcp_server.js';
import {
  statusTool,
  contextTool,
  lintTool,
  taskListTool,
  taskShowTool,
  cycleListTool,
  cycleShowTool,
  agentListTool,
  agentShowTool,
} from './read/index.js';
import {
  taskNewTool,
  taskDeleteTool,
  taskSubmitTool,
  taskApproveTool,
  taskActivateTool,
  taskCompleteTool,
  taskAssignTool,
} from './task/index.js';
import {
  feedbackCreateTool,
  feedbackListTool,
  feedbackResolveTool,
} from './feedback/index.js';
import {
  cycleNewTool,
  cycleActivateTool,
  cycleCompleteTool,
  cycleEditTool,
  cycleAddTaskTool,
  cycleRemoveTaskTool,
  cycleMoveTaskTool,
  cycleAddChildTool,
} from './cycle/index.js';
import {
  syncPushTool,
  syncPullTool,
  syncResolveTool,
  syncAuditTool,
} from './sync/index.js';
import {
  auditScanTool,
  auditWaiveTool,
  auditWaiveListTool,
  agentRunTool,
  actorNewTool,
} from './audit/index.js';

/**
 * Registers all MCP tools on the server.
 * Called during bootstrap, before connecting transport.
 */
export function registerAllTools(server: McpServer): void {
  // Cycle 1: 9 read-only tools
  server.registerTool(statusTool);
  server.registerTool(contextTool);
  server.registerTool(lintTool);
  server.registerTool(taskListTool);
  server.registerTool(taskShowTool);
  server.registerTool(cycleListTool);
  server.registerTool(cycleShowTool);
  server.registerTool(agentListTool);
  server.registerTool(agentShowTool);

  // Cycle 2: 7 task lifecycle tools
  server.registerTool(taskNewTool);
  server.registerTool(taskDeleteTool);
  server.registerTool(taskSubmitTool);
  server.registerTool(taskApproveTool);
  server.registerTool(taskActivateTool);
  server.registerTool(taskCompleteTool);
  server.registerTool(taskAssignTool);

  // Cycle 2: 3 feedback tools
  server.registerTool(feedbackCreateTool);
  server.registerTool(feedbackListTool);
  server.registerTool(feedbackResolveTool);

  // Cycle 3: 8 cycle management tools
  server.registerTool(cycleNewTool);
  server.registerTool(cycleActivateTool);
  server.registerTool(cycleCompleteTool);
  server.registerTool(cycleEditTool);
  server.registerTool(cycleAddTaskTool);
  server.registerTool(cycleRemoveTaskTool);
  server.registerTool(cycleMoveTaskTool);
  server.registerTool(cycleAddChildTool);

  // Cycle 3: 4 sync tools
  server.registerTool(syncPushTool);
  server.registerTool(syncPullTool);
  server.registerTool(syncResolveTool);
  server.registerTool(syncAuditTool);

  // Cycle 4: 3 audit + 1 agent + 1 actor tools
  server.registerTool(auditScanTool);
  server.registerTool(auditWaiveTool);
  server.registerTool(auditWaiveListTool);
  server.registerTool(agentRunTool);
  server.registerTool(actorNewTool);
}
