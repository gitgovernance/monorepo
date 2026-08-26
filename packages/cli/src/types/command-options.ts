/**
 * Common command option interfaces for GitGovernance CLI
 * Following the GitGovernance CLI standard structure
 */

export interface BaseCommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean; // All read commands must support --json flag
}

export interface OutputCommandOptions extends BaseCommandOptions {
  output?: string;
}

// DiagramCommandOptions removed with the `gitgov diagram` command. It had zero
// references outside this file even before the deletion.

export interface EntityCommandOptions extends BaseCommandOptions {
  id?: string;
  status?: string;
  priority?: string;
  tags?: string;
}

export interface StateCommandOptions extends BaseCommandOptions {
  force?: boolean;
  dryRun?: boolean;
  branch?: string;
}

export interface ValidationCommandOptions extends BaseCommandOptions {
  fix?: boolean;
  report?: string;
  checkAll?: boolean;
}
