/**
 * Input types for the 4 sync MCP tools.
 */

export interface SyncPushInput {
  dryRun?: boolean;
  force?: boolean;
}

export interface SyncPullInput {
  forceReindex?: boolean;
  force?: boolean;
}

export interface SyncResolveInput {
  reason: string;
}

export interface SyncAuditInput {
  verifySignatures?: boolean;
  verifyChecksums?: boolean;
}
