/**
 * Input and response types for the 9 read-only MCP tools.
 * Based on mcp_tools_read blueprint §3.
 */

// --- Status ---

export interface StatusResponse {
  projectName: string;
  activeCycles: Array<{
    id: string;
    title: string;
    status: string;
    taskCount: number;
  }>;
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }>;
  health: {
    score: number;
    stalledTasks: number;
    atRiskTasks: number;
  };
}

// --- Context ---

export interface ContextResponse {
  config: {
    projectName: string;
    version: string;
    gitgovRoot: string;
  };
  session: {
    currentActor: string | null;
    sessionId: string;
  };
  actor: {
    id: string;
    name: string;
    type: 'human' | 'agent';
  } | null;
}

// --- Lint ---

export interface LintInput {
  fix?: boolean;
}

export interface LintViolation {
  recordType: string;
  recordId: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
  fixable: boolean;
}

// --- Tasks ---

export interface TaskListInput {
  status?: 'draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  cycleIds?: string[];
  tags?: string[];
  stalled?: boolean;
  atRisk?: boolean;
  limit?: number;
  offset?: number;
}

export interface TaskShowInput {
  taskId: string;
}

// --- Cycles ---

export interface CycleListInput {
  status?: 'planning' | 'active' | 'completed' | 'archived';
  tags?: string[];
  limit?: number;
}

export interface CycleShowInput {
  cycleId: string;
}

// --- Agents ---

export interface AgentShowInput {
  agentId: string;
}
