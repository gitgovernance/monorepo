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

export interface DiagramCommandOptions {
  output?: string;
  watch?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  cycle?: string;
  task?: string;
  package?: string;
  showArchived?: boolean;
}

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
