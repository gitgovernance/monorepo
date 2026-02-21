/**
 * Input types for the 3 execution MCP tools.
 * Based on mcp_tools_execution.md §3.2.
 */

export interface ExecutionCreateInput {
  /** ID of the task this execution belongs to */
  taskId: string;
  /** The tangible, verifiable output */
  result: string;
  /** Semantic classification (defaults to 'progress') */
  type?: 'analysis' | 'progress' | 'blocker' | 'completion' | 'info' | 'correction';
  /** Human-readable title */
  title?: string;
  /** Context and rationale */
  notes?: string;
  /** Typed references */
  references?: string[];
}

export interface ExecutionListInput {
  /** Filter by task ID */
  taskId?: string;
  /** Filter by execution type */
  type?: 'analysis' | 'progress' | 'blocker' | 'completion' | 'info' | 'correction';
  /** Max results */
  limit?: number;
}

export interface ExecutionShowInput {
  /** The execution ID to show */
  executionId: string;
}
