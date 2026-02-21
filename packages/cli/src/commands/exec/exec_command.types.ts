/**
 * Types for the exec command.
 * Based on exec_command.md §3.3.
 */

import type { BaseCommandOptions } from '../../interfaces/command';

/** Options for `gitgov exec new <taskId>` */
export interface ExecNewOptions extends BaseCommandOptions {
  /** The tangible, verifiable output of the execution (required) */
  result: string;
  /** Semantic classification of the execution event */
  type?: ExecutionType;
  /** Human-readable title (used to generate executionId) */
  title?: string;
  /** Context, decisions, and rationale behind the result */
  notes?: string;
  /** Typed references (commit:abc, pr:123, file:path, url:https://...) */
  reference?: string[];
}

/** Options for `gitgov exec list [taskId]` */
export interface ExecListOptions extends BaseCommandOptions {
  /** Filter by execution type */
  type?: ExecutionType;
  /** Max results to return */
  limit?: number;
}

/** Options for `gitgov exec show <executionId>` */
export interface ExecShowOptions extends BaseCommandOptions {
  // Inherits json, verbose, quiet from BaseCommandOptions
}

/** Execution type enum values for validation */
export type ExecutionType = 'analysis' | 'progress' | 'blocker' | 'completion' | 'info' | 'correction';

/** Valid execution types array for validation */
export const VALID_EXECUTION_TYPES: ExecutionType[] = [
  'analysis', 'progress', 'blocker', 'completion', 'info', 'correction'
];
