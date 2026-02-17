/**
 * Input types for the 3 feedback MCP tools.
 * Based on mcp_tools_feedback blueprint §3.
 */

export interface FeedbackCreateInput {
  entityType: 'task' | 'execution' | 'changelog' | 'feedback' | 'cycle';
  entityId: string;
  type: 'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment';
  content: string;
  assignee?: string;
}

export interface FeedbackListInput {
  entityId?: string;
  type?: string;
  status?: 'open' | 'acknowledged' | 'resolved' | 'wontfix';
  limit?: number;
}

export interface FeedbackResolveInput {
  feedbackId: string;
  content?: string;
}
