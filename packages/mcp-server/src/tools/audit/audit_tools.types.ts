/**
 * Input types for the 3 audit + 1 agent + 1 actor MCP tools.
 */

export interface AuditScanInput {
  include?: string[];
  exclude?: string[];
  changedSince?: string;
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
