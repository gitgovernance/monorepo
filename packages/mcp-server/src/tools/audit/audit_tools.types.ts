/**
 * Input types for the 3 audit + 1 agent + 1 actor MCP tools.
 */

export interface AuditScanInput {
  target?: 'code' | 'jira' | 'gitgov';
  scope?: 'diff' | 'full' | 'baseline';
  detector?: 'regex' | 'heuristic' | 'llm';
}

export interface AuditWaiveInput {
  fingerprint: string;
  justification: string;
}

export interface AuditWaiveListInput {
  activeOnly?: boolean;
}

export interface AgentRunInput {
  agentName: string;
  taskId: string;
  input?: unknown;
}

export interface ActorNewInput {
  id: string;
  type: 'human' | 'agent';
  displayName: string;
  roles?: string[];
}
